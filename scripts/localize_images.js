#!/usr/bin/env node
/**
 * 图片本地化: 把文章正文 / 封面里的外链图下载到 assets/img/, 并改写 posts.json
 *
 * 用法:
 *   node scripts/localize_images.js            # 全部文章
 *   node scripts/localize_images.js 45 46 47   # 只处理指定 id
 *
 * 抓取顺序(逐级降级):
 *   1) 直连
 *   2) 走本地代理(默认 127.0.0.1:8899, 可用 PROXY 环境变量覆盖)
 *   3) 换 fallback 域(image.acg.lol -> acgyx.us)
 * 每张图带魔数校验(JPG/PNG/GIF/WEBP), 非图片丢弃; 全部失败的保持外链(前端 onerror 自动隐藏)。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');

const REPO = path.join(__dirname, '..');
const POSTS = path.join(REPO, 'data', 'posts.json');
const ASSETS = path.join(REPO, 'assets', 'img');
const PROXY = process.env.PROXY || 'http://127.0.0.1:8899';
const NO_PROXY = process.argv.includes('--no-proxy');

const MAGIC = [
  [Buffer.from([0xff, 0xd8, 0xff]), 'jpg'],
  [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png'],
  [Buffer.from([0x47, 0x49, 0x46, 0x38]), 'gif'],
  [Buffer.from([0x52, 0x49, 0x46, 0x46]), 'webp'],
];

function isImage(buf) {
  return MAGIC.some(([sig]) => buf.length >= sig.length && buf.slice(0, sig.length).equals(sig));
}
function fallbackUrl(u) {
  return u.replace(/image\.acg\.lol/i, 'acgyx.us');
}

function dechunk(buf) {
  const out = []; let pos = 0;
  while (pos < buf.length) {
    const nl = buf.indexOf('\r\n', pos);
    if (nl < 0) break;
    const size = parseInt(buf.slice(pos, nl).toString(), 16);
    if (!size || Number.isNaN(size)) break;
    out.push(buf.slice(nl + 2, nl + 2 + size));
    pos = nl + 2 + size + 2;
  }
  return Buffer.concat(out);
}
function parseHttpFull(buf) {
  const idx = buf.indexOf('\r\n\r\n');
  if (idx < 0) return { status: 0, location: '', body: buf };
  const head = buf.slice(0, idx).toString();
  const m = head.match(/^HTTP\/1\.[01]\s+(\d+)/);
  const locM = head.match(/^location:\s*(.+)$/im);
  const body = buf.slice(idx + 4);
  return {
    status: m ? Number(m[1]) : 0,
    location: locM ? locM[1].trim() : '',
    body: /transfer-encoding:\s*chunked/i.test(head) ? dechunk(body) : body,
  };
}

function directGet(url, timeout = 15000, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 4) return reject(new Error('too many redirects'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://acgyxjvip.com/' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return directGet(new URL(r.headers.location, url).toString(), timeout, depth + 1).then(resolve, reject);
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function proxyGet(url, timeout = 25000, depth = 0) {
  if (depth > 4) return Promise.reject(new Error('too many redirects'));
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const pu = new URL(PROXY);
    const req = http.request({
      host: pu.hostname, port: Number(pu.port) || 8899,
      method: 'CONNECT', path: `${u.hostname}:${u.port || 443}`, timeout,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return reject(new Error('CONNECT ' + res.statusCode)); }
      const s = tls.connect({ socket, servername: u.hostname }, () => {
        s.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.hostname}\r\nUser-Agent: Mozilla/5.0\r\nReferer: https://acgyxjvip.com/\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      const chunks = [];
      s.on('data', c => chunks.push(c));
      s.on('end', () => {
        try {
          const r = parseHttpFull(Buffer.concat(chunks));
          if (r.status >= 300 && r.status < 400 && r.location) {
            return proxyGet(new URL(r.location, url).toString(), timeout, depth + 1).then(resolve, reject);
          }
          if (r.status !== 200) return reject(new Error('HTTP ' + r.status));
          resolve(r.body);
        } catch (e) { reject(e); }
      });
      s.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('proxy timeout')));
    req.end();
  });
}

async function fetchImage(url) {
  const attempts = [{ name: 'direct', fn: () => directGet(url) }];
  if (!NO_PROXY) attempts.push({ name: 'proxy', fn: () => proxyGet(url) });
  const fb = fallbackUrl(url);
  if (fb !== url) {
    attempts.push({ name: 'fallback-direct', fn: () => directGet(fb) });
    if (!NO_PROXY) attempts.push({ name: 'fallback-proxy', fn: () => proxyGet(fb) });
  }
  let last;
  for (const a of attempts) {
    try {
      const buf = await a.fn();
      if (buf && buf.length) return buf;
      last = new Error('empty');
    } catch (e) { last = e; }
  }
  throw last || new Error('all failed');
}

async function main() {
  const ids = process.argv.slice(2).filter(x => /^\d+$/.test(x)).map(Number);
  const onlyIds = ids.length ? new Set(ids) : null;
  const data = JSON.parse(fs.readFileSync(POSTS, 'utf8'));
  const targets = onlyIds ? data.posts.filter(p => onlyIds.has(p.id)) : data.posts;
  console.log(`目标: ${targets.length} 篇` + (onlyIds ? ` (id ${ids.join(',')})` : ' (全部)'));

  fs.mkdirSync(ASSETS, { recursive: true });

  const urlSet = new Set();
  for (const p of targets) {
    let m;
    const re = /<img[^>]+src="([^"]+)"/g;
    while ((m = re.exec(p.content || '')) !== null) if (!m[1].startsWith('/assets/')) urlSet.add(m[1]);
    if (p.image && !p.image.startsWith('/assets/')) urlSet.add(p.image);
  }
  const list = [...urlSet];
  console.log(`待处理外链图: ${list.length} 张`);

  const map = {};
  let okDl = 0, reuse = 0, fail = 0;
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    const tag = `[${i + 1}/${list.length}]`;
    const ext = ((u.match(/\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i) || ['.jpg'])[0].toLowerCase().replace('jpeg', 'jpg')).replace(/^\.+/, '') || 'jpg';
    const hash = require('crypto').createHash('md5').update(u).digest('hex').slice(0, 16);
    const fname = `img_${hash}.${ext}`;
    const dest = path.join(ASSETS, fname);
    const local = '/assets/img/' + fname;

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0 && isImage(fs.readFileSync(dest))) {
      map[u] = local; reuse++; console.log(`${tag} 已存在 ${fname}`); continue;
    }
    try {
      const buf = await fetchImage(u);
      if (isImage(buf)) { fs.writeFileSync(dest, buf); map[u] = local; okDl++; console.log(`${tag} OK ${fname}`); }
      else { fail++; console.log(`${tag} 非图片丢弃 ${u.slice(0, 60)}`); }
    } catch (e) {
      fail++; console.log(`${tag} 失败(保持外链) ${u.slice(0, 60)} -> ${e.message}`);
    }
  }

  let changed = 0;
  for (const p of targets) {
    const before = p.content;
    p.content = p.content.replace(/<img[^>]+src="([^"]+)"/g, (mm, src) => map[src] ? mm.replace(src, map[src]) : mm);
    if (p.image && map[p.image]) p.image = map[p.image];
    if (p.content !== before) {
      changed++;
      p.description = p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
  }

  if (changed) {
    fs.writeFileSync(POSTS, JSON.stringify(data, null, 2));
    console.log(`已写回 posts.json (更新 ${changed} 篇)`);
  } else {
    console.log('无改动, 未写回');
  }
  console.log(`\n=== 新下载 ${okDl} · 复用 ${reuse} · 失败 ${fail} (失败的保持外链) ===`);
}

main().catch(e => { console.error('[失败] ' + (e.message || e)); process.exit(1); });
