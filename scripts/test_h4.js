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
const d=require('./data/page2-full.json');
get(d.items[2].url).then(html=>{
  const cheerio=require('cheerio');
  const $=cheerio.load(html);
  $('h4').each((i,el)=>console.log('H4:',$(el).text().trim()));
});
