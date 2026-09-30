/**
 * 流程第 1.5 步:生成 第XXX页_待填百度链接.xlsx
 * 列:游戏标题 | 分享文件名 | PC端百度链接 | AZ端百度链接
 * (只保留百度,不要 UC/移动云盘/迅雷/夸克/115)
 * 用法:node make_excel.js (读 page2-full.json)
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2-full.json'), 'utf8'));
const PAGE = full.page;
const outPath = 'E:/主线/主线/正在做的/游戏站/百度提取的分享链接/第' + PAGE + '页_待填百度链接_v5.xlsx';

// 提取码:每篇可能多个,取第一个(或留空由用户填自己的)
const header = ['游戏标题', '分享文件名', 'PC端百度链接', 'AZ端百度链接'];
const rows = [header];
for (const it of full.items) {
  const d = it.drives || {};
  // 分享文件名:realFileNames[0],去掉 pwd:/sid: 前缀
  const fname = (it.realFileNames && it.realFileNames[0]) ? String(it.realFileNames[0]).replace(/^(pwd|sid):/, '') : '';
  // baidu: [{url,label}] ,label=PC/AZ
  // baidu 可能是字符串或 {url,label};统一成对象,有标签按标签,没标签按顺序(第1->PC列,第2->AZ列)
  const bds = (d.baidu || []).map(x => (typeof x === 'object' ? x : { url: x, label: '' }));
  const pc = bds.find(x => x.label === 'PC') || (bds.length && bds[0].label === '' ? bds[0] : null);
  const az = bds.find(x => x.label === 'AZ') || (bds.length > 1 ? bds[1] : null);
  const fmt = x => {
    if (!x) return '';
    const u = (typeof x === 'object' ? x.url : String(x));
    // 链接里若已带 ?pwd 就保留,否则不带(让用户填自己的)
    return u.includes('?pwd=') ? u : u;
  };
  rows.push([it.title, fname, fmt(pc), fmt(az)]);
}
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [{ wch: 55 }, { wch: 18 }, { wch: 55 }, { wch: 55 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '第' + PAGE + '页');
XLSX.writeFile(wb, outPath);
console.log('已生成:', outPath);
console.log('共 ' + (rows.length - 1) + ' 行,其中 PC+AZ 双链接 ' + rows.slice(1).filter(r => r[2] && r[3]).length + ' 篇');
rows.slice(1).forEach(r => console.log('  [' + (r[2] ? String(r[2]).split('/s/')[1].substring(0, 8) : '—') + '|' + (r[3] ? String(r[3]).split('/s/')[1].substring(0, 8) : '—') + '] ' + r[0].substring(0, 36)));
