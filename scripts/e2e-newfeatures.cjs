// e2e：新功能批量验证(小游戏轮替/排序小游戏/文字速度/目标HUD/自动保存/hub角标/像素图标)
const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  let ok=0,bad=0; const t=(n,c)=>{c?ok++:bad++;console.log((c?'✓ ':'✗ ')+n);};
  const ev=fn=>p.evaluate(fn);

  // 像素字体加载
  const fontLoaded=await ev(()=>document.fonts.check('12px "Fusion Pixel"','你'));
  t('像素字体 Fusion Pixel 已加载', fontLoaded);

  // Hub 角标(等场景真正 active,避免时序抖动)
  await ev(async()=>{window.__game.scene.start('HubScene');
    for(let i=0;i<20;i++){const h=window.__game.scene.getScene('HubScene');
      if(h&&h.scene.isActive())break; await new Promise(r=>setTimeout(r,150));}
    await new Promise(r=>setTimeout(r,600));});
  const hubTags=await ev(()=>{const h=window.__game.scene.getScene('HubScene');
    const texts=h.children.list.filter(o=>o.text).map(o=>o.text);
    return {full:texts.includes('★完整版'), mini:texts.includes('★迷你完整')};});
  t('Hub 内容量角标(完整版/迷你完整)', hubTags.full&&hubTags.mini);

  // 进世界
  await ev(async()=>{ localStorage.clear(); localStorage.setItem('wdwtb_onboarded','1');
    window.__game.scene.start('WorldScene',{career:'programmer',subRole:'dev',act:1});
    await new Promise(r=>setTimeout(r,3200)); });

  // NPC 浮标是像素图标(Image 而非 Text)
  const markIsImage=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior');
    return chen.mark.type==='Image' && chen.mark.texture.key.startsWith('pi_');});
  t('NPC 浮标=像素图标纹理', markIsImage);

  // 目标 HUD
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    w._story.phase='working'; w.questSystem.accept('dev_c1'); w._updateNpcMarks();});
  await sleep(400);
  const hud=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    return {text:w.objectiveHud.text, vis:w.objectiveHud.visible};});
  t('目标 HUD 显示下一步', hud.vis && hud.text.includes('小赵'));

  // 小游戏轮替: 第1次 Debug,第2次 Sequence
  const g1=await ev(async()=>{const w=window.__game.scene.getScene('WorldScene');
    w._launchCoding(()=>{},'easy'); await new Promise(r=>setTimeout(r,700));
    const d=window.__game.scene.getScene('DebugGameScene');
    const active=d&&d.scene.isActive();
    window.__game.scene.stop('DebugGameScene'); window.__game.scene.resume('WorldScene');
    return active;});
  t('第1次干活=Debug找茬', g1);
  const g2=await ev(async()=>{const w=window.__game.scene.getScene('WorldScene');
    w._launchCoding(()=>{},'easy'); await new Promise(r=>setTimeout(r,900));
    const s=window.__game.scene.getScene('SequenceGameScene');
    const active=s&&s.scene.isActive();
    const title=s&&s.titleText?s.titleText.text:'';
    const cards=s&&s.cards?s.cards.length:0;
    window.__game.scene.stop('SequenceGameScene'); window.__game.scene.resume('WorldScene');
    return {active,title,cards};});
  t('第2次干活=流程排序(dev题库)', g2.active && g2.title.includes('开发·流程排序') && g2.cards>=4);

  // 排序玩法可通关: 按正确顺序点
  const g3=await ev(async()=>{const w=window.__game.scene.getScene('WorldScene');
    let result=null;
    w._workGameFlip=true; // 下一次翻成 Sequence
    w._launchCoding(r=>{result=r;},'easy');
    await new Promise(r=>setTimeout(r,900));
    const s=window.__game.scene.getScene('SequenceGameScene');
    if(!s||!s.cards) return {fail:'no scene'};
    // 按 correctOrder 依次点对应卡
    for(let round=0; round<3; round++){
      for(const line of s.correctOrder){
        const card=s.cards.find(c=>c.line===line);
        if(card) card.bg.emit('pointerdown');
        await new Promise(r=>setTimeout(r,60));
      }
      // 解释页 → 点击继续
      await new Promise(r=>setTimeout(r,300));
      s.input.emit('pointerdown');
      await new Promise(r=>setTimeout(r,400));
      if(result) break;
    }
    return {result};});
  t('排序小游戏可全对通关', g3.result && g3.result.ratio===1);

  // 文字速度=快 → 打字机瞬显(用真对话引擎节点)
  await ev(()=>{localStorage.setItem('wdwtb_settings',JSON.stringify({bgm:70,sfx:80,textSpeed:2}));});
  const fast=await ev(async()=>{const w=window.__game.scene.getScene('WorldScene');
    w.dialogueActive=true;
    w.dialogueEngine.start({start:'n1',nodes:{n1:{speaker:'',text:'这是一段用于测试打字机速度的比较长的文字内容。',choices:[]}}});
    await new Promise(r=>setTimeout(r,120));
    const eng=w.dialogueEngine;
    const done=!eng._typing && eng._bodyText && eng._bodyText.text.length>15;
    eng._endDialogue(); w.dialogueActive=false;
    return done;});
  t('文字速度=快 → 瞬间显示全文', fast);

  // 自动保存 toast + 存档
  const sv=await ev(async()=>{const w=window.__game.scene.getScene('WorldScene');
    w.questSystem.progress('talk','zhao'); w.questSystem.progress('minigame','work');
    const done=w.questSystem.complete('dev_c1');
    await new Promise(r=>setTimeout(r,400)); // 等 toast 淡入
    const s=JSON.parse(localStorage.getItem('wdwtb_save_1')||'{}');
    return {done, toast:w._saveToast&&w._saveToast.alpha>0,
      saved:!!(s.quests&&s.quests.completed&&s.quests.completed.includes('dev_c1'))};});
  t('自动保存 toast+写档', sv.done && sv.toast && sv.saved);

  console.log(`\n${ok} passed, ${bad} failed | pageerrors: ${errs.length}`);
  errs.slice(0,5).forEach(e=>console.log(' ',e));
  await b.close(); process.exit(bad||errs.length?1:0);
})();
