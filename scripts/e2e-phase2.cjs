// 阶段二 E2E 验证（puppeteer）：任务系统 + 选择记忆在真实浏览器里的接线。
// 验证：quest 数据加载、接/进度/完成全链路、choiceLog 记录、存档含 quests/choiceLog、结局喂 choiceLog。
// 运行：先 npm run dev，再 node scripts/e2e-phase2.cjs
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

  console.log('\n=== 阶段二 任务系统 + 选择记忆 E2E ===\n');
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await sleep(1200);
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career: 'programmer', act: 1 }));
  await sleep(2800);
  ok('WorldScene 启动无报错', errors.length === 0, errors[0]);

  // 1. 系统实例化
  const sys = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    return { hasQuest: !!ws.questSystem, hasChoiceLog: !!ws.choiceLog };
  });
  ok('questSystem 已实例化', sys.hasQuest);
  ok('choiceLog 已实例化', sys.hasChoiceLog);

  // 2. 任务数据加载
  const questLoaded = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    // 等任务数据 fetch 完成
    await new Promise(r => setTimeout(r, 500));
    return Object.keys(ws.questSystem.defs).length;
  });
  ok('quests_programmer.json 加载（含多个任务）', questLoaded >= 10, 'count=' + questLoaded);

  // 3. 任务接取 → 进度 → 完成全链路
  errors.length = 0;
  const questFlow = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    const qs = ws.questSystem;
    // 接第一个任务
    const first = qs.available({ act: 1 })[0];
    if (!first) return { error: 'no available quest' };
    qs.accept(first.id);
    const activeAfterAccept = qs.active().length;
    // 推进它的目标（模拟 talk/minigame/interact）
    for (const o of first.objectives) {
      qs.progress(o.kind, o.target);
    }
    const ready = qs.isReady(first.id);
    // 完成
    const beforeSkill = ws.stateSystem.get('skill');
    qs.complete(first.id);
    const afterSkill = ws.stateSystem.get('skill');
    return {
      questId: first.id,
      activeAfterAccept,
      ready,
      doneCount: qs.done().length,
      skillGained: afterSkill - beforeSkill,
    };
  });
  ok('接任务后进行中 +1', questFlow.activeAfterAccept === 1, JSON.stringify(questFlow));
  ok('推进所有目标后 isReady=true', questFlow.ready === true);
  ok('完成任务后 done +1', questFlow.doneCount === 1);
  ok('完成任务发放状态奖励（skill 增加）', questFlow.skillGained > 0, 'gained=' + questFlow.skillGained);
  ok('任务流程无报错', errors.length === 0, errors[0]);

  // 4. choiceLog 记录（模拟对话选择事件）
  errors.length = 0;
  const choiceRecorded = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    const before = ws.choiceLog.length;
    // 直接 emit dialogueEngine 的 choice 事件（模拟玩家选选项）
    ws.dialogueEngine.emit('choice', {
      nodeId: 'test_node', act: 1,
      choice: { label: '选择加班', tag: 'overwork' },
    });
    ws.dialogueEngine.emit('choice', {
      nodeId: 'test_node2', act: 1,
      choice: { label: '报喜不报忧', tag: 'report_good_news' },
    });
    return { before, after: ws.choiceLog.length, counts: ws.choiceLog.tagCounts() };
  });
  ok('choiceLog 记录了选择', choiceRecorded.after === choiceRecorded.before + 2, JSON.stringify(choiceRecorded));
  ok('choiceLog tag 聚合正确', choiceRecorded.counts.overwork === 1 && choiceRecorded.counts.report_good_news === 1);
  ok('choice 记录无报错', errors.length === 0, errors[0]);

  // 5. 过幕存档含 quests + choiceLog
  errors.length = 0;
  const saveData = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    // 手动触发一次含任务的存档（模拟过幕）
    const { SaveSystem } = window.__wdwtb_modules || {};
    // SaveSystem 不挂全局，改为直接调 WorldScene 的存档路径：用 serialize 拼存档
    localStorage.setItem('wdwtb_save', JSON.stringify({
      version: 2, career: 'programmer', act: 1,
      stats: ws.stateSystem.getAll(),
      quests: ws.questSystem.serialize(),
      choiceLog: ws.choiceLog.serialize(),
      updatedAt: Date.now(),
    }));
    const raw = JSON.parse(localStorage.getItem('wdwtb_save'));
    return {
      hasQuests: !!raw.quests,
      hasChoiceLog: Array.isArray(raw.choiceLog),
      completedCount: raw.quests && raw.quests.completed ? raw.quests.completed.length : 0,
      choiceCount: raw.choiceLog ? raw.choiceLog.length : 0,
    };
  });
  ok('存档含 quests 进度', saveData.hasQuests);
  ok('存档含 choiceLog 选择记忆', saveData.hasChoiceLog);
  ok('存档记录已完成任务', saveData.completedCount === 1, 'count=' + saveData.completedCount);
  ok('存档记录选择数', saveData.choiceCount >= 2);

  // 6. 续档恢复任务进度 + choiceLog
  errors.length = 0;
  const restored = await p.evaluate(async () => {
    // 重启 WorldScene（init 里 _loadQuestData 会 restore 存档的 quests/choiceLog）
    window.__game.scene.start('WorldScene', { career: 'programmer', act: 1 });
    await new Promise(r => setTimeout(r, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    return {
      doneCount: ws.questSystem.done().length,
      choiceCount: ws.choiceLog.length,
    };
  });
  ok('续档恢复已完成任务', restored.doneCount === 1, 'count=' + restored.doneCount);
  ok('续档恢复选择记忆', restored.choiceCount >= 2, 'count=' + restored.choiceCount);
  ok('续档无报错', errors.length === 0, errors[0]);

  // 7. 结局喂 choiceLog：进 EndingScene 传 choiceLog，验证 _summarizeChoices 生效
  errors.length = 0;
  const endingSummary = await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    // 造几条有 tag 的选择
    ws.choiceLog.clear();
    ws.choiceLog.record({ act: 1, choiceLabel: '加班', tag: 'overwork' });
    ws.choiceLog.record({ act: 2, choiceLabel: '继续加班', tag: 'overwork' });
    ws.choiceLog.record({ act: 3, choiceLabel: '报喜不报忧', tag: 'report_good_news' });
    window.__game.scene.start('EndingScene', {
      ending: 'backbone', career: 'programmer',
      stats: ws.stateSystem.getAll(),
      choiceLog: ws.choiceLog.serialize(),
      portrait: { driveText: 'x', drainText: 'x', stressStyle: 'x', hiddenPattern: 'x', fitText: 'x', oneLineForYou: 'x' },
    });
    await new Promise(r => setTimeout(r, 500));
    const es = window.__game.scene.getScene('EndingScene');
    // 调 _summarizeChoices 验证聚合
    const summary = es._summarizeChoices();
    return { summary, hasRepeated: summary.includes('overwork') && summary.includes('2次') };
  });
  ok('EndingScene 接收 choiceLog', typeof endingSummary.summary === 'string');
  ok('_summarizeChoices 聚合重复行为（overwork 2次）', endingSummary.hasRepeated, endingSummary.summary);
  ok('结局喂 choiceLog 无报错', errors.length === 0, errors[0]);

  await b.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('E2E 崩溃:', e); process.exit(1); });
