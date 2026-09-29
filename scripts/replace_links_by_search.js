/**
 * 按标题搜索抓取 acgyxjvip2.com + 只用 Excel 百度网盘链接替换（最终版 v3）
 * - 只处理 Excel 里有百度链接的行（35 篇），无链接的剔除
 * - id = Excel 行号
 * - 搜索后遍历全部候选做严格核心词校验
 * - 封面：优先 data-src（懒加载）
 * - 下载区：只保留百度网盘链接，删掉 UC/移动云盘/迅雷/夸克/115 等其他网盘段落
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
function readExcelRows() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1)
    .filter(r => r[0] && String(r[0]).trim() && r[2] && String(r[2]).trim()) // 只留有百度链接的
    .map((r, i) => ({ lineNo: i + 1, expectedTitle: String(r[0]).trim(), shareFile: r[1] ? String(r[1]).trim() : '', baiduLink: String(r[2]).trim() }));
}
function extractSearchKey(title) {
  const cleaned = title.replace(/\[|\]/g, ' ').replace(/v?\d+(\.\d+)*/gi, ' ').replace(/[\u3000-\u303f\uff00-\uffef]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(w => w.length >= 2);
  const latin = words.filter(w => /[a-zA-Z0-9]/.test(w));
  const cjk = words.filter(w => /[\u4e00-\u9fa5]/.test(w));
  return (latin.length ? latin.sort((a, b) => b.length - a.length)[0] : cjk.sort((a, b) => b.length - a.length)[0]) || cleaned.substring(0, 10);
}
function strictCoreMatch(expected, actual) {
  const norm = s => s.replace(/\[|\]/g, ' ').replace(/[\s\-—–_|:：?？【】()（）！!，,。、~～·・\u3000-\u303f\uff00-\uffef]+/g, ' ').replace(/\s+/g, ' ').trim();
  const e = norm(expected).toLowerCase();
  const a = norm(actual).toLowerCase();
  const keys = s => {
    const cjk = (s.match(/[\u4e00-\u9fa5\u3040-\u309f]{3,10}/g) || []).filter(w => w.length >= 4);
    const lat = (s.match(/[a-z0-9]{5,}/g) || []).filter(w => !/^\d+$/.test(w));
    return [...cjk, ...lat];
  };
  const eKeys = keys(e);
  if (!eKeys.length) return false;
  const best = eKeys.sort((x, y) => y.length - x.length)[0];
  return a.includes(best);
}
async function searchCandidates(key) {
  const url = BASE + '/wp-json/wp/v2/posts?search=' + encodeURIComponent(key) + '&per_page=20&_fields=id,link';
  const html = await fetchWithRetry(url);
  const posts = JSON.parse(html);
  if (!Array.isArray(posts) || posts.length === 0) return [];
  return posts.map(p => ({ id: String(p.id), url: p.link }));
}
function decodeEntities(t) {
  if (!t) return '';
  return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&#8211;/g, '\u2013').replace(/&#8217;/g, "'").replace(/&#8230;/g, '\u2026');
}
function parseArticle(html, url) {
  const $ = cheerio.load(html);
  let title = '';
  const t1 = $('.single-title').first();
  if (t1.length) title = decodeEntities(t1.text().trim()).replace(/[\s\-|–—]+ACG游戏姬.*$/i, '').trim();
  if (!title) title = decodeEntities($('title').text().trim().replace(/[\s\-|–—]+ACG游戏姬.*$/i, '').trim());

  let content = '';
  const c1 = $('.single-content').first();
  if (c1.length) {
    content = $.html(c1).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
    content = content.replace(/\bsrc="[^"]*"\s+data-src="/gi, 'src="').replace(/\bdata-src=/gi, 'src="').replace(/\bdata-lazy-src=/gi, 'src="');
    content = content.replace(/\s+loading="lazy"/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').trim();
  }

  let description = '';
  const md = $('meta[name="description"]').attr('content');
  if (md) description = decodeEntities(md.trim()).substring(0, 200);

  let category = 'PC';
  const tm = title.match(/\[([^\]]+)\]/);
  if (tm) {
    const raw = tm[1].toUpperCase();
    if (/安卓|AZ/.test(raw)) category = 'AZ';
    else if (raw.includes('SLG')) category = 'SLG';
    else if (raw.includes('RPG')) category = 'RPG';
    else if (raw.includes('ADV')) category = 'ADV';
    else if (raw.includes('ACT')) category = 'ACT';
    else if (raw.includes('NTR')) category = 'NTR';
  }

  let date = '';
  const d1 = $('.data span, time, .post-date, .date').first();
  if (d1.length) date = d1.text().trim();
  if (!date) date = new Date().toISOString().split('T')[0];

  // 封面：优先 data-src（懒加载），其次 src
  let image = '';
  const img = $('.single-content img').first();
  if (img.length) {
    image = img.attr('data-src') || img.attr('src') || '';
    if (image && /avatar|logo|icon|emoji|loading|placeholder/i.test(image)) image = '';
  }

  return { title, content, description, category, date, image, views: '0', comments: 0 };
}

