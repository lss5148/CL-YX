const d = require(__dirname + '/../data/posts.json');
console.log('总篇数:', d.posts.length);
let ok = 0, bad = 0;
for (const p of d.posts) {
  const ext = (p.content.match(/<img\s+src="(?!(?:\/assets|\/assets))[a-z]/g) || []).length;
  if (ext > 0) bad++; else ok++;
}
console.log('还有外链图的篇数:', bad, '| 全本地/空的篇数:', ok);
