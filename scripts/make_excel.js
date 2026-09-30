/**
 * 流程第 1.5 步（修正版）：生成 第2394页_待填百度链接.xlsx
 * 列：标题 | 原文百度网盘 | 原文UC网盘 | 原文移动云盘 | 原文迅雷 | 原文夸克 | 原文115 | 你的百度网盘链接（留空的不上）
 * 原文里有的链接自动带过来，没有的留空待填
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2395-full.json'), 'utf8'));
const PAGE = full.page;
const outPath = 'E:/主线/主线/正在做的/游戏站/百度提取的分享链接/第' + PAGE + '页_待填百度链接_v3.xlsx';

// 旧表里已有的链接（按标题核心词匹配）
const oldLinks = {};
const oldPath = 'E:/主线/主线/正在做的/游戏站/百度提取的分享链接/百度分享链接_已替换_v2.xlsx';
if (fs.existsSync(oldPath)) {
  const wb = XLSX.readFile(oldPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(1);
  rows.forEach(r => {
    if (r[0] && r[2]) oldLinks[String(r[0]).trim()] = String(r[2]).trim();
  });
}
function coreWords(s) {
  return s.replace(/\[|\]|\(|\)/g, ' ').replace(/[\u3000-\u303f\uff00-\uffef]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}
function findOldLink(title) {
  const c = coreWords(title).split(' ').filter(w => w.length > 2);
  for (const [t, l] of Object.entries(oldLinks)) {
    const oc = coreWords(t);
    const shared = c.filter(w => oc.includes(w));
    if (shared.length >= 2) return l;
  }
  return '';
}

const header = ['标题', '原文百度网盘（含提取码）', '原文UC网盘', '原文移动云盘', '原文迅雷', '原文夸克', '原文115', '你的百度网盘链接（没有就留空，留空的不上）'];
const rows = [header];
for (const it of full.items) {
  const d = it.drives || {}; const p = (it.pwd || '').split(' ')[0] || '';
  const oldL = findOldLink(it.title);
  // "你的链接"列：优先旧表里已有的
  const baiduUrl = (d.baidu || [])[0] || '';
  const baiduFull = baiduUrl ? (baiduUrl.includes('?pwd=') ? baiduUrl : (p ? baiduUrl + '?pwd=' + p : baiduUrl)) : '';
  rows.push([it.title, baiduFull, (d.uc || [])[0] || '', (d.yun139 || [])[0] || '', (d.xunlei || [])[0] || '', (d.quark || [])[0] || '', (d.d115 || [])[0] || '', oldL]);
}
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [{ wch: 55 }, { wch: 60 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 50 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '第' + PAGE + '页');
XLSX.writeFile(wb, outPath);
console.log('✅ 已生成:', outPath);
console.log('共 ' + (rows.length - 1) + ' 行；旧表匹配到你的链接 ' + rows.slice(1).filter(r => r[8]).length + ' 条');
rows.slice(1).forEach(r => console.log('  ' + (r[8] ? '[你的链接已带]' : '[待填]') + ' ' + r[0].substring(0, 45)));
