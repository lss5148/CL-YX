#!/usr/bin/env node
/**
 * 通用批次部署 (阶段 3-4)
 *
 * 用法:
 *   node scripts/deploy_batch.js --page 5 --mode preview --csv <回填表>
 *   node scripts/deploy_batch.js --page 5 --mode commit  --csv <回填表>
 *
 * 做的事:
 *   1) 读 data/acgyxjvip2_page{N}/page{N}_posts.json (已抓取的第 N 页)
 *   2) 读回填表 (csv 或 xlsx: 分享名 -> 完整链接)
 *   3) 按分享名匹配 -> 生成文章 (正文用已抓 content_html, 图文保持原站顺序)
 *   4) preview: 只输出预览 md
 *      commit : 写 posts.json + 图片本地化(直连失败自动走 8899 代理) + rebuild_index
 *
 * 保护:
 *   - 已存在于 posts.json 的 source (原站链接) 会自动跳过, 避免重复部署
 *   - 下载图片做魔数校验, 非图片丢弃, 失败的保持外链
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');
const cheerio = require('cheerio');

const REPO = path.join(__dirname, '..');
const ROOT = path.join(REPO, '..');
const PROXY = process.env.PROXY || 'http://127.0.0.1:8899';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const PAGE = arg('page', '5');
const MODE = arg('mode', 'preview');
const CSV = arg('csv', '');
const NO_PROXY = process.argv.includes('--no-proxy');

const POSTS_FILE = path.join(ROOT, 'data', `acgyxjvip2_page${PAGE}`, `page${PAGE}_posts.json`);
const DATA = path.join(REPO, 'data', 'posts.json');
const OUT_MD = path.join(ROOT, 'data', `preview-page${PAGE}.md`);

const SHARE_RE = /(PCC\d+|AZC\d+|C\d+)/;
const IMG_RE = /<img[^>]+src="([^"]+)"/g;
const MAGIC = [
  [Buffer.from([0xff, 0xd8, 0xff]), 'jpg'],
  [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png'],
  [Buffer.from([0x47, 0x49, 0x46, 0x38]), 'gif'],
  [Buffer.from([0x52, 0x49, 0x46, 0x46]), 'webp'],
];

// ---------- 分享名 ----------
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

// ---------- 回填表解析 (csv / xlsx 通用) ----------
function normalizeLink(u) {
  if (!u) return '';
  let s = String(u).trim().replace(/^https?:\/\//, '');
  if (!/^pan\.baidu\.com/i.test(s)) s = 'pan.baidu.com/' + s.replace(/^pan\.baidu\.com/i, '');
  s = 'https://' + s;
  if (!s.includes('?pwd=')) {
    const m = s.match(/pwd=([A-Za-z0-9]+)/);
    if (m) s += (s.includes('?') ? '&' : '?') + 'pwd=' + m[1];
  }
  return s;
}

function loadCsvLinks(file) {
  const map = {};
  if (!file || !fs.existsSync(file)) throw new Error('回填表不存在: ' + file);

  if (/\.xlsx?$/i.test(file)) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    for (const r of rows) {
      const cells = r.map(x => String(x || '').trim());
      const nameCell = cells.find(c => SHARE_RE.test(c));
      if (!nameCell) continue;
      const name = (nameCell.match(SHARE_RE) || [])[0];
      const linkCell = cells.find(c => /pan\.baidu\.com|^s\//i.test(c));
      if (!name || !linkCell) continue;
      map[name] = normalizeLink(linkCell);
    }
    return map;
  }

  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    const nameCell = cells.find(c => SHARE_RE.test(c));
    if (!nameCell) continue;
    const name = (nameCell.match(SHARE_RE) || [])[0];
    const linkCell = cells.find(c => /pan\.baidu\.com|^s\//i.test(c));
    if (!name || !linkCell) continue;
    map[name] = normalizeLink(linkCell);
  }
  return map;
}

// ---------- 正文 ----------
function extractBody(html) {
  const $ = cheerio.load(html);
  const sec = $('div.single-content');
  if (!sec.length) return '';
  sec.find('img').each((i, el) => {
    const dataSrc = $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (dataSrc) {
      $(el).attr('src', dataSrc);
      $(el).removeAttr('data-src');
      $(el).removeAttr('data-lazy-src');
    }
    $(el).attr('loading', 'lazy');
    $(el).attr('decoding', 'async');
  });
  sec.find('script, iframe').remove();
  sec.find('h4').each((i, el) => {
    if (/百度网盘|UC网盘|迅雷|夸克|115|移动云/i.test($(el).text())) $(el).remove();
  });
  sec.find('p').each((i, el) => {
    if (/pan\.baidu|drive\.uc|quark|139\.com|115\.com|xunlei|百度网盘/i.test($(el).text())) $(el).remove();
  });
  sec.find('blockquote.wp-embedded-content').remove();
  sec.find('a[href*="52acgyxj.com"]').remove();
  sec.find('strong, span').each((i, el) => {
    if (/^前作[:：]/.test(($(el).text() || '').trim())) $(el).remove();
  });
  return sec.html().trim();
}

function buildBaiduBlock(links) {
  let html = '<p>——————————————————</p>\n<hr>\n<p><strong>— 下载 —</strong></p>';
  links.forEach(l => {
    const sharePart = l.share ? (l.label ? l.share + ' ' + l.label : l.share) : (l.label || '');
    const tag = sharePart ? '<p>百度网盘：' + sharePart + '</p>\n' : '';
    html += tag + '<p><a href="' + l.url + '" target="_blank" rel="noopener">' + l.url + '</a></p>\n';
  });
  return html;
}

function coverFrom(content) {
  const m = content.match(/<img[^>]+src="([^"]+)"/);
  return m ? m[1] : '';
}

function cleanTitle(t) {
  return t.replace(/【更新】|【补档】|补档/g, '').trim();
}

// ---------- 图片下载 (直连 -> 代理 CONNECT) ----------
function dechunk(buf) {
  const out = [];
  let pos = 0;
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

function parseHttp(buf) {
  const idx = buf.indexOf('\r\n\r\n');
  if (idx < 0) return buf;
  const head = buf.slice(0, idx).toString();
  if (!/^HTTP\/1\.[01] 200/.test(head)) throw new Error(head.split('\r\n')[0]);
  const body = buf.slice(idx + 4);
  return /transfer-encoding:\s*chunked/i.test(head) ? dechunk(body) : body;
}

function directGet(url, timeout) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://acgyxjvip.com/' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return directGet(new URL(r.headers.location, url).toString(), timeout).then(resolve, reject);
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

function proxyGet(url, timeout) {
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
      s.on('end', () => { try { resolve(parseHttp(Buffer.concat(chunks))); } catch (e) { reject(e); } });
      s.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('proxy timeout')));
    req.end();
  });
}

async function fetchImage(url) {
  const tries = NO_PROXY ? ['direct'] : ['direct', 'proxy'];
  let last;
  for (const how of tries) {
    try {
      const buf = how === 'direct' ? await directGet(url, 15000) : await proxyGet(url, 25000);
      if (buf && buf.length > 0) return buf;
      last = new Error('empty');
    } catch (e) { last = e; }
  }
  throw last || new Error('download failed');
}

function isImage(buf) {
  return MAGIC.some(([sig]) => buf.length >= sig.length && buf.slice(0, sig.length).equals(sig));
}

// ---------- R2 (存在 .r2.json 时启用) ----------
function loadR2() {
  const f = path.join(REPO, '.r2.json');
  if (!fs.existsSync(f)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!c.accountId || !c.bucket || !c.publicBase) return null;
    if (/^在 |^你的 /.test(String(c.accountId))) return null;
    const publicBase = String(c.publicBase).trim().replace(/\/+$/, '');

    // 优先 REST API(api.cloudflare.com); S3 域名在部分网络下会被 TLS 阻断
    if (c.apiToken && !/^★/.test(String(c.apiToken))) {
      return {
        mode: 'REST', bucket: c.bucket, publicBase,
        async put(key, buf, mime) {
          const url = `https://api.cloudflare.com/client/v4/accounts/${c.accountId}/r2/buckets/${c.bucket}/objects/${encodeURIComponent(key)}`;
          const r = await fetch(url, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${c.apiToken}`, 'Content-Type': mime || 'application/octet-stream' },
            body: buf,
          });
          if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
        },
      };
    }

    if (!c.accessKeyId || !c.secretAccessKey) return null;
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
    return {
      mode: 'S3', bucket: c.bucket, publicBase,
      async put(key, buf, mime) {
        await s3.send(new PutObjectCommand({
          Bucket: c.bucket, Key: key, Body: buf,
          ContentType: mime || 'application/octet-stream',
          CacheControl: 'public, max-age=31536000, immutable',
        }));
      },
    };
  } catch (e) {
    console.log('  [R2] 配置读取失败, 回退本地化: ' + e.message);
    return null;
  }
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// ---------- 主流程 ----------
async function main() {
  const pagePosts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')).posts;
  const csvMap = loadCsvLinks(CSV);
  const all = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const existing = all.posts;
  const existingSources = new Set(existing.map(p => p.source).filter(Boolean));
  const startId = Math.max(...existing.map(x => x.id)) + 1;

  console.log(`页面: 第 ${PAGE} 页, 抓取 ${pagePosts.length} 篇`);
  console.log(`回填表: ${Object.keys(csvMap).length} 条链接`);

  const newPosts = [];
  const skipped = [];

  for (const p of pagePosts) {
    if (existingSources.has(p.link)) { skipped.push(`${p.id} 已在库`); continue; }
    const { pc, az } = shareNames(p.content_html);
    const myLinks = [];
    const missing = [];
    if (pc) { if (csvMap[pc]) myLinks.push({ url: csvMap[pc], label: az ? 'PC' : '', share: pc }); else missing.push(pc); }
    if (az) { if (csvMap[az]) myLinks.push({ url: csvMap[az], label: 'AZ', share: az }); else missing.push(az); }
    if (!myLinks.length) { skipped.push(`${p.id} 无匹配链接(${missing.join(',') || '无分享名'})`); continue; }

    let content = extractBody('<div class="single-content">' + p.content_html + '</div>');
    content += '\n' + buildBaiduBlock(myLinks);
    newPosts.push({
      id: 0,
      title: cleanTitle(p.title),
      description: '',
      tags: ['PC', '安卓'],
      content,
      image: coverFrom(content),
      link: '',
      download: myLinks.map(l => l.url).join(' '),
      category: 'PC',
      gradient: 'linear-gradient(135deg,#3498DB,#2980B9)',
      icon: 'fa-gamepad',
      author: 'CL',
      views: 0,
      comments: 0,
      date: p.date || new Date().toISOString().slice(0, 10),
      source: p.link,
    });
  }

  newPosts.forEach((p, i) => { p.id = startId + i; p.link = '/article.html?id=' + p.id; });

  console.log(`命中 ${newPosts.length} 篇, 跳过 ${skipped.length} 篇`);
  skipped.forEach(s => console.log('  跳过: ' + s));

  const lines = [`# 第 ${PAGE} 页 预览 (共 ${newPosts.length} 篇, id ${startId}-${startId + newPosts.length - 1})`, ''];
  newPosts.forEach(p => {
    lines.push(`## #${p.id} ${p.title}`);
    lines.push(`- 封面: ${p.image || '无'}`);
    lines.push(`- 图片数: ${(p.content.match(/<img/g) || []).length}`);
    lines.push(`- 百度: ${p.download}`);
    lines.push('- 正文预览: ' + p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90));
    lines.push('');
  });
  fs.writeFileSync(OUT_MD, lines.join('\n'));
  console.log('预览: ' + OUT_MD);

  if (MODE !== 'commit') {
    console.log('预览模式, 未写库');
    return;
  }
  if (!newPosts.length) {
    console.log('没有需要部署的文章, 未写库');
    return;
  }

  // ---- 图片处理: 配了 R2 就上传对象存储, 否则本地化 ----
  const r2 = loadR2();
  console.log(r2 ? `图片去向: R2 (${r2.bucket})` : '图片去向: 本地 assets/img (未配置 .r2.json)');

  const assetsDir = path.join(REPO, 'assets', 'img');
  if (!r2) fs.mkdirSync(assetsDir, { recursive: true });

  const uniq = new Set();
  for (const p of newPosts) {
    let m;
    IMG_RE.lastIndex = 0;
    while ((m = IMG_RE.exec(p.content)) !== null) if (!m[1].startsWith('/assets/')) uniq.add(m[1]);
    if (p.image && !p.image.startsWith('/assets/')) uniq.add(p.image);
  }
  const imgList = [...uniq];
  console.log(`待处理图片 ${imgList.length} 张`);

  const localMap = {};
  let okDl = 0, reuse = 0, failDl = 0;
  for (const u of imgList) {
    const ext = (u.match(/\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i) || ['jpg'])[0].toLowerCase().replace('jpeg', 'jpg');
    const hash = u.replace(/[^a-z0-9]/gi, '').slice(-16);
    const fname = `img_${hash}.${ext}`;
    const dest = path.join(assetsDir, fname);

    if (r2) {
      // 上传到 R2 (已下载到本地的同名文件也可直接复用上传)
      try {
        let buf;
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0 && isImage(fs.readFileSync(dest))) {
          buf = fs.readFileSync(dest); reuse++;
        } else {
          buf = await fetchImage(u);
          if (!isImage(buf)) { failDl++; console.log('  非图片, 跳过: ' + u.slice(0, 70)); continue; }
        }
        await r2.put(fname, buf, MIME[ext] || 'application/octet-stream');
        localMap[u] = r2.publicBase + '/' + fname;
        okDl++;
      } catch (e) {
        failDl++;
        console.log('  失败(保持外链): ' + u.slice(0, 70) + ' -> ' + e.message);
      }
      continue;
    }

    // 本地化(原逻辑)
    const local = '/assets/img/' + fname;
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0 && isImage(fs.readFileSync(dest))) {
      localMap[u] = local; reuse++; continue;
    }
    try {
      const buf = await fetchImage(u);
      if (isImage(buf)) { fs.writeFileSync(dest, buf); localMap[u] = local; okDl++; }
      else { failDl++; console.log('  非图片, 丢弃: ' + u.slice(0, 70)); }
    } catch (e) {
      failDl++;
      console.log('  失败(保持外链): ' + u.slice(0, 70) + ' -> ' + e.message);
    }
  }
  console.log(`图片: 成功 ${okDl}, 复用 ${reuse}, 失败 ${failDl}`);

  for (const p of newPosts) {
    p.content = p.content.replace(/<img[^>]+src="([^"]+)"/g, (mm, src) => localMap[src] ? mm.replace(src, localMap[src]) : mm);
    if (p.image && localMap[p.image]) p.image = localMap[p.image];
    p.description = p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  const merged = existing.concat(newPosts);
  const tagSet = new Set();
  merged.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
  all.posts = merged;
  all.tags = [...tagSet];
  all.randomPosts = merged.map(p => ({ id: p.id, title: p.title, link: p.link, gradient: p.gradient, date: p.date }));
  all.pagination = { total: merged.length };
  fs.writeFileSync(DATA, JSON.stringify(all, null, 2));
  console.log(`已写入 posts.json: ${existing.length} -> ${merged.length}`);

  console.log('重建 posts-index.json ...');
  require('child_process').execSync('node scripts/rebuild_index.js', { cwd: REPO, stdio: 'inherit' });
}

main().catch(e => { console.error('[失败] ' + (e.message || e)); process.exit(1); });
