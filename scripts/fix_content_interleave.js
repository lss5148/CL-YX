/**
 * 重建第2页(46-55)的 content:图文交替,对齐原站 single-content 结构
 * 用法:node scripts/fix_content_interleave.js
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const https = require('https');

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://www.acgyxjvip2.com/' },
      timeout: 45000
    }, r => {
      if (r.statusCode !== 200) { r.resume(); reject(new Error('http ' + r.statusCode)); return; }
      let d = '';
      r.setEncoding('utf8');
      r.on('data', c => (d += c));
      r.on('end', () => resolve(d));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// 取原站 single-content 原始顺序(图文交替),修懒加载
function interleavedBody(html) {
  const $ = cheerio.load(html);
  const sec = $('div.single-content');
  if (!sec.length) return null;
  sec.find('img').each((i, el) => {
    const dataSrc = $(el).attr('data-src');
    if (dataSrc) {
      $(el).attr('src', dataSrc);
      $(el).removeAttr('data-src');
    }
    $(el).attr('loading', 'lazy');
    $(el).attr('decoding', 'async');
  });
  sec.find('script, iframe').remove();
  // 只保留我们自己的百度网盘,清掉其他网盘
  sec.find('h4').each((i, el) => {
    const t = $(el).text();
    if (/UC网盘|迅雷|夸克|115|移动云/i.test(t)) $(el).remove();
  });
  sec.find('p').each((i, el) => {
    const t = $(el).text();
    if (/drive\.uc|quark|139\.com|115\.com|xunlei/i.test(t)) $(el).remove();
  });
  return sec.html().trim();
}

(async () => {
  const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'posts.json'), 'utf8'));
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2-full.json'), 'utf8'));

  let ok = 0, fail = 0;
  for (let i = 0; i < 10; i++) {
    const p = posts.posts[45 + i]; // id 46-55 按顺序
    const item = list.items[i];
    if (!p || !item) { console.log('索引缺失,跳过'); continue; }
    try {
      const html = await fetchHtml(item.url);
      const body = interleavedBody(html);
      if (!body || !body.includes('<img')) {
        console.log('#' + p.id, '原站正文没有图,保留旧 content');
        fail++;
        continue;
      }
      p.content = body;
      ok++;
      console.log('#' + p.id, 'OK,图片', (body.match(/<img/g) || []).length, '张');
    } catch (e) {
      console.log('#' + p.id, '抓取失败:', e.message, ',保留旧 content');
      fail++;
    }
    await new Promise(r => setTimeout(r, 800));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'posts.json'), JSON.stringify(posts, null, 2));
  console.log('完成: 成功 ' + ok + ',失败/跳过 ' + fail);
  console.log('接下来:node scripts/rebuild_index.js');
})().catch(e => { console.error(e); process.exit(1); });
