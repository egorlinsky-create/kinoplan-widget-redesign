const fs = require("node:fs"), { spawnSync } = require("node:child_process");
const { join } = require("node:path"), { tmpdir } = require("node:os"), { pathToFileURL } = require("node:url");
const name = "KINOPLAN-BOOKING.html";
const asset = "data:image/jpeg;base64," + fs.readFileSync("prototype/img/rocky.jpg").toString("base64");
const input = fs.readFileSync(name,"utf8").replaceAll("__POSTER__",asset);
fs.writeFileSync(name,input);
const file = fs.mkdtempSync(join(tmpdir(),"cinema-booking-"));
const setup = String.raw`
<script>
const q = s => document.querySelector(s);
const tap = s => q(s).click();
const fill = (s,value) => { q(s).value=value; q(s).dispatchEvent(new Event('input',{bubbles:true})); };
const showPage = () => q('#widget').dataset.view;
const ok = (condition,label) => { if(!condition) throw Error(label); };
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const form = () => {fill('#email','tester@example.com');q('#consent').checked=true;};
`;
const test = setup + String.raw`
(async()=>{
  ok(showPage()==='seats','entry directly in hall');
  ok(q('h1').textContent.includes('Рокки'),'selected showing');
  ok(document.querySelectorAll('.seat').length===96,'hall seat count');
  ok(getComputedStyle(q('#seatWindow')).overflowX==='auto','zoom container');
  ok(q('#seatWindow').scrollWidth<=q('#seatWindow').clientWidth+2,'whole hall fits');
  tap('#larger');ok(q('#seatWindow').scrollWidth>q('#seatWindow').clientWidth,'zoom overflows inside hall only');
  tap('#smaller');
  tap('[data-seat="4-5"]');
  ok(q('[data-total]').textContent==='550 ₽','price from selected seat');
  tap('#pair');ok(q('#pairDialog').open,'pair preview');
  ok(document.querySelectorAll('.seat[aria-pressed="true"]').length===1,'pair preview preserves selection');
  tap('#applyPair');
  ok(document.querySelectorAll('.seat[aria-pressed="true"]').length===2,'pair applied');
  tap('#orderAction');ok(showPage()==='checkout','checkout');
  tap('#orderAction');ok(!q('#emailError').hidden,'email validation');
  form();q('#scenario').value='conflict';tap('#orderAction');
  ok(showPage()==='seats'&&!q('#seatNotice').hidden,'seat conflict');
  ok(document.querySelectorAll('.seat[aria-pressed="true"]').length===1,'preserves unaffected seat');
  tap('#orderAction');tap('#signIn');fill('#authEmail','tester@example.com');
  tap('#authAction');fill('#authCode','4321');tap('#authAction');ok(!q('#authError').hidden,'invalid code');
  fill('#authCode','1234');tap('#authAction');
  ok(!q('#savedMethod').hidden&&!q('#recipient').hidden&&!q('#authDialog').open,'saved profile');
  q('#scenario').value='pending';tap('#orderAction');
  ok(showPage()==='payment','saved card opens payment');
  await sleep(1000);
  ok(q('#payment-title').textContent==='Ответ банка задерживается','pending bank response');
  ok(q('#payActions button').textContent==='Проверить статус','no duplicate payment CTA');
  tap('#payActions button');await sleep(1000);ok(showPage()==='ticket','ticket after verifying');
  ok(q('#ticketEmail').textContent==='tester@example.com','ticket recipient');
  tap('#finish');tap('#restart');tap('[data-seat="4-5"]');tap('#orderAction');form();
  tap('[value="sbp"]');tap('#orderAction');ok(!q('#bankQr').hidden,'SBP QR available');
  q('#scenario').value='failure';tap('#payActions button');await sleep(1000);
  ok(q('#payment-title').textContent==='Банк отклонил платёж','declined payment');
  tap('#payActions button');await sleep(1000);ok(showPage()==='ticket','retry success');
  ok(document.documentElement.scrollWidth<=document.documentElement.clientWidth+1,'viewport fit');
  parent.postMessage('PASS '+document.documentElement.clientWidth,'*');
})().catch(error=>parent.postMessage('FAIL '+error.message,'*'));
</script>
`;
const inject = (s,p) => fs.writeFileSync(join(file,p),input.replace("</body>",()=>s+"\n</body>"));
const edge = (url, width, height, profile, extra) => spawnSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",[
"--headless=new","--disable-gpu","--no-first-run","--no-sandbox","--hide-scrollbars","--force-device-scale-factor=1","--window-size="+width+","+height,
"--virtual-time-budget=6500","--user-data-dir="+join(file,profile),...extra,pathToFileURL(url).href],{encoding:"utf8",maxBuffer:5*1024*1024,timeout:20000,windowsHide:true});
inject(test,"test.html");
for (const w of [320,390,1280]) {
  const path=join(file,"test-"+w+".html");
  fs.writeFileSync(path,'<!doctype html><meta charset="utf-8"><output id="result"></output><script>addEventListener("message",e=>document.querySelector("output").textContent=e.data)</script><iframe width="'+w+'" height="844" src="test.html"></iframe>');
  const r=edge(path,Math.max(580,w),920,"test-profile-"+w,["--dump-dom"]);
  const status=r.stdout?.match(/<output id="result">([^<]*)<\/output>/)?.[1];
  console.log(w,status || r.error?.message || "no result");
  if (!status?.startsWith("PASS")) process.exitCode = 1;
}
const screens=[
  ["hall",1280,920,""],
  ["phone",390,860,""],
  ["checkout",1280,920,setup+'tap("#pair");tap("#applyPair");tap("#orderAction");</script>']
];
for (const [key,w,h,actions] of screens) {
  const page=join(file,key+".html");
  inject(actions,key+".html");
  let view=page;
  if (w<500) {
    view=join(file,key+"-viewport.html");
    fs.writeFileSync(view,'<!doctype html><style>body{margin:0;display:grid;justify-content:center;background:#242831}iframe{border:0}</style><iframe src="'+key+'.html" width="'+w+'" height="'+h+'"></iframe>');
  }
  const png=join(process.cwd(),"_research","new-"+key+".png");
  edge(view,Math.max(530,w),h,"shot-profile-"+key,["--screenshot="+png]);
  if(fs.existsSync(png))console.log(png);
}
