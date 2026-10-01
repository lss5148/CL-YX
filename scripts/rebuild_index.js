/**
 * 重建 data/posts-index.json(网站实际加载的文件)
 * 背景:部署只更新了 posts.json,但前端 fetch 的是 posts-index.json,导致首页不显示新文章
 * 规则:
 *   - posts: 取 posts.json 全部 55 篇,每篇保留 index 所需字段(去掉 content/download/author/authorAvatar/comments/source/views)
 *   - tags: 字符串数组(旧文件误存成对象数组,导致标签云显示 [object Object])
 *   - randomPosts: 最新 5 篇的 id
 *   - pagination: total/perPage 同步
 */
const fs = require('fs');
const path = require('path');

const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'posts.json'), 'utf8'));
const oldIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'posts-index.json'), 'utf8'));

// 每篇精简:保留 index 需要的字段
const KEEP = ['id', 'title', 'link', 'description', 'image', 'tags', 'category', 'gradient', 'icon', 'date'];
const slimPosts = full.posts.map(p => {
  const o = {};
  KEEP.forEach(k => { if (p[k] !== undefined) o[k] = p[k]; });
  return o;
});

// 重建 tags 字符串数组(全量去重)
const tagSet = new Set();
full.posts.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
const tags = [...tagSet];

// randomPosts:最新 5 篇 id(按日期倒序+id倒序)
const sorted = [...full.posts].sort((a, b) => {
  const da = a.date || '', db = b.date || '';
  if (da !== db) return da < db ? 1 : -1;
  return (b.id || 0) - (a.id || 0);
});
const randomPosts = sorted.slice(0, 5).map(p => p.id);

const newIndex = {
  site: oldIndex.site,
  posts: slimPosts,
  tags,
  comments: oldIndex.comments || [],
  randomPosts,
  pagination: { total: full.posts.length, perPage: 10 }
};

const out = path.join(__dirname, '..', 'data', 'posts-index.json');
fs.writeFileSync(out, JSON.stringify(newIndex, null, 2));
console.log('✅ 重建 posts-index.json:', newIndex.posts.length, '篇, tags', tags.length, '个, randomPosts', randomPosts.join(','));
console.log('   最大 id:', Math.max(...newIndex.posts.map(p => p.id)));
