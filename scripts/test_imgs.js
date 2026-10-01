const https = require('https');
const cheerio = require('cheerio');
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
const d = require('../data/page2-full.json');
get(d.items[0].url).then(html=>{
  const $ = cheerio.load(html);
  console.log('--- 第1篇 img src 域名分布 ---');
  const doms = {};
  $('img').each((i,el)=>{
    const s = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || '';
    if(!s)return;
    let dom='';
    try{dom=new URL(s).host;}catch(e){dom=s.substring(0,40);}
    doms[dom]=(doms[dom]||0)+1;
  });
  Object.entries(doms).forEach(([k,v])=>console.log('  ',v,k));
});
