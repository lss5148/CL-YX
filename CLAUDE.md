# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CL游戏姬 (CL-YX)** — A static game-sharing website deployed on Cloudflare Pages. Data is stored in `data/posts.json` and managed via a browser-based admin panel that writes directly to GitHub REST API.

- **Deploy**: Push to `main` branch → Cloudflare Pages auto-deploys (~1-2 min)
- **GitHub**: `lss5148/CL-YX`
- **Live site**: `yx.chulian.ccwu.cc` (custom domain) / `CL-YX.pages.dev`

## File Inventory (current line counts)

```
File                            Lines    Purpose
───                                    ─────────────────────────────────
index.html                       219    Homepage (public, renders posts from posts.json)
article.html                     484    Article detail page (static shell, renders from URL param)
extract-tool.html               1241    Standalone tool: batch-extract + date-based extraction + XLSX
admin/index.html                2883    Admin panel (SPA, writes to GitHub API directly)
css/style.css                    914    Global styles (dark/light/auto theme via CSS vars)
js/script.js                     349    Homepage logic: data load, render, search, pagination, theme

data/posts.json                  931    Main CMS data store (31 posts)
data/posts-index.json                  Lightweight index (id/title/category/date only) for homepage
data/download-mapping.json      2749    Download link mapping (platform codes ↔ URLs ↔ passwords)
data/ref_article.html                  Reference article HTML from acgyx.us (used by analysis scripts)

vendor/css/bootstrap.min.css           Self-hosted Bootstrap 5 (232KB, replaces CDN)
vendor/css/font-awesome.min.css        Self-hosted Font Awesome 4 (31KB, replaces CDN)
vendor/js/bootstrap.bundle.min.js      Self-hosted Bootstrap JS (80KB, replaces CDN)
vendor/fonts/fontawesome-webfont.*     Self-hosted Font Awesome font files (eot/woff2/woff/ttf/svg)

functions/img.js                  58    Image proxy (bypasses blocked image CDNs)
functions/proxy.js                58    CORS proxy (5 min cache, for acgyx.us scraping)
functions/upload-img.js          102    Telegram Bot image upload endpoint (batch + persistence)
functions/api/auth.js                  Decap CMS OAuth entry point
functions/api/callback.js              Decap CMS OAuth callback

scripts/batch_import.js          12269  Node.js CLI: scrape acgyx.us → posts.json (cheerio)
scripts/analyze_article.js        2447  DOM structure analyzer for ref_article.html
scripts/analyze2.js               1902  Secondary analysis tool
scripts/fix_images.js             2412  Clean up imported image URLs
```

### Data Flow

```
Browser → Cloudflare Pages CDN → static files
  ├── admin panel → GitHub REST API (via user's PAT stored in localStorage)
  │                  └── commits data/posts.json + data/download-mapping.json → triggers redeploy
  ├── homepage → fetches data/posts.json → renders article cards client-side
  └── article detail → fetches data/posts-index.json, loads full post by id → renders content
```

### Architecture Notes

- **No build step**: Raw HTML/CSS/JS, served directly by Cloudflare Pages
- **No backend server**: GitHub API acts as the CMS backend
- **No testing framework** currently set up
- **GitHub PAT** with `repo` scope is stored in browser `localStorage`
- **Content XSS risk**: Article `content` uses `innerHTML` — admin accounts must be trusted

---

## User-Facing Pages

### Homepage (`index.html`)

- Article card listing with pagination (10 per page)
- Tag filtering via URL `?tag=标签名`
- Text search via URL `?q=关键词`
- Dark/Light/Auto theme toggle (persisted in localStorage)
- Responsive layout (Bootstrap 5 + custom CSS)
- Animated wave banner with gradient text
- Sidebar: search, tag cloud, recent comments, random posts
- Mobile: offcanvas navigation + floating action menu
- Data source: `data/posts-index.json` (lightweight, loaded on page load)
- Lazy-loading images (`data-src` attribute)

### Article Detail (`article.html`)

