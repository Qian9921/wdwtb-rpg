const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  await p.evaluate(async()=>{ window.__game.scene.start('WorldScene',{career:'programmer',act:1}); await new Promise(r=>setTimeout(r,3000)); });
  const anim=async()=>p.evaluate(()=>{const w=window.__game.scene.getScene('WorldScene'); return {facing:w.facing, anim:w.player.anims.currentAnim?.key, playing:w.player.anims.isPlaying};});
  const valid=['_up','_down','_left','_right'];
  const res={};
  // 各斜向组合
  for(const [name,keys] of [['↖W+A',['KeyW','KeyA']],['↗W+D',['KeyW','KeyD']],['↙S+A',['KeyS','KeyA']],['↘S+D',['KeyS','KeyD']]]){
    for(const k of keys) await p.keyboard.down(k);
    await sleep(700);
    res[name]=await anim();
    for(const k of keys) await p.keyboard.up(k);
    await sleep(200);
  }
  let allValid=true;
  for(const [k,v] of Object.entries(res)){ const ok=v.anim && valid.some(s=>v.anim.endsWith(s)); if(!ok)allValid=false; console.log(k,'→',v.anim,'facing:',v.facing, ok?'✓':'✗失真'); }
  console.log('全部吸附合法4向:',allValid,'| ERRORS:',errs.length);
  await b.close();
})();
