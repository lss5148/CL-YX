/**
 * 流程第 1.5 步:生成 第XXX页_待填百度链接.xlsx
 * 列:游戏标题 | 分享文件名 | PC端百度链接 | AZ端百度链接
 * C/D 列格式:链接: https://pan.baidu.com/s/xxx?pwd=码 提取码: 码
 * 用法:node make_excel.js (读 page2-full.json)
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const full = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'page2-full.json'), 'utf8'));
const PAGE = full.page;
const outPath = 'E:/主线/主线/正在做的/游戏站/百度提取的分享链接/第' + PAGE + '页_待填百度链接_v13.xlsx';

const header = ['游戏标题', '分享文件名', 'PC端百度链接', 'AZ端百度链接'];
const rows = [header];
for (const it of full.items) {
  const d = it.drives || {};
  const bds = (d.baidu || []).map(x => (typeof x === 'object' ? x : { url: x, label: '' }));
  // B列 分享文件名:优先取每个百度链接自带的 name;都空才退回 pwd 锚点
  const nameStr = bds.map(b => b.name || '').filter(n => n).join(' / ');
  let fname = nameStr || '';
  if (!fname && it.pwd) {
    const p = String(it.pwd).trim();
    fname = p.includes(' ') ? ('原文码:' + p.split(/\s+/).join(' / ')) : ('原文码:' + p);
  }
  if (!fname) fname = '(无分享名)';
  // C/D 列:PC 取 label=PC 或第1个,AZ 取 label=AZ 或第2个
  const pc = bds.find(x => x.label === 'PC') || (bds.length && !bds[0].label ? bds[0] : null);
  const az = bds.find(x => x.label === 'AZ') || (bds.length > 1 ? bds[1] : null);
  // 拼完整格式:链接: url?pwd=码 提取码: 码
  const fmt = x => {
    if (!x) return '';
    const u = (typeof x === 'object' ? x.url : String(x));
    // 从该链接 url 里提取 pwd(链接自带 ?pwd=xxx)
    const m = u.match(/\?pwd=([A-Za-z0-9]+)/);
    const pwd = m ? m[1] : '';
    const fullUrl = u.includes('?pwd=') ? u : (pwd ? (u + '?pwd=' + pwd) : u);
    return pwd ? ('链接: ' + fullUrl + ' 提取码: ' + pwd) : ('链接: ' + u);
  };
  rows.push([it.title, fname, fmt(pc), fmt(az)]);
}
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [{ wch: 55 }, { wch: 24 }, { wch: 70 }, { wch: 70 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '第' + PAGE + '页');
XLSX.writeFile(wb, outPath);
console.log('已生成:', outPath);
console.log('共 ' + (rows.length - 1) + ' 行,其中 PC+AZ 双链接 ' + rows.slice(1).filter(r => r[2] && r[3]).length + ' 篇');
rows.slice(1).forEach(r => console.log('  [' + (r[2] ? String(r[2]).split('/s/')[1].substring(0, 8) : '—') + '|' + (r[3] ? String(r[3]).split('/s/')[1].substring(0, 8) : '—') + '] ' + r[0].substring(0, 36)));
