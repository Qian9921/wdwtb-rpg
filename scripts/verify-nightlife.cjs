// 真操作验证回家/通勤大改:行动点预算/状态咬合/随机事件/种子挂钩
const puppeteer = require('/home/liangyu/wdwtb-transfer/node_modules/puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__game && window.__game.scene, { timeout: 10000 });

  let pass = 0, fail = 0;
  const ok = (n, c, d) => { c ? (pass++, console.log('✓ ' + n)) : (fail++, console.log('✗ ' + n + (d ? ' → ' + d : ''))); };

  // ── 验证HomeScene:行动点系统 ──
  await p.evaluate(() => {
    window.__game.scene.start('HomeScene', {
      career: 'programmer', act: 1, day: 3, slot: 1,
      stats: { health: 80, energy: 20, san: 60, stress: 65, skill: 10, performance: 50, money: 100, passion: 70 },
    });
  });
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: '/tmp/nl-home.png' });

  const home = await p.evaluate(() => {
    const h = window.__game.scene.getScene('HomeScene');
    return {
      pointsLeft: h._pointsLeft,
      hasUI: !!h.ui,
      // 精力20<25 → 学习应不可用; 压力65>=60 → decompress特殊活动应解锁
      textDump: h.ui ? h.ui.list.filter(o => o.text).map(o => o.text).join(' | ') : '',
    };
  });
  ok('HomeScene启动无错', errs.length === 0, errs.slice(-2).join('|'));
  ok('行动点=2', home.pointsLeft === 2, 'pts=' + home.pointsLeft);
  ok('精力低(20)时学习变灰(显示看不进去)', /看不进去|太累/.test(home.textDump), home.textDump.slice(0, 200));
  ok('压力高(65)解锁"和自己待会儿"特殊活动', /和自己待会儿|和解/.test(home.textDump), home.textDump.slice(0, 300));

  // 做一个活动(打游戏放松,应该可用),点数应-1
  const afterAct = await p.evaluate(() => {
    const h = window.__game.scene.getScene('HomeScene');
    const { NIGHT_ACTIVITIES } = window.__nl || {};
    // 直接调_doActivity模拟选"打游戏放松"(relax)
    const relax = { id: 'relax', tag: 'game', label: '打游戏放松', cost: 1, effect: { stress: -12, passion: 4, energy: -4 }, gate: () => ({ ok: true }), seed: 'relaxed' };
    const before = h.stats.stress;
    h._doActivity(relax);
    return { pointsLeft: h._pointsLeft, stressBefore: before, stressAfter: h.stats.stress, seeds: h._nightSeeds };
  });
  ok('做活动后行动点-1(=1)', afterAct.pointsLeft === 1, 'pts=' + afterAct.pointsLeft);
  ok('活动改状态(压力-12)', afterAct.stressAfter < afterAct.stressBefore, `${afterAct.stressBefore}→${afterAct.stressAfter}`);
  ok('活动埋种子(relaxed)', afterAct.seeds.includes('relaxed'), JSON.stringify(afterAct.seeds));

  // ── 验证CommuteScene:随机事件+不同天不同事件 ──
  const commuteIds = [];
  for (let day = 2; day <= 6; day++) {
    await p.evaluate((d) => {
      // 每次清recent让抽取更自由,但保留看能否随机
      window.__game.scene.start('CommuteScene', {
        career: 'programmer', act: 1, day: d, slot: 1,
        stats: { health: 80, energy: 100, san: 70, stress: 30, skill: 10, performance: 50, money: 50, passion: 70 },
      });
    }, day);
    await new Promise(r => setTimeout(r, 900));
    const id = await p.evaluate(() => {
      const c = window.__game.scene.getScene('CommuteScene');
      return c._currentEvent ? c._currentEvent.id : null;
    });
    if (id) commuteIds.push(id);
  }
  await p.screenshot({ path: '/tmp/nl-commute.png' });
  ok('通勤5天都抽到事件', commuteIds.length === 5, JSON.stringify(commuteIds));
  // 随机性:5天不应全相同(旧版day%6会规律重复,新版随机)
  const uniq = new Set(commuteIds);
  ok('通勤事件有随机性(非全同)', uniq.size >= 2, `${uniq.size}种: ${JSON.stringify(commuteIds)}`);

  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ FAILED'} (${pass} passed, ${fail} failed)`);
  await b.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
