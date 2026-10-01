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
get('https://www.acgyxjvip2.com/44590.html').then(html=>{
  const $=cheerio.load(html);
  const all=$('h4');
  for(let i=0;i<all.length;i++){
    const el=all[i];
    const txt=$(el).text().replace(/\s+/g,' ').trim();
    if(txt.includes('百度')&&txt.length<200){
      console.log('idx:',i,'txt:',txt);
      const nm5=txt.match(/百度网盘\s*[：:]\s*([A-Za-z0-9]{4,})/i);
      console.log('  匹配nm5:',nm5?nm5[1]:'no match');
      const lab=txt.match(/百度网盘\s*[：:]\s*(PC|AZ)/i);
      console.log('  匹配lab:',lab?lab[1]:'no match');
    }
  }
});
