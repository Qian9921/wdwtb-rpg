// 真实点击播完裁剪后的 act1-4(每个分支选第一个),验证无卡死、next_act 正常收尾
const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  let ok=0,bad=0;
  for(const act of [1,2,3,4]){
    await p.evaluate(async(act)=>{ localStorage.clear(); localStorage.setItem('wdwtb_onboarded','1');
      window.__game.scene.start('WorldScene',{career:'programmer',subRole:'dev',act});
      await new Promise(r=>setTimeout(r,3000)); }, act);
    // 直接播本幕剧情
    await p.evaluate(async(act)=>{const w=window.__game.scene.getScene('WorldScene');
      w._story={phase:'ready',act,daysInAct:0,checkpoint:null,pendingAct:null};
      w._playStory(`./data/programmer_act${act}.json`);
      await new Promise(r=>setTimeout(r,900));}, act);
    let steps=0, done=false, minigames=0;
    for(let i=0;i<160;i++){
      const st=await p.evaluate(()=>{const w=window.__game.scene.getScene('WorldScene');
        // 小游戏/心象等子场景弹出→直接完成返回
        const dbg=window.__game.scene.getScene('DebugGameScene');
        if(dbg&&dbg.scene.isActive()){ if(dbg.onComplete)dbg.onComplete({correct:3,total:3,ratio:1}); return {sub:'debug'}; }
        const ms=window.__game.scene.getScene('MindscapeScene');
        if(ms&&ms.scene.isActive()){ window.__game.scene.stop('MindscapeScene'); window.__game.scene.resume('WorldScene'); w.events.emit('mindscapeReturn'); return {sub:'mindscape'}; }
        // 家人消息弹窗→关掉
        if(w.phoneMessage&&w.phoneMessage.isShowing()){ w.phoneMessage._close(false); return {sub:'phone'}; }
        if(!w.dialogueActive) return {done:true, phase:w._story.phase};
        const eng=w.dialogueEngine;
        if(!eng.ui){ return {cur:'(no-ui,waiting)'}; }
        if(eng._typing||(eng._hasMorePages&&eng._hasMorePages())){ eng._catcher&&eng._catcher.emit('pointerdown'); return {cur:eng.currentId}; }
        let btn=null;
        if(eng.ui) eng.ui.iterate(o=>{if(btn)return;if(o.type==='Container'){o.iterate(ch=>{if(!btn&&ch.type==='Zone'&&ch.input&&ch.input.enabled)btn=ch;});}else if(o.type==='Rectangle'&&o.input&&o.input.enabled&&o.width<900&&o.height<100)btn=o;});
        if(btn){btn.emit('pointerdown');} else if(eng._catcher){eng._catcher.emit('pointerdown');}
        return {cur:eng.currentId};});
      if(st.sub){minigames++;await sleep(400);continue;}
      if(st.done){ done=true; steps=i; console.log(`✓ act${act} 播完并关闭 (${i}步, ${minigames}个子场景, phase=${st.phase})`); ok++; break; }
      await sleep(120);
    }
    if(!done){ bad++; const st=await p.evaluate(()=>window.__game.scene.getScene('WorldScene').dialogueEngine.currentId);
      console.log(`✗ act${act} 卡死在 ${st}`); }
  }
  console.log(`\n${ok}/4 幕通过 | pageerrors: ${errs.length}`); errs.slice(0,5).forEach(e=>console.log(' ',e));
  await b.close(); process.exit(bad||errs.length?1:0);
})();
