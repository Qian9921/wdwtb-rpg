// e2e：轻量职业(设计师)抽查——进世界/播单文件剧情/到结局不报错
const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  let ok=0,bad=0; const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n);};

  for(const career of ['designer','product']){
    // 每个职业重开页面,避免上一职业的结局场景残留
    await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
    await p.evaluate(async(career)=>{ localStorage.clear(); localStorage.setItem('wdwtb_onboarded','1');
      window.__game.scene.start('WorldScene',{career,act:1});
      await new Promise(r=>setTimeout(r,3000)); }, career);
    const world=await p.evaluate(()=>{const w=window.__game.scene.getScene('WorldScene');
      return {active:w&&w.scene.isActive(), npcs:w?w.npcs.length:0};});
    t(`${career} 进世界+NPC就位`, world.active && world.npcs>=3);
    // 走近导师播剧情,点30步验证不崩
    await p.evaluate(()=>{const w=window.__game.scene.getScene('WorldScene');
      const chen=w.npcs.find(n=>n.id==='senior');
      w.player.setPosition(chen.spr.x,chen.spr.y+40); w._interact(chen);});
    await sleep(900);
    let played=0;
    for(let i=0;i<30;i++){
      const st=await p.evaluate(()=>{const w=window.__game.scene.getScene('WorldScene');
        if(!w||!w.scene.isActive()&&!w.scene.isPaused())return {gone:true};
        const ms=window.__game.scene.getScene('MindscapeScene');
        if(ms&&ms.scene.isActive()){window.__game.scene.stop('MindscapeScene');window.__game.scene.resume('WorldScene');w.events.emit('mindscapeReturn');return {};}
        const mg=window.__game.scene.getScene('MinigameScene');
        if(mg&&mg.scene.isActive()){if(mg.onComplete)mg.onComplete({correct:3,total:3});window.__game.scene.stop('MinigameScene');window.__game.scene.resume('WorldScene');return {};}
        if(w.phoneMessage&&w.phoneMessage.isShowing()){w.phoneMessage._close(false);return {};}
        if(!w.dialogueActive)return {done:true};
        const eng=w.dialogueEngine;
        if(!eng.ui)return {};
        if(eng._typing||(eng._hasMorePages&&eng._hasMorePages())){eng._catcher&&eng._catcher.emit('pointerdown');return {};}
        const btns=[];eng.ui.iterate(o=>{if(o.type==='Container'){o.iterate(ch=>{if(ch.type==='Zone'&&ch.input&&ch.input.enabled)btns.push(ch);});}else if(o.type==='Rectangle'&&o.input&&o.input.enabled&&o.width<900&&o.height<100)btns.push(o);});
        if(btns.length)btns[0].emit('pointerdown');else if(eng._catcher)eng._catcher.emit('pointerdown');
        return {};});
      played=i;
      if(st.done||st.gone)break;
      await sleep(150);
    }
    t(`${career} 剧情推进${played}步无崩溃(0 pageerror)`, errs.length===0);
  }
  console.log(`\n${ok} passed, ${bad} failed | pageerrors: ${errs.length}`);
  errs.slice(0,5).forEach(e=>console.log(' ',e));
  await b.close(); process.exit(bad||errs.length?1:0);
})();
