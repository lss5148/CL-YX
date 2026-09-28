/**
 * 批量从 52acgyxj.com 导入文章到本站
 * 用法: node scripts/batch_import.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const { HttpProxyAgent } = require('http-proxy-agent');

const POSTS_PATH = path.join(__dirname, '..', 'data', 'posts.json');

// 配置
const BASE_URL = 'https://www.52acgyxj.com';
const PROXY_URL = 'http://127.0.0.1:8899';

// 创建代理 agent
const proxyAgent = new HttpProxyAgent(PROXY_URL);

// HTTP 请求包装（支持代理和重定向）
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
            timeout: 30000,
            agent: proxyAgent,
            maxRedirects: 5,
        };

        const client = url.startsWith('https') ? https : http;
        const req = client.request(url, options, (res) => {
            // 处理重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
        req.end();
    });
}

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

// 获取首页最新文章ID
async function getLatestIdsFromHomepage() {
    const html = await fetchUrl(BASE_URL);
    const $ = cheerio.load(html);
    const ids = [];
    $('a[href*=".html"]').each((i, el) => {
        const match = $(el).attr('href')?.match(/\/(\d{5})\.html/);
        if (match) ids.push(parseInt(match[1]));
    });
    return [...new Set(ids)].sort((a, b) => b - a);
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
        // 转换懒加载图片
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
    let category = 'PC';
    const catLinks = $('.single-category a, .category a, [rel="category tag"], .post-categories a');
    catLinks.each((i, el) => {
        const rawCat = $(el).text().trim().toUpperCase();
        for (const c of Object.keys(CATEGORY_MAP)) {
            if (rawCat.includes(c)) { category = c; return false; }
        }
    });
    // Try from title brackets
    if (category === 'PC') {
        const titleMatch = title.match(/\[([^\]]+)\]/);
        if (titleMatch) {
            const rawCat = titleMatch[1].toUpperCase();
            for (const c of Object.keys(CATEGORY_MAP)) {
                if (rawCat.includes(c)) { category = c; break; }
            }
        }
    }

    // --- 作者 ---
    let author = 'CL';
    const authorEl = $('.single-author-name, .author-name, [rel="author"], .post-author').first();
    if (authorEl.length) author = authorEl.text().trim();

    // --- 日期 ---
    let date = '';
    const dateEl = $('.data span, time, .post-date, .date').first();
    if (dateEl.length) {
        date = dateEl.text().trim();
        const dt = dateEl.attr('datetime') || dateEl.attr('title') || '';
        if (dt && !date) date = dt;
    }
    if (!date) {
        const metaDate = $('meta[property="article:published_time"]').attr('content');
        if (metaDate) {
            try {
                const d = new Date(metaDate);
                if (!isNaN(d.getTime())) date = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
            } catch(e) {}
        }
    }
    // Extract date from content if needed
    if (!date) {
        const dateMatch = content.match(/(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})/);
        if (dateMatch) {
            date = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
        } else {
            date = new Date().toISOString().split('T')[0];
        }
    }

    // --- 封面图 ---
    let image = '';
    const firstImg = $('.single-content img, article img, .entry-content img').first();
    if (firstImg.length) {
        image = firstImg.attr('src') || firstImg.attr('data-src') || '';
        if (image && (image.includes('avatar') || image.includes('logo') || image.includes('icon') || image.includes('emoji') || image.includes('loading'))) {
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

    // --- 浏览数/评论数 ---
    let views = '0';
    const viewsEl = $('.single-views, .post-views, .views').first();
    if (viewsEl.length) views = viewsEl.text().trim().replace(/[^0-9.]/g, '') || '0';

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
        authorAvatar: article.author.charAt(0) || '恋',
        views: article.views,
        comments: article.comments,
        date: article.date,
    };
}

// 主函数
async function main() {
    console.log('='.repeat(50));
    console.log('CL-YX 风格抓取 (52acgyxj.com)');
    console.log('='.repeat(50));

    // 读取现有数据
    const raw = fs.readFileSync(POSTS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const existingPosts = data.posts;

    // 检查已存在的文章（基于标题去重）
    const existingTitles = new Set(existingPosts.map(p => p.title));
    let maxId = existingPosts.length > 0 ? Math.max(...existingPosts.map(p => p.id)) : 0;

    console.log(`\n已有文章: ${existingPosts.length} 篇, 最大ID: ${maxId}`);

    // 获取首页最新文章ID
    console.log('\n检测首页最新文章...');
    const homepageIds = await getLatestIdsFromHomepage();
    console.log('首页最新ID:', homepageIds.slice(0, 10).join(', '));

    // 选择要抓取的ID（只抓比max_id新的，最多2篇）
    const newIds = homepageIds.filter(i => i > maxId).slice(0, 2);
    console.log('需要抓取:', newIds.join(', '));

    if (newIds.length === 0) {
        console.log('\n没有新文章需要抓取！');
        return;
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const id of newIds) {
        const url = `${BASE_URL}/${id}.html`;
        console.log(`\n-------------`);
        console.log(`处理: ${url}`);

        try {
            const html = await fetchUrl(url);
            const article = parseArticle(html, url);

            // 去重检查
            if (existingTitles.has(article.title)) {
                console.log('跳过(已存在): ' + article.title.substring(0, 50));
                skipped++;
                continue;
            }

            maxId++;
            const post = makePost(article, maxId);
            existingPosts.unshift(post);
            existingTitles.add(article.title);
            imported++;

            console.log('成功: ' + post.title.substring(0, 60));
            console.log('   分类: ' + post.category + ' | 日期: ' + post.date);
            console.log('   封面: ' + (post.image ? '有' : '无'));
            console.log('   下载: ' + post.download.substring(0, 50));

        } catch (e) {
            console.log('失败: ' + e.message);
            failed++;
        }

        // 礼貌延迟
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

    console.log('\n========== 抓取完成 ==========');
    console.log('成功: ' + imported);
    console.log('跳过: ' + skipped);
    console.log('失败: ' + failed);
    console.log('总文章数: ' + existingPosts.length);
}

main().catch(console.error);
