#!/usr/bin/env node
/**
 * 第5页本地版预览(直连原站 ECONNRESET 时用本地 body-*.html 缓存)
 * 步骤:读 page5-full.json + 回传CSV(13条) -> 读本地正文缓存 -> 提取正文+图
 *      -> 拼下载区(完整可点URL) -> 写 preview-page5-local.md
 * 用法:node scripts/preview_page5_local.js
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const REPO = path.join(__dirname, '..');
const CSV = 'E:/主线/主线/正在做的/游戏站/.reasonix/attachments/clipboard-20261003-141304.376173-000009.csv';

function loadCsv() {
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
  $('p').each((i, el) => {
    const txt = ($(el).text() || '').replace(/\s+/g, ' ').trim();
    if (!txt || txt.length < 2) return;
    if (/网盘|pan\.baidu|drive\.uc|quark|139\.com|115\.com|xunlei|百度网盘/i.test(txt)) return;
    if (/^(上一篇|下一篇|取消回复|\d+\s*评论|暂无评论)/.test(txt)) return;
    if ($(el).closest('aside,.widget,#comments').length) return;
    paras.push('<p>' + txt.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>');
  });
  return paras.join('\n') + '\n' + imgHtml;
}

function buildBaiduBlock(links) {
  let html = '<p>——————————————————</p>\n<hr>\n<p><strong>— 下载 —</strong></p>';
  links.forEach(l => {
    const sharePart = l.share ? (l.label ? l.share + ' ' + l.label : l.share) : (l.label ? l.label : '');
    const tag = sharePart ? '<p>百度网盘：' + sharePart + '</p>\n' : '';
    html += tag + '<p><a href="' + l.url + '" target="_blank" rel="noopener">' + l.url + '</a></p>\n';
  });
  return html;
}

function main() {
  const page = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'page5-full.json'), 'utf8'));
  const csvMap = loadCsv();
  console.log('CSV 链接共 ' + Object.keys(csvMap).length + ' 条');

  const lines = [];
  lines.push('# 第 5 页预览(本地正文缓存版, 共 ' + page.items.length + ' 篇)');
  lines.push('');
  let miss = 0;
  for (const it of page.items) {
    const bds = it.drives.baidu || [];
    let myLinks = [], missing = [];
    for (const b of bds) {
      if (b.name && csvMap[b.name]) myLinks.push({ url: csvMap[b.name], label: b.label || '', share: b.name });
      else missing.push(b.name);
    }
    if (myLinks.length === 0) { miss++; continue; }
    const bodyPath = path.join(REPO, 'data', 'body-' + it.id + '.html');
    let html;
    try { html = fs.readFileSync(bodyPath, 'utf8'); }
    catch (e) { console.log('  本地缓存缺失 ' + it.id + ', 跳过'); miss++; continue; }
    let content = extractBody(html);
    content = content + '\n' + buildBaiduBlock(myLinks);
    const cover = (content.match(/<img\s+src="([^"]+)"/) || [])[1] || '';
    const nimg = (content.match(/<img/g) || []).length;
    const desc = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100);
    lines.push('## ' + it.title.substring(0, 60));
    lines.push('- 源站: ' + it.url + '  图' + nimg + '张  封面=' + (cover || '无') + '  百度' + myLinks.length + '端');
    lines.push('- 正文预览: ' + desc);
    lines.push('');
  }
  const out = path.join(REPO, 'data', 'preview-page5-local.md');
  fs.writeFileSync(out, lines.join('\n'));
  console.log('✅ 预览 -> ' + out);
  console.log(miss ? '缺链接/缺缓存未上的 ' + miss + ' 篇' : '全部 ' + page.items.length + ' 篇就绪');
}
main();
