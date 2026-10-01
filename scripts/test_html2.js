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
get('https://www.acgyxjvip2.com/44580.html').then(html=>{
  const cheerio=require('cheerio');
  const $=cheerio.load(html);
  // 找出所有 div/p 里包含"百度网盘"的,看它们的文本
  const results=[];
  $('div, p').each((i,el)=>{
    const txt=($(el).text()||'').replace(/\s+/g,' ');
    if(txt.includes('百度')&&txt.length<300)results.push({tag:$(el).prop('tagName'),txt:txt.substring(0,200)});
  });
  console.log('共找到', results.length, '个含百度的 div/p');
  results.forEach(r=>console.log('['+r.tag+']', r.txt));
}).catch(e=>console.error(e));
