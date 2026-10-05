# 部署控制台 (本地 Web UI)

浏览器操作游戏站 抓取 → 待填表 → 上传回填表 → 匹配部署 → 重建推送 → 验证 的可视化界面。

## 启动

```powershell
cd CL-YX-repo
node scripts\one_click.js              # 推荐: 清端口 → 起服务 → 探代理 → 开浏览器
node scripts\console.js                # 默认 http://localhost:9000
node scripts\console.js --port 8000    # 自定义端口
```

或双击 `CL-YX-repo\启动控制台.bat`（bat 内是英文提示，避免 cmd 中文乱码）。

> **端口默认 9000**（8000 长期被别的程序占用）。旧实例占着端口时 `one_click.js` 会自动清。

## 按钮（点完必有反馈：进行中 → 成功/失败原因）

| 阶段 | 按钮 | 说明 |
|---|---|---|
| ① 抓取 | `抓取本页` | Python+代理8899 抓第 N 页列表+详情 → `pageN_posts.json` |
| ② 待填表 | `生成待填 Excel` / `⬇ 下载 xlsx` | 生成 `pageN_baidu.xlsx`(4列)；文件缺失会**自动生成** |
| ③ 部署 | `① 上传回填表` → `② preview` → `③ commit` | 上传 xlsx/csv 自动识别 + 按分享名比对缺失；commit 写库 + **图片传 R2** |
| ④ 重建推送 | `④ rebuild_index` → `⑤ git commit + push` | 重建首页索引；push 直连3次 → 代理 |
| ⑤ 验证 | `⑥ 验证` | 残留码扫描 + index.total + 推荐位 |

## 接口

```text
POST /api/upload?page=N&filename=...   上传回填表(二进制 body)
POST /api/action/fetch                 { page, perPage }
POST /api/action/xlsx                  { page }
POST /api/action/deploy                { page, mode: preview|commit, csvPath? }
POST /api/action/rebuild               {}
POST /api/action/git                   {}       (add + commit + push)
GET  /api/verify                       残留码 / index.total / 推荐位
GET  /api/status                       代理是否在线
GET  /api/log                          运行日志
GET  /api/download?type=xlsx|json&page=N
```

## 相关脚本

| 脚本 | 作用 |
|---|---|
| `console.js` | 控制台服务（极简页面 + 上述接口） |
| `one_click.js` | 启动入口：清端口 → 起控制台 → 探代理 → 开浏览器 |
| `deploy_batch.js` | 通用批次部署：`--page N --mode preview|commit --csv <回填表>` |
| `upload_r2.js` | 图片迁移到 R2（`--dry` / `--rewrite-only` / `--keep-local`） |
| `rebuild_index.js` | 重建 `posts-index.json`（首页读它） |

## 注意

- **图片托管在 Cloudflare R2**：配置 `CL-YX-repo/.r2.json`（已 gitignore）。
  上传走 **Cloudflare REST API**（`api.cloudflare.com`）；S3 域名 `r2.cloudflarestorage.com` 在本机网络被 TLS 阻断，只作备选。
- **不需要再跑 `interleave`**：`deploy_batch.js` 的正文按原站顺序直出，图文天然交错。
- git push 直连 3 次失败会自动走代理 `127.0.0.1:8899`（先确认代理在线）。
- 端口被占用：`Get-NetTCPConnection -LocalPort 9000` 找 PID 杀掉，或直接跑 `one_click.js`。
- Cloudflare Pages 有 **1–2 分钟部署延迟**，push 后别急着验证线上。
- 每批部署后建议自检：`python -X utf8 scratch/detect_dup_imgs.py`（应为 0）。
