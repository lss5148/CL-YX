/**
 * 流程记录第 1 步：抓取 acgyxjvip2.com/page/2394 的文章列表
 * 输出 page2394-list.json：每篇的 标题 + 文章URL + 封面 + 简介 + 日期
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');
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
(async () => {
  const html = await getFinal('https://www.acgyxjvip2.com/page/2394');
  const $ = cheerio.load(html);

  // 列表页每篇文章的 DOM 结构：找所有 article/标题 a 标签
  const items = [];
  // 常见的 WordPress 列表结构
  const blocks = $('.post-item, .post-list-item, article, .media, .post').get();
  // 备用：直接按标题 a 标签找
  const seen = new Set();
  const titleLinks = $('a').filter((i, el) => {
    const href = $(el).attr('href') || '';
    const txt = $(el).text().trim();
    return /^\d+\.html$|\/\d+\.html$|\/\d+$/.test(href.replace(/^https?:\/\/[^/]+/, '')) && txt.length > 10;
  });
  titleLinks.each((i, el) => {
    const a = $(el);
    const href = a.attr('href') || '';
    const title = a.text().trim();
    if (!href || seen.has(href)) return;
    seen.add(href);
    // 找该 a 所在列表项里的封面、简介、日期
    let block = a.closest('li, article, .post-item, .media, .post, div[class*=post], div[class*=item]');
    let image = '', description = '', date = '';
    if (block.length) {
      const img = block.find('img').first();
      if (img.length) image = img.attr('data-src') || img.attr('src') || '';
      const descEl = block.find('p, .description, .desc, .summary').first();
      if (descEl.length) description = descEl.text().trim().substring(0, 150);
      const dateEl = block.find('time, .date, .post-date, .meta-date').first();
      if (dateEl.length) date = dateEl.text().trim();
    }
    items.push({ title, url: href, image, description, date });
  });
  console.log('抓到文章:', items.length, '篇');
  const out = path.join(__dirname, '..', 'data', 'page2394-list.json');
  fs.writeFileSync(out, JSON.stringify({ page: 2394, source: 'https://www.acgyxjvip2.com/page/2394', count: items.length, items }, null, 2), 'utf8');
  console.log('已写入:', out);
  for (const it of items) {
    console.log('- ' + it.title.substring(0, 55));
    console.log('    ' + it.url + ' | 封面:' + (it.image ? 'Y' : 'N') + ' | 日期:' + (it.date || '-'));
  }
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
