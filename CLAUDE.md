# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CL游戏姬** — A static game-sharing website deployed on Cloudflare Pages. Data is stored in a single `data/posts.json` file and managed via a browser-based admin panel that writes directly to GitHub.

- **Deploy**: Push to `main` branch → Cloudflare Pages auto-deploys (~1-2 min)
- **GitHub**: `lss5148/CL-YX`
- **Live site**: `CL-YX.pages.dev`

## Architecture

```
index.html            → Homepage (public, renders posts from posts.json)
article.html          → Article detail page (static shell, to be implemented)
extract-tool.html     → Standalone tool: batch-extract URLs from acgyx.us → XLSX
admin/index.html      → Admin panel (SPA, writes to GitHub API directly)
data/posts.json       → Single-file data store (Git-based CMS)
css/style.css         → Global styles (light/dark/auto theme via CSS vars)
js/script.js          → Homepage logic: data load, render, search, pagination, theme
functions/            → Cloudflare Pages Functions (edge serverless)
  img.js              → Image proxy (bypasses blocked image CDNs)
  proxy.js            → CORS proxy (for acgyx.us scraping)
  api/auth.js         → Decap CMS OAuth entry point
  api/callback.js     → Decap CMS OAuth callback
scripts/              → Node.js CLI tools (local dev only)
  batch_import.js     → Scrape acgyx.us → posts.json (uses cheerio)
  analyze_article.js  → Analyze ref_article.html DOM structure
  fix_images.js       → Clean up imported image URLs
```

### Data Flow

```
Browser → Cloudflare Pages CDN → static files
  ├── admin panel → GitHub REST API (via user's PAT) → commits data/posts.json → triggers redeploy
  └── homepage → fetches data/posts.json → renders client-side
```

### User-Facing Features

- Article cards with pagination (10/page), tag filtering (`?tag=`), search (`?q=`)
- Dark/Light/Auto theme toggle (persisted in localStorage)
- Responsive layout (Bootstrap 5 + custom CSS)

### Admin Panel

- Single `admin/index.html` (~1600 lines, all inline)
- Requires GitHub Personal Access Token with `repo` scope
- Features: CRUD articles, manage tags/comments, batch import from acgyx.us (parallel, configurable concurrency, auto-retry)
- Data saved by committing to `data/posts.json` via GitHub REST API

## Key Technical Details

- **Data format**: `data/posts.json` has top-level keys: `site`, `posts`, `tags`, `comments`, `randomPosts`, `pagination`
- **Image proxy**: `/img?url=` — only proxies image extensions (.jpg/.jpeg/.png/.gif/.webp/.bmp/.svg)
- **CORS proxy**: `/proxy?url=` — 5 min cache, used by import tool
- **Import from acgyx.us**: CORS proxy chain (allorigins → corsproxy → codetabs), 25s timeout, auto-dedup by source URL pattern
- **Theme**: CSS variables (`--accent`, `--bs-*`), 3 modes via `data-bs-theme` on `<html>`
- **No build step**: Raw HTML/CSS/JS, served directly by Cloudflare Pages
- **No testing framework** currently set up

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

## Content Safety Notes

- Article `content` uses `innerHTML` — XSS risk if an admin account is compromised
- GitHub PAT with `repo` scope is stored in browser localStorage
- Decompression passwords are embedded in `data/posts.json` (not security-sensitive by design)