- Article content rendered from `data/posts.json` by `?id=XX` URL parameter
- Download links rendered in three-line format (platform → code, link, extract code) with clickable URLs
- Breadcrumb navigation
- Decorative elements: header image, tag badges, category icon
- Back-to-homepage link

---

## Admin Panel (`admin/index.html`)

**~2883 lines, all inline HTML/CSS/JS.** Requires GitHub PAT with `repo` scope.

### Tab 1: 文章管理 (Article Management)

| Feature | Description |
|---------|-------------|
| **Pagination** | 20 articles per page, PC/AZ filter tabs, page navigation controls |
| **CRUD** | Add new article, edit (inline modal), delete with confirmation |
| **Batch delete** | Multi-select via checkboxes + "批量删除选中" button |
| **Save to GitHub** | `saveAll()` — commits `data/posts.json` with SHA tracking; auto-retry on SHA conflict |
| **Import tool** | Bulk import from acgyx.us with parallel concurrency config, auto-retry, progress tracking |
| **Duplicate detection** | `isDuplicateUrl()` — checks source URL to prevent reimport |
| **Import pipeline** | 5 steps: (1) filter duplicates → (2) parallel batch extract → (3) auto-save to memory → (4) auto-save to GitHub with retry → (5) final summary |
| **Auto tag generation** | `autoGenerateTags()` — extracts tags from article description and content |
| **Auto gradient** | `updateGradientPreview()` — generates gradient based on article category/title |
| **Content cleaning** | `cleanDownloadSections()` — removes stale download sections from imported content |
| **Markdown mode** | `toggleMdMode()` / `togglePreview()` — switch between rich text and raw HTML editing |
| **Proxy test** | `testProxies()` — verify CORS proxy availability before importing |
| **Failed URL export** | `exportFailedUrls()` — export failed import URLs to XLSX for retry |

### Tab 2: 下载链接管理 (Download Link Management)

| Feature | Description |
|---------|-------------|
| **Mapping data model** | Per-article: `originalLinks` (baiduUrls, yun139Urls, xunleiUrls, quarkUrls, cloud115Urls) + `myLinks` (baidu, yun139, xunlei, quark, cloud115 each with url/pwd/code) |
| **Table view** | Sortable table: title, category, original URL, myLink url/pwd/code per platform |
| **Inline editing** | Click-to-edit any mapping field, auto-saves to memory |
| **Apply single link** | `applySingleLink()` — generates three-line format: `{平台}：{code}\n链接：{url}\n提取码：{pwd}` with clickable `<a>` links |
| **Batch replace all** | `batchReplaceLinks()` — applies all mapping entries to all articles at once |
| **XLSX import** | `uploadMappingXlsx()` — upload XLSX, auto-map columns, handle "已提交" skip, multi-line text parsing |
| **XLSX export** | `downloadMappingXlsx()` — export mapping table to XLSX |
| **JSON download** | `downloadMappingJson()` — download raw `download-mapping.json` |
| **Save to GitHub** | `saveMappingToGithub()` — PUT to `data/download-mapping.json` with SHA conflict retry logic |
| **Column mapping** | XLSX columns matched by `shortLabel` (removing "云盘"/"网盘" suffix) for compatibility |

### Tab 3: 图片记录 (Image Records)

| Feature | Description |
|---------|-------------|
| **Telegram upload** | `uploadImages()` — batch upload images via Telegram Bot API, returns direct image URLs |
| **Upload history** | `renderUploadHistory()` — shows recent uploads with click-to-copy |
| **Image compression** | `compressImage()` — client-side compression (maxWidth + quality params) before upload |
| **Records table** | `loadImageRecords()` / `renderImageRecordsTable()` — persistent upload history with copy count |
| **XLSX export** | `exportImageRecordsXlsx()` — export image records to XLSX |
| **Save to GitHub** | `saveImageRecordsToGithub()` — persist image records to GitHub |
| **Copy + record** | `copyAndRecord(url)` — copy URL to clipboard + increment copy count |
| **Clear history** | `clearUploadHistory()` — reset upload history |

