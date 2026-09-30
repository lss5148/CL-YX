/**
 * 第 1 步补充：抓每篇原文里的"文件名/分享名"
 * 通常出现在：
 *  - "文件名：" "原文件名：" "分享名：" 这类文字后面
 *  - 百度网盘分享链接里的 ?pwd= 之前的 /s/xxx 里的 xxx（文件名）
 *  - 网盘卡片区域（class 带 drive/pan/baidu 的块）里的 <a> 文本
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
function extractFileNames(html) {
  const $ = cheerio.load(html);
  const text = $('body').text();
  const found = new Set();
  // 1) "文件名：xxx" / "原文件名：xxx" / "分享名：xxx" / "压缩包：xxx"
  const pats = [
    /文件名\s*[:：]\s*([^\n\r<>\s]{2,60})/g,
    /原文件名\s*[:：]\s*([^\n\r<>\s]{2,60})/g,
    /分享名\s*[:：]\s*([^\n\r<>\s]{2,60})/g,
    /压缩包\s*[:：]\s*([^\n\r<>\s]{2,60})/g,
    /游戏名\s*[:：]\s*([^\n\r<>\s]{2,60})/g
  ];
  pats.forEach(re => {
    let m;
    while ((m = re.exec(text)) !== null) {
      const v = m[1].trim();
      // 过滤掉太短的或明显不是文件名的
      if (v.length >= 2 && v.length <= 60 && !/^\d+$/.test(v)) found.add(v);
    }
  });
  // 2) 找所有网盘区域的 <a> 文本（标题里带"网盘"关键词的段落）
  $('p, div').each((i, el) => {
    const $el = $(el);
    const txt = $el.text() || '';
    if (/网盘|pan\.baidu|drive\.uc|xunlei|quark|115\.com/i.test(txt)) {
      $el.find('a').each((j, a) => {
        const t = $(a).text().trim();
        if (t && t.length >= 2 && t.length <= 60 && !/^https?:/i.test(t)) found.add(t);
      });
    }
  });
  return [...found];
}
async function main() {
  const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2394-full.json'), 'utf8'));
  for (let i = 0; i < full.items.length; i++) {
    const it = full.items[i];
    try {
      const html = await withRetry(it.url);
      it.fileNames = extractFileNames(html);
      console.log('  [' + (i + 1) + '/' + full.items.length + '] 文件名: ' + JSON.stringify(it.fileNames) + ' | ' + it.title.substring(0, 30));
    } catch (e) {
      it.fileNames = [];
      console.log('  [' + (i + 1) + '/' + full.items.length + '] 失败');
    }
    await new Promise(r => setTimeout(r, 300));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'page2394-full.json'), JSON.stringify(full, null, 2), 'utf8');
  console.log('\n✅ 文件名已写回');
}
main().catch(e => { console.error(e); process.exit(1); });
