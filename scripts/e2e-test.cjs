// e2e：测试(test)子职业全流程——真实点击播完五章(每分支选第一个),验证无卡死、
// 子职业分支正常、五章到 next_act/ending 收尾、act5 进入 EndingScene。
// 与 e2e-shortstory 对称,但 subRole='test' 且覆盖 act5 结局。
const puppeteer = require('puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(1800);
  let ok = 0, bad = 0;

  // 完成任意小游戏子场景（Debug/CodeReview/TestCase/Sequence）
  const MINIGAMES = ['DebugGameScene', 'CodeReviewScene', 'TestCaseScene', 'SequenceGameScene'];

  for (const act of [1, 2, 3, 4, 5]) {
    await p.evaluate(async (act) => {
      localStorage.clear(); localStorage.setItem('wdwtb_onboarded', '1');
      window.__game.scene.start('WorldScene', { career: 'programmer', subRole: 'test', act });
      await new Promise(r => setTimeout(r, 3000));
    }, act);
    await p.evaluate(async (act) => {
      const w = window.__game.scene.getScene('WorldScene');
      w._story = { phase: 'ready', act, daysInAct: 0, checkpoint: null, pendingAct: null };
      w._playStory(`./data/programmer_act${act}.json`);
      await new Promise(r => setTimeout(r, 900));
    }, act);

    let done = false, minigames = 0, endingReached = false;
    for (let i = 0; i < 200; i++) {
      const st = await p.evaluate((MINIGAMES) => {
        const w = window.__game.scene.getScene('WorldScene');
        // 结局场景（act5 终点）
        const end = window.__game.scene.getScene('EndingScene');
        if (end && end.scene.isActive()) return { ending: true };
        // 小游戏子场景 → 直接完成返回
        for (const key of MINIGAMES) {
          const s = window.__game.scene.getScene(key);
          if (s && s.scene.isActive()) { if (s.onComplete) s.onComplete({ correct: 3, total: 3, ratio: 1, maxCombo: 2 }); return { sub: key }; }
        }
        const ms = window.__game.scene.getScene('MindscapeScene');
        if (ms && ms.scene.isActive()) { window.__game.scene.stop('MindscapeScene'); window.__game.scene.resume('WorldScene'); w.events.emit('mindscapeReturn'); return { sub: 'mindscape' }; }
        if (w.phoneMessage && w.phoneMessage.isShowing()) { w.phoneMessage._close(false); return { sub: 'phone' }; }
        if (!w.dialogueActive) return { done: true, phase: w._story.phase };
        const eng = w.dialogueEngine;
        if (!eng.ui) return { cur: '(no-ui)' };
        if (eng._typing || (eng._hasMorePages && eng._hasMorePages())) { eng._catcher && eng._catcher.emit('pointerdown'); return { cur: eng.currentId }; }
        let btn = null;
        eng.ui.iterate(o => { if (btn) return; if (o.type === 'Container') { o.iterate(ch => { if (!btn && ch.type === 'Zone' && ch.input && ch.input.enabled) btn = ch; }); } else if (o.type === 'Rectangle' && o.input && o.input.enabled && o.width < 900 && o.height < 100) btn = o; });
        if (btn) btn.emit('pointerdown'); else if (eng._catcher) eng._catcher.emit('pointerdown');
        return { cur: eng.currentId };
      }, MINIGAMES);
      if (st.ending) { endingReached = true; done = true; console.log(`✓ test act${act} → 进入结局 EndingScene (${minigames}子场景)`); ok++; break; }
      if (st.sub) { minigames++; await sleep(400); continue; }
      if (st.done) {
        // act5:对话结束后结局场景可能仍在淡入转场——继续轮询等 EndingScene,而非立即判失败
        if (act === 5) { await sleep(200); continue; }
        done = true; console.log(`✓ test act${act} 播完并收尾 (${i}步, ${minigames}子场景, phase=${st.phase})`); ok++; break;
      }
      await sleep(120);
    }
    if (!done) { bad++; const cur = await p.evaluate(() => window.__game.scene.getScene('WorldScene') ? window.__game.scene.getScene('WorldScene').dialogueEngine.currentId : '(scene gone)'); console.log(`✗ test act${act} 卡死在 ${cur}`); }
  }

  console.log(`\n${ok}/5 幕通过 (test 子职业) | pageerrors: ${errs.length}`); errs.slice(0, 5).forEach(e => console.log(' ', e));
  await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
