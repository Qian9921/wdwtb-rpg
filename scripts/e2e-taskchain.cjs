// e2e：任务链主线接线验证（dev 链 + test 链皮肤）
const puppeteer=require('puppeteer'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage(); await p.setViewport({width:1920,height:1080});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,160)));
  await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'}); await sleep(1800);
  await p.evaluate(async()=>{ localStorage.clear();
    window.__game.scene.start('WorldScene',{career:'programmer',subRole:'dev',act:1});
    await new Promise(r=>setTimeout(r,3200)); });

  let ok=0, bad=0;
  const t=(name,cond)=>{ cond?ok++:bad++; console.log((cond?'✓ ':'✗ ')+name); };
  const ev=fn=>p.evaluate(fn);

  // 1. 链按 subRole 加载
  const loaded=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    return {ids:w.questSystem.order.slice(), sub:w.subRole};});
  t('subRole=dev 且加载 dev 链5环', loaded.sub==='dev' && loaded.ids.join()==='dev_c1,dev_c2,dev_c3,dev_c4,dev_c5');

  // 2. 报到剧情优先：story=ready 时找老陈不派活（跳过剧情:直接置 working 模拟已看完报到）
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    w._story.phase='working'; w._updateNpcMarks();});

  // 3. 老陈派活（acceptLine + 第一目标指路）
  const r1=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen);
    const txt=w._lineText?w._lineText.text:(document.body.innerText||'');
    return {accepted:Object.keys(w.questSystem.accepted), dlg:w.dialogueActive};});
  t('找老陈→接下 dev_c1', r1.accepted.includes('dev_c1'));
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene'); if(w._dismissLine)w._dismissLine(); w.dialogueActive=false;});

  // 4. 小赵头顶引导标 + talkLines 对接
  const r2=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const zhao=w.npcs.find(n=>n.id==='zhao');
    const markBefore=zhao.markState;
    w._interact(zhao);
    const next=w.questSystem.nextObjective('dev_c1');
    return {markBefore, o1done:next&&next.id==='o2'};});
  t('小赵有引导标(❗)', r2.markBefore==='❗');
  t('对话小赵→o1 完成,下一步 o2', r2.o1done===true);
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene'); w.dialogueActive=false;});

  // 5. 工位干活上报 minigame:'work' → o2 完成 → 老陈 ❓可交付
  const r3=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    w.questSystem.progress('minigame','work'); w._updateNpcMarks();
    const chen=w.npcs.find(n=>n.id==='senior');
    return {ready:w.questSystem.isReady('dev_c1'), mark:chen.markState};});
  t('干活后 dev_c1 就绪', r3.ready);
  t('老陈头顶 ❓ 可交付', r3.mark==='❓');

  // 6. 交付：doneLine + progressGain 推项目进度 + c2 解锁
  const r4=await ev(()=>{const w=window.__game.scene.getScene('WorldScene');
    const before=w.projectSystem.progress;
    const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen);
    return {done:!!w.questSystem.completed['dev_c1'],
      gain:w.projectSystem.progress-before,
      next:w.questSystem.available({act:w.act}).map(q=>q.id)};});
  t('交付 dev_c1 完成', r4.done);
  t('项目进度 +12 (progressGain)', r4.gain===12);
  t('dev_c2 解锁', r4.next.includes('dev_c2'));
  await ev(()=>{const w=window.__game.scene.getScene('WorldScene'); w.dialogueActive=false;});

  // 7. 工单板顶部显示主线条(接了 c2 后)
  const r5=await ev(async()=>{const w=window.__game.scene.getScene('WorldScene');
    const chen=w.npcs.find(n=>n.id==='senior'); w._interactSenior(chen); w.dialogueActive=false;
    w._openWorkBoard();
    await new Promise(r=>setTimeout(r,300));
    const texts=[]; w._workBoardUI.iterate(o=>{if(o.text)texts.push(o.text);});
    w._closeWorkBoard(w._workBoardUI);
    return texts.join('|');});
  t('工单板=我的工作台', r5.includes('我的工作台'));
  t('工单板显示当前任务+登录接口', r5.includes('当前任务') && r5.includes('登录接口'));
  t('工单板显示项目%', /项目 \d+%/.test(r5));

  // 8. test 链 + 小游戏皮肤
  await ev(async()=>{ localStorage.clear();
    window.__game.scene.start('WorldScene',{career:'programmer',subRole:'test',act:1});
    await new Promise(r=>setTimeout(r,3000)); });
  const r6=await ev(async()=>{const w=window.__game.scene.getScene('WorldScene');
    const ids=w.questSystem.order.slice();
    w._launchCoding(()=>{},'easy');
    await new Promise(r=>setTimeout(r,800));
    const d=window.__game.scene.getScene('DebugGameScene');
    const title=d&&d.titleText?d.titleText.text:'';
    window.__game.scene.stop('DebugGameScene'); window.__game.scene.resume('WorldScene');
    return {ids, title};});
  t('subRole=test 加载 test 链', r6.ids.join()==='test_c1,test_c2,test_c3,test_c4,test_c5');
  t('测试岗小游戏标题=测试·缺陷排查', r6.title.includes('测试·缺陷排查'));

  console.log(`\n${ok} passed, ${bad} failed | pageerrors: ${errs.length}`);
  errs.forEach(e=>console.log('  PAGEERR:',e));
  await b.close();
  process.exit(bad||errs.length?1:0);
})();