### Tab 4: 图片链接批量替换 (Batch Image URL Replace)

| Feature | Description |
|---------|-------------|
| **Scan articles** | `scanImageUrls()` — scans all articles for image URLs, shows replaceable count |
| **Preview** | `updateReplacePreview()` — shows old→new URL mapping before executing |
| **Execute replace** | `executeBatchImageReplace()` — bulk replace all matched URLs, then save to GitHub |

### GitHub API Integration

- `getHeaders()` — returns auth headers with `Content-Type: application/json` + `Accept: application/vnd.github.v3+json`
- `fetchFromGitHub()` — wrapper with error handling
- `connectGitHub()` — enter PAT, verify access
- `saveAll()` — commits `data/posts.json` with SHA, retry on 422
- SHA conflict resolution: re-fetches SHA on 422, retries PUT once

---

## Extraction Tool (`extract-tool.html`)

**~1241 lines, standalone page.** Extracts articles from acgyx.us → XLSX/JSON.

### Page-Based Extraction (CSS Selector)

| Feature | Description |
|---------|-------------|
| **Configurable selectors** | Article container, title, link, description, image, date, tags — user configurable |
| **Pagination** | Start page, end page, configurable per-page URL template |
| **Proxy chain** | 4 proxies: self-hosted `/proxy?url=` → codetabs → corsproxy → allorigins; auto-fallback |
| **Rate limiting** | Configurable delay between requests (ms) |
| **Results table** | Interactive table with multi-select, category assignment, copy |
| **XLSX export** | `exportToXlsx()` — export selected results to XLSX |
| **Reset** | `resetAll()` — clear all data |

### Date-Based Extraction (WordPress REST API)

| Feature | Description |
|---------|-------------|
| **Date picker** | `<input type="date">` to select target date |
| **WP REST API** | Queries `https://acgyx.us/wp-json/wp/v2/posts?after=...&before=...&per_page=100` |
| **Proxy chain** | Reuses `getProxyList()` same proxy chain |
| **Dedup** | Auto-deduplicate URLs found via date query |
| **Direct fill** | Populates `extractedData` array, feeds into Step 2 (Baidu code scanning) |

### Baidu Code Scanning (Step 2)

| Feature | Description |
|---------|-------------|
| **Scan all** | `startScanBaidu()` — visit each extracted URL, parse Baidu cloud code from page HTML |
| **Batch scan** | Parallel scanning with configurable concurrency |
| **Results** | `renderScanResults()` — table showing article + extracted baidu code |
| **XLSX export** | `exportScanXlsx()` — export scanning results with Baidu mapping |
| **JSON mapping** | `exportMappingJson()` — export as `download-mapping.json` format |
| **Proxy fallback** | Same proxy chain as extraction |

---

## Data Formats

### `data/posts.json` — Main CMS

```json
{
  "site": { "title": "CL游戏姬", "subtitle": "...", "footer": "解压密码: ..." },
  "posts": [
    {
      "id": 59,
      "title": "...",
      "description": "...",
      "tags": ["汉化", "RPG", "PC"],
      "content": "<p>HTML content...</p><p>...下载链接...<a href=...>...</a></p>",
      "image": "",
      "link": "/article.html?id=59",
      "download": "https://pan.xunlei.com/s/...",
      "category": "PC",           // "PC" or "AZ"
      "gradient": "linear-gradient(...)",
      "icon": "fa-gamepad",
      "author": "CL",
      "authorAvatar": "恋",
      "views": "0",
      "comments": 0,
      "date": "2026年6年1日",
      "source": "https://acgyx.us/39014.html"
    }
  ],
  "tags": [ /* tag objects with count */ ],
  "comments": [],
  "randomPosts": [],
  "pagination": { "total": 31, "perPage": 10 }
}
```

### `data/posts-index.json` — Lightweight Index

Same `site`/`pagination` structure, but `posts` array contains only `{id, title, link, description, image, tags, category, gradient, icon, date}` (no `content`, no `source`, no `download`). Used by homepage for fast loading.

