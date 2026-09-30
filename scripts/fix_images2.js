/**
 * v3.2 补全版：
 * - 用 cheerio 修复双 src 属性（loading.gif 占位 + 真实 data-src 并存的情况）
 * - 补回 16 篇没有内文图片的文章的封面图（作为正文开头的第一张图）
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const DATA_DIR = path.join(__dirname, '..', 'data');

function fixImgs(html) {
  const $ = cheerio.load(html);
  $('img').each((i, el) => {
    const $el = $(el);
    const ds = $el.attr('data-src');
    const src = $el.attr('src') || '';
    if (ds && /loading\.gif|placeholder/i.test(src)) {
      $el.attr('src', ds);
    }
    $el.removeAttr('data-src');
    $el.removeAttr('loading');
    $el.removeClass('lazy');
  });
  return $.html();
}

function ensureCoverAtStart(content, coverUrl) {
  if (!coverUrl) return content;
  if (/<img[\s>]/.test(content)) return content;
  return '<p><img src="' + coverUrl + '"></p>\n' + content;
}

async function main() {
  const postsJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'posts.json'), 'utf8'));
  let fixedGif = 0, addedCover = 0;
  for (const p of postsJson.posts) {
    let content = p.content || '';
    if (/loading\.gif/.test(content)) {
      content = fixImgs(content);
      if (!/loading\.gif/.test(content)) fixedGif++;
    }
    if (p.image && !/<img[\s>]/.test(content)) {
      content = ensureCoverAtStart(content, p.image);
      addedCover++;
    }
    p.content = content;
  }
  fs.writeFileSync(path.join(DATA_DIR, 'posts.json'), JSON.stringify(postsJson, null, 2), 'utf8');

  const indexJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'posts-index.json'), 'utf8'));
  indexJson.posts = postsJson.posts.map(p => ({ id: p.id, title: p.title, link: p.link, description: p.description, image: p.image, tags: p.tags, category: p.category, gradient: p.gradient, icon: p.icon, date: p.date }));
  fs.writeFileSync(path.join(DATA_DIR, 'posts-index.json'), JSON.stringify(indexJson, null, 2), 'utf8');

  console.log('✅ 修复双 src:', fixedGif, '篇 | 补封面:', addedCover, '篇');
}
main().catch(e => { console.error(e); process.exit(1); });
