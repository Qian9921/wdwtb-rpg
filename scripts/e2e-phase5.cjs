// 阶段五 E2E 验证：全职业内容 + onboarding + 辅助模式。
// 验证：10 职业 quests/interactables 可加载、onboarding 首次显示、辅助模式减半消耗。
// 运行：先 npm run dev，再 node scripts/e2e-phase5.cjs
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = process.env.BASE_URL || 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

const CAREERS = ['programmer', 'product', 'admin', 'designer', 'operation', 'teacher', 'doctor', 'civilservant', 'sales', 'lawyer'];

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERR: ' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  console.log('\n=== 阶段五 全职业内容 + onboarding + 辅助模式 E2E ===\n');
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // 1. 全 10 职业 quests + interactables 可加载
  let questOk = 0, intOk = 0;
  for (const c of CAREERS) {
    const r = await p.evaluate(async (career) => {
      const q = await fetch(`./data/quests_${career}.json`);
      const i = await fetch(`./data/interactables_${career}.json`);
      let qc = 0, ic = 0;
      if (q.ok) { const d = await q.json(); qc = (d.quests || []).length; }
      if (i.ok) { const d = await i.json(); ic = (d.interactables || []).length; }
      return { qc, ic };
    }, c);
    if (r.qc >= 4) questOk++;
    if (r.ic >= 5) intOk++;
  }
  ok('10 职业任务文件齐全（每个≥4任务）', questOk === 10, `${questOk}/10`);
  ok('10 职业交互物件文件齐全（每个≥5物件）', intOk === 10, `${intOk}/10`);

  // 2. onboarding 首次显示
  errors.length = 0;
  const onboarding = await p.evaluate(async () => {
    localStorage.clear(); // 确保首次
    window.__game.scene.start('WorldScene', { career: 'programmer', act: 1, day: 1 });
    await new Promise(r => setTimeout(r, 3200));
    const ws = window.__game.scene.getScene('WorldScene');
    // onboarding overlay 是高 depth container，检测是否存在
    const hasOverlay = ws.children.list.some(o => o.depth === 11000);
    return { hasOverlay };
  });
  ok('首次进办公室显示 onboarding', onboarding.hasOverlay);
  ok('onboarding 无报错', errors.length === 0, errors[0]);

  // 3. onboarding 只显示一次（标记后不再弹）
  const secondTime = await p.evaluate(async () => {
    // onboarded 标记应已设置（走完或部分）；手动设置模拟走完
    localStorage.setItem('wdwtb_onboarded', '1');
    window.__game.scene.start('WorldScene', { career: 'programmer', act: 1, day: 1 });
    await new Promise(r => setTimeout(r, 3000));
    const ws = window.__game.scene.getScene('WorldScene');
    const hasOverlay = ws.children.list.some(o => o.depth === 11000);
    return { hasOverlay };
  });
  ok('已 onboard 后不再显示', secondTime.hasOverlay === false);

  // 4. 辅助模式：负面消耗减半
  errors.length = 0;
  const assist = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    // 开辅助模式
    localStorage.setItem('wdwtb_settings', JSON.stringify({ assist: true }));
    ws.stateSystem.set('health', 80);
    ws.stateSystem.change('health', -20); // 辅助下应只掉 10
    const assistHealth = ws.stateSystem.get('health');
    // 关辅助模式
    localStorage.setItem('wdwtb_settings', JSON.stringify({ assist: false }));
    ws.stateSystem.set('health', 80);
    ws.stateSystem.change('health', -20); // 正常掉 20
    const normalHealth = ws.stateSystem.get('health');
    return { assistHealth, normalHealth };
  });
  ok('辅助模式掉血减半（80→70）', assist.assistHealth === 70, 'got ' + assist.assistHealth);
  ok('关闭辅助掉血正常（80→60）', assist.normalHealth === 60, 'got ' + assist.normalHealth);

  // 5. 各职业 minigame 类型正确（产品=review，行政=affairs）
  const mgTypes = await p.evaluate(async () => {
    const prod = await (await fetch('./data/interactables_product.json')).json();
    const adm = await (await fetch('./data/interactables_admin.json')).json();
    const pComputer = prod.interactables.find(i => i.id === 'computer');
    const aComputer = adm.interactables.find(i => i.id === 'computer');
    return { prod: pComputer.action, adm: aComputer.action };
  });
  ok('产品经理电脑=minigame:review', mgTypes.prod === 'minigame:review', mgTypes.prod);
  ok('行政电脑=minigame:affairs', mgTypes.adm === 'minigame:affairs', mgTypes.adm);

  // 6. 换职业加载对应任务（product）
  errors.length = 0;
  const productQuest = await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('wdwtb_onboarded', '1'); // 跳过引导
    window.__game.scene.start('WorldScene', { career: 'product', act: 1, day: 1 });
    await new Promise(r => setTimeout(r, 3000));
    const ws = window.__game.scene.getScene('WorldScene');
    return { questCount: Object.keys(ws.questSystem.defs).length };
  });
  ok('换职业(product)加载对应任务', productQuest.questCount >= 10, 'count=' + productQuest.questCount);
  ok('换职业无报错', errors.length === 0, errors[0]);

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 崩溃:', e); process.exit(1); });
