const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  const r=await p.evaluate(async()=>{
    window.__game.scene.start('WorldScene',{career:'programmer',act:1});
    await new Promise(res=>setTimeout(res,3000));
    const ws=window.__game.scene.getScene('WorldScene');
    // 取第一个碰撞组的第一个成员,看它的 body 尺寸
    const g=ws.solidGroups[0];
    const kids=g.getChildren();
    const sample=kids.slice(0,3).map(k=>({ x:Math.round(k.x), y:Math.round(k.y), bw:k.body?.width, bh:k.body?.height, dw:Math.round(k.displayWidth), dh:Math.round(k.displayHeight) }));
    return { groupCount:ws.solidGroups.length, firstGroupKids:kids.length, sample };
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
