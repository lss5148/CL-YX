/**
 * 修复 v3：恢复文章正文（介绍 + 图片）
 * 3) 把正文里的原下载区（百度网盘/UC/移动云盘等 + 分隔线）整体裁掉
 * 4) 末尾重新拼接用户自己的百度网盘区块
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const XLSX = require('xlsx');

const BASE = 'https://www.acgyxjvip2.com';
const EXCEL_PATH = 'E:/主线/主线/正在做的/游戏站/百度提取的分享链接/百度分享链接_已替换_v2.xlsx';
const DATA_DIR = path.join(__dirname, '..', 'data');
const RETRY = 2;
const BUDGET_CODE = 'B936111';

function fetchFinal(url, depth) {
  depth = depth || 0;
  return new Promise((res, rej) => {
    if (depth > 5) return rej(new Error('too many redirects'));
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return fetchFinal(r.headers.location, depth + 1).then(res, rej);
      if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    });
    req.on('error', rej);
    req.setTimeout(30000, () => { req.destroy(); rej(new Error('timeout')); });
    req.end();
  });
}
async function fetchWithRetry(url) {
  let lastErr;
  for (let i = 0; i <= RETRY; i++) {
    try { return await fetchFinal(url); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw lastErr;
}
function decodeEntities(t) {
  if (!t) return '';
  return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ');
}

// 判断一个 <p> 是否属于"下载区"：含网盘链接、或网盘关键词、或纯分隔线
function isDownloadPara(html) {
  const lower = html.toLowerCase();
  if (/(drive\.uc|drive\.uc\.cn|caiyun\.139|yun\.139|pan\.quark|pan\.xunlei|115\.com|pan\.baidu)/.test(lower)) return true;
  if (/(UC网盘|uc网盘|移动云盘|迅雷|夸克网盘|夸克链接|夸克|115|115链接|115云|云115|115资源|baidu网盘|百度网盘|百度网盘|百度链接)/.test(html)) return true;
  // 纯分隔线段落：只包含 — 横线 / 中文破折号 / 全角横线 / 空
  const txt = html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').trim();
  if (/^[—–\-:：\s]{0,3}$/.test(txt) && txt.length <= 4) return true; // "—" or "—" etc
  return false;
}

// 把内容 HTML 里下载区（连续的 isDownloadPara 段落 + 它们之间的 <hr>）删掉
function cutDownloadBlock(html) {
  if (!html) return html;
  let c = html;
  // 反复直到没有变化：删掉任意含网盘关键词/链接的 <p>，以及任何 <hr>
  let changed = true;
  while (changed) {
    changed = false;
    const re = /<p[^>]*>([\s\S]*?)<\/p>|<hr[^>]*\/?>/gi;
    c = c.replace(re, (match, inner) => {
      if (match.startsWith('<hr')) return '';
      if (inner !== undefined && isDownloadPara(match)) { changed = true; return ''; }
      return match;
    });
    // 清理多余空行
    c = c.replace(/\n{3,}/g, '\n\n');
    c = c.replace(/(<p[^>]*>\s*<\/p>\s*){2,}/gi, '');
  }
  return c;
}

// 把懒加载图片的 src 还原为 data-src
function restoreLazyImgs(html) {
  return html
    .replace(/\bdata-src="([^"]*)"\s+class="lazy"/gi, (m, url) => 'src="' + url + '"')
    .replace(/\bsrc="[^"]*loading\.gif"[^"]*"\s*data-src="([^"]*)"/gi, (m, url) => 'src="' + url + '"')
    .replace(/<img([^>]*)\sdata-src="([^"]*)"/g, (m, rest, url) => {
      if (rest.includes('src="')) return m;
      return '<img' + rest + ' src="' + url + '"';
    })
    .replace(/\s+class="lazy"/gi, '')
    .replace(/\s+loading="lazy"/gi, '');
}

function parseArticleBody(html) {
  const $ = cheerio.load(html);
  const c = $('.single-content').first();
  if (!c.length) return '';
  let content = c.html() || '';
  // 把 div 外壳剥掉（和 v3 保持一致）
  content = content.replace(/^<div[^>]*>/, '').replace(/<\/div>\s*$/, '').trim();
  // 只保留 <p>/<br>/<img>/<strong>/<em>/<a>/<span> 等正文标签，去掉脚本/样式
  content = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  // 还原懒加载
  content = restoreLazyImgs(content);
  // 裁掉下载区
  content = cutDownloadBlock(content);
  // 末尾补一个空 <p> 避免粘到 hr 上
  return content.trim();
}

function buildBaiduBlock(link, code) {
  const m = String(link).match(/(https?:\/\/pan\.baidu\.com\/s\/[^\s"&']+)(?:\?pwd=([^\s"&]+))?/i);
  const url = m ? m[1] : link;
  const pwd = m ? (m[2] || '') : '';
  if (!url) return '';
  let l = '';
  if (code) l += '百度网盘：' + code + '<br>';
  l += '链接：<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
  if (pwd) l += '<br>提取码：' + pwd;
  return '<p>' + l + '</p>';
}

function readExcelBaidu() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1);
  const linkRows = rows.filter(r => r[0] && String(r[0]).trim() && r[2] && String(r[2]).trim());
  return linkRows.map((r, i) => ({ excelRow: i + 1, baiduLink: String(r[2]).trim() }));
}

async function main() {
  console.log('恢复正文（介绍+图片）+ 替换百度链接 v3.1');
  const postsJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'posts.json'), 'utf8'));
  const posts = postsJson.posts;
  console.log('posts:', posts.length);

  const excel = readExcelBaidu();
  console.log('excel 有链接行:', excel.length);
  // 建立 id -> excel.baiduLink 的映射（按行号 = id）
  const byId = {};
  excel.forEach(row => { byId[row.excelRow] = row.baiduLink; });

  let okCount = 0, failCount = 0;
  const updatedPosts = [];
  for (const p of posts) {
    const baidu = byId[p.id];
    if (!baidu) { updatedPosts.push(p); continue; }
    const src = p.source;
    let body = null;
    try {
      const html = await fetchWithRetry(src);
      body = parseArticleBody(html);
      const imgs = (body.match(/<img/g) || []).length;
      console.log('  id=' + p.id + ' imgs=' + imgs + ' len=' + body.length + ' | ' + p.title.substring(0, 40));
      okCount++;
    } catch (e) {
      console.log('  id=' + p.id + ' 抓取失败:', e.message);
      failCount++;
      updatedPosts.push(p);
      continue;
    }
    // 拼接：正文 + hr + 下载标题 + 用户百度区块
    const block = buildBaiduBlock(baidu, BUDGET_CODE);
    const newContent = body + '\n<hr>\n<p><strong>— 下载 —</strong></p>\n' + block;
    p.content = newContent;
    updatedPosts.push(p);
  }

  // 写回
  postsJson.posts = updatedPosts;
  fs.writeFileSync(path.join(DATA_DIR, 'posts.json'), JSON.stringify(postsJson, null, 2), 'utf8');

  // 同步 posts-index.json
  const indexJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'posts-index.json'), 'utf8'));
  indexJson.posts = updatedPosts.map(p => ({ id: p.id, title: p.title, link: p.link, description: p.description, image: p.image, tags: p.tags, category: p.category, gradient: p.gradient, icon: p.icon, date: p.date }));
  fs.writeFileSync(path.join(DATA_DIR, 'posts-index.json'), JSON.stringify(indexJson, null, 2), 'utf8');

  console.log('\n✅ 完成：成功 ' + okCount + ' 篇，失败 ' + failCount + ' 篇');
  if (failCount > 0) {
    process.exit(1);
  }
}
main().catch(e => { console.error('脚本出错:', e); process.exit(1); });
