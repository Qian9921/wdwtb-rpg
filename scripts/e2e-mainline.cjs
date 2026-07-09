// 主线通关验证：核心验证 BUG-1（下班丢 story 导致卡第一幕）修复 —— 完整走
// act1剧情播完 → 下班 → 睡觉推进天数 → 回办公室 → 走近老陈能推进 act2。
// 运行：先 npm run dev，再 node scripts/e2e-mainline.cjs
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  p.on('pageerror', e => errors.push('❌ ' + String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errors.push('❌ ' + m.text().slice(0, 160)); });

  console.log('\n=== 主线通关验证（BUG-1 修复）===\n');
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('wdwtb_onboarded', '1'); });
  await sleep(1000);

  // 1. 进办公室 act1，story=ready
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career: 'programmer', deep: true, act: 1 }));
  await sleep(2800);
  let st = await p.evaluate(() => window.__game.scene.getScene('WorldScene')._story);
  ok('进办公室 story.phase=ready act=1', st.phase === 'ready' && st.act === 1, JSON.stringify(st));

  // 2. 模拟 act1 剧情播完 → next_act → 进经营期(working)
  await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.dialogueActive = false;
    ws._loadNextAct(); // 剧情内 next_act 触发，进 working
  });
  await sleep(700);
  st = await p.evaluate(() => window.__game.scene.getScene('WorldScene')._story);
  ok('剧情播完进经营期 story.phase=working', st.phase === 'working', JSON.stringify(st));

  // 3. 下班回家（关键：BUG-1 现场——存档必须保住 story）
  await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    // 关掉可能的仪式弹窗
    ws.children.list.filter(o => o.depth === 10001).forEach(o => o.destroy());
    ws._goHome();
  });
  await sleep(1500);
  const savedAfterHome = await p.evaluate(() => JSON.parse(localStorage.getItem('wdwtb_save')));
  ok('下班后存档仍保住 story（BUG-1核心）', savedAfterHome.story && savedAfterHome.story.phase === 'working',
    JSON.stringify(savedAfterHome.story));

  // 4. 睡觉 → daysInAct++（HomeScene._sleep 的逻辑，不依赖相机转场时序）
  await sleep(1200); // 等 _goHome 转场
  await p.evaluate(() => {
    const hs = window.__game.scene.getScene('HomeScene');
    if (hs && hs._sleep) hs._sleep();
  });
  await sleep(1200);
  const savedAfterSleep = await p.evaluate(() => JSON.parse(localStorage.getItem('wdwtb_save')));
  ok('睡觉后经营期天数 daysInAct 累加', savedAfterSleep.story && savedAfterSleep.story.daysInAct >= 1,
    JSON.stringify(savedAfterSleep.story));

  // 5. 续档恢复 + 推进：用 reload 得到干净会话（headless 下同页多次转场会累积竞态，
  //    真实玩家不会），写入"睡觉后"的存档，重进 WorldScene 验证 init 恢复。
  await p.evaluate(() => localStorage.setItem('wdwtb_save', JSON.stringify({
    version: 2, career: 'programmer', act: 1,
    stats: { health: 80, energy: 100, san: 80, stress: 20, skill: 10, performance: 50, money: 0, passion: 70 },
    story: { phase: 'working', act: 1, daysInAct: 1 },
  })));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.setItem('wdwtb_onboarded', '1'));
  await sleep(1500);
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career: 'programmer', deep: true, act: 1 }));
  await sleep(2800);
  st = await p.evaluate(() => window.__game.scene.getScene('WorldScene')._story);
  ok('续档恢复 story(working, 天数保留)', st.phase === 'working' && st.daysInAct >= 1, JSON.stringify(st));

  // 6. 走近老陈 → 天数攒够(ACT_DAYS[1]=1) → 推进到 act2
  errors.length = 0;
  const advanced = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    const senior = ws.npcs.find(n => n.id === 'senior');
    ws._interactSenior(senior); // working 期 + 天数够 → 推进 act2 + 播剧情
    await new Promise(r => setTimeout(r, 800));
    return { act: ws.act, storyAct: ws._story.act, phase: ws._story.phase };
  });
  ok('天数攒够 → 走近老陈推进到 act2（主线能通！）', advanced.act === 2 && advanced.storyAct === 2, JSON.stringify(advanced));
  ok('推进无报错', errors.length === 0, errors[0]);

  // 7. 坏节点兜底（BUG-4）：坏 next 不冻死
  errors.length = 0;
  const badNode = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    const eng = ws.dialogueEngine;
    eng.data = { start: 'n1', nodes: { n1: { text: '测试', choices: [{ label: '去坏节点', next: 'NONEXISTENT' }] } } };
    eng.start(eng.data);
    await new Promise(r => setTimeout(r, 300));
    // 点选项跳到不存在的节点
    eng._showNode('NONEXISTENT');
    await new Promise(r => setTimeout(r, 300));
    return { crashed: false }; // 没抛异常就算过
  }).catch(() => ({ crashed: true }));
  ok('坏节点不冻死（BUG-4兜底）', badNode.crashed === false);
  ok('坏节点无未捕获异常', errors.length === 0, errors[0]);

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('崩溃:', e); process.exit(1); });
