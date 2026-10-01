/**
 * 流程第 1 步:抓列表页正文区文章 + 网盘链接 + 分享名 + 提取码
 * 用法:node fetch_full.js <页号>(默认 2)
 * 输出:data/pageN-full.json
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

// 抓网盘链接:维护 curLabel(PC/AZ) 和 curName(分享名,如 C248333)
// 按顺序配对:标题行(h4)在前,链接行(p)在后
function extractDriveLinks(html) {
  const $ = cheerio.load(html);
  const text = $('body').text() + ' ' + html;
  const find = re => { const m = text.match(re) || []; return [...new Set(m.map(x => x))]; };
  let curLabel = '';
  let curName = '';
  const baiduList = [];
  // 扫所有 h4/h3/h2/div/p,按文档顺序
  const sel = 'h4, h3, h2, div, p';
  $(sel).each((i, el) => {
    const txt = ($(el).text() || '').replace(/\s+/g, ' ');
    if (txt.length > 200) return;
    // 先匹配「百度网盘: PC」/「百度网盘: AZ」标签行
    // 再匹配「百度网盘: C248333」等纯字母数字的分享名行(h4 居多)
    // 先匹配分享名(冒号后 4 位以上纯字母数字,PCC246999 / AZC246999 / C248333 都兼容)
    const nm5 = txt.match(/百度网盘\s*[：:]\s*([A-Za-z0-9]{4,})/i);
    if (nm5) { curName = nm5[1]; return; }
    // 再匹配「百度网盘: PC」/「百度网盘: AZ」标签行(PC/AZ 恰好 2 字母,不会和 4+ 位分享名混)
    const lab = txt.match(/百度网盘\s*[：:]\s*(PC|AZ)$/i);
    if (lab) { curLabel = lab[1].toUpperCase(); return; }
    // 最后匹配百度链接行,带上当前 label + name
    const um = txt.match(/https?:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9\-_]+/);
    if (um) baiduList.push({ url: um[0], label: curLabel, name: curName });
  });
  const seenB = new Set();
  const baidu = baiduList.filter(b => { if (seenB.has(b.url)) return false; seenB.add(b.url); return true; });
  return {
    baidu,
    uc: find(/https?:\/\/drive\.uc\.cn\/s\/[A-Za-z0-9\-_?=&]+/g),
    yun139: find(/https?:\/\/(?:caiyun|yun)\.139\.com\/[^\s<>&"]+/g),
    xunlei: find(/https?:\/\/pan\.xunlei\.com\/[^\s<>&"]+/g),
    quark: find(/https?:\/\/pan\.quark\.cn\/[^\s<>&"]+/g),
    d115: find(/https?:\/\/(?:www\.)?115\.com\/[^\s<>&"]+/g)
  };
}

function extractPwd(html) {
  const $ = cheerio.load(html);
  const text = $('body').text();
  const pats = [/提取码\s*[:：]\s*([A-Za-z0-9]{4,8})/g, /访问码\s*[:：]\s*([A-Za-z0-9]{4,8})/g, /pwd=([A-Za-z0-9]{4,8})/g];
  const found = new Set();
  pats.forEach(re => { let m; while ((m = re.exec(text)) !== null) found.add(m[1]); });
  return [...found].join(' ');
}

async function main() {
  const PAGE = parseInt(process.argv[2]) || 2;
  const listHtml = await withRetry('https://www.acgyxjvip2.com/page/' + PAGE);
  const $ = cheerio.load(listHtml);
  const seen = new Set();
  const urls = [];
  $('article h3 a, article .post-title a, article h2 a').each((i, el) => {
    const a = $(el);
    const href = a.attr('href') || '';
    const txt = a.text().trim();
    if (/\d+\.html/.test(href) && txt.length > 8 && !seen.has(href)) { seen.add(href); urls.push({ title: txt, url: href }); }
  });
  console.log('本页文章:', urls.length, '篇');
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const it = urls[i];
    try {
      const html = await withRetry(it.url);
      const drives = extractDriveLinks(html);
      const pwd = extractPwd(html);
      // 把 name 合并进 baidu 数组
      drives.baidu = drives.baidu.map(b => {
        // 从原文里找该 url 对应的分享名
        const m = html.match(new RegExp('百度网盘\\s*[：:]\\s*([A-Za-z0-9]+(?:C)?\\d{4,})\\s*(?:<[^>]*>)?\\s*链接[^<]*' + b.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
        || html.match(new RegExp(b.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*?百度网盘\\s*[：:]\\s*([A-Za-z0-9]+(?:C)?\\d{4,})', 'i'));
        // 简化:从已有 data 里带过来
        return { ...b, name: b.name || '' };
      });
      const total = Object.values(drives).reduce((n, a) => n + a.length, 0);
      console.log('  [' + (i + 1) + '/' + urls.length + '] 网盘 ' + total + ' 个 | 提取码:' + pwd + ' | ' + it.title.substring(0, 40));
      results.push({ ...it, drives, pwd });
    } catch (e) {
      console.log('  [' + (i + 1) + '/' + urls.length + '] 失败: ' + e.message);
      results.push({ ...it, drives: { baidu: [], uc: [], yun139: [], xunlei: [], quark: [], d115: [] }, pwd: '', error: e.message });
    }
    await new Promise(r => setTimeout(r, 300));
  }
  const out = path.join(__dirname, '..', 'data', 'page' + PAGE + '-full.json');
  fs.writeFileSync(out, JSON.stringify({ page: PAGE, source: 'https://www.acgyxjvip2.com/page/' + PAGE, count: results.length, items: results }, null, 2), 'utf8');
  console.log('\n✅ 完成 ->', out);
}
main().catch(e => { console.error(e); process.exit(1); });
