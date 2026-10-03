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
  // 优先读本地正文缓存 data/body-<源站id>.html (直连 ECONNRESET 时用)
  const m = url.match(/\/(\d+)\.html/);
  if (m) {
    const local = path.join(__dirname, '..', 'data', 'body-' + m[1] + '.html');
    if (fs.existsSync(local)) {
      console.log('  [local] ' + local);
      return Promise.resolve(fs.readFileSync(local, 'utf8'));
    }
  }
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
// 注意: 下载区链接由 deploy 阶段 buildBaiduBlock 追加, 这里清理网盘块但不重建下载区,
//       下载区由调用方(见下方重拼段)按 分享名+端 格式补回, 避免 interleave 抹掉下载区 (AGENTS #20/#25)
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
  // 清掉原站"前作/相关/更多"推荐块(wp-embedded-content 引块 + 含 52acgyxj 域名的锚点)
  sec.find('blockquote.wp-embedded-content').remove();
  sec.find('a[href*="52acgyxj.com"]').remove();
  // 清掉"前作：xxx"引导文字
  sec.find('strong, span').each((i, el) => {
    const t = ($(el).text() || '').trim();
    if (/^前作[:：]/.test(t)) $(el).remove();
  });
  return sec.html().trim();
}

// 重拼本批下载区: 标签行「百度网盘：分享名+端」+ 完整可点击 URL (AGENTS.md 下载区格式新规)
// item.drives.baidu 元素形如 {name:'PCC258000', label:'PC'} / {name:'AZC258000', label:'AZ'} / {name:'C256111', label:''}
function buildDownloadBlock(downloadStr, item) {
  if (!downloadStr || !downloadStr.trim()) return '';
  const links = downloadStr.split(/\s+/).filter(Boolean);
  const bds = (item.drives && item.drives.baidu) || [];
  // 逐条取分享名+端; download 字段里的链接顺序与 bds 对应(deploy 时同一顺序生成)
  const lines = links.map((u, i) => {
    const b = bds[i] || {};
    const share = b.name || '';
    const side = b.label || '';
    const sharePart = share ? (side ? share + ' ' + side : share) : (side || '');
    const tag = sharePart ? '<p>百度网盘：' + sharePart + '</p>\n' : '';
    return tag + '<p><a href="' + u + '" target="_blank" rel="noopener">' + u + '</a></p>\n';
  });
  return '<p>——————————————————</p>\n<hr>\n<p><strong>— 下载 —</strong>\n' + lines.join('\n');
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
      // 把本批下载区(我们自己的百度链接)按 分享名+端 格式重拼回尾部
      // (interleave 整体替换正文会丢掉 deploy 时加的尾部, AGENTS #20; 分享名/端来自 page2-full.json 的 item.drives.baidu)
      p.content = body + '\n' + buildDownloadBlock(p.download, item);
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
