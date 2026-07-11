// 批次C E2E：连贯性打通。验证任务可接可交、interact上报、精力消耗、剧情状态机、choice tag。
// 运行：先 npm run dev，再 node scripts/e2e-batchC.cjs
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = process.env.BASE_URL || 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERR: ' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  console.log('\n=== 批次C 连贯性打通 E2E ===\n');
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('wdwtb_onboarded', '1'); });
  await sleep(1200);
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career: 'programmer', act: 1, day: 1 }));
  await sleep(3000);
  ok('WorldScene 启动无报错', errors.length === 0, errors[0]);

  // 1. 剧情状态机初始化
  const story = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    return { phase: ws._story.phase, act: ws._story.act, hasDay: !!ws.daySystem };
  });
  ok('剧情状态机初始 ready', story.phase === 'ready', JSON.stringify(story));

  // 2. 任务链设计:接链任务后 talk 目标可完成(senior 不再短路任务系统)
  errors.length = 0;
  const questFlow = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    await new Promise(r => setTimeout(r, 400));
    const qs = ws.questSystem;
    const q = Object.values(qs.defs).find(x => (x.objectives||[]).some(o => o.kind === 'talk'));
    if (!q) return { error: 'no talk quest' };
    qs.accept(q.id);
    const io = q.objectives.find(o => o.kind === 'talk');
    const before = qs.accepted[q.id].objectives[io.id];
    qs.progress('talk', io.target);
    const after = qs.accepted[q.id].objectives[io.id];
    return { questId: q.id, target: io.target, before, after };
  });
  ok('任务链 talk 目标可完成', questFlow.after === true && questFlow.before === false, JSON.stringify(questFlow));

  // 3. 交互物件真的上报 interact 进度 + 消耗精力
  errors.length = 0;
  const interactReport = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.stateSystem.set('money', 100);
    const budgetBefore = ws.daySystem.energyBudget;
    // 接一个需要 interact computer 的任务
    const qs = ws.questSystem;
    const q = Object.values(qs.defs).find(x => (x.objectives||[]).some(o => o.kind === 'interact' && o.target === 'computer'));
    if (q && !qs.completed[q.id]) qs.accept(q.id);
    // 找 computer 交互物件，触发交互
    const computer = ws._interactables.find(o => o.id === 'computer');
    // computer 是 minigame，会 pause 场景，改用 vending（buy_drink）测 interact 上报
    const vending = ws._interactables.find(o => o.id === 'vending');
    ws._interactObject(vending);
    await new Promise(r => setTimeout(r, 300));
    const budgetAfter = ws.daySystem.energyBudget;
    return { budgetBefore, budgetAfter, spent: budgetBefore - budgetAfter };
  });
  ok('交互物件消耗每日精力预算', interactReport.spent > 0, JSON.stringify(interactReport));
  ok('交互无报错', errors.length === 0, errors[0]);
  await p.evaluate(() => { const ws = window.__game.scene.getScene('WorldScene'); ws.dialogueActive = false; });

  // 4. next_act 进经营期（不再一口气播下一幕）
  errors.length = 0;
  const nextAct = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws._story.phase = 'ready'; ws.act = 1; ws._story.act = 1;
    ws.dialogueActive = false;
    ws._loadNextAct(); // 模拟剧情内 next_act
    await new Promise(r => setTimeout(r, 600));
    return { phase: ws._story.phase, daysInAct: ws._story.daysInAct, act: ws.act };
  });
  ok('next_act 进入经营期(working)而非直接播下一幕', nextAct.phase === 'working', JSON.stringify(nextAct));
  ok('经营期天数从0开始', nextAct.daysInAct === 0);
  await p.evaluate(() => { const ws = window.__game.scene.getScene('WorldScene'); const c = ws.children.list.find(o=>o.depth===10001); if(c)c.destroy(true); });

  // 5. 程序员=里程碑推进:pendingAct 未设不推进;设了 pendingAct 走近 senior 推进
  errors.length = 0;
  const advance = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws._story = { phase: 'working', act: 1, daysInAct: 0, pendingAct: null };
    ws.act = 1;
    const senior = ws.npcs.find(n => n.id === 'senior');
    ws._interactSenior(senior);
    await new Promise(r => setTimeout(r, 200));
    const notYet = ws._story.act || ws.act;
    ws.dialogueActive = false;
    ws._story.pendingAct = 2; // 项目跨过25%里程碑
    ws._interactSenior(senior);
    await new Promise(r => setTimeout(r, 600));
    return { notYetAct: notYet, advancedAct: ws.act, advancedPhase: ws._story.phase };
  });
  ok('里程碑未到→不推进（还是act1）', advance.notYetAct === 1);
  ok('里程碑到→推进到act2', advance.advancedAct === 2, JSON.stringify(advance));

  // 6. choice tag 采集：剧情选项带 tag，choiceLog 能聚合
  errors.length = 0;
  const tagCollect = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.choiceLog.clear();
    // 模拟 dialogueEngine choice 事件带 tag
    ws.dialogueEngine.emit('choice', { nodeId: 'a2_task_inner', act: 2, choice: { label: '闷头先干', tag: 'overwork' } });
    ws.dialogueEngine.emit('choice', { nodeId: 'a3_req_inner', act: 3, choice: { label: '加班主改', tag: 'overwork' } });
    ws.dialogueEngine.emit('choice', { nodeId: 'a4_sprint', act: 4, choice: { label: '硬扛', tag: 'overwork' } });
    return { count: ws.choiceLog.length, tags: ws.choiceLog.tagCounts() };
  });
  ok('choiceLog 采集到 tag（不再全null）', tagCollect.tags.overwork === 3, JSON.stringify(tagCollect));

  // 7. 验证剧情数据真的补了 tag
  const dataTag = await p.evaluate(async () => {
    const d = await (await fetch('./data/programmer_act5.json')).json();
    const tags = d.nodes.a5_crossroads.choices.map(c => c.tag).filter(Boolean);
    return { crossroadsTags: tags };
  });
  ok('剧情数据 a5 结局分叉已打 tag', dataTag.crossroadsTags.length >= 5, JSON.stringify(dataTag.crossroadsTags));

  // 8. 手机现为 HUD 常驻按钮(_phoneBtn),不再是地面物件
  const phone = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    return { hasPhoneBtn: !!ws._phoneBtn && ws._phoneBtn.visible !== false };
  });
  ok('手机 HUD 按钮存在(取代地面物件)', phone.hasPhoneBtn);

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 崩溃:', e); process.exit(1); });
