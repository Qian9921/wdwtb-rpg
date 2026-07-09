// 场景背景 E2E：验证 bgChange 真的切换到不同的场景画面（不再是办公室叠色）+ 截图各场景。
// 运行：先 npm run dev，再 node scripts/e2e-backdrop.cjs
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

  console.log('\n=== 场景背景 E2E ===\n');
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('wdwtb_onboarded', '1'); });
  await sleep(1200);
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career: 'programmer', act: 1, day: 1 }));
  await sleep(3000);
  ok('WorldScene 启动无报错', errors.length === 0, errors[0]);

  // 1. sceneBackdrop 实例化
  const has = await p.evaluate(() => !!window.__game.scene.getScene('WorldScene').sceneBackdrop);
  ok('sceneBackdrop 已实例化', has);

  // 2. 各场景切换：验证 backdrop 容器有内容（真画了场景）+ 截图
  const scenes = ['street_morning', 'office_lobby', 'home', 'apartment_night', 'hospital', 'pantry', 'window', 'desk'];
  for (const bg of scenes) {
    errors.length = 0;
    const info = await p.evaluate(async (bgKey) => {
      const ws = window.__game.scene.getScene('WorldScene');
      ws.sceneBackdrop.show(bgKey);
      await new Promise(r => setTimeout(r, 700));
      const c = ws.sceneBackdrop.container;
      return { hasContainer: !!c, childCount: c ? c.list.length : 0 };
    }, bg);
    ok(`场景「${bg}」真的画了背景（非办公室叠色）`, info.hasContainer && info.childCount > 3, JSON.stringify(info));
    await p.screenshot({ path: `/tmp/scene-${bg}.png` });
  }
  console.log('  📷 各场景截图: /tmp/scene-*.png');

  // 3. 切回办公室 → backdrop 移除（露出办公室地图）
  errors.length = 0;
  const backToOffice = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.sceneBackdrop.show('office');
    await new Promise(r => setTimeout(r, 600));
    return { removed: !ws.sceneBackdrop.container };
  });
  ok('切回办公室 → backdrop 移除（露出地图）', backToOffice.removed);

  // 4. dialogueEnd 也移除 backdrop
  const onEnd = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.sceneBackdrop.show('home'); // 先切到家
    await new Promise(r => setTimeout(r, 400));
    const hadHome = !!ws.sceneBackdrop.container;
    ws.dialogueEngine.emit('dialogueEnd'); // 剧情结束
    await new Promise(r => setTimeout(r, 600));
    return { hadHome, removedAfterEnd: !ws.sceneBackdrop.container };
  });
  ok('剧情结束自动移除场景背景回办公室', onEnd.hadHome && onEnd.removedAfterEnd, JSON.stringify(onEnd));
  ok('全程无报错', errors.length === 0, errors[0]);

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 崩溃:', e); process.exit(1); });
