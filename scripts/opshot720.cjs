const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1280,height:720});
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  await p.evaluate(async()=>{window.__game.scene.start('OpeningScene');await new Promise(r=>setTimeout(r,1300));});
  await p.evaluate(()=>window.__game.scene.getScene('OpeningScene')._pickSkin(6)); // SkyOffice 女
  await sleep(500);
  await p.screenshot({path:'/tmp/op720.png'});
  console.log('shot done');
  await b.close();
})();
