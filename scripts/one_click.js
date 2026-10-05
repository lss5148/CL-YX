#!/usr/bin/env node
/**
 * 本地最小启动入口
 * 用法:
 *   node scripts/one_click.js
 *
 * 只做 3 件事:
 *   1) 检查 8899 是否在线
 *   2) 清掉旧 9000
 *   3) 启动 9000 并打开浏览器
 *
 * 说明:
 *   当前版本不再做复杂五阶段 UI, 页面只保留「抓取本页 / 生成 Excel / 日志」。
 */
const net = require('net');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, exec } = require('child_process');

const REPO = path.join(__dirname, '..');
const PORT = 9000;
const PROXY_PORT = 8899;

function ok(m) { console.log('[OK] ' + m); }
function warn(m) { console.log('[WARN] ' + m); }
function bad(m) { console.log('[FAIL] ' + m); }
function info(m) { console.log('   ' + m); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function probeProxy() {
  return await new Promise(resolve => {
    const s = net.connect(PROXY_PORT, '127.0.0.1');
    s.setTimeout(1500);
    s.on('connect', () => { resolve(true); s.destroy(); });
    s.on('timeout', () => { resolve(false); s.destroy(); });
    s.on('error', () => resolve(false));
  });
}

async function killPortListeners(port) {
  await new Promise(resolve => {
    const cmd = os.platform() === 'win32'
      ? `netstat -ano | findstr ":${port} " | findstr LISTENING`
      : `netstat -an | awk '/:${port}[[:space:]]/ && /LISTEN/ {print $NF}'`;
    exec(cmd, { shell: os.platform() === 'win32' ? 'cmd.exe' : 'sh' }, (err, out) => {
      if (err) return resolve();
      const pids = new Set();
      String(out || '').split(/\r?\n/).forEach(line => {
        const m = line.trim().match(/(\d+)\s*$/);
        if (!m) return;
        const pid = Number(m[1]);
        if (pid && pid > 900 && pid !== process.pid) pids.add(pid);
      });
      pids.forEach(pid => {
        try {
          process.kill(pid, 'SIGTERM');
          info(`已请 PID ${pid} 释放 ${port}`);
        } catch (e) {
          info(`kill PID ${pid} 失败: ${e.message}`);
        }
      });
      resolve();
    });
  });
  await sleep(2000);
}

function openBrowser(url) {
  const cmd = os.platform() === 'win32' ? `start "" ${url}` : os.platform() === 'darwin' ? `open "${url}"` : `xdg-open ${url}`;
  exec(cmd, err => {
    if (err) warn('自动打开浏览器失败，请手动访问 ' + url);
    else ok('已打开 ' + url);
  });
}

async function main() {
  console.log('');
  console.log('=== 游戏站本地控制台 · 最小启动版 ===');
  info(`仓库: ${REPO}`);

  const proxyAlive = await probeProxy();
  if (!proxyAlive) {
    warn('8899 代理未启动。抓取会失败，但 9000 页面仍可打开。');
  } else {
    ok('8899 代理在线');
  }

  info('清理旧 9000 控制台...');
  await killPortListeners(PORT);

  const proc = spawn(process.execPath, [path.join(__dirname, 'console.js'), '--port', String(PORT), '--proxy', `http://127.0.0.1:${PROXY_PORT}`], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', d => info('[console] ' + String(d).trim()));
  proc.stderr.on('data', d => info('[console.err] ' + String(d).trim()));

  const started = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 12000);
    const check = async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/log`);
        if (r.status === 200) {
          clearTimeout(timer);
          return resolve(true);
        }
      } catch (e) {}
      setTimeout(check, 500);
    };
    check();
  });

  if (!started) {
    bad('9000 启动失败，请检查是否有旧进程或依赖缺失');
    try { proc.kill(); } catch (e) {}
    process.exit(1);
  }

  ok('9000 已启动: http://localhost:' + PORT);
  ok('页面只提供 3 个动作: 抓取本页 / 生成待填 Excel / 查看日志');
  openBrowser(`http://localhost:${PORT}`);

  process.on('SIGINT', () => {
    console.log('');
    info('停止中...');
    try { proc.kill(); } catch (e) {}
    process.exit(0);
  });
}

main().catch(e => {
  bad(e.message || String(e));
  process.exit(1);
});
