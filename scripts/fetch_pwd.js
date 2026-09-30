/**
 * 第 1 步补充：抓每篇原文里的"提取码/密码"文字
 */
const https = require('https');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
function getFinal(url, depth) {
  depth = depth || 0;
  return new Promise((res, rej) => {
    if (depth > 5) return rej(new Error('too many redirects'));
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return getFinal(r.headers.location, depth + 1).then(res, rej); }
      if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    });
    req.on('error', rej);
    req.setTimeout(30000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}
async function withRetry(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try { return await getFinal(url); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw lastErr;
}
function extractPwdFromHtml(html) {
  const $ = cheerio.load(html);
  const text = $('body').text();
  // 提取码常见写法：提取码：xxxx / 密码：xxxx / 访问码：xxxx / 密码xxxx
  const pats = [
    /(?:提取码|访问码)\s*[:：]\s*([A-Za-z0-9]{4,8})/g,
    /(?:网盘|百度)?密码\s*[:：]\s*([A-Za-z0-9]{4,8})/g,
    /pwd=([A-Za-z0-9]{4,8})/g
  ];
  const found = new Set();
  pats.forEach(re => {
    let m;
    while ((m = re.exec(text)) !== null) found.add(m[1]);
  });
  return [...found].join(' ');
}
async function main() {
  const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2394-full.json'), 'utf8'));
  for (let i = 0; i < full.items.length; i++) {
    const it = full.items[i];
    try {
      const html = await withRetry(it.url);
      it.pwd = extractPwdFromHtml(html);
      console.log('  [' + (i + 1) + '/' + full.items.length + '] 提取码: "' + it.pwd + '" | ' + it.title.substring(0, 35));
    } catch (e) {
      it.pwd = '';
      console.log('  [' + (i + 1) + '/' + full.items.length + '] 失败: ' + e.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'page2394-full.json'), JSON.stringify(full, null, 2), 'utf8');
  console.log('\n✅ 提取码已写回 data/page2394-full.json');
}
main().catch(e => { console.error(e); process.exit(1); });
