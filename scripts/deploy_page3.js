/**
 * 部署第 3 页(10 篇)
 * 步骤:读 page3_matched.json -> 按分享名匹配用户链接 -> 抓正文(保留介绍+图片)
 *      -> 删其他网盘 -> 尾部加"百度网盘 + 完整链接(带?pwd=)" -> 追加到 posts.json (id 66+)
 * 用法:node scripts/deploy_page3.js preview   (先预览不写入)
 *       node scripts/deploy_page3.js commit   (确认后写 posts.json + 图片本地化)
 */
const https = require('https');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'preview';

const CSV = process.argv[3] || 'E:/主线/主线/正在做的/游戏站/.reasonix/attachments/clipboard-20261002-152426.901996-000021.csv';

function getFinal(url, depth) {
  depth = depth || 0;
  return new Promise((res, rej) => {
    if (depth > 6) return rej(new Error('redirect loop'));
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 300 && r.headers.location) { r.resume(); return getFinal(r.headers.location, depth + 1).then(res, rej); }
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
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 3) continue;
    const name = p[0].trim();
    let link = p[1].trim();
    if (!link.includes('?pwd=')) link = link + '?pwd=' + p[2].trim();
    map[name] = link;
  }
  return map;
}

// 从原文正文区提取:介绍段 + 图片
function extractBody(html) {
  const $ = cheerio.load(html);
  const imgs = [];
  const seen = new Set();
  $('img').each((i, el) => {
    const s = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
    if (!s) return;
    if (/avatar|qlogo|cravatar|loading\.gif|top\/lolis/i.test(s)) return;
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

// 下载区
function buildBaiduBlock(links) {
  let html = '<p>——————————————————</p>\n<hr>\n<p><strong>— 下载 —</strong></p>';
  links.forEach(l => {
    const tag = l.label ? '百度网盘：' + l.label + '<br>' : '';
    html += '<p>' + tag + '<a href="' + l.url + '" target="_blank" rel="noopener">' + l.url + '</a></p>';
  });
  return html;
}

// 从分享的 HTML 提取百度网盘信息
function extractBaiduLinks(html) {
  const $ = cheerio.load(html);
  const result = { pc: null, az: null };
  
  $('h4').each((i, el) => {
    const text = $(el).text();
    if (!text.includes('百度网盘')) return;
    
    // 提取分享名
    const nameMatch = text.match(/百度网盘[：:]\s*(\S+)/);
    const name = nameMatch ? nameMatch[1] : '';
    
    // 提取链接
    const afterEl = $(el).nextAll().text();
    const urlMatch = afterEl.match(/pan\.baidu\.com\/s\/[^\s<>"']+/);
    const url = urlMatch ? urlMatch[0] : '';
    
    if (!url) return;
    
    const link = { name, url, text };
    
    if (/AZ|安卓/.test(name)) {
      result.az = link;
    } else {
      result.pc = link;
    }
  });
  
  return result;
}

async function main() {
  const matchedFile = path.join(__dirname, '..', '..', 'data', 'acgyxjvip2_page3', 'page3_matched.json');
  const data = JSON.parse(fs.readFileSync(matchedFile, 'utf8'));
  const posts = data.posts || data;
  
  const csvMap = loadCsvLinks();
  console.log('CSV 链接共 ' + Object.keys(csvMap).length + ' 条');
  
  const newPosts = [];
  const startId = 66; // 接在第2页之后
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const pid = post.id;
    const title = post.title;
    const html = post.content_html || '';
    
    console.log('\n[' + (i+1) + '/10] ID=' + pid + ' ' + title.substring(0, 40));
    
    // 提取百度网盘信息
    const baiduInfo = extractBaiduLinks(html);
    
    // 匹配用户链接
    let myLinks = [];
    
    if (baiduInfo.pc && csvMap[baiduInfo.pc.name]) {
      myLinks.push({ 
        label: baiduInfo.pc.name.startsWith('PCC') ? 'PC' : '', 
        name: baiduInfo.pc.name, 
        url: csvMap[baiduInfo.pc.name] 
      });
    }
    
    if (baiduInfo.az && csvMap[baiduInfo.az.name]) {
      myLinks.push({ 
        label: 'AZ', 
        name: baiduInfo.az.name, 
        url: csvMap[baiduInfo.az.name] 
      });
    }
    
    if (myLinks.length === 0) {
      console.log('  ⚠️ 未匹配链接');
      continue;
    }
    
    console.log('  匹配: ' + myLinks.map(l => l.name + '=' + l.label).join(', '));
    
    // 抓取原文正文
    let bodyHtml = '';
    try {
      bodyHtml = await withRetry(post.url);
    } catch (e) {
      console.log('  抓取失败: ' + e.message);
      continue;
    }
    
    const content = extractBody(bodyHtml) + '\n' + buildBaiduBlock(myLinks);
    const image = coverFrom(content);
    
    const newPost = {
      id: 0,
      title: cleanTitle(title),
      description: '',
      tags: ['PC', '安卓'],
      content,
      image,
      link: '',
      download: myLinks.map(l => l.url).filter(Boolean).join(' '),
      category: 'PC',
      gradient: 'linear-gradient(135deg,#3498DB,#2980B9)',
      icon: 'fa-gamepad',
      author: 'CL',
      views: 0,
      comments: 0,
      date: new Date().toISOString().slice(0, 10),
      source: post.url
    };
    
    newPosts.push(newPost);
    console.log('  封面: ' + (image ? '有' : '无') + '  百度: ' + myLinks.length + '端');
  }
  
  console.log('\n========== 部署预览 ==========');
  console.log('共 ' + newPosts.length + ' 篇待部署 (id ' + startId + '-' + (startId + newPosts.length - 1) + ')');
  
  // 预览
  let lines = [];
  lines.push('# 第 3 页预览(共 ' + newPosts.length + ' 篇, id ' + startId + '-' + (startId + newPosts.length - 1) + ')');
  lines.push('');
  newPosts.forEach((p, i) => {
    p.id = startId + i;
    p.link = '/article.html?id=' + p.id;
    p.description = p.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100);
    lines.push('## #' + p.id + ' ' + p.title);
    lines.push('- 封面: ' + (p.image || '无'));
    lines.push('- 图片数: ' + (p.content.match(/<img/g) || []).length);
    lines.push('- 百度: ' + p.download);
    lines.push('');
  });
  
  const previewPath = path.join(__dirname, '..', 'data', 'preview-page3.md');
  fs.writeFileSync(previewPath, lines.join('\n'));
  console.log('\n预览已保存到: data/preview-page3.md');
  
  if (MODE === 'commit') {
    const dataPath = path.join(__dirname, '..', 'data', 'posts.json');
    const existingPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8')).posts;
    const all = existingPosts.concat(newPosts);
    
    const obj = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    obj.posts = all;
    
    const tagSet = new Set();
    all.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
    obj.tags = [...tagSet];
    obj.randomPosts = all.map(p => ({
      title: p.title,
      link: p.link,
      gradient: p.gradient,
      date: p.date
    }));
    obj.pagination = { total: all.length };
    
    fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2));
    console.log('\n✅ 已写入 posts.json,现在共 ' + all.length + ' 篇');
    
    // 图片本地化
    const ids = newPosts.map(x => String(x.id));
    console.log('🖼️  本地化新文章图片...');
    const https2 = require('https'), http2 = require('http');
    const assetsDir = path.join(__dirname, '..', 'assets', 'img');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    
    const uniq = new Set();
    for (const p of obj.posts) {
      if (!ids.includes(String(p.id))) continue;
      const re2 = new RegExp('<img src="([^"]+)"', 'g');
      let mm;
      while ((mm = re2.exec(p.content)) !== null) {
        if (!mm[1].startsWith('/assets/')) uniq.add(mm[1]);
      }
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
      
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        localMap[u] = localPath;
        continue;
      }
      
      await new Promise(res => {
        const lib = u.startsWith('https') ? https2 : http2;
        const req = lib.get(u, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://acgyxjvip2.com/' },
          timeout: 6000
        }, r => {
          if (r.statusCode !== 200) { r.resume(); console.log('  失败' + r.statusCode + ' ' + u.substring(0, 50)); return res(); }
          const ws = fs.createWriteStream(dest);
          r.pipe(ws);
          ws.on('finish', () => {
            ws.close();
            const s2 = fs.statSync(dest).size;
            if (s2 > 0) localMap[u] = localPath;
            console.log('  ' + (s2 > 0 ? 'OK' : '空') + ' ' + localPath);
            res();
          });
          ws.on('error', () => res());
        });
        req.on('timeout', () => { req.destroy(); res(); });
        req.on('error', e => { console.log('  网络' + e.code + ' ' + u.substring(0, 50)); res(); });
      });
    }
    
    const IMGRE = new RegExp('<img src="([^"]+)"', 'g');
    for (const p of obj.posts) {
      if (!ids.includes(String(p.id))) continue;
      p.content = p.content.replace(IMGRE, function(mm, src) {
        return localMap[src] ? mm.replace(src, localMap[src]) : mm;
      });
      if (p.image && localMap[p.image]) p.image = localMap[p.image];
    }
    
    fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2));
    console.log('\n🖼️  本地化完成: 成功 ' + Object.keys(localMap).length + ' / ' + imgList.length + ' 张');
    
    // 同步 posts-index.json
    console.log('重建 posts-index.json ...');
    require('child_process').execSync('node scripts/rebuild_index.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    
    console.log('\n✅ 部署完成! 下一步: git push');
  } else {
    console.log('\n👀 预览模式,未写文件。预览在 data/preview-page3.md');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
