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
get('https://www.acgyxjvip2.com/44537.html').then(html=>{
  const cheerio=require('cheerio');
  const $=cheerio.load(html);
  const text=$('body').text();
  const lines=text.split('\n').filter(l=>l.includes('百度')||l.includes('PCC')||l.includes('AZC')||l.includes('C24'));
  lines.slice(0,15).forEach(l=>console.log(l));
});
