/**
 * 批量从 acgyx.us 导入文章到本站
 * 用法: node scripts/batch_import.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

const POSTS_PATH = path.join(__dirname, '..', 'data', 'posts.json');

// 目标文章列表（从首页提取，排除已导入的 38212 和 38691）
const TARGET_URLS = [
    'https://acgyx.us/38211.html',
    'https://acgyx.us/38202.html',
    'https://acgyx.us/38203.html',
    'https://acgyx.us/38204.html',
    'https://acgyx.us/38205.html',
    'https://acgyx.us/38206.html',
    'https://acgyx.us/38207.html',
    'https://acgyx.us/38208.html',
    'https://acgyx.us/38209.html',
    'https://acgyx.us/38210.html',
    'https://acgyx.us/38699.html',
    'https://acgyx.us/38698.html',
    'https://acgyx.us/38697.html',
    'https://acgyx.us/38696.html',
    'https://acgyx.us/38695.html',
    'https://acgyx.us/38694.html',
    'https://acgyx.us/38693.html',
    'https://acgyx.us/38692.html',
];

// 分类映射
const CATEGORY_MAP = {
    'SLG': 'SLG', 'RPG': 'RPG', 'ADV': 'ADV', 'ACT': 'ACT',
    'AZ': 'AZ', 'NTR': 'NTR', 'PC': 'PC',
};

// 分类对应的渐变色
const GRADIENT_MAP = {
    'SLG': { c1: '#D87CFF', c2: '#9B59B6' },
    'RPG': { c1: '#FF6B6B', c2: '#C0392B' },
    'ADV': { c1: '#4ECDC4', c2: '#2C3E50' },
    'ACT': { c1: '#F39C12', c2: '#E74C3C' },
    'AZ':  { c1: '#3498DB', c2: '#2980B9' },
    'NTR': { c1: '#E74C3C', c2: '#8E44AD' },
    'PC':  { c1: '#2ECC71', c2: '#27AE60' },
};

// 图标映射
const ICON_MAP = {
    'SLG': 'fa-gamepad', 'RPG': 'fa-flag', 'ADV': 'fa-star',
    'ACT': 'fa-flask', 'AZ': 'fa-globe', 'NTR': 'fa-heart',
    'PC': 'fa-gamepad',
};

// HTTP 请求包装
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
            timeout: 30000,
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject).on('timeout', function() {
            this.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// HTML 实体解码
function decodeEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n))
        .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8211;/g, '–')
        .replace(/&#8217;/g, "'")
        .replace(/&#8230;/g, '…');
}

// 解析文章
function parseArticle(html, url) {
    const $ = cheerio.load(html);

    // --- 标题 ---
    let title = '';
    const titleEl = $('.single-title').first() || $('h1').first();
    if (titleEl.length) {
        title = decodeEntities(titleEl.text().trim());
        title = title.replace(/[\s\-|–—]+ACG游戏姬.*$/, '').replace(/[\s\-|–—]+ACGYX.*$/i, '').trim();
    }
    if (!title) {
        const titleTag = $('title').text().trim();
        title = decodeEntities(titleTag.replace(/[\s\-|–—]+ACG游戏姬.*$/, '').trim());
    }
    if (!title) throw new Error('未能提取标题');

    // --- 正文 ---
    let content = '';
    const contentEl = $('.single-content').first() || $('.entry-content').first() || $('article').first();
    if (contentEl.length) {
        content = $.html(contentEl);
        // Remove the outer wrapper div tag
        content = content.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
        // 转换懒加载图片：先移除占位 src，再提升 data-src
        content = content.replace(/\bsrc="[^"]*"\s+data-src="/gi, 'src="');
        content = content.replace(/\bdata-src=/gi, 'src=');
        content = content.replace(/\bdata-lazy-src=/gi, 'src=');
        content = content.replace(/\s+loading="lazy"/gi, '');
        content = content.replace(/\s+loading="eager"/gi, '');
        // 移除脚本和样式
        content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
        content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
        content = content.trim();
    }

    // --- 描述 ---
    let description = '';
    const metaDesc = $('meta[name="description"]').attr('content');
    if (metaDesc) description = decodeEntities(metaDesc.trim());
    if (!description) {
        const firstP = $('.single-content p').first() || $('article p').first();
        if (firstP.length) description = decodeEntities(firstP.text().trim()).substring(0, 200);
    }

    // --- 分类 ---
    let category = '其他';
    const catLinks = $('.single-category a, .category a, [rel="category tag"], .post-categories a');
    catLinks.each((i, el) => {
        const rawCat = $(el).text().trim().toUpperCase();
        for (const c of Object.keys(CATEGORY_MAP)) {
            if (rawCat.includes(c)) { category = c; return false; }
        }
    });
    // Try from title brackets
    if (category === '其他') {
        const titleMatch = title.match(/\[([^\]]+)\]/);
        if (titleMatch) {
            const rawCat = titleMatch[1].toUpperCase();
            for (const c of Object.keys(CATEGORY_MAP)) {
                if (rawCat.includes(c)) { category = c; break; }
            }
        }
    }

    // --- 作者 ---
    let author = '姬姬';
    const authorEl = $('.single-author-name, .author-name, [rel="author"], .post-author').first();
    if (authorEl.length) author = authorEl.text().trim();

    // --- 日期 ---
    let date = '';
    const dateEl = $('.data span, time, .post-date, .date').first();
    if (dateEl.length) {
        date = dateEl.text().trim();
        // Try datetime attribute
        const dt = dateEl.attr('datetime') || dateEl.attr('title') || '';
        if (dt && !date) date = dt;
    }
    if (!date) {
        const metaDate = $('meta[property="article:published_time"]').attr('content');
        if (metaDate) {
            try {
                const d = new Date(metaDate);
                if (!isNaN(d.getTime())) date = d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
            } catch(e) {}
        }
    }
    // Extract date from content if needed
    if (!date || !date.includes('年')) {
        const dateMatch = content.match(/(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/);
        if (dateMatch) {
            date = dateMatch[1] + '年' + parseInt(dateMatch[2]) + '月' + dateMatch[3] + '日';
        } else {
            date = new Date().toLocaleDateString('zh-CN').replace(/\//g, '年').replace('/', '月') + '日';
        }
    }

    // --- 封面图 ---
    let image = '';
    const firstImg = $('.single-content img, article img, .entry-content img').first();
    if (firstImg.length) {
        image = firstImg.attr('src') || firstImg.attr('data-src') || '';
        if (image && (image.includes('avatar') || image.includes('logo') || image.includes('icon') || image.includes('emoji') || image.includes('loading') || image.includes('lolimeow'))) {
            image = '';
        }
    }

    // --- 下载链接 ---
    let download = '#';
    const downloadPatterns = [
        /https?:\/\/pan\.baidu\.com\/\S+/i,
        /https?:\/\/pan\.xunlei\.com\/\S+/i,
        /https?:\/\/drive\.uc\.cn\/\S+/i,
        /https?:\/\/yun\.139\.com\/\S+/i,
        /https?:\/\/mofacga\.top\/\S+/i,
        /https?:\/\/115\.com\/\S+/i,
        /https?:\/\/pan\.quark\.cn\/\S+/i,
    ];
    for (const pattern of downloadPatterns) {
        const match = content.match(pattern);
        if (match) {
            download = match[0].replace(/["'<>\s]+$/, '');
            break;
        }
    }

    // --- 浏览数 ---
    let views = '0';
    const viewsEl = $('.single-views, .post-views, .views').first();
    if (viewsEl.length) views = viewsEl.text().trim().replace(/[^0-9.]/g, '') || '0';

    // --- 评论数 ---
    let comments = 0;
    const commentsEl = $('.single-comments, .post-comments, .comments-count').first();
    if (commentsEl.length) {
        const c = parseInt(commentsEl.text().trim().replace(/[^0-9]/g, ''));
        if (!isNaN(c)) comments = c;
    }

    return { title, content, description, category, author, date, image, download, views, comments };
}

// 生成 post 对象
function makePost(article, id) {
    const grad = GRADIENT_MAP[article.category] || { c1: '#D87CFF', c2: '#9B59B6' };
    return {
        id: id,
        title: article.title,
        description: article.description,
        content: article.content,
        image: article.image,
        link: '/article.html?id=' + id,
        download: article.download,
        category: article.category,
        gradient: 'linear-gradient(135deg,' + grad.c1 + ',' + grad.c2 + ')',
        icon: ICON_MAP[article.category] || 'fa-gamepad',
        author: article.author,
        authorAvatar: article.author.charAt(0) || '姬',
        views: article.views,
        comments: article.comments,
        date: article.date,
    };
}

// 主函数
async function main() {
    // 读取现有数据
    const raw = fs.readFileSync(POSTS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const existingPosts = data.posts;

    // 检查已存在的文章（基于标题去重）
    const existingTitles = new Set(existingPosts.map(p => p.title));
    let maxId = existingPosts.length > 0 ? Math.max(...existingPosts.map(p => p.id)) : 0;

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const url of TARGET_URLS) {
        console.log('\n-------------');
        console.log('处理: ' + url);

        try {
            const html = await fetchUrl(url);
            const article = parseArticle(html, url);

            // 去重检查
            if (existingTitles.has(article.title)) {
                console.log('⏭ 已存在，跳过: ' + article.title.substring(0, 50));
                skipped++;
                continue;
            }

            maxId++;
            const post = makePost(article, maxId);
            existingPosts.unshift(post); // 插到最前面
            existingTitles.add(article.title);
            imported++;

            console.log('✅ 导入成功: ' + post.title.substring(0, 60));
            console.log('   分类: ' + post.category + ' | 作者: ' + post.author + ' | 日期: ' + post.date);
            console.log('   下载: ' + post.download.substring(0, 60));
            if (post.image) console.log('   封面: ' + post.image.substring(0, 60));

        } catch (e) {
            console.log('❌ 失败: ' + e.message);
            failed++;
        }

        // 礼貌延迟，避免被 ban
        await new Promise(r => setTimeout(r, 1500));
    }

    // 更新随机推荐
    const shuffled = [...existingPosts].sort(() => Math.random() - 0.5);
    data.randomPosts = shuffled.slice(0, 5).map(p => ({
        title: p.title,
        link: p.link || '#',
        gradient: p.gradient || 'linear-gradient(135deg,#D87CFF,#8E44AD)',
        date: p.date || '',
    }));

    // 保存
    data.posts = existingPosts;
    fs.writeFileSync(POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');

    console.log('\n========== 批量导入完成 ==========');
    console.log('✅ 成功: ' + imported);
    console.log('⏭ 跳过: ' + skipped);
    console.log('❌ 失败: ' + failed);
    console.log('📄 总文章数: ' + existingPosts.length);
}

main().catch(console.error);
