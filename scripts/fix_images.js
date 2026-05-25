/**
 * 修复已有文章的图片问题
 * 1. 去除重复的 src 属性（loading.gif 占位图）
 * 2. 修复 post.image 封面图字段
 * 用法: node scripts/fix_images.js
 */
const fs = require('fs');
const path = require('path');

const POSTS_PATH = path.join(__dirname, '..', 'data', 'posts.json');

function main() {
    const raw = fs.readFileSync(POSTS_PATH, 'utf8');
    const data = JSON.parse(raw);
    let fixCount = 0;

    for (const post of data.posts) {
        if (!post.content) continue;

        const original = post.content;

        // 1. 修复正文中的图片: 移除 loading 占位 src (它后面跟着真正的 src)
        // 模式: <img ... src="...loading.gif" src="real.jpg" ...>
        // 移除掉第一个 src (指向 loading.gif 或主题资源目录的)
        post.content = post.content.replace(
            /(<img\s[^>]*?)\bsrc="[^"]*?\/(?:loading|assets\/)[^"]*?"\s*/gi,
            '$1'
        );

        // 2. 同时处理 data-src 还没转换的情况 (双重保险)
        // 先移除旧的 loading src, 再提升 data-src
        post.content = post.content.replace(
            /\bsrc="[^"]*?"\s+data-src=/gi,
            'src='
        );
        post.content = post.content.replace(/\bdata-src=/gi, 'src=');

        // 3. 去掉多余的 class="lazy" (原站懒加载标记)
        post.content = post.content.replace(/\s+class="lazy"/gi, '');

        // 4. 修复封面图字段
        if (post.image && (
            post.image.includes('loading') ||
            post.image.includes('assets/i') ||
            post.image.includes('lolimeow')
        )) {
            // 从正文中找第一张真实图片作为封面
            const imgMatch = post.content.match(/src="([^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i);
            if (imgMatch) {
                post.image = imgMatch[1];
            } else {
                post.image = '';
            }
        }

        if (post.content !== original) {
            fixCount++;
            console.log('✅ 修复: ' + post.title.substring(0, 50) + '...');
        }
    }

    // 写入修复后的数据
    fs.writeFileSync(POSTS_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log('\n========== 图片修复完成 ==========');
    console.log('✅ 修复文章: ' + fixCount + '/' + data.posts.length);
    console.log('📄 总文章数: ' + data.posts.length);
}

main();
