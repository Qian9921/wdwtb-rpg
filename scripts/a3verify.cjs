const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  await p.evaluate(async()=>{ window.__game.scene.start('WorldScene',{career:'programmer',act:1}); await new Promise(r=>setTimeout(r,3000)); });
  const pos=async()=>p.evaluate(()=>{const w=window.__game.scene.getScene('WorldScene'); return {x:Math.round(w.player.x),y:Math.round(w.player.y),stuck:w.player.body.blocked.none===false};});
  const start=await pos();
  // 向右走 2s,看是否位移(没被卡死在原地)
  await p.keyboard.down('KeyD'); await sleep(2000); await p.keyboard.up('KeyD'); await sleep(200);
  const right=await pos();
  await p.keyboard.down('KeyW'); await sleep(2000); await p.keyboard.up('KeyW'); await sleep(200);
  const up=await pos();
  console.log('start',JSON.stringify(start),'→D',JSON.stringify(right),'→W',JSON.stringify(up));
  console.log('能移动:', (right.x!==start.x)||(up.y!==right.y), '| ERRORS:',errs.length);
  await p.screenshot({path:'/tmp/a3_world.png'});
  await b.close();
})();
