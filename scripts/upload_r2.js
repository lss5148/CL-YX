#!/usr/bin/env node
/**
 * R2 图片上传 / 迁移
 *
 * 用法:
 *   node scripts/upload_r2.js --dry            # 只列出要传什么, 不真传
 *   node scripts/upload_r2.js                  # 上传 assets/img 下所有图, 并按需改写 posts.json
 *   node scripts/upload_r2.js --rewrite-only   # 不上传, 只把 posts.json 里的 /assets/img/x 改成 R2 URL
 *   node scripts/upload_r2.js --keep-local     # 上传+改写, 但不删除本地文件
 *
 * 配置: CL-YX-repo/.r2.json (见 .r2.example.json, 已在 .gitignore 中)
 *
 * 说明:
 *   - R2 key = 文件名(如 img_abc.jpg), 公开 URL = publicBase + '/' + key
 *   - 默认会把本地已上传成功的图片从 assets/img 删除(仓库瘦身); --keep-local 可保留
 *   - git 历史里的旧图片不会因此消失(.git 瘦身需要单独的 git filter-repo 操作)
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const ASSETS = path.join(REPO, 'assets', 'img');
const POSTS = path.join(REPO, 'data', 'posts.json');
const CFG = path.join(REPO, '.r2.json');

const DRY = process.argv.includes('--dry');
const REWRITE_ONLY = process.argv.includes('--rewrite-only');
const KEEP_LOCAL = process.argv.includes('--keep-local');

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif',
};

function loadCfg() {
  if (!fs.existsSync(CFG)) {
    console.error('缺少配置文件: ' + CFG);
    console.error('请复制 .r2.example.json 为 .r2.json 并填入你的 R2 信息');
    process.exit(1);
  }
  const c = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const need = ['accountId', 'bucket', 'publicBase', 'accessKeyId', 'secretAccessKey'];
  const miss = need.filter(k => !c[k] || /^在 |^你的 /.test(String(c[k])));
  if (miss.length) {
    console.error('配置未填完整: ' + miss.join(', '));
    process.exit(1);
  }
  c.publicBase = String(c.publicBase).replace(/\/+$/, '');
  return c;
}

async function main() {
  const cfg = loadCfg();
  const localFiles = fs.existsSync(ASSETS)
    ? fs.readdirSync(ASSETS).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    : [];
  console.log(`R2: bucket=${cfg.bucket}  publicBase=${cfg.publicBase}`);
  console.log(`本地图片: ${localFiles.length} 张`);

  const uploaded = new Map(); // 文件名 -> 公开 URL
  for (const f of localFiles) uploaded.set(f, `${cfg.publicBase}/${f}`);

  if (!REWRITE_ONLY) {
    if (DRY) {
      localFiles.slice(0, 8).forEach(f => console.log('  [dry] ' + f + ' -> ' + uploaded.get(f)));
      if (localFiles.length > 8) console.log(`  ... 共 ${localFiles.length} 张`);
      return;
    }
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    let ok = 0, fail = 0;
    for (let i = 0; i < localFiles.length; i++) {
      const f = localFiles[i];
      const ext = (f.split('.').pop() || 'jpg').toLowerCase();
      const full = path.join(ASSETS, f);
      const tag = `[${i + 1}/${localFiles.length}]`;
      try {
        const body = fs.readFileSync(full);
        await s3.send(new PutObjectCommand({
          Bucket: cfg.bucket, Key: f, Body: body,
          ContentType: MIME[ext] || 'application/octet-stream',
          CacheControl: 'public, max-age=31536000, immutable',
        }));
        ok++;
        if (i % 20 === 0 || i === localFiles.length - 1) console.log(`${tag} 已上传 ${f}`);
      } catch (e) {
        fail++;
        console.log(`${tag} 失败 ${f} -> ${e.message}`);
        uploaded.delete(f);
      }
    }
    console.log(`\n上传完成: 成功 ${ok}, 失败 ${fail}`);
  }

  // 改写 posts.json
  const data = JSON.parse(fs.readFileSync(POSTS, 'utf8'));
  let changed = 0;
  for (const p of data.posts) {
    const before = p.content || '';
    let after = before;
    for (const [f, url] of uploaded) {
      const local = '/assets/img/' + f;
      if (after.includes(local)) after = after.split(local).join(url);
    }
    if (after !== before) { p.content = after; changed++; }
    if (p.image && p.image.startsWith('/assets/img/')) {
      const f = p.image.slice('/assets/img/'.length);
      if (uploaded.has(f)) { p.image = uploaded.get(f); changed++; }
    }
  }
  if (changed) {
    fs.writeFileSync(POSTS, JSON.stringify(data, null, 2));
    console.log(`posts.json 已改写 (${changed} 处)`);
  } else {
    console.log('posts.json 无需改写');
  }

  if (!REWRITE_ONLY && !KEEP_LOCAL && !DRY && uploaded.size) {
    let del = 0;
    for (const f of uploaded.keys()) {
      try { fs.unlinkSync(path.join(ASSETS, f)); del++; } catch (e) {}
    }
    console.log(`已删除本地图片 ${del} 张 (仓库瘦身; --keep-local 可保留)`);
    console.log('注意: .git 历史里的旧图仍存在, 彻底瘦身需另行 git filter-repo');
  }
}

main().catch(e => { console.error('[失败] ' + (e.message || e)); process.exit(1); });
