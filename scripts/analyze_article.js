const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('data/ref_article.html', 'utf8'));

console.log('=== 整体布局 ===');
$('body').children().each((i, el) => {
    const tag = (el.tagName || '').toLowerCase();
    const cls = $(el).attr('class') || '';
    const id = $(el).attr('id') || '';
    console.log((i+1) + '. <' + tag + '> class="' + cls + '" id="' + id + '"');
});

console.log('\n=== 文章标题 ===');
$('.single-title, .entry-title, .post-title, h1.page-title').each((i, el) => {
    console.log('  ' + $(el).text().trim().substring(0, 80));
});

console.log('\n=== 元信息行 ===');
$('.single-meta, .post-meta, .entry-meta').each((i, el) => {
    console.log('  ' + $(el).text().trim().substring(0, 100));
});

console.log('\n=== 分类/标签/作者信息 ===');
$('.single-category, .single-author, .post-category, .post-author, .data').each((i, el) => {
    console.log('  .' + $(el).attr('class') + ' => ' + $(el).text().trim().substring(0, 80));
});

console.log('\n=== 正文 ===');
$('.single-content, .entry-content, .post-content, .article-content').each((i, el) => {
    console.log('  .' + $(el).attr('class') + ' => ' + $(el).html().length + ' bytes');
});

console.log('\n=== 文章容器(主要布局) ===');
$('.container, .container-fluid').each((i, el) => {
    const hasRow = $(el).find('> .row').length > 0;
    if (hasRow) {
        console.log('  .container -> .row 子元素:');
        $(el).find('> .row').children().each((j, child) => {
            const ccls = $(child).attr('class') || '';
            const ctag = (child.tagName || '').toLowerCase();
            const htmlLen = $(child).html().length;
            console.log('    Col' + (j+1) + ': <' + ctag + '> .' + ccls + ' (' + htmlLen + ' bytes)');
        });
    }
});

console.log('\n=== 主要文章容器(猜测) ===');
$('[class*="col-"]').each((i, el) => {
    const text = $(el).text().trim().substring(0, 60);
    const htmlLen = $(el).html().length;
    const cls = $(el).attr('class') || '';
    if (htmlLen > 500) {
        console.log('  .' + cls + ' => ' + htmlLen + ' bytes, text: "' + text + '"');
    }
});

console.log('\n=== 底部/下载区域 ===');
$('.article-footer, .post-footer, .entry-footer, .download-box, .download-area, [class*="download"]').each((i, el) => {
    console.log('  .' + $(el).attr('class') + ' => ' + $(el).text().trim().substring(0, 100));
});
