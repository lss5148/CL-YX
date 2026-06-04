/**
 * 批量处理 .md 文件 → 上传图片到 Telegram 图床 → 生成网站文档
 *
 * 用法: node scripts/process_docs.js <telegram_token> <chat_id>
 * 例如: node scripts/process_docs.js 8521451269:xx -1003949857465
 *
 * 流程:
 *   1. 读取 商品目录/ 下所有 .md
 *   2. 提取 ![[...]] 图片引用 → 在图床/ 中找到文件
 *   3. 上传唯一图片到 Telegram（5 并发，可断点续传）
 *   4. 替换 .md 中所有引用为 Telegram URL
 *   5. 保存到项目 docs/ 目录
 *   6. 生成 docs/index.json 索引文件
 */

const fs = require('fs');
const path = require('path');

// ── 配置 ──
const MD_DIR = 'E:/OneDrive - ZHANGYUJIAN/obsidian/福利姬/商品目录/';
const IMAGE_DIR = 'E:/OneDrive - ZHANGYUJIAN/obsidian/图床/';
const PROJECT_DOCS_DIR = 'E:/自己做的软件/网站/acgyx-clone/docs/';
const CACHE_FILE = path.join(__dirname, 'upload_cache.json');

const token = process.argv[2];
const chatId = process.argv[3];

if (!token || !chatId) {
    console.error('用法: node scripts/process_docs.js <telegram_token> <chat_id>');
    process.exit(1);
}

// ── 工具函数 ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const UPLOAD_ENDPOINT = 'https://yx.chulian.ccwu.cc/upload-img';

async function uploadToTelegram(filePath, fileName) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: getMimeType(fileName) });

        const formData = new FormData();
        formData.append('file', blob, fileName);
        formData.append('token', token);
        formData.append('chatId', chatId);

        const r = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: formData });
        const d = await r.json();

        if (d.ok && d.okCount > 0 && d.results && d.results[0]) {
            const res = d.results[0];
            return {
                ok: true,
                url: res.url,
                width: res.width,
                height: res.height,
            };
        }
        return { ok: false, error: d.error || (d.results && d.results[0] && d.results[0].error) || '上传失败' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const mime = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp',
    };
    return mime[ext] || 'image/jpeg';
}

