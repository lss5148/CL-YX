const https = require('https');
function get(url){
  return new Promise((res,rej)=>{
    https.get(url,{headers:{'User-Agent':'Mozilla/5.0'}},r=>{
      if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){res(get(r.headers.location));return;}
      let d='';
      r.on('data',c=>d+=c);
      r.on('end',()=>res(d));
    });
  });
}
get('https://www.acgyxjvip2.com/44590.html').then(html=>{
  const cheerio=require('cheerio');
  const $=cheerio.load(html);
  console.log('--- h4 内容 ---');
  $('h4').each((i,el)=>console.log(JSON.stringify($(el).text().trim())));
  console.log('--- 含百度的短行 ---');
  $('div, p').each((i,el)=>{
    const txt=$(el).text().replace(/\s+/g,' ').trim();
    if(txt.includes('百度')&&txt.length<200)console.log($(el).prop('tagName'),JSON.stringify(txt));
  });
});
