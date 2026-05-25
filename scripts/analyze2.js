const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('data/ref_article.html', 'utf8'));

console.log('=== .post-single 内部 ===');
const postSingle = $('.post-single').first();
postSingle.children().each((i, el) => {
    const tag = (el.tagName || '').toLowerCase();
    const cls = $(el).attr('class') || '';
    const htmlLen = $(el).html().length;
    const txt = $(el).text().trim().substring(0, 100);
    console.log((i+1) + '. <' + tag + '> .' + cls + ' (' + htmlLen + ' bytes) => ' + txt);
});

console.log('\n=== .single-title ===');
$('.single-title').each((i, el) => {
    console.log('  .single-title: ' + $(el).text().trim().substring(0, 80));
    console.log('  父元素: <' + $(el).parent()[0].tagName + '> .' + ($(el).parent().attr('class') || ''));
});

console.log('\n=== 文章顶部元信息 ===');
// Check what's before .single-title
postSingle.children().each((i, el) => {
    const cls = $(el).attr('class') || '';
    if (cls.includes('single-') || cls.includes('meta') || cls.includes('category') || cls.includes('data') || cls.includes('author')) {
        const tag = (el.tagName || '').toLowerCase();
        const txt = $(el).text().trim().substring(0, 80);
        console.log('  <' + tag + '> .' + cls + ' => "' + txt + '"');
    }
});

console.log('\n==== .post-single 的 .single-content ====');
console.log('  存在: ' + ($('.single-content').length > 0));
console.log('  长度: ' + ($('.single-content').html() ? $('.single-content').html().length : 0) + ' bytes');

console.log('\n==== 第一张图的src ====');
$('.single-content img').first().each((i, el) => {
    console.log('  src: ' + ($(el).attr('src') || $(el).attr('data-src') || 'none'));
});

console.log('\n==== .post-comments ====');
const comments = $('.post-comments').first();
console.log('  内容长度: ' + comments.html().length + ' bytes');
