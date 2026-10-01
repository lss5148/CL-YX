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
get('https://www.acgyxjvip2.com/44581.html').then(html=>{
  const cheerio=require('cheerio');
  const $=cheerio.load(html);
  const results=[];
  $('h4, h3, h2, div, p').each((i,el)=>{
    const txt=($(el).text()||'').replace(/\s+/g,' ');
    if(txt.length<300&&(txt.includes('百度')||txt.includes('pan.baidu')))results.push({tag:$(el).prop('tagName'),txt:txt.substring(0,150)});
  });
  console.log('--- 44581 找到的网盘相关行 ---');
  results.forEach(r=>console.log('['+r.tag+']',r.txt));
});
