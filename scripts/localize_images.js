/**
 * 图片本地化:把文章正文里的外链图下载到 assets/img/,posts.json 引用改成本地路径
 * 用法:
 *   node scripts/localize_images.js all   # 全部 40 篇的外链图(历史+新)
 *   node scripts/localize_images.js <id>  # 只指定某几篇,如 "36 37 38 39 40"
 * 说明:
 *   - 每张图最多重试 2 次,失败就保持外链(页面 onerror 会自动隐藏破图)
 *   - 已成功/已存在的图会跳过
 *   - 成功后写回 posts.json
 */
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

// 目标篇:全部 or 指定 id
const onlyIds = process.argv[3] ? process.argv[3].split(/\s+/).map(Number) : null;
const targets = onlyIds ? posts.filter(p => onlyIds.includes(p.id)) : posts;
console.log('目标篇数:', targets.length, onlyIds ? ('(id: ' + onlyIds.join(',') + ')') : '(全部)');

// 收集外链图(排除已本地的 /assets/)
const urlSet = new Set();
for (const p of targets) {
  const re = /<img\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(p.content)) !== null) {
    if (!m[1].startsWith('/assets/')) urlSet.add(m[1]);
  }
  if (p.image && !p.image.startsWith('/assets/')) urlSet.add(p.image);
}
const list = [...urlSet];
console.log('待下载外链图(去重):', list.length);

const urlMap = {};
let done = 0, skipped = 0;
let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  const IMGRE = new RegExp('<img\\s+src="([^"]+)"', 'g');
  for (const p of targets) {
    p.content = p.content.replace(IMGRE, function (mm, src) {
      const local = urlMap[src];
      return local ? mm.replace(src, local) : mm;
    });
    if (p.image && urlMap[p.image]) p.image = urlMap[p.image];
  }
  fs.writeFileSync(postsPath, JSON.stringify(data, null, 2));
  console.log('\n=== 完成: 成功 ' + done + ' / 跳过 ' + skipped + ' (跳过的保持外链,页面 onerror 自动隐藏) ===');
}

// 主图床 image.acg.lol 被墙，自动 fallback 到 acgyx.us（同路径）
function fallbackUrl(url) {
  return url.replace('image.acg.lol', 'acgyx.us');
}
function fetchOne(url, depth, dest, cb) {
  if (depth > 3) return cb(false, 'RETRY_MAX');
  // depth>=1 时改用 fallback 域
  const realUrl = depth >= 1 ? fallbackUrl(url) : url;
  const lib = realUrl.startsWith('https') ? https : http;
  const req = lib.get(realUrl, {
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
  if (idx === 0) {
    try { fs.copyFileSync(postsPath, postsPath + '.bak'); } catch (e) { /* ignore */ }
  }
  if (idx >= list.length) { finish(); return; }
  const u = list[idx];
  const ext = (u.match(/\.(jpg|jpeg|png|webp|gif)$/i) || ['jpg'])[0].toLowerCase();
  // 用 md5 风格命名避免覆盖
  const hash = u.replace(/[^a-z0-9]/gi, '').slice(0, 10);
  const fname = 'img_' + hash + '.' + ext;
  const dest = path.join(assetsDir, fname);
  const localPath = '/assets/img/' + fname;
  const next = () => run(idx + 1);

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    urlMap[u] = localPath; done++;
    console.log('[' + (idx + 1) + '/' + list.length + '] 已存在 ' + localPath);
    next();
    return;
  }
  fetchOne(u, 0, dest, (ok, code) => {
    if (ok) { urlMap[u] = localPath; done++; console.log('[' + (idx + 1) + '/' + list.length + '] OK ' + localPath); }
    else { skipped++; console.log('[' + (idx + 1) + '/' + list.length + '] SKIP(' + code + ') ' + u.substring(0, 55)); }
    next();
  });
}
run(0);
