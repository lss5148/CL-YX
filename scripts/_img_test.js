const d = require(__dirname + '/../data/posts.json');
const posts = d.posts;
const urls = new Set();
for (const p of posts) {
  const re = /<img\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(p.content)) !== null) urls.add(m[1]);
  if (p.image) urls.add(p.image);
}
const list = [...urls];
const https = require('https');
function test(u, ref) {
  return new Promise(res => {
    const req = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': ref } }, r => {
      r.resume();
      const c = String(r.statusCode);
      res(c + ' ' + u.substring(0, 60));
      req.destroy();
    });
    req.on('error', e => res('ERR(' + e.code + ') ' + u.substring(0, 60)));
    req.setTimeout(8000, () => { req.destroy(); res('TIMEOUT ' + u.substring(0, 60)); });
  });
}
(async () => {
  const sample = list.filter(u => !u.includes('image.acg.lol')).slice(0, 10);
  console.log('=== 不带 referer(模拟直接打开) ===');
  for (const u of sample) console.log(await test(u, ''));
  const acg = list.find(u => u.includes('image.acg.lol'));
  if (acg) console.log('\nacg.lol 参考:', await test(acg, ''));
})();
