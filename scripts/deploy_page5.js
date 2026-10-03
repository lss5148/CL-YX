/**
 * 部署第 5 页(10 篇,全部命中 CSV)
 * 步骤:读 page5-full.json -> 按 baidu[].name 匹配 CSV 链接 -> 抓正文(保留介绍+图片)
 *      -> 删其他网盘 -> 尾部加"百度网盘 + 完整链接(带?pwd=)" -> 追加到 posts.json (id 86+)
 * 用法:node scripts/deploy_page5.js preview   (先预览不写入)
 *       node scripts/deploy_page5.js commit   (确认后写 posts.json + 图片本地化)
 */
const https = require('https');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'preview';
const USE_PROXY = process.env.USE_PROXY === '1' || process.env.PROXY !== undefined;
const PROXY = process.env.PROXY || 'http://127.0.0.1:8899';

const CSV = process.argv[3] || 'E:/主线/主线/正在做的/游戏站/.reasonix/attachments/clipboard-20261003-141304.376173-000009.csv';

function getFinal(url, depth) {
  depth = depth || 0;
  return new Promise((res, rej) => {
    if (depth > 6) return rej(new Error('redirect loop'));
    if (USE_PROXY) {
      // 走本地 HTTP 代理(直连被 ECONNRESET 时用)。默认 127.0.0.1:8899
      const u = new URL(url);
      const pu = new URL(PROXY);
      const opts = {
        host: pu.hostname || '127.0.0.1', port: pu.port ? Number(pu.port) : 8899,
        path: url, method: 'GET',
        headers: { 'Host': u.host, 'User-Agent': 'Mozilla/5.0', 'Proxy-Connection': 'keep-alive' }
      };
      const pport = pu.port ? Number(pu.port) : 8899;
      const req = require('http').request({ ...opts, port: pport }, r => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return getFinal(r.headers.location, depth + 1).then(res, rej); }
        if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode + ' (proxy)')); }
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => res(d));
      });
      req.on('error', rej);
      req.setTimeout(30000, () => { req.destroy(); rej(new Error('timeout(proxy)')); });
      req.end();
      return;
    }
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return getFinal(r.headers.location, depth + 1).then(res, rej); }
      if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    });
    req.on('error', rej);
    req.setTimeout(30000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}
async function withRetry(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try { return await getFinal(url); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw lastErr;
}

// 从 CSV 建 分享名 -> 完整链接(带?pwd=) 的映射
function loadCsvLinks() {
  const raw = fs.readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const map = {};
  // 首列名可能是"文件名"或"文件名列"，按第 1 列取
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 3) continue;
    const name = p[0].trim();
    let link = p[1].trim();
    // 确保带 ?pwd=
    if (!link.includes('?pwd=')) link = link + '?pwd=' + p[2].trim();
    map[name] = link;
  }
  return map;
}

// 从原文正文区提取:介绍段 + 图片(保留懒加载)
function extractBody(html) {
  const $ = cheerio.load(html);
  const imgs = [];
  const seen = new Set();
  $('img').each((i, el) => {
    const s = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
    if (!s) return;
    // 排除头像/广告/logo;保留正文图(imagetwist/acg.lol/uploads 等图床)
    if (/avatar|qlogo|cravatar|loading\.gif|top\/lolis/i.test(s)) return;
    if (i === 0) return;
    if (seen.has(s)) return;
    seen.add(s); imgs.push(s);
    if (!/imagetwist|uploads\/\d{4}/i.test(s)) return;
    if (/loading\.gif|avatar|qlogo|top\/lolis|logo/i.test(s)) return;
    if (i === 0) return;
    if (seen.has(s)) return;
    seen.add(s); imgs.push(s);
  });
  const imgHtml = imgs.map(s => '<p><img src="' + s + '" loading="lazy"></p>').join('\n');
  const paras = [];
  $('div[align="left"], p').each((i, el) => {
    if ($(el).closest('article.widget-post, aside, .widget, #comments').length) return;
    const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (!txt || txt.length < 2) return;
    if (/网盘|pan\.baidu|drive\.uc|quark|139\.com|115\.com|xunlei/i.test(txt)) return;
    if (/^(上一篇|下一篇|取消回复|\d+\s*评论|暂无评论)/.test(txt)) return;
    paras.push('<p>' + txt.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>');
  });
  return paras.join('\n') + '\n' + imgHtml;
}

function coverFrom(content) {
  const m = content.match(/<img\s+src="([^"]+)"/);
  return m ? m[1] : '';
}
function cleanTitle(t) {
  return t.replace(/【更新】|【补档】|补档/g, '').trim();
}

