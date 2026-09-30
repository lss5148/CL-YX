// 修复循环写回 bug + 正则:每张图只试 2 次,失败跳过,只把下载成功的写回一次
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '..');
const postsPath = path.join(postsDir, 'data', 'posts.json');
const assetsDir = path.join(postsDir, 'assets', 'img');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

const data = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const posts = data.posts;

const urls = new Set();
for (const p of posts) {
  const re = /<img\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(p.content)) !== null) {
    if (!m[1].startsWith('/assets/')) urls.add(m[1]);
  }
  if (p.image && !p.image.startsWith('/assets/')) urls.add(p.image);
}
const list = [...urls];
console.log('待下载(去重):', list.length);

const urlMap = {};
let done = 0, skipped = 0;
let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  // 正则:替换 <img src="X"> 的 X
  const IMGRE = new RegExp('<img\\s+src="([^"]+)"', 'g');
  for (const p of posts) {
    p.content = p.content.replace(IMGRE, function (mm, src) {
      const local = urlMap[src];
      return local ? mm.replace(src, local) : mm;
    });
    if (p.image && urlMap[p.image]) p.image = urlMap[p.image];
  }
  fs.writeFileSync(postsPath, JSON.stringify(data, null, 2));
  console.log('\n=== 完成: 成功 ' + done + ' / 跳过 ' + skipped + ' (跳过图保持外链) ===');
}

function fetchOne(url, depth, dest, cb) {
  if (depth > 2) return cb(false, 'RETRY_MAX');
  const lib = url.startsWith('https') ? https : http;
  const req = lib.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://acgyxjvip2.com/' },
    timeout: 6000
  }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      return fetchOne(r.headers.location, depth + 1, dest, cb);
    }
    if (r.statusCode !== 200) { r.resume(); return cb(false, r.statusCode); }
    const ws = fs.createWriteStream(dest);
    r.pipe(ws);
    ws.on('finish', () => { ws.close(); const s = fs.statSync(dest).size; cb(s > 0, 200); });
    ws.on('error', () => cb(false, 'WRITE_ERR'));
  });
  req.on('timeout', () => { req.destroy(); cb(false, 'TIMEOUT'); });
  req.on('error', e => cb(false, e.code || 'ERR'));
}

function run(idx) {
  if (idx >= list.length) { finish(); return; }
  const u = list[idx];
  const ext = (u.match(/\.(jpg|jpeg|png|webp|gif)$/i) || ['jpg'])[0].toLowerCase();
  const fname = 'img_' + (idx + 1) + '.' + ext;
  const dest = path.join(assetsDir, fname);
  const localPath = '/assets/img/' + fname;
  const next = () => run(idx + 1);

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    urlMap[u] = localPath; done++;
    next();
    return;
  }
  fetchOne(u, 0, dest, (ok, code) => {
    if (ok) { urlMap[u] = localPath; done++; }
    else { skipped++; }
    next();
  });
}
run(0);
