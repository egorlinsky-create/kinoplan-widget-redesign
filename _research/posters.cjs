const https=require("https"),fs=require("fs");
const urls = {
 "rocky.jpg":"https://s1ru1.kinoplan24.ru/891/0406060507c4f4fd9f7947e9/24563.jpg?mode=fit&width=400&height=600",
 "kolotun.jpg":"https://s2ru1.kinoplan24.ru/740/0406060507bff4031515e595/24653.jpg?mode=fit&width=400&height=600",
 "dedmobil.jpg":"https://s1ru1.kinoplan24.ru/959/0406060507bd644aed06b9eb/25411.jpg?mode=fit&width=400&height=600",
 "tiger.jpg":"https://s1ru1.kinoplan24.ru/956/0406060507c19470fd708b83/22753.jpg?mode=fit&width=400&height=600",
 "uvidet.jpg":"https://s1ru1.kinoplan24.ru/964/0406060507c6d70c6eea066a/26248.jpg?mode=fit&width=400&height=600",
 "astral.jpg":"https://s1ru1.kinoplan24.ru/965/0406060507c37f8bdb780abf/25387.jpg?mode=fit&width=400&height=600",
};
function get(url){return new Promise((res,rej)=>{const req=https.get(url,{headers:{"User-Agent":"Mozilla/5.0 Chrome/131.0"}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){return res(get(new URL(r.headers.location,url).href));}const chunks=[];r.on("data",c=>chunks.push(c));r.on("end",()=>res({status:r.statusCode,buf:Buffer.concat(chunks)}));});req.on("error",rej);req.setTimeout(30000,()=>req.destroy(new Error("timeout")));});}
(async()=>{for(const [n,u] of Object.entries(urls)){try{const r=await get(u);fs.writeFileSync("prototype/img/"+n,r.buf);console.log(n,r.status,r.buf.length);}catch(e){console.log(n,"ERR",e.message);}}})();
