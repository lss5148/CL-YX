/**
 * 重建指定页批次的 content:图文交替,对齐原站 single-content 结构
 * 用法:node scripts/fix_content_interleave.js [pageX-full.json]
 * 说明:不传参默认 page2-full.json;新批次传 page3-full.json 等
 *      按 pageX-full.json 的 url 匹配 posts.json 里的 source 字段
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
  // 清掉原站自带的所有网盘块:百度网盘的 h4 标签 + 含网盘链接的 p
  // (我们的百度链接统一由 deploy 阶段 buildBaiduBlock 追加在尾部,正文这里不要保留原站的)
  sec.find('h4').each((i, el) => {
    const t = $(el).text();
    if (/百度网盘|UC网盘|迅雷|夸克|115|移动云/i.test(t)) $(el).remove();
  });
  sec.find('p').each((i, el) => {
    const t = $(el).text();
    if (/pan\.baidu|drive\.uc|quark|139\.com|115\.com|xunlei|百度网盘/i.test(t)) $(el).remove();
  });
  return sec.html().trim();
}

(async () => {
  const pageFile = process.argv[2] || 'page2-full.json';
  const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'posts.json'), 'utf8'));
  const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', pageFile), 'utf8'));

  // 本次批次:posts.json 里 source 匹配 page2-full.json 中各 item.url 的新文章
  const urlSet = new Set(list.items.map(x => x.url));
  const newPosts = posts.posts.filter(p => urlSet.has(p.source));
  console.log('找到新文章', newPosts.length, '篇, ids:', newPosts.map(p => p.id).join(','));

  // 按 url 对应 page2-full.json 的 item
  const byUrl = {};
  list.items.forEach(it => { byUrl[it.url] = it; });

  let ok = 0, fail = 0;
  for (const p of newPosts) {
    const item = byUrl[p.source];
    if (!item) { console.log('#' + p.id, 'url 无对应 item,跳过'); continue; }
    try {
      const html = await fetchHtml(item.url);
      const body = interleavedBody(html);
      if (!body || !body.includes('<img')) {
        console.log('#' + p.id, '原站正文没有图,保留旧 content');
        fail++;
        continue;
      }
      // 把本批下载区(我们自己的百度链接)追加回去:interleave 整体替换正文会丢掉 deploy 时加的尾部
      if (p.download && p.download.trim()) {
        const links = p.download.split(/\s+/).filter(Boolean);
        const tagSet = new Set((item.drives && item.drives.baidu) ? item.drives.baidu.map(b => b.label).filter(Boolean) : []);
        const labels = tagSet.has('PC') && tagSet.has('AZ') && links.length === 2 ? ['PC', 'AZ'] : (tagSet.has('PC') && tagSet.has('AZ') ? ['PC'] : []);
        let block = '<p>——————————————————</p>\n<hr>\n<p><strong>— 下载 —</strong></p>';
        links.forEach((u, i) => {
          const tag = labels[i] ? '百度网盘：' + labels[i] + '<br>' : '';
          block += '<p>' + tag + '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a></p>';
        });
        p.content = body + '\n' + block;
      } else {
        p.content = body;
      }
      ok++;
      console.log('#' + p.id, 'OK,图片', (body.match(/<img/g) || []).length, '张, 尾部下载区已重拼');
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
