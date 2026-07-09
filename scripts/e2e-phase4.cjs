// 阶段四 E2E 验证：多天循环 + 多场景（DaySystem/HomeScene/CommuteScene）。
// 验证：DaySystem 实例化、天数 HUD、下班回家转场、通勤事件、场景间状态贯穿。
// 运行：先 npm run dev，再 node scripts/e2e-phase4.cjs
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

  console.log('\n=== 阶段四 多天循环 + 多场景 E2E ===\n');
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await sleep(1200);
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career: 'programmer', act: 1, day: 1 }));
  await sleep(3000);
  ok('WorldScene 启动无报错', errors.length === 0, errors[0]);

  // 1. DaySystem 实例化
  const sys = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    return {
      hasDay: !!ws.daySystem,
      day: ws.daySystem && ws.daySystem.day,
      phase: ws.daySystem && ws.daySystem.phase,
      hudText: ws.dayText && ws.dayText.text,
    };
  });
  ok('daySystem 已实例化', sys.hasDay);
  ok('进办公室即 work 阶段', sys.phase === 'work', sys.phase);
  ok('天数 HUD 显示', sys.hudText && sys.hudText.includes('第 1 天'), sys.hudText);

  // 2. commute_events.json 可加载
  const commuteData = await p.evaluate(async () => {
    const res = await fetch('./data/commute_events.json');
    if (!res.ok) return { ok: false };
    const d = await res.json();
    return { ok: true, count: d.events ? d.events.length : 0 };
  });
  ok('commute_events.json 可加载', commuteData.ok && commuteData.count >= 5, JSON.stringify(commuteData));

  // 3. 下班回家 → HomeScene 转场
  errors.length = 0;
  const homeResult = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.stateSystem.set('skill', 42); // 造个特征值，验证跨场景贯穿
    ws._goHome();
    await new Promise(r => setTimeout(r, 1200));
    const hs = window.__game.scene.getScene('HomeScene');
    return {
      homeActive: window.__game.scene.isActive('HomeScene'),
      homeStats: hs && hs.stats ? hs.stats.skill : null,
    };
  });
  ok('下班回家转场到 HomeScene', homeResult.homeActive);
  ok('状态跨场景贯穿（skill=42 传到 HomeScene）', homeResult.homeStats === 42, 'got ' + homeResult.homeStats);
  ok('下班转场无报错', errors.length === 0, errors[0]);

  // 4. HomeScene 自我提升改变状态
  errors.length = 0;
  const improveResult = await p.evaluate(() => {
    const hs = window.__game.scene.getScene('HomeScene');
    const before = hs.stats.skill;
    // 模拟"学习充电"（skill+6, energy-10）
    hs._doImprove({ effect: { skill: 6, energy: -10 } });
    return { skillGained: hs.stats.skill - before };
  });
  ok('HomeScene 自我提升增加技能', improveResult.skillGained === 6, 'got ' + improveResult.skillGained);
  ok('自我提升无报错', errors.length === 0, errors[0]);

  // 5. 睡觉 → CommuteScene（下一天）
  errors.length = 0;
  const sleepResult = await p.evaluate(async () => {
    const hs = window.__game.scene.getScene('HomeScene');
    const dayBefore = hs.day;
    hs._sleep();
    await new Promise(r => setTimeout(r, 1200));
    const cs = window.__game.scene.getScene('CommuteScene');
    return {
      commuteActive: window.__game.scene.isActive('CommuteScene'),
      dayAfter: cs && cs.day,
      dayBefore,
    };
  });
  ok('睡觉转场到 CommuteScene', sleepResult.commuteActive);
  ok('睡觉后天数+1', sleepResult.dayAfter === sleepResult.dayBefore + 1, `${sleepResult.dayBefore}→${sleepResult.dayAfter}`);
  ok('睡觉转场无报错', errors.length === 0, errors[0]);

  // 6. CommuteScene 事件选择改状态 → 回办公室
  errors.length = 0;
  const commuteFlow = await p.evaluate(async () => {
    const cs = window.__game.scene.getScene('CommuteScene');
    await new Promise(r => setTimeout(r, 800)); // 等事件加载
    // 模拟选一个选项
    const before = cs.stats ? { ...cs.stats } : {};
    cs._choose({ effect: { san: 5 }, reply: '测试' });
    return { hasStats: !!cs.stats, sanChanged: cs.stats && cs.stats.san !== (before.san || 0) };
  });
  ok('CommuteScene 选择改变状态', commuteFlow.hasStats && commuteFlow.sanChanged);
  ok('通勤事件无报错', errors.length === 0, errors[0]);

  // 7. 完整循环：通勤→办公室状态贯穿
  errors.length = 0;
  const fullLoop = await p.evaluate(async () => {
    const cs = window.__game.scene.getScene('CommuteScene');
    if (cs && cs.stats) cs.stats.passion = 88; // 标记值
    cs._goWork();
    await new Promise(r => setTimeout(r, 1500));
    const ws = window.__game.scene.getScene('WorldScene');
    return {
      worldActive: window.__game.scene.isActive('WorldScene'),
      passionCarried: ws && ws.stateSystem ? ws.stateSystem.get('passion') : null,
    };
  });
  ok('通勤→办公室转场', fullLoop.worldActive);
  ok('通勤状态贯穿回办公室（passion=88）', fullLoop.passionCarried === 88, 'got ' + fullLoop.passionCarried);
  ok('完整循环无报错', errors.length === 0, errors[0]);

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 崩溃:', e); process.exit(1); });