// 把正文里所有"其他网盘"的下载段落删掉，只留百度网盘
// 策略：删除整段包含 UC网盘/移动云盘/迅雷/夸克/115 等关键词的 <p>，
// 以及"链接：+<a>"且 a 指向非百度网盘的 <p>；最后统一替换百度网盘区。
function stripOtherDrives(html) {
  if (!html) return html;
  let c = html;
  const otherDriveKeywords = ['UC网盘', 'uc网盘', '移动云盘', '迅雷', '夸克', '115', '云盘'];
  // 1) 删除含其他网盘关键词的整个 <p>...</p>
  c = c.replace(/<p[^>]*>[\s\S]*?(?:UC网盘|uc网盘|移动云盘|迅雷|夸克|115\.com|yun\.139\.com|pan\.xunlei\.com|pan\.quark\.cn|drive\.uc\.cn|drive\.uc|caiyun\.139\.com)[\s\S]*?<\/p>/gi, '');
  // 2) 删除"链接：<a href=...>"段，只要 a 的 href 不是百度网盘
  c = c.replace(/<p[^>]*>\s*链接[：:]\s*<a[^>]*href="[^"]*"[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/p>/gi, (match, p1) => {
    const hrefMatch = match.match(/href="([^"]*)"/i);
    const href = hrefMatch ? hrefMatch[1] : '';
    if (/pan\.baidu\.com/i.test(href)) return match; // 保留百度
    return '';
  });
  // 3) 删除"提取码/密码/访问码：xxx"独立段（非百度）
  c = c.replace(/<p[^>]*>\s*(?:提取码|密码|访问码)[：:]\s*\S+\s*<\/p>/gi, '');
  // 4) 删除分隔线
  c = c.replace(/<p[^>]*>\s*[—–\-]{3,}[：:]?[\s\S]*?<\/p>/gi, '');
  // 5) 清理连续空 <p>
  c = c.replace(/<p[^>]*>\s*(?:<br\s*\/?>\s*)*\s*<\/p>/gi, '');
  c = c.replace(/(<p[^>]*>\s*<\/p>\s*){2,}/gi, '');
  return c;
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
function autoGenerateTags(a) {
  const f = new Set();
  if (a.category) f.add(a.category);
  const kw = { '汉化': /汉化/i, '更新': /更新/, '新作': /新作/, '步兵': /步兵/, '官中': /官中/, '安卓': /安卓/i, '动态': /动态/, '3D': /3D/, '像素': /像素/, '后宫': /后宫/, '沙盒': /沙盒/, '作弊': /作弊/i, '互动': /互动|触摸/, '探索': /探索/, '巨乳': /巨乳/, '爆乳': /爆乳/, 'NTR': /NTR/i, 'SLG': /SLG/i, 'RPG': /RPG/i, 'ADV': /ADV/i, 'ACT': /ACT/i, '全CG': /全CG|全回想/i, '存档': /存档/, '破解': /破解/, '全CV': /全CV/i };
  for (const t of Object.keys(kw)) if (kw[t].test(a.title) || kw[t].test(a.description || '')) f.add(t);
  return [...f];
}
const GRADIENT_MAP = { 'SLG': { c1: '#D87CFF', c2: '#9B59B6' }, 'RPG': { c1: '#FF6B6B', c2: '#C0392B' }, 'ADV': { c1: '#4ECDC4', c2: '#2C3E50' }, 'ACT': { c1: '#F39C12', c2: '#E74C3C' }, 'AZ': { c1: '#3498DB', c2: '#2980B9' }, 'NTR': { c1: '#E74C3C', c2: '#8E44AD' }, 'PC': { c1: '#2ECC71', c2: '#27AE60' } };
const ICON_MAP = { 'SLG': 'fa-gamepad', 'RPG': 'fa-flag', 'ADV': 'fa-star', 'ACT': 'fa-flask', 'AZ': 'fa-globe', 'NTR': 'fa-heart', 'PC': 'fa-gamepad' };
function makePost(a, id, src) {
  const g = GRADIENT_MAP[a.category] || GRADIENT_MAP['PC'];
  return {
    id, title: a.title, description: a.description, tags: autoGenerateTags(a), content: a.content,
    image: a.image, link: '/article.html?id=' + id, download: src, category: a.category,
    gradient: 'linear-gradient(135deg,' + g.c1 + ',' + g.c2 + ')', icon: ICON_MAP[a.category] || 'fa-gamepad',
    author: 'CL', authorAvatar: '恋', views: a.views, comments: a.comments, date: a.date, source: src,
  };
}
async function resolveRow(row) {
  const keys = [extractSearchKey(row.expectedTitle), row.expectedTitle.replace(/\[|\]/g, ' ').trim().split(/\s+/).slice(1, 4).join(' '), row.expectedTitle.replace(/\[|\]/g, '').trim().substring(0, 40)].filter(k => k && k.length >= 4);
  const seen = new Set();
  for (const key of keys) {
    let cands;
    try { cands = await searchCandidates(key); } catch (e) { continue; }
    for (const c of cands) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      try {
        const html = await fetchWithRetry(c.url);
        const parsed = parseArticle(html, c.url);
        if (strictCoreMatch(row.expectedTitle, parsed.title)) return { url: c.url, parsed };
      } catch (e) {}
    }
  }
  return null;
}
async function main() {
  console.log('抓取（仅百度网盘）+ 封面修复 + 只留百度链接（v3）');
  const excelRows = readExcelRows();
  console.log('Excel 有百度链接的行: ' + excelRows.length);

  const resolved = [];
  for (const row of excelRows) {
    const hit = await resolveRow(row);
    if (!hit) {
      resolved.push({ row, ok: false, error: '未命中' });
      console.log('  行 ' + String(row.lineNo).padStart(2) + ' 未命中: ' + row.expectedTitle.substring(0, 45));
      continue;
    }
    // 1) 删掉其他网盘段落，只留百度
    let content = stripOtherDrives(hit.parsed.content);
    // 2) 在末尾追加百度网盘区
    const block = buildBaiduBlock(row.baiduLink, BUDGET_CODE);
    if (block) content = content + '\n<hr>\n<p><strong>— 下载 —</strong></p>\n' + block;
    hit.parsed.content = content;
    const baiduUrl = String(row.baiduLink).match(/(https?:\/\/pan\.baidu\.com\/s\/[^\s"&']+)(?:\?pwd=([^\s"&]+))?/i);
    resolved.push({ row, ok: true, parsed: hit.parsed, hitUrl: hit.url, replacedUrl: baiduUrl ? baiduUrl[1] : row.baiduLink });
    console.log('  行 ' + String(row.lineNo).padStart(2) + ' [封面:' + (hit.parsed.image ? 'Y' : 'N') + '] ' + hit.parsed.title.substring(0, 45));
  }

  resolved.sort((a, b) => a.row.lineNo - b.row.lineNo);
  const posts = [];
  const mappingArticles = [];
  const reportRows = [];
  resolved.forEach((item, idx) => {
    const lineNo = item.row.lineNo;
    if (item.ok) {
      const id = idx + 1;
      const post = makePost(item.parsed, id, item.hitUrl);
      post.download = item.replacedUrl;
      posts.push(post);
      mappingArticles.push({
        title: post.title, url: post.link, category: post.category,
        baiduCode: BUDGET_CODE, baiduPhrase: '',
        originalLinks: { baiduUrls: [], yun139Urls: [], xunleiUrls: [], quarkUrls: [], cloud115Urls: [] },
        myLinks: {
          baidu: { url: item.replacedUrl, pwd: String(item.row.baiduLink).match(/pwd=([^\s"&]+)/) ? String(item.row.baiduLink).match(/pwd=([^\s"&]+)/)[1] : '', code: BUDGET_CODE },
          yun139: { url: '', pwd: '', code: BUDGET_CODE }, xunlei: { url: '', pwd: '', code: BUDGET_CODE }, quark: { url: '', pwd: '', code: BUDGET_CODE }, cloud115: { url: '', pwd: '', code: BUDGET_CODE },
        },
        note: 'excel行' + lineNo, status: 'done',
      });
      reportRows.push({ lineNo, expectedTitle: item.row.expectedTitle, id, actualTitle: item.parsed.title, category: post.category, date: post.date, hasBaidu: 'Y', replaced: 'Y', image: item.parsed.image ? 'Y' : 'N', baiduUrl: item.replacedUrl, note: '' });
    } else {
      reportRows.push({ lineNo, expectedTitle: item.row.expectedTitle, id: null, actualTitle: '', category: '', date: '', hasBaidu: 'Y', replaced: 'N', image: '', baiduUrl: item.row.baiduLink, note: item.error });
    }
  });

  const postsJson = {
    site: { title: 'CL游戏姬', subtitle: '小黄油,galgame,cos福利… 免费下载！', footer: '解压密码: acgyxj.xyz / acgyxj.cc / acgyxj.top' },
    posts,
    tags: buildTagCloud(posts),
    comments: [],
    randomPosts: posts.slice(0, 5).map(p => ({ title: p.title, link: p.link, gradient: p.gradient, date: p.date })),
    pagination: { total: posts.length, perPage: 10 },
  };
  fs.writeFileSync(path.join(DATA_DIR, 'posts.json'), JSON.stringify(postsJson, null, 2), 'utf8');
  const indexJson = {
    site: postsJson.site,
    posts: posts.map(p => ({ id: p.id, title: p.title, link: p.link, description: p.description, image: p.image, tags: p.tags, category: p.category, gradient: p.gradient, icon: p.icon, date: p.date })),
    tags: postsJson.tags, comments: [], randomPosts: postsJson.randomPosts, pagination: postsJson.pagination,
  };
  fs.writeFileSync(path.join(DATA_DIR, 'posts-index.json'), JSON.stringify(indexJson, null, 2), 'utf8');
  const oldMappingPath = path.join(DATA_DIR, 'download-mapping.json');
  let oldMapping = { version: 2, articles: [] };
  try { oldMapping = JSON.parse(fs.readFileSync(oldMappingPath, 'utf8')); } catch (e) {}
  const newByTitle = new Map(mappingArticles.map(a => [a.title, a]));
  const merged = oldMapping.articles.map(a => newByTitle.has(a.title) ? newByTitle.get(a.title) : a);
  const kept = new Set(oldMapping.articles.map(a => a.title));
  for (const a of mappingArticles) if (!kept.has(a.title)) merged.unshift(a);
  fs.writeFileSync(oldMappingPath, JSON.stringify({ version: 2, articles: merged }, null, 2), 'utf8');

  const lines = ['# 抓取预览报告（仅百度 + 封面修复）', '', '时间: ' + new Date().toISOString(),
    'Excel 行(有百度链接): ' + excelRows.length + ' | 命中: ' + reportRows.filter(r => r.id).length + ' | 未命中: ' + reportRows.filter(r => !r.id).length,
    '有封面: ' + reportRows.filter(r => r.image === 'Y').length + ' / ' + reportRows.filter(r => r.id).length, '',
    '| 行 | 文章ID | 实际标题 | 分类 | 封面 | 百度链接 |', '|---|---|---|---|---|---|'];
  for (const r of reportRows) lines.push('| ' + r.lineNo + ' | ' + (r.id || '-') + ' | ' + (r.actualTitle || '').substring(0, 35) + ' | ' + r.category + ' | ' + r.image + ' | ' + (r.baiduUrl || '').substring(0, 40) + ' |');
  const unmatched = reportRows.filter(r => !r.id);
  if (unmatched.length) { lines.push('', '## 未命中', ''); for (const r of unmatched) lines.push('- 行 ' + r.lineNo + ': ' + r.expectedTitle + '  →  ' + r.note); }
  fs.writeFileSync(path.join(DATA_DIR, 'preview-report.md'), lines.join('\n'), 'utf8');

  console.log('\n✅ 完成: 命中 ' + reportRows.filter(r => r.id).length + '/' + excelRows.length + ' | 有封面 ' + reportRows.filter(r => r.image === 'Y').length);
}
function buildTagCloud(posts) {
  const c = {};
  for (const p of posts) for (const t of (p.tags || [])) c[t] = (c[t] || 0) + 1;
  return Object.entries(c).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
main().catch(e => { console.error('脚本出错:', e); process.exit(1); });
