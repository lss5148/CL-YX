const https = require('https');
function get(url, depth) {
  depth = depth || 0;
  return new Promise((res, rej) => {
    if (depth > 5) return rej(new Error('too many redirects'));
    const r = https.get(url, { timeout: 8000 }, resp => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) { resp.resume(); return get(resp.headers.location, depth + 1).then(res, rej); }
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ status: resp.statusCode, html: d }));
    });
    r.on('error', rej); r.on('timeout', () => { r.destroy(); rej(new Error('timeout')); });
  });
}
get('https://cl-yx-e9c.pages.dev/article.html%3Fid=46').then(({ status, html }) => {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const title = $('h1, h2, .post-title, .article-title').first().text().trim().substring(0, 50);
  const imgCount = (html.match(/<img/g) || []).length;
  console.log('HTTP', status);
  console.log('标题:', title || '(空)');
  console.log('图片数:', imgCount);
  console.log('是否含帕罗贡:', html.includes('帕罗贡'));
  console.log('是否含 posts.json 引用:', html.includes('posts.json') || html.includes('siteData'));
}).catch(e => console.log('err:', e.message));
