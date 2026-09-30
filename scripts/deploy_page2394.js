/**
 * 部署第 2394 页:只上 myLink 有值的 5 篇
 * 步骤:抓正文(保留介绍+图片) -> 删其他网盘 -> 尾部加"百度网盘：jxnf + 完整链接" -> 追加到 posts.json (id 36-40)
 * 用法: node scripts/deploy_page2394.js preview  (先预览不写入)
 *        node scripts/deploy_page2394.js commit  (确认后写 posts.json)
 */
const https = require('https');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'preview';

const BUCKET = 'cl-yx';

function getFinal(url, depth) {
  depth = depth || 0;
  return new Promise((res, rej) => {
    if (depth > 6) return rej(new Error('redirect loop'));
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

// 从原文正文区提取:图片 + 介绍段
function extractBody(html) {
  const $ = cheerio.load(html);
  // 正文图文:介绍在 <div align=left>,图在 img(imagetwist 域);排除侧栏/头图/网盘/评论
  const imgs = [];
  const seen = new Set();
  $('img').each((i, el) => {
    const s = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
    if (!s) return;
    // 只要正文图:imagetwist 图床,排除侧栏/头图/头像/广告/网盘
    if (!/imagetwist|uploads\/\d{4}/i.test(s)) return;
    if (/loading\.gif|avatar|qlogo|top\/lolis|logo/i.test(s)) return;
    // 头图(washroom 之类横幅)排除:取第一张 img 之前的
    if (i === 0) return;
    if (seen.has(s)) return;
    seen.add(s); imgs.push(s);
  });
  const imgHtml = imgs.map(s => '<p><img src="' + s + '" loading="lazy"></p>').join('\n');
  // 介绍文字:
  const paras = [];
  $('div[align="left"], p').each((i, el) => {
    // 跳过网盘区/评论/侧栏
    if ($(el).closest('article.widget-post, aside, .widget, #comments').length) return;
    const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (!txt || txt.length < 2) return;
    if (/网盘|pan\.baidu|drive\.uc|quark|139\.com|115\.com|xunlei/i.test(txt)) return;
    if (/^(上一篇|下一篇|取消回复|\d+\s*评论|暂无评论)/.test(txt)) return;
    paras.push('<p>' + txt.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>');
  });
  // 顺序:先介绍文字,再正文图,网盘区由调用方追加
  return paras.join('\n') + '\n' + imgHtml;
}

// 封面图:正文第一张图
function coverFrom(content) {
  const m = content.match(/<img\s+src="([^"]+)"/);
  return m ? m[1] : '';
}

function cleanTitle(t) {
  return t.replace(/【更新】|【补档】|补档/g, '').trim();
}

function buildBaiduBlock(pwd, link) {
  return '<p>——————————————————</p>\n<hr>\n<p><strong>— 下载 —</strong></p>\n<p>百度网盘：' + pwd + '<br>链接：<a href="' + link + '" target="_blank" rel="noopener">' + link + '</a></p>';
}

async function main() {
  const page = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2394-full.json'), 'utf8'));
  const toDo = page.items.filter(it => it.myLink);
  console.log('待部署 ' + toDo.length + ' 篇:');

  const newPosts = [];
  for (const it of toDo) {
    let html;
    try { html = await withRetry(it.url); } catch (e) { console.log('  抓取失败 ' + it.url + ' ' + e.message); continue; }
    let content = extractBody(html);
    // 安全:去掉正文里任何残留的其他网盘链接(UC/迅雷/夸克/115/移动云)
    content = content.replace(/<p>(?:(?!网盘).)*UC网盘.*<\/p>/s, '');
    const pwd = 'jxnf';
    content = content + '\n' + buildBaiduBlock(pwd, it.myLink);
    const post = {
      id: 0, // commit 时再编号
      title: cleanTitle(it.title),
      description: '',
      tags: ['PC', '安卓'],
      content,
      image: coverFrom(content),
      link: '', // commit 时填 /article.html?id=N
      download: it.myLink,
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
    console.log('  ' + post.title.substring(0, 40) + '  | 图' + imgs + '张  封面=' + (post.image ? '有' : '无'));
  }

  const dataPath = path.join(__dirname, '..', 'data', 'posts.json');
  const posts = JSON.parse(fs.readFileSync(dataPath, 'utf8')).posts;
  const startId = Math.max(...posts.map(p => p.id)) + 1;

  // 预览清单
  let lines = [];
  lines.push('# 第 2394 页预览(共 ' + newPosts.length + ' 篇, id ' + startId + '-' + (startId + newPosts.length - 1) + ')');
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
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'preview-2394.md'), lines.join('\n'));

  if (MODE === 'commit') {
    const all = posts.concat(newPosts);
    const obj = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    obj.posts = all;
    // 更新 tags / randomPosts / pagination
    const tagSet = new Set();
    all.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
    obj.tags = [...tagSet];
    obj.randomPosts = all.map(p => p.id);
    obj.pagination = { total: all.length };
    fs.writeFileSync(dataPath, JSON.stringify(obj, null, 2));
    console.log('✅ 已写入 posts.json,现在共 ' + all.length + ' 篇');
  } else {
    console.log('\n👀 预览模式,未写文件。预览在 data/preview-2394.md');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
