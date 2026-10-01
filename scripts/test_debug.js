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
  const sel='h4';
  let curLabel='',curName='';
  $(sel).each((i,el)=>{
    const txt=($(el).text()||'').replace(/\s+/g,' ');
    if(txt.length>200)return;
    const lab=txt.match(/百度网盘\s*[：:]\s*(PC|AZ)/i);
    if(lab){curLabel=lab[1].toUpperCase();return;}
    const nm5=txt.match(/百度网盘\s*[：:]\s*([A-Za-z0-9]{4,})/i);
    if(nm5&&!lab){curName=nm5[1];console.log('抓到分享名:',curName,'| label:',curLabel);return;}
    const um=txt.match(/https?:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9\-_]+/);
    if(um)console.log('百度链接:',um[0],'| name:',curName);
  });
});
