const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1280,height:720});
  // 有档态标题
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>localStorage.setItem('wdwtb_save',JSON.stringify({career:'programmer',act:2})));
  await p.reload({waitUntil:'domcontentloaded'}); await sleep(2200);
  await p.screenshot({path:'/tmp/a1_title_save.png'});
  // 暂停菜单
  await p.evaluate(async()=>{
    window.__game.scene.start('WorldScene',{career:'programmer',act:1});
    await new Promise(r=>setTimeout(r,2800));
    const ws=window.__game.scene.getScene('WorldScene');
    ws.scene.pause(); ws.scene.launch('PauseScene',{origin:'WorldScene',stateSystem:ws.stateSystem,career:'programmer',act:1});
    await new Promise(r=>setTimeout(r,900));
  });
  await p.screenshot({path:'/tmp/a1_pause.png'});
  await b.close();
})();
