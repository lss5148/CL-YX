/**
 * 修复仍残留 loading.gif 的 <img> 标签：
 * 这些标签原本有 data-src，但 restoreBody 用简单正则替换后丢失了 data-src，
 * 导致 src 还是占位 gif。这里用 cheerio 重新识别并补上真实 src。
 * 策略：如果 <img> 的 src 是 loading.gif 且 data-src 为空/缺，则尝试从原始 source 页重新抓取该图的 data-src 并写回。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const DATA_DIR = path.join(__dirname, '..', 'data');

function fetchFinal(url, depth) {
  depth = depth || 0;
  return new Promise((res, rej) => {
    if (depth > 5) return rej(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return fetchFinal(r.headers.location, depth + 1).then(res, rej);
      if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}

async function main() {
  const postsJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'posts.json'), 'utf8'));
  let fixed = 0;
  for (const p of postsJson.posts) {
    if (!/loading\.gif/.test(p.content)) continue;
    try {
      const html = await fetchFinal(p.source);
      const $ = cheerio.load(html);
      const c = $('.single-content').first();
      // 按顺序取原文里的 img 的 data-src
      const realSrcs = [];
      c.find('img').each((i, el) => {
        const $el = $(el);
        const ds = $el.attr('data-src');
        if (ds && !/loading\.gif/i.test(ds)) realSrcs.push(ds);
      });
      // 把 p.content 里所有 loading.gif 的 src 替换成 realSrcs（按顺序）
      let idx = 0;
      p.content = p.content.replace(/<img([^>]*)\s*src="[^"]*loading\.gif"([^>]*)>/gi, (match, pre, post) => {
        if (idx >= realSrcs.length) return match;
        const url = realSrcs[idx++];
        // 重新构造 img，把 src 换成 url，保留其他属性
        const attrs = (pre + ' ' + post).trim();
        return '<img' + (attrs ? ' ' + attrs : '') + ' src="' + url + '" decoding="async">';
      });
      if (!/loading\.gif/.test(p.content)) fixed++;
      else console.log('  id=' + p.id + ' still has gif, realSrcs=' + realSrcs.length);
    } catch (e) {
      console.log('  id=' + p.id + ' fetch failed:', e.message);
    }
  }
  fs.writeFileSync(path.join(DATA_DIR, 'posts.json'), JSON.stringify(postsJson, null, 2), 'utf8');
  const indexJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'posts-index.json'), 'utf8'));
  indexJson.posts = postsJson.posts.map(pp => ({ id: pp.id, title: pp.title, link: pp.link, description: pp.description, image: pp.image, tags: pp.tags, category: pp.category, gradient: pp.gradient, icon: pp.icon, date: pp.date }));
  fs.writeFileSync(path.join(DATA_DIR, 'posts-index.json'), JSON.stringify(indexJson, null, 2), 'utf8');
  console.log('✅ fixed gif src:', fixed, '篇');
}
main().catch(e => { console.error(e); process.exit(1); });