// ── 主逻辑 ──
async function main() {
    // 第一步：构建图片索引
    console.log('📂 构建图片索引...');
    const imageIndex = {};

    const folders = fs.readdirSync(IMAGE_DIR, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const folder of folders) {
        const folderPath = path.join(IMAGE_DIR, folder.name);
        let files;
        try { files = fs.readdirSync(folderPath); } catch (e) { continue; }
        for (const file of files) {
            const fullPath = path.join(folderPath, file);
            try {
                const stat = fs.statSync(fullPath);
                if (!stat.isFile()) continue;
                const ext = path.extname(file).toLowerCase();
                if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) continue;
                const key = file.toLowerCase();
                if (!imageIndex[key]) imageIndex[key] = [];
                imageIndex[key].push({ file, folder: folder.name, fullPath, size: stat.size });
            } catch (e) { /* skip */ }
        }
    }
    console.log(`   索引了 ${Object.keys(imageIndex).length} 个唯一文件名`);

    // 也按路径索引（如 "图床/01.困困狗/null.jpeg"），全小写
    for (const folder of folders) {
        const folderPath = path.join(IMAGE_DIR, folder.name);
        let files;
        try { files = fs.readdirSync(folderPath); } catch (e) { continue; }
        for (const file of files) {
            const key = ('图床/' + folder.name + '/' + file).toLowerCase();
            if (!imageIndex[key]) {
                const fullPath = path.join(folderPath, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isFile()) {
                        imageIndex[key] = [{ file, folder: folder.name, fullPath, size: stat.size }];
                    }
                } catch (e) { /* skip */ }
            }
        }
    }
    console.log(`   路径索引后共计 ${Object.keys(imageIndex).length} 个条目`);

    // 第二步：扫描 .md 文件
    console.log('📄 扫描 .md 文件中的图片引用...');
    const mdFiles = fs.readdirSync(MD_DIR).filter(f => f.endsWith('.md'));
    const mdContents = {};

    let totalRefs = 0;
    const uniqueImages = {};

    for (const mdFile of mdFiles) {
        const content = fs.readFileSync(path.join(MD_DIR, mdFile), 'utf-8');
        const refRegex = /!\[\[([^\]]+)\]\]/g;
        const refs = [];
        let match;
        while ((match = refRegex.exec(content)) !== null) {
            const name = match[1].trim();
            refs.push({ raw: match[0], name, idx: match.index });
            totalRefs++;

            let resolved = null;
            const lookupKey = name.toLowerCase();

            if (imageIndex[lookupKey]) {
                resolved = imageIndex[lookupKey];
            }

            if (!resolved) {
                const pathKey = name.replace(/\\/g, '/').toLowerCase();
                if (imageIndex[pathKey]) {
                    resolved = imageIndex[pathKey];
                }
            }

            if (!uniqueImages[lookupKey]) {
                uniqueImages[lookupKey] = { name, resolvedPaths: resolved || [], refs: [] };
            }
            uniqueImages[lookupKey].refs.push({ mdFile, raw: match[0], name });
        }
        mdContents[mdFile] = { content, refs };
    }

    console.log(`   共 ${totalRefs} 个引用, ${Object.keys(uniqueImages).length} 个唯一图片`);
    const foundImages = Object.values(uniqueImages).filter(u => u.resolvedPaths.length > 0);
    const notFoundImages = Object.values(uniqueImages).filter(u => u.resolvedPaths.length === 0);
    console.log(`   可找到: ${foundImages.length}, 未找到: ${notFoundImages.length}`);

    if (notFoundImages.length > 0) {
        console.log('\n⚠️  未找到的图片（将保留原样）:');
        notFoundImages.slice(0, 10).forEach(u => {
            console.log(`   ${u.name} (来自: ${[...new Set(u.refs.map(r => r.mdFile))].join(', ')})`);
        });
        if (notFoundImages.length > 10) console.log(`   ... 还有 ${notFoundImages.length - 10} 个`);
    }

    // 第三步：上传图片到 Telegram
    console.log('\n☁️  上传图片到 Telegram 图床...');

    let uploadCache = {};
    if (fs.existsSync(CACHE_FILE)) {
        try {
            uploadCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            console.log(`   从缓存恢复 ${Object.keys(uploadCache).length} 个已上传记录`);
        } catch (e) { /* ignore */ }
    }

    const toUpload = foundImages.filter(u => !uploadCache[u.name]);
    let uploadedCount = 0;
    let failedCount = 0;

    if (toUpload.length === 0) {
        console.log('   所有图片已上传，跳过');
    } else {
        console.log(`   待上传: ${toUpload.length} 张图片`);
        const CONCURRENCY = 5;

        for (let i = 0; i < toUpload.length; i += CONCURRENCY) {
            const batch = toUpload.slice(i, i + CONCURRENCY);
            const pct = Math.round((i / toUpload.length) * 100);
            process.stdout.write(`   [${pct}%] 上传中... (${i}/${toUpload.length})\r`);

            const results = await Promise.all(batch.map(item => {
                const firstPath = item.resolvedPaths[0];
                return uploadToTelegram(firstPath.fullPath, firstPath.file);
            }));

            for (let j = 0; j < batch.length; j++) {
                const result = results[j];
                const item = batch[j];
                if (result.ok) {
                    uploadCache[item.name] = {
                        url: result.url,
                        width: result.width,
                        height: result.height,
                        uploadedAt: new Date().toISOString(),
                        sourceFile: item.resolvedPaths[0].file,
                        sourceFolder: item.resolvedPaths[0].folder,
                    };
                    uploadedCount++;
                } else {
                    failedCount++;
                    console.log(`\n   ❌ 上传失败: ${item.name} -> ${result.error}`);
                }
            }

            fs.writeFileSync(CACHE_FILE, JSON.stringify(uploadCache, null, 2));

            if (i + CONCURRENCY < toUpload.length) {
                await sleep(500);
            }
        }
        console.log(`\n   ✅ 上传完成: 成功 ${uploadedCount}, 失败 ${failedCount}`);
    }

    // 第四步：替换引用并保存
    console.log('\n✏️  替换图片引用并保存到 docs/...');

    if (!fs.existsSync(PROJECT_DOCS_DIR)) {
        fs.mkdirSync(PROJECT_DOCS_DIR, { recursive: true });
    }

    const docIndex = [];

    for (const mdFile of mdFiles) {
        let content = mdContents[mdFile].content;
        const refRegex = /!\[\[([^\]]+)\]\]/g;
        let replacedCount = 0;

        content = content.replace(refRegex, (match, name) => {
            const trimmed = name.trim();
            const lookupKey = trimmed.toLowerCase();
            const cached = uploadCache[trimmed] || uploadCache[lookupKey];
            if (cached && cached.url) {
                replacedCount++;
                return `![${trimmed}](${cached.url})`;
            }
            return match;
        });

        let title = mdFile.replace(/\.md$/, '');
        let contentForDisplay = content;

        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let frontmatter = {};
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (const line of fmLines) {
                const sepIdx = line.indexOf(':');
                if (sepIdx > 0) {
                    const key = line.slice(0, sepIdx).trim();
                    const val = line.slice(sepIdx + 1).trim().replace(/^['"]|['"]$/g, '');
                    frontmatter[key] = val;
                }
            }
            if (frontmatter.title) title = frontmatter.title;
            contentForDisplay = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        }

        const outPath = path.join(PROJECT_DOCS_DIR, mdFile);
        fs.writeFileSync(outPath, contentForDisplay, 'utf-8');

        docIndex.push({
            id: mdFile.replace(/\.md$/, ''),
            file: mdFile,
            title: title,
            replacedImages: replacedCount,
            totalImages: mdContents[mdFile].refs.length,
            share_link: frontmatter.share_link || '',
            share_updated: frontmatter.share_updated || '',
        });

        if (replacedCount < mdContents[mdFile].refs.length) {
            const failed = mdContents[mdFile].refs.length - replacedCount;
            console.log(`   ⚠️ ${mdFile}: 替换 ${replacedCount}/${mdContents[mdFile].refs.length} (${failed} 个未替换)`);
        }
    }

    fs.writeFileSync(path.join(PROJECT_DOCS_DIR, 'index.json'), JSON.stringify({
        total: docIndex.length,
        updatedAt: new Date().toISOString(),
        docs: docIndex,
    }, null, 2));

    console.log(`\n✅ 完成！`);
    console.log(`   处理的 .md 文件: ${mdFiles.length}`);
    console.log(`   上传的图片: ${uploadedCount}`);
    console.log(`   成功替换的引用: ${docIndex.reduce((s, d) => s + d.replacedImages, 0)}`);
    console.log(`   文档保存到: ${PROJECT_DOCS_DIR}`);
}

main().catch(err => {
    console.error('\n❌ 脚本出错:', err.message);
    process.exit(1);
});