// 下载区:按 label(PC/AZ) 分行, 标签行「百度网盘：分享名+端」(有端标记时拼在后面, 无端标记时只显示分享名), 下一行放完整可点击 URL(见 AGENTS.md 下载区格式)
function buildBaiduBlock(links) {
  let html = '<p>——————————————————</p>\n<hr>\n<p><strong>— 下载 —</strong></p>';
  links.forEach(l => {
    // 分享名优先: l.share 有就拼 label(端), 没 share 才退而用 label
    const sharePart = l.share ? (l.label ? l.share + ' ' + l.label : l.share) : (l.label ? l.label : '');
    const tag = sharePart ? '<p>百度网盘：' + sharePart + '</p>\n' : '';
    // 完整 URL 直接作为可见文本 + 可点击锚点(一键复制)
    html += tag + '<p><a href="' + l.url + '" target="_blank" rel="noopener">' + l.url + '</a></p>\n';
  });
  return html;
}

async function main() {
  const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page5-full.json'), 'utf8'));
  const csvMap = loadCsvLinks();
  console.log('CSV 链接共 ' + Object.keys(csvMap).length + ' 条');

  // 按 baidu[].name 匹配 CSV,组装每篇的 myLinks
  const toDo = [];
  for (const it of page.items) {
    const bds = (it.drives.baidu || []).map(x => (typeof x === 'object' ? x : { url: x, label: '' }));
    // 有 name 的按 name 匹配 CSV,没 name 的单链接(取第一个)
    let myLinks = [];
    let missing = [];
    for (const b of bds) {
      if (b.name && csvMap[b.name]) {
        myLinks.push({ url: csvMap[b.name], label: b.label || '', share: b.name });
      } else if (!b.name) {
        // 单链接且无 name:尝试用 pwd 锚点,但这里 CSV 都是按 name,单链接一般 name 也在
        missing.push('(无分享名)');
      } else {
        missing.push(b.name);
      }
    }
    it.myLinks = myLinks;
    it.missing = missing;
    if (myLinks.length > 0) toDo.push(it);
  }
  console.log('\n命中 CSV ' + toDo.length + ' 篇,缺链接未上的 ' + (page.items.length - toDo.length) + ' 篇:');
  page.items.forEach(it => { if (it.missing && it.missing.length) console.log('  缺: ' + it.title.substring(0, 30) + ' -> ' + it.missing.join(',')); });

  const newPosts = [];
  for (const it of toDo) {
    let html;
    // 优先读本地正文缓存(避免直连 ECONNRESET / 代理语义问题)
    const localBody = path.join(__dirname, '..', 'data', 'body-' + it.id + '.html');
    if (process.env.LOCAL_BODY === '1' && fs.existsSync(localBody)) {
      html = fs.readFileSync(localBody, 'utf8');
      console.log('  [local] ' + it.id + ' 用本地正文缓存');
    } else {
      try { html = await withRetry(it.url); } catch (e) { console.log('  抓取失败 ' + it.url + ' ' + e.message); continue; }
    }
    let content = extractBody(html);
    // 去掉正文里残留的其他网盘链接(UC/迅雷/夸克/115/移动云)
    content = content.replace(/<p>(?:(?!网盘).)*UC网盘.*<\/p>/s, '');
    content = content + '\n' + buildBaiduBlock(it.myLinks);
    const post = {
      id: 0,
      title: cleanTitle(it.title),
      description: '',
      tags: ['PC', '安卓'],
      content,
      image: coverFrom(content),
      link: '',
      download: it.myLinks.map(l => l.url).filter(Boolean).join(' '),
      category: 'PC',
      gradient: 'linear-gradient(135deg,#3498DB,#2980B9)',
      icon: 'fa-gamepad',
      author: 'CL',
      views: 0,
      comments: 0,
      date: new Date().toISOString().slice(0, 10),
      source: it.url
    };
    newPosts.push(post);
    const imgs = (content.match(/<img/g) || []).length;
    console.log('  ' + post.title.substring(0, 40) + '  | 图' + imgs + '张  封面=' + (post.image ? '有' : '无') + '  百度' + it.myLinks.length + '端');
  }

  const dataPath = path.join(__dirname, '..', 'data', 'posts.json');
  const posts = JSON.parse(fs.readFileSync(dataPath, 'utf8')).posts;
  const startId = Math.max(...posts.map(p => p.id)) + 1;

  // 预览
  let lines = [];
  lines.push('# 第 5 页预览(共 ' + newPosts.length + ' 篇, id ' + startId + '-' + (startId + newPosts.length - 1) + ')');
  lines.push('');
  newPosts.forEach((p, i) => {
    p.id = startId + i;
    p.link = '/article.html?id=' + p.id;
    p.description = p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120);
    lines.push('## #' + p.id + ' ' + p.title);
    lines.push('- 封面: ' + (p.image || '无'));
    lines.push('- 图片数: ' + (p.content.match(/<img/g) || []).length);
    lines.push('- 百度: ' + p.download);
    lines.push('- 正文预览: ' + p.description);
    lines.push('');
  });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'preview-page5.md'), lines.join('\n'));

  if (MODE === 'commit') {
    const all = posts.concat(newPosts);
    const obj = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    obj.posts = all;
    const tagSet = new Set();
    all.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
    obj.tags = [...tagSet];
    obj.randomPosts = all.map(p => p.id);
    obj.pagination = { total: all.length };
    fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2));
    console.log('✅ 已写入 posts.json,现在共 ' + all.length + ' 篇');
    // 图片本地化
    const ids = newPosts.map(x => String(x.id));
    console.log('\u{1F501} 本地化新文章图片...');
    const https2 = require('https'), http2 = require('http');
    const assetsDir = path.join(__dirname, '..', 'assets', 'img');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    const uniq = new Set();
    for (const p of obj.posts) {
      if (!ids.includes(String(p.id))) continue;
      const re2 = new RegExp('<img src="([^"]+)"', 'g'); let mm;
      while ((mm = re2.exec(p.content)) !== null) { if (!mm[1].startsWith('/assets/')) uniq.add(mm[1]); }
      if (p.image && !p.image.startsWith('/assets/')) uniq.add(p.image);
    }
    const imgList = [...uniq];
    console.log('  待本地化 ' + imgList.length + ' 张');
    const localMap = {};
    for (const u of imgList) {
      const ext = (u.match(/\.(jpg|jpeg|png|webp|gif)$/i) || ['jpg'])[0].toLowerCase();
      const hash = u.replace(/[^a-z0-9]/gi, '').slice(0, 10);
      const fname = 'img_' + hash + '.' + ext;
      const dest = path.join(assetsDir, fname);
      const localPath = '/assets/img/' + fname;
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { localMap[u] = localPath; continue; }
      await new Promise(res => {
        const lib = u.startsWith('https') ? https2 : http2;
        const req = lib.get(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://acgyxjvip2.com/' }, timeout: 6000 }, r => {
          if (r.statusCode !== 200) { r.resume(); console.log('  失败' + r.statusCode + ' ' + u.substring(0, 50)); return res(); }
          const ws = fs.createWriteStream(dest); r.pipe(ws);
          ws.on('finish', () => { ws.close(); const s2 = fs.statSync(dest).size; if (s2 > 0) localMap[u] = localPath; console.log('  ' + (s2 > 0 ? 'OK' : '空') + ' ' + localPath); res(); });
          ws.on('error', () => res());
        });
        req.on('timeout', () => { req.destroy(); res(); });
        req.on('error', e => { console.log('  网络' + e.code + ' ' + u.substring(0, 50)); res(); });
      });
    }
    const IMGRE = new RegExp('<img src="([^"]+)"', 'g');
    for (const p of obj.posts) {
      if (!ids.includes(String(p.id))) continue;
      p.content = p.content.replace(IMGRE, function (mm, src) { return localMap[src] ? mm.replace(src, localMap[src]) : mm; });
      if (p.image && localMap[p.image]) p.image = localMap[p.image];
    }
    fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2));
    console.log('\u{1F501} 本地化完成: 成功 ' + Object.keys(localMap).length + ' / ' + imgList.length + ' 张');
    // 同步 posts-index.json(前端实际 fetch 的文件),否则首页不显示新文章
    console.log('重建 posts-index.json ...');
    require('child_process').execSync('node scripts/rebuild_index.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  } else {
    console.log('\n\ud83d\udc40 预览模式,未写文件。预览在 data/preview-page2.md');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
