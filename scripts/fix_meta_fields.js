/**
 * 修复 posts.json / posts-index.json:
 * 1) 补齐 author="CL"、views=0、comments="0"(首页卡片 meta 显示 undefined 的根因)
 * 2) 随机推荐区缩略图:改用 gradient 占位(图床被墙无法显示,占位更干净)
 * 3) 封面图尺寸统一为 3:4 卡图(见 style.css)
 */
const fs = require('fs');
const path = require('path');

for (const file of ['data/posts.json', 'data/posts-index.json']) {
  const p = path.join(__dirname, '..', file);
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  (obj.posts || []).forEach(post => {
    if (post.author == null || post.author === '') post.author = 'CL';
    if (post.views == null) post.views = 0;
    if (post.comments == null || post.comments === '') post.comments = '0';
  });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  console.log('fixed:', file, (obj.posts || []).length, '篇');
}
