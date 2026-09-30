/**
 * 第 3 步：读 CSV，匹配出哪些文章有用户自己的百度链接
 * 输出：匹配报告 + 写进 page2394-full.json 的 myLinks
 */
const fs = require('fs');
const path = require('path');

const CSV = 'C:/Users/Administrator/Downloads/批量分享记录_202609301215.csv';
const fullPath = path.join(__dirname, '..', 'data', 'page2394-full.json');
const full = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

// 读 CSV
const csvLines = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/);
const myLinks = csvLines.slice(1).map(line => {
  const [name, url, pwd] = line.split(',');
  return { name: (name || '').trim(), url: (url || '').trim(), pwd: (pwd || '').trim() };
}).filter(x => x.url);

console.log('CSV 里共 ' + myLinks.length + ' 条链接');

// 匹配：CSV 文件名(短) 对应 文章标题里的关键词
// 规则：文件名 2 个以上连续字匹配到标题 → 视为同一篇
function normalize(s) {
  return s.replace(/\[|\]|\(|\)|【|】|（|）/g, ' ').replace(/[\u3000-\u303f\uff00-\uffef]/g, ' ').replace(/\s+/g, ' ').trim();
}
const matched = [];
const unmatched = [];
for (const m of myLinks) {
  const mNorm = normalize(m.name);
  const words = mNorm.split(' ').filter(w => w.length >= 2);
  let hit = null;
  for (const it of full.items) {
    const tNorm = normalize(it.title);
    // 文件名整段在标题里 → 命中
    if (mNorm.length >= 3 && tNorm.includes(mNorm.toLowerCase())) { hit = it; break; }
    // 或文件名核心词全在标题里
    if (words.length >= 1 && words.every(w => tNorm.toLowerCase().includes(w.toLowerCase()))) { hit = it; break; }
  }
  if (hit) {
    hit.myLink = m.url;
    hit.myPwd = m.pwd;
    matched.push({ name: m.name, url: m.url, title: hit.title.substring(0, 50) });
  } else {
    unmatched.push({ name: m.name, url: m.url });
  }
}

console.log('\n=== 匹配成功 ' + matched.length + ' 条 ===');
matched.forEach(x => console.log('  [' + x.name + '] -> ' + x.title));
console.log('\n=== 未匹配 ' + unmatched.length + ' 条 ===');
unmatched.forEach(x => console.log('  [' + x.name + '] ' + x.url));

// 写回
fs.writeFileSync(fullPath, JSON.stringify(full, null, 2), 'utf8');
console.log('\n✅ 已写回 myLink 到 ' + fullPath);

// 打印最终表格预览
console.log('\n=== 待部署文章（有 myLink 的）===');
for (const it of full.items) {
  if (it.myLink) {
    console.log(it.title.substring(0, 45), '->', it.myLink);
  }
}
