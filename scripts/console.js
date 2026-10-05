#!/usr/bin/env node
/**
 * 游戏站 部署控制台 (本地 Web UI · 最小版)
 * 用法: node scripts/console.js [--port 9000] [--proxy http://127.0.0.1:8899]
 * 浏览器打开 http://localhost:9000
 *
 * 现在只做 3 件事:
 *   ① 抓取第 N 页
 *   ② 生成待填 Excel
 *   ③ 展示状态/日志
 *
 * 说明:
 *   当前本地脚本目标: 点「抓取本页」必须立刻有反馈, 成功/失败都直接显示在页面。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const ROOT = path.join(REPO, '..');
const PORT = process.argv.includes('--port') ? Number(process.argv[process.argv.indexOf('--port') + 1]) : 9000;
const PROXY = (() => {
  const i = process.argv.indexOf('--proxy');
  if (i > -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.CONSOLE_PROXY || 'http://127.0.0.1:8899';
})();
const BASE = process.env.CONSOLE_BASE || 'https://www.52acgyxj.com';

const logs = [];
function log(...a) {
  const line = a.join(' ');
  logs.push(line);
  if (logs.length > 500) logs.shift();
  console.log(line);
}

// ============ 抓取单页(Python 走代理) ============
const { execFile } = require('child_process');
function probeProxyNow() {
  const net = require('net');
  const pu = new URL(PROXY);
  return new Promise(resolve => {
    const s = net.connect(Number(pu.port) || 8899, pu.hostname || '127.0.0.1');
    s.setTimeout(1200);
    s.on('connect', () => { resolve(true); s.destroy(); });
    s.on('timeout', () => { resolve(false); s.destroy(); });
    s.on('error', () => resolve(false));
  });
}

async function fetchPageViaPython(page, perPage = 10) {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const proxyArg = PROXY.replace(/^http:\/\//, '');
  const script = 'scratch/fetch_one_page.py';
  const args = [script, '--page', String(page), '--per-page', String(perPage), '--proxy', proxyArg];

  const proxyOk = await probeProxyNow();
  if (!proxyOk) {
    const msg = '抓取失败: 代理 ' + PROXY + ' 未启动或不可达。请先启动本机 8899 代理，再点「抓取本页」。';
    log(`[抓取] ${msg}`);
    throw new Error(msg);
  }

  log(`[抓取] 调 Python: ${py} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    execFile(py, ['-X', 'utf8', ...args], { cwd: String(ROOT), env: process.env, timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (stderr) log(`[抓取·py] ${stderr.trim().split('\n').slice(-4).join(' | ')}`);
        if (err) {
          const em = String((err && err.message) || err);
          const hint = /proxy|ECONNREFUSED|WinError|10061|Unable to connect to proxy/i.test(em)
            ? ' 排查: 请确认 ' + PROXY + ' 已启动。'
            : '';
          return reject(new Error('Python 抓取失败: ' + em + hint));
        }
        try {
          const out = JSON.parse(stdout.trim().split('\n').pop());
          const summary = {
            page: out.page,
            per_page: out.per_page,
            out: out.out,
            count: out.count,
            ids: out.post_ids || out.ids || [],
            postTitles: out.post_titles || [],
            postOut: out.post_out || out.out,
            wp_total: out.wp_total,
            fetched_at: out.fetched_at,
          };
          if (out.out && fs.existsSync(out.out)) {
            const detail = JSON.parse(fs.readFileSync(out.out, 'utf8'));
            summary.posts = detail.posts || [];
          }
          log(`[抓取] ✅ Python 完成, ${summary.count} 篇 -> ${summary.out}`);
          resolve(summary);
        } catch (e) {
          reject(new Error('Python 输出解析失败: ' + String(stdout).slice(0, 300)));
        }
      });
  });
}

async function fetchPage(page, perPage = 10) {
  log(`[抓取] ===== 第 ${page} 页 (per_page=${perPage}) [Python 模式] =====`);
  const out = await fetchPageViaPython(page, perPage);
  return { outPath: out.out || out.postOut || '', posts: out.posts || [], ids: out.ids || [] };
}

// ============ 提取分享名 + 生成 Excel ============
const SHARE_RE = /(PCC\d+|AZC\d+|C\d+)/;
function shareNames(html) {
  const names = [...html.matchAll(/<h4[^>]*>\s*百度网盘\s*[：:]\s*([^<]+?)\s*<\/h4>/gi)].map(m => m[1].trim());
  let pc = null, az = null;
  for (const raw of names) {
    const t = (SHARE_RE.exec(raw) || [])[0];
    if (!t) continue;
    if (t.startsWith('AZC')) az = az || t;
    else if (t.startsWith('PCC')) pc = pc || t;
    else pc = pc || t;
  }
  return { pc, az };
}

function baiduLinks(html) {
  const out = { pc: '', az: '' };
  if (!html) return out;
  const blocks = html.split(/<h4[^>]*>/i).slice(1);
  for (const blk of blocks) {
    const mH = blk.match(/^([^<]*)/i);
    const head = (mH ? mH[1] : '').trim();
    if (!/百度网盘/i.test(head)) continue;
    const { pc: pcN, az: azN } = shareNames('<h4>' + head + '</h4>');
    const uM = blk.match(/<a[^>]+href="([^"]*pan\.baidu\.com[^"]*)"/i) || blk.match(/(https?:\/\/pan\.baidu\.com\/[^\s"<>]+)/i);
    if (!uM) continue;
    let u = (uM[1] || uM[0]).trim();
    u = u.replace(/^https?:\/\//, '');
    if (!/^pan\.baidu\.com/i.test(u)) u = 'pan.baidu.com/' + u.replace(/^pan\.baidu\.com/i, '');
    u = 'https://' + u.replace(/^https?:\/\//, '');
    if (!u.includes('?pwd=')) {
      const codeM = head.match(/pwd=([A-Za-z0-9]+)/i) || (blk.match(/pwd=([A-Za-z0-9]+)/i) || []);
      if (codeM && codeM[1]) u += (u.includes('?') ? '&' : '?') + 'pwd=' + codeM[1];
    }
    if (pcN && !azN) out.pc = out.pc || u;
    else if (pcN && azN) out.pc = out.pc || u;
    else if (azN) out.az = out.az || u;
    else out.pc = out.pc || u;
  }
  return out;
}

function buildXlsx(page, posts) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const rows = [['游戏标题', '分享文件名', 'PC端百度链接', 'AZ端百度链接']];
  let filled = 0;
  for (const p of posts) {
    const { pc, az } = shareNames(p.content_html);
    const share = (pc && az) ? `${pc}/${az}` : (pc || az || '');
    const links = baiduLinks(p.content_html);
    if (links.pc || links.az) filled++;
    rows.push([p.title, share, links.pc, links.az]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 60 }, { wch: 24 }, { wch: 55 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, ws, '百度网盘链接');
  const out = path.join(ROOT, `data/acgyxjvip2_page${page}`, `page${page}_baidu.xlsx`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  XLSX.writeFile(wb, out);
  log(`[Excel] 生成 ${out} (带原站链接 ${filled}/${posts.length})`);
  return out;
}

// ============ HTTP 服务 ============
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const api = u.pathname;

  if (api === '/' || api === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const html = PAGE_HTML
      .split('__PORT__').join(String(PORT))
      .split('__BASE__').join(BASE)
      .split('__PROXY__').join(PROXY);
    res.end(html);
    return;
  }

  if (api === '/api/log') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(logs.slice(-200)));
    return;
  }

  if (api === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    const pu = new URL(PROXY);
    const net = require('net');
    const s = net.connect(Number(pu.port) || 8899, pu.hostname || '127.0.0.1');
    s.setTimeout(1500);
    s.on('connect', () => { res.end(JSON.stringify({ proxyAlive: true, proxy: PROXY, base: BASE })); s.destroy(); });
    s.on('timeout', () => { res.end(JSON.stringify({ proxyAlive: false, proxy: PROXY, base: BASE })); s.destroy(); });
    s.on('error', () => res.end(JSON.stringify({ proxyAlive: false, proxy: PROXY, base: BASE })));
    return;
  }

  if (api.startsWith('/api/action/')) {
    const act = api.split('/')[3];
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      let p = {};
      try { p = JSON.parse(body || '{}'); } catch {}
      try {
        switch (act) {
          case 'fetch': {
            const r = await fetchPage(p.page, p.perPage || 10);
            res.end(JSON.stringify({ ok: true, ids: r.ids, count: r.posts.length, out: r.outPath }));
            break;
          }
          case 'xlsx': {
            const postsJson = JSON.parse(fs.readFileSync(path.join(ROOT, `data/acgyxjvip2_page${p.page}/page${p.page}_posts.json`), 'utf8'));
            const out = buildXlsx(p.page, postsJson.posts);
            res.end(JSON.stringify({ ok: true, out, download: `/api/download?type=xlsx&page=${p.page}` }));
            break;
          }
          default:
            res.end(JSON.stringify({ ok: false, error: '未知操作 ' + act }));
        }
      } catch (e) {
        log(`[API] ${act} 失败: ${e.message}`);
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }

  if (api === '/api/download') {
    const t = u.searchParams.get('type');
    const page = u.searchParams.get('page');
    const fp = t === 'xlsx' ? path.join(ROOT, `data/acgyxjvip2_page${page}/page${page}_baidu.xlsx`)
      : t === 'json' ? path.join(ROOT, `data/acgyxjvip2_page${page}/page${page}_posts.json`) : null;
    if (!fp || !fs.existsSync(fp)) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fp)}"`);
    fs.createReadStream(fp).pipe(res);
    return;
  }

  res.statusCode = 404;
  res.end('not found');
});

// ============ 启动 ============
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    log(`[启动] 端口 ${PORT} 被占用: 请先关掉占用该端口的旧控制台/程序, 再启动本服务`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  log(`控制台已启动: http://localhost:${PORT}`);
  log(`原站 ${BASE}, 代理 ${PROXY}`);

  const net = require('net');
  const pu = new URL(PROXY);
  const s = net.connect(Number(pu.port) || 8899, pu.hostname || '127.0.0.1');
  s.setTimeout(2000);
  s.on('connect', () => { log(`[代理] ${PROXY} 在线 ✓`); s.destroy(); });
  s.on('timeout', () => { log(`[代理] ${PROXY} 无响应(未自动起代理)。抓取前请先手动启动 8899`); s.destroy(); });
  s.on('error', () => { log(`[代理] ${PROXY} 未启动(未自动起代理)。抓取前请先手动启动 8899, 再点「抓取本页」`); });
});

// ============ 极简页面 ============
const PAGE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>游戏站部署控制台</title>
<style>
:root{--bg:#0f1117;--card:#1a1d27;--tx:#e6e8ef;--mut:#8b90a4;--acc:#4f8cff;--ok:#3fb97f;--err:#ff5c5c;--line:#2a2e3d}
*{box-sizing:border-box}body{margin:0;font:14px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--tx)}
.wrap{max-width:900px;margin:0 auto;padding:18px}
h1{font-size:20px;margin:0 0 6px}
.sub{color:var(--mut);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:10px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
label{color:var(--mut);font-size:13px}
input[type=text],input[type=number]{background:#0d0f16;border:1px solid var(--line);color:var(--tx);border-radius:6px;padding:7px 9px;font-size:13px;min-width:90px}
button{background:var(--acc);color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer;font-weight:600}
button:disabled{opacity:.45;cursor:not-allowed}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;margin-left:6px}
.badge.ok{background:rgba(63,185,127,.15);color:var(--ok)}
.badge.err{background:rgba(255,92,92,.15);color:var(--err)}
.badge.wait{background:rgba(139,144,164,.15);color:var(--mut)}
.kv{font-size:12px;color:var(--mut)}
.log{background:#0a0c12;border:1px solid var(--line);border-radius:8px;padding:10px;height:260px;overflow:auto;font:11px/1.7 ui-monospace,Consolas,monospace;color:#c9d1e3;white-space:pre-wrap}
</style></head>
<body><div class="wrap">
<h1>游戏站部署控制台</h1>
<div class="sub">本地最小版：只保留抓取、Excel、日志，避免复杂 UI 误判</div>

<div class="card">
  <div class="row">
    <span>原站 <b id="st_base">__BASE__</b></span>
    <span>代理 <b id="st_proxy">__PROXY__</b> <span id="st_proxy_state" class="badge wait">检测中</span></span>
    <span>端口 <b>__PORT__</b></span>
  </div>
</div>

<div class="card">
  <div class="row">
    <label>页码</label><input type="text" id="p" value="5" style="width:70px">
    <label>每页</label><input type="number" id="per" value="10" style="width:60px">
    <button id="btn_fetch" onclick="act('fetch')">抓取本页</button>
    <button onclick="act('xlsx')">生成待填 Excel</button>
  </div>
  <div id="fetch_status" class="kv" style="margin-top:8px;color:var(--mut)">页面脚本已加载，点击按钮开始测试。</div>
  <div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">
    <a id="dl_xlsx" href="/api/download?type=xlsx&amp;page=5" style="color:var(--acc);font-size:13px;text-decoration:none">⬇ 下载 xlsx</a>
    <a id="dl_json" href="/api/download?type=json&amp;page=5" style="color:var(--mut);font-size:13px;text-decoration:none">⬇ 下载 JSON</a>
  </div>
</div>

<div class="card">
  <div style="font-size:13px;color:var(--acc);font-weight:700;margin-bottom:8px">运行日志</div>
  <div class="log" id="log"></div>
</div>
</div>
<script>
const el = id => document.getElementById(id);
let busy = false;

function setStatus(text, kind){
  const box = el('fetch_status');
  if (!box) return;
  box.textContent = text;
  box.style.color = kind === 'ok' ? 'var(--ok)' : (kind === 'err' ? 'var(--err)' : 'var(--mut)');
}

function setBusy(v){
  busy = v;
  document.querySelectorAll('button').forEach(b => b.disabled = v);
}

async function callApi(url, opt){
  const r = await fetch(url, opt);
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {}
  if (!r.ok || !data || data.ok === false) {
    throw new Error((data && data.error) ? data.error : ('HTTP ' + r.status + ' ' + text.slice(0, 160)));
  }
  return data;
}

async function act(a, opts = {}){
  if (busy) return;
  setBusy(true);
  setStatus(a === 'xlsx' ? '正在请求 /api/action/xlsx …' : '正在请求 /api/action/fetch …', 'wait');
  try {
    const r = await callApi('/api/action/' + a, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: el('p').value,
        perPage: el('per').value,
        ...opts,
      }),
    });
    setBusy(false);
    if (a === 'fetch') {
      setStatus('✅ 抓取完成: 第 ' + el('p').value + ' 页 ' + (r.count || 0) + ' 篇, 输出: ' + (r.out || '无'), 'ok');
    } else if (a === 'xlsx') {
      setStatus('✅ Excel 已生成: ' + (r.out || '无'), 'ok');
    }
  } catch (e) {
    setBusy(false);
    setStatus('❌ ' + ((e && e.message) ? e.message : e), 'err');
    alert((e && e.message) ? e.message : String(e));
  }
}

async function tail(){
  try {
    const r = await fetch('/api/log');
    const l = await r.json();
    el('log').textContent = l.join('\\n');
    el('log').scrollTop = el('log').scrollHeight;
  } catch (e) {}
}

async function loadStatus(){
  try {
    const r = await fetch('/api/status');
    const s = await r.json();
    el('st_base').textContent = s.base || '';
    el('st_proxy').textContent = s.proxy || '';
    const st = el('st_proxy_state');
    st.textContent = s.proxyAlive ? '在线' : '未起';
    st.className = 'badge ' + (s.proxyAlive ? 'ok' : 'err');
  } catch (e) {}
}

tail(); setInterval(tail, 2500);
loadStatus(); setInterval(loadStatus, 15000);
setInterval(() => {
  el('dl_xlsx').href = '/api/download?type=xlsx&page=' + el('p').value;
  el('dl_json').href = '/api/download?type=json&page=' + el('p').value;
}, 700);
</script></body></html>`;
