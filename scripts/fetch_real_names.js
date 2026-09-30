/**
 * 精确抓"原文件分享名"：只认下载区/网盘区的 <p> 段落，找"文件名：" 后面那个 <a> 或纯文本
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
function extractRealFileName(html) {
  const $ = cheerio.load(html);
  const names = new Set();
  $('p, div').each((i, el) => {
    const $el = $(el);
    const txt = ($el.text() || '').replace(/\s+/g, ' ').trim();
    if (txt.length > 200) return;
    // 网盘行形如"百度网盘：孤儿 链接：https://..."，文件名写在冒号后
    const m = txt.match(/(百度网盘|UC网盘|UC云盘|移动云盘|迅雷网盘|夸克网盘|115网盘)\s*[：:]\s*(\S+?)(?:\s|链接：|https?:)/i);
    if (m && m[2]) names.add(m[2]);
  });
  return [...names];
}
async function main() {
  const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2394-full.json'), 'utf8'));
  for (let i = 0; i < full.items.length; i++) {
    const it = full.items[i];
    try {
      const html = await withRetry(it.url);
      it.realFileNames = extractRealFileName(html);
      console.log('  [' + (i + 1) + '/' + full.items.length + '] ' + JSON.stringify(it.realFileNames) + ' | ' + it.title.substring(0, 35));
    } catch (e) {
      it.realFileNames = [];
      console.log('  [' + (i + 1) + '/' + full.items.length + '] 失败: ' + e.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'page2394-full.json'), JSON.stringify(full, null, 2), 'utf8');
  console.log('\n✅ 已写回 realFileNames');
}
main().catch(e => { console.error(e); process.exit(1); });
