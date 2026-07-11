// e2e：全程通关——5环任务链推到100% → 各里程碑剧情 → act5 → 五岔路 → 结局画像
const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  let ok=0,bad=0; const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n);};
  const ev=fn=>p.evaluate(fn);

  await ev(async()=>{ localStorage.clear(); localStorage.setItem('wdwtb_onboarded','1');
    window.__game.scene.start('WorldScene',{career:'programmer',subRole:'dev',act:1});
    await new Promise(r=>setTimeout(r,3200)); });

  // 通用:真实点击播完当前剧情(处理小游戏/心象/手机弹窗)
  const playStory=async()=>{
    for(let i=0;i<200;i++){
      const st=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
        const dbg=window.__game.scene.getScene('DebugGameScene');
        if(dbg&&dbg.scene.isActive()){ if(dbg.onComplete)dbg.onComplete({correct:3,total:3,ratio:1}); return {sub:1}; }
        const sq=window.__game.scene.getScene('SequenceGameScene');
        if(sq&&sq.scene.isActive()){ if(sq.onComplete)sq.onComplete({correct:2,total:2,ratio:1}); window.__game.scene.stop('SequenceGameScene'); window.__game.scene.resume('WorldScene'); return {sub:1}; }
        const ms=window.__game.scene.getScene('MindscapeScene');
        if(ms&&ms.scene.isActive()){ window.__game.scene.stop('MindscapeScene'); window.__game.scene.resume('WorldScene'); w.events.emit('mindscapeReturn'); return {sub:1}; }
        if(w.phoneMessage&&w.phoneMessage.isShowing()){ w.phoneMessage._close(false); return {sub:1}; }
        if(!w.dialogueActive) return {done:true};
        const eng=w.dialogueEngine;
        if(!eng.ui) return {wait:1};
        if(eng._typing||(eng._hasMorePages&&eng._hasMorePages())){ eng._catcher&&eng._catcher.emit('pointerdown'); return {}; }
        let btn=null; eng.ui.iterate(o=>{if(btn)return;if(o.type==='Container'){o.iterate(ch=>{if(!btn&&ch.type==='Zone'&&ch.input&&ch.input.enabled)btn=ch;});}else if(o.type==='Rectangle'&&o.input&&o.input.enabled&&o.width<900&&o.height<100)btn=o;});
        if(btn)btn.emit('pointerdown'); else if(eng._catcher)eng._catcher.emit('pointerdown');
        return {};});
      if(st.done) return true;
      await sleep(st.sub?400:110);
    }
    return false;
  };

  // 播第一幕(报到)
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior');
    w.player.setPosition(chen.spr.x,chen.spr.y+40); w._interact(chen);});
  await sleep(900);
  t('act1 报到剧情播完', await playStory());

  // 做完一环链任务(接→talk→work→交付),返回交付后的状态
  const doChain=async(id,talkTarget)=>{
    return await p.evaluate(async({id,talkTarget})=>{const w=window.__game.scene.getScene('WorldScene');
      const chen=w.npcs.find(n=>n.id==='senior');
      w._interactSenior(chen); w.dialogueActive=false;         // 接
      if(!w.questSystem.accepted[id]) return {fail:'not accepted '+id, story:JSON.stringify(w._story)};
      w.questSystem.progress('talk',talkTarget);
      w.questSystem.progress('minigame','work');
      w._interactSenior(chen); w.dialogueActive=false;         // 交付
      return {done:!!w.questSystem.completed[id], progress:w.projectSystem.progress,
        pending:w._story.pendingAct, phase:w._story.phase};}, {id,talkTarget});
  };

  // 链1: c1(12%) c2(32%→过25里程碑→act2待播)
  let r=await doChain('dev_c1','zhao');
  t('c1 交付 12%', r.done && r.progress===12);
  r=await doChain('dev_c2','lin');
  t('c2 交付 32% → 触发25%里程碑(pendingAct=2)', r.done && r.progress===32 && r.pending===2);

  // 找老陈推进 act2 剧情并播完
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen);});
  await sleep(900);
  t('act2 里程碑剧情播完', await playStory());
  let st=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    return {act:w.act, phase:w._story.phase};});
  t('推进到 act2 经营期', st.act===2 && st.phase==='working');

  // c3(52%→50里程碑→act3)
  r=await doChain('dev_c3','zhao');
  t('c3 交付 52% → pendingAct=3', r.done && r.progress===52 && r.pending===3);
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen);});
  await sleep(900);
  t('act3 剧情播完', await playStory());

  // c4(76%→75里程碑→act4)
  r=await doChain('dev_c4','ting');
  t('c4 交付 76% → pendingAct=4', r.done && r.progress===76 && r.pending===4);
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen);});
  await sleep(900);
  t('act4 剧情播完', await playStory());

  // c5(100%→100里程碑→act5)
  r=await doChain('dev_c5','vet');
  t('c5 交付 100% → pendingAct=5', r.done && r.progress===100 && r.pending===5);
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen);});
  await sleep(900);
  // act5 播到结局(EndingScene) — playStory 直到 dialogueActive=false 或场景切换
  let ended=false;
  for(let i=0;i<300;i++){
    const s2=await ev(()=>{
      const e=window.__game.scene.getScene('EndingScene');
      if(e&&e.scene.isActive()) return {ending:true};
      const w=window.__game.scene.getScene('WorldScene');
      // 子场景检查必须在 isActive 守卫之前——心象/小游戏会 pause 世界(paused≠active)
      const dbg=window.__game.scene.getScene('DebugGameScene');
      if(dbg&&dbg.scene.isActive()){ if(dbg.onComplete)dbg.onComplete({correct:3,total:3,ratio:1}); return {}; }
      const ms=window.__game.scene.getScene('MindscapeScene');
      if(ms&&ms.scene.isActive()){ window.__game.scene.stop('MindscapeScene'); window.__game.scene.resume('WorldScene'); w.events.emit('mindscapeReturn'); return {}; }
      if(!w||(!w.scene.isActive()&&!w.scene.isPaused())) return {other:true};
      if(w.phoneMessage&&w.phoneMessage.isShowing()){ w.phoneMessage._close(false); return {}; }
      if(!w.dialogueActive){ 
        // act5 剧情结束但没进结局? 再戳老陈
        const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen); return {};
      }
      const eng=w.dialogueEngine;
      if(!eng.ui) return {};
      if(eng._typing||(eng._hasMorePages&&eng._hasMorePages())){ eng._catcher&&eng._catcher.emit('pointerdown'); return {}; }
      const btns=[]; eng.ui.iterate(o=>{if(o.type==='Container'){o.iterate(ch=>{if(ch.type==='Zone'&&ch.input&&ch.input.enabled)btns.push(ch);});}else if(o.type==='Rectangle'&&o.input&&o.input.enabled&&o.width<900&&o.height<100)btns.push(o);});
      if(btns.length)btns[btns.length-1].emit('pointerdown'); else if(eng._catcher)eng._catcher.emit('pointerdown');
      return {};});
    if(s2.ending){ ended=true; break; }
    if(i%20===0){ const cur=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
      const eng=w?w.dialogueEngine:null;
      return eng?{cur:eng.currentId,typing:eng._typing,adv:eng._advanced,act:w.dialogueActive,
        paused:w.scene.isPaused(),hasUI:!!eng.ui,pages:eng._pages?eng._pages.length:0,idx:eng._pageIdx}:'(none)';});
      console.log('  act5 step',i,JSON.stringify(cur)); }
    await sleep(130);
  }
  t('act5 播完 → 进入结局(EndingScene)', ended);
  if(ended){
    await sleep(9000); // AI 生成或模板兜底需要时间
    const fin=await ev(()=>{const e=window.__game.scene.getScene('EndingScene');
      const texts=[]; e.children.list.forEach(o=>{if(o.text)texts.push(o.text); if(o.list)o.list.forEach(c=>{if(c.text)texts.push(c.text);});});
      return texts.join('|');});
    t('结局画像渲染(心之画像)', fin.includes('心之画像'));
    const endName=await ev(()=>{const e=window.__game.scene.getScene('EndingScene');return e.ending;});
    t('结局标识为五结局之一(非career)', ['backbone','quit','health','switch','light'].includes(endName));
    await p.screenshot({path:'/tmp/ending.png'});
  }

  console.log(`\n${ok} passed, ${bad} failed | pageerrors: ${errs.length}`);
  errs.slice(0,5).forEach(e=>console.log(' ',e));
  await b.close(); process.exit(bad||errs.length?1:0);
})();
