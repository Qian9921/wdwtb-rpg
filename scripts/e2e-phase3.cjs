// 阶段三 E2E 验证：可交互物件 + 内心独白（思维内阁）。
// 验证：interactables 加载渲染、buy_drink 状态交易、monologue 触发思维气泡、ThoughtSystem 实例化。
// 运行：先 npm run dev，再 node scripts/e2e-phase3.cjs
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

  console.log('\n=== 阶段三 可交互物件 + 内心独白 E2E ===\n');
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await sleep(1200);
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career: 'programmer', act: 1 }));
  await sleep(3000);
  ok('WorldScene 启动无报错', errors.length === 0, errors[0]);

  // 1. 系统实例化
  const sys = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    return {
      hasThought: !!ws.thoughtSystem,
      thoughtReady: ws.thoughtSystem && ws.thoughtSystem.isReady(),
      interactableCount: (ws._interactables || []).length,
    };
  });
  ok('thoughtSystem 已实例化', sys.hasThought);
  ok('monologues.json 加载（thoughtSystem ready）', sys.thoughtReady);
  ok('可交互物件已渲染', sys.interactableCount >= 5, 'count=' + sys.interactableCount);

  // 2. buy_drink：状态交易（花钱换精力）
  errors.length = 0;
  const buyResult = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.stateSystem.set('money', 100); // 给点钱
    ws.stateSystem.set('energy', 50); // 先降精力（满值时加不上，会被 clamp）
    const beforeEnergy = ws.stateSystem.get('energy');
    const beforeMoney = ws.stateSystem.get('money');
    // 找 coffee 物件（buy_drink）
    const coffee = ws._interactables.find(o => o.id === 'coffee');
    if (!coffee) return { error: 'no coffee' };
    ws._interactObject(coffee);
    return {
      energyGained: ws.stateSystem.get('energy') - beforeEnergy,
      moneySpent: beforeMoney - ws.stateSystem.get('money'),
    };
  });
  ok('buy_drink 增加精力', buyResult.energyGained > 0, JSON.stringify(buyResult));
  ok('buy_drink 花费金钱', buyResult.moneySpent > 0);
  ok('buy_drink 无报错', errors.length === 0, errors[0]);
  await sleep(300);
  // 关掉可能弹出的 _showLine
  await p.evaluate(() => { const ws = window.__game.scene.getScene('WorldScene'); ws.dialogueActive = false; });

  // 3. buy_drink 钱不够时拒绝
  const noMoneyResult = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.stateSystem.set('money', 0);
    const beforeEnergy = ws.stateSystem.get('energy');
    const vending = ws._interactables.find(o => o.id === 'vending');
    ws._interactObject(vending);
    return { energyChanged: ws.stateSystem.get('energy') !== beforeEnergy };
  });
  ok('钱不够时 buy_drink 拒绝（精力不变）', noMoneyResult.energyChanged === false);

  // 4. monologue 触发思维气泡
  errors.length = 0;
  const monoResult = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    // 造高压力状态确保有人格触发
    ws.stateSystem.set('stress', 85);
    const before = ws.children.list.length;
    ws._triggerMonologue('auto');
    // 思维气泡是 container，检测是否新增了 UI 对象
    const after = ws.children.list.length;
    return { added: after > before };
  });
  ok('monologue 触发思维气泡（新增 UI）', monoResult.added);
  ok('monologue 无报错', errors.length === 0, errors[0]);

  // 5. ThoughtSystem.think 按状态选人格
  const thinkResult = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.stateSystem.set('stress', 85);
    const t = ws.thoughtSystem.think(ws.stateSystem.getAll());
    return t ? { voiceId: t.voice.id, hasText: !!t.text } : null;
  });
  ok('高压力 think 返回 analyst 人格', thinkResult && thinkResult.voiceId === 'analyst', JSON.stringify(thinkResult));
  ok('think 返回真实台词', thinkResult && thinkResult.hasText);

  // 6. quest_board 物件打开任务面板
  errors.length = 0;
  const boardResult = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.dialogueActive = false;
    const whiteboard = ws._interactables.find(o => o.id === 'whiteboard');
    ws._interactObject(whiteboard);
    await new Promise(r => setTimeout(r, 500));
    return { pauseActive: window.__game.scene.isActive('PauseScene') };
  });
  ok('quest_board 打开任务面板（PauseScene 激活）', boardResult.pauseActive);
  ok('quest_board 无报错', errors.length === 0, errors[0]);

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 崩溃:', e); process.exit(1); });