### `data/download-mapping.json` — Link Mapping

```json
{
  "version": 2,
  "articles": [
    {
      "title": "...",
      "url": "/article.html?id=59",
      "category": "PC",
      "baiduCode": "",
      "baiduPhrase": "",
      "originalLinks": {
        "baiduUrls": [],
        "yun139Urls": [],
        "xunleiUrls": ["https://pan.xunlei.com/s/..."],
        "quarkUrls": [],
        "cloud115Urls": []
      },
      "myLinks": {
        "baidu":    { "url": "", "pwd": "", "code": "" },
        "yun139":   { "url": "", "pwd": "", "code": "" },
        "xunlei":   { "url": "https://pan.xunlei.com/s/...", "pwd": "xn3m", "code": "B936111" },
        "quark":    { "url": "", "pwd": "", "code": "" },
        "cloud115": { "url": "", "pwd": "", "code": "" }
      }
    }
  ]
}
```

### Download Link Three-Line Format

When applied to article content, links are rendered as:

```
{platform}：{code}
链接：<a href="{url}" target="_blank" rel="noopener">{url}</a>
提取码：{pwd}
```

---

## Cloudflare Pages Functions (Edge Serverless)

| File | Purpose | Notes |
|------|---------|-------|
| `functions/img.js` | Image proxy | `/img?url=` — proxies image extensions (.jpg/.jpeg/.png/.gif/.webp/.bmp/.svg) to bypass blocked CDNs |
| `functions/proxy.js` | CORS proxy | `/proxy?url=` — 5 min cache, used for scraping acgyx.us |
| `functions/upload-img.js` | Telegram upload | Accepts multipart/form uploads, forwards to Telegram Bot API, returns direct URL |
| `functions/api/auth.js` | Decap CMS OAuth entry | Not actively used |
| `functions/api/callback.js` | Decap CMS OAuth callback | Not actively used |

---

## Scripts (Node.js CLI, local dev only)

| Script | Purpose |
|--------|---------|
| `scripts/batch_import.js` | Scrape acgyx.us pages → generate `posts.json` (uses cheerio) |
| `scripts/analyze_article.js` | Analyze `data/ref_article.html` DOM structure to find CSS selectors |
| `scripts/analyze2.js` | Secondary analysis tool |
| `scripts/fix_images.js` | Clean up imported image URLs (remove duplicates, fix broken links) |

---

## Theme System

- **3 modes**: Dark (default), Light, Auto (follows system preference)
- **Mechanism**: `data-bs-theme` attribute on `<html>` element
- **Persistence**: localStorage (`theme` key)
- **CSS variables**: `--accent` (#d63384 pink), `--bg-deep`, `--bs-*` overrides
- **Toggle**: Navbar dropdown (desktop) + offcanvas list (mobile)
- **Admin panel**: Inherits theme from page; separate per-element theme toggle available

---

## Performance Optimizations

- **Self-hosted CDN assets**: Bootstrap CSS/JS and Font Awesome CSS/fonts moved to `vendor/` directory, eliminating 12s+ CDN delays (cdnjs.cloudflare.com)
- **Lazy loading images**: `data-src` attribute, loaded via IntersectionObserver in `js/script.js`
- **Lightweight index**: `posts-index.json` for homepage (no content/download fields)
- **CORS proxy cache**: `/proxy?url=` has 5 min cache TTL

---

## Common Commands (local dev)

```bash
# Run batch import (scrape acgyx.us articles)
node scripts/batch_import.js

# Analyze reference article DOM structure
node scripts/analyze_article.js

# Fix image URLs in imported data
node scripts/fix_images.js

# No build/serve command — open index.html directly or use any static server
# e.g. npx serve .
```

---

## Content Safety Notes

- Article `content` uses `innerHTML` — XSS risk if an admin account is compromised
- GitHub PAT with `repo` scope is stored in browser `localStorage`
- Decompression passwords are embedded in `data/posts.json` (not security-sensitive by design)
- Image proxy (`img.js`) only proxies image file extensions to prevent SSRF
