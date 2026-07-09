// 端到端验证（puppeteer）：验证新功能在真实浏览器里不报错、数据可加载。
// 覆盖：WorldScene 启动、家人消息数据 fetch、3 套小游戏题库 fetch、存档增强、触屏控制实例化。
// 运行：先 npm run dev，再 node scripts/e2e-features.cjs
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BASE = process.env.BASE_URL || 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
};

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERR: ' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

  console.log('\n=== E2E 功能验证 ===\n');

  // 1. 页面加载
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  ok('页面加载无致命错误', errors.length === 0, errors[0]);

  // 2. 进 WorldScene（跳过开场）
  await p.evaluate(() => localStorage.clear());
  await p.evaluate(() => {
    window.__game.scene.start('WorldScene', { career: 'programmer', act: 1 });
  });
  await sleep(3000);
  ok('WorldScene 启动后无报错', errors.length === 0, errors.slice(-2).join(' | '));

  // 3. 验证核心系统实例化
  const sys = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    return {
      hasState: !!ws.stateSystem,
      hasDialogue: !!ws.dialogueEngine,
      hasStatusUI: !!ws.statusUI,
      hasPhone: !!ws.phoneMessage,
      hasFamily: !!ws.familyMessages,
      hasTouch: !!ws.touchControls,
      healthVal: ws.stateSystem ? ws.stateSystem.get('health') : null,
    };
  });
  ok('stateSystem 已实例化', sys.hasState);
  ok('dialogueEngine 已实例化', sys.hasDialogue);
  ok('statusUI 已实例化', sys.hasStatusUI);
  ok('phoneMessage (T1) 已实例化', sys.hasPhone);
  ok('familyMessages (T1/T2) 已实例化', sys.hasFamily);
  ok('touchControls (T4) 已实例化', sys.hasTouch);
  ok('stateSystem 初始 health=80', sys.healthVal === 80, 'got ' + sys.healthVal);

  // 4. 家人消息数据可 fetch（emotional_anchors.json）
  const famReady = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    await ws.familyMessages.load();
    return ws.familyMessages.isReady();
  });
  ok('emotional_anchors.json 加载成功', famReady);

  // 5. pickForAct 能从真实数据匹配消息
  const pickResult = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    const r = ws.familyMessages.pickForAct(1);
    return r ? { bubbles: r.bubbles.length, hasContext: !!r.context } : null;
  });
  ok('pickForAct(1) 从真实数据匹配到家人消息', !!pickResult && pickResult.bubbles > 0, JSON.stringify(pickResult));

  // 6. 三套小游戏题库 JSON 可 fetch（T3）
  for (const t of ['coding', 'review', 'affairs']) {
    const r = await p.evaluate(async (type) => {
      const res = await fetch(`./data/minigame_${type}.json`);
      if (!res.ok) return { ok: false };
      const d = await res.json();
      return { ok: true, count: d.questions ? d.questions.length : 0, title: d._meta && d._meta.title };
    }, t);
    ok(`minigame_${t}.json 可加载且有题目`, r.ok && r.count === 3, JSON.stringify(r));
  }

  // 7. 状态阈值触发家人消息（T2）—— 模拟 health 跌破 20
  errors.length = 0;
  const thresholdTriggered = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    let triggered = false;
    // 监听 _showPhone 是否被调用（间接：phoneMessage.isShowing）
    ws.stateSystem.set('health', 25);   // 先到安全位
    ws.stateSystem.set('health', 15);   // 跌破 → 应触发 threshold → _onStateThreshold → _showPhone
    return new Promise(resolve => {
      setTimeout(() => resolve(ws.phoneMessage.isShowing()), 1500);
    });
  });
  ok('health 跌破 20 触发家人消息弹窗 (T2)', thresholdTriggered);
  ok('触发阈值消息无报错', errors.length === 0, errors[0]);
  // 关掉弹窗
  await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.phoneMessage.destroy();
    ws.dialogueActive = false;
  });
  await sleep(500);

  // 8. 存档增强（T5）：触发 next_act 后存档含 stats
  errors.length = 0;
  // 直接测 SaveSystem.saveProgress + load 往返
  const saveRoundtrip = await p.evaluate(() => {
    const { SaveSystem } = window.__game.registry.get('modules') || {};
    // modules 可能没注册，改用 fetch 不到的方式——直接操作 localStorage 验证结构
    // 通过 WorldScene 间接：调 saveProgress
    const ws = window.__game.scene.getScene('WorldScene');
    // 模拟过幕存档
    ws.constructor; // 确认场景存在
    return null;
  });
  // 改用直接 fetch SaveSystem 模块验证：加载页面后 SaveSystem 已打包进 chunk，
  // 通过 WorldScene 的 import 链验证 saveProgress 存在
  const hasSaveProgress = await p.evaluate(() => {
    // SaveSystem 不挂在全局，但 WorldScene 的 init 调过 saveProgress；
    // 验证：手动写一个含 stats 的存档，重启 WorldScene 看是否 restore
    const ws = window.__game.scene.getScene('WorldScene');
    return typeof ws !== 'undefined';
  });
  // 更直接：验证 localStorage 存档结构（WorldScene init 时已 saveProgress）
  const saveData = await p.evaluate(() => {
    const raw = localStorage.getItem('wdwtb_save');
    return raw ? JSON.parse(raw) : null;
  });
  ok('存档含 version 字段 (T5)', saveData && saveData.version === 2, JSON.stringify(saveData));
  ok('存档含 career 字段 (T5)', saveData && !!saveData.career);
  ok('存档含 act 字段 (T5)', saveData && typeof saveData.act === 'number');
  ok('存档含 updatedAt 时间戳 (T5)', saveData && typeof saveData.updatedAt === 'number');

  // 9. 存档 restore 往返：写一个含 stats 的档，重启场景验证恢复
  errors.length = 0;
  const restoredHealth = await p.evaluate(async () => {
    // 手写一个低 health 的存档
    localStorage.setItem('wdwtb_save', JSON.stringify({
      version: 2, career: 'programmer', act: 1,
      stats: { health: 35, energy: 50, san: 40, stress: 60, skill: 30, performance: 45, money: 500, passion: 25 },
      updatedAt: Date.now(),
    }));
    // 重启 WorldScene（同 career+act → init 会读到存档并 restore）
    window.__game.scene.start('WorldScene', { career: 'programmer', act: 1 });
    await new Promise(r => setTimeout(r, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    return ws.stateSystem ? ws.stateSystem.get('health') : null;
  });
  ok('续档恢复 health=35（存档增强生效）', restoredHealth === 35, 'got ' + restoredHealth);
  ok('续档恢复无报错', errors.length === 0, errors[0]);

  // 10. 触屏控制：非触屏环境下 getAxis 返回 {0,0}（不干扰键盘）
  const touchAxis = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    const a = ws.touchControls.getAxis();
    return { x: a.x, y: a.y };
  });
  ok('触屏控制 getAxis() 桌面环境返回 {0,0}', touchAxis.x === 0 && touchAxis.y === 0, JSON.stringify(touchAxis));

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 崩溃:', e); process.exit(1); });

// ============ 阶段一 Game Feel 验证（追加段）============
// 注：此段在原 IIFE 末尾已 close browser 后无法跑，故作为独立验证。
// 实际验证用下面的独立脚本 test-phase1.cjs。
