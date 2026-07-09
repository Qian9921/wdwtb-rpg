const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1600);
  await p.evaluate(async()=>{window.__game.scene.start('OpeningScene');await new Promise(r=>setTimeout(r,1200));});
  for(const i of [0,4]){
    const r=await p.evaluate((idx)=>{
      const s=window.__game.scene.getScene('OpeningScene'); s._pickSkin(idx);
      const spr=s.previewSpr; const bb=spr.getBounds();
      return {idx, label:s.skinNameLabel.text, scale:spr.scaleX, top:Math.round(bb.top), bottom:Math.round(bb.bottom), h:Math.round(bb.height)};
    }, i);
    await sleep(200);
    console.log(`#${r.idx} ${r.label} scale=${r.scale} worldTop=${r.top} bottom=${r.bottom} h=${r.h}`);
  }
  console.log('参考：标题y=40 副标题y=76（世界坐标）');
  await b.close();
})();
