// e2e：迷你完整职业(律师/医生)全路径——开场 light 剧情 → 经营期任务链 → 100% → 结局回流
// 覆盖历史软锁：里程碑 pendingAct 挡住接任务；结局吞掉 light 选择(health/light)
const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COMBOS = [
  { career: 'lawyer', sub: 'litigation', endHint: 'light' },
  { career: 'doctor', sub: 'clinic', endHint: null }, // 医生两条结局，取节点 ending
];

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 220)));
  let ok = 0, bad = 0;
  const t = (n, c, d) => {
    c ? ok++ : bad++;
    console.log((c ? '✓ ' : '✗ ') + n + (c ? '' : ' → ' + (d || '')));
  };

  async function clickDialogue(max = 80) {
    for (let i = 0; i < max; i++) {
      const st = await p.evaluate(() => {
        const w = window.__game.scene.getScene('WorldScene');
        if (!w) return { gone: true };
        // mindscape / minigame / debug / sequence / phone
        for (const key of ['MindscapeScene', 'MinigameScene', 'DebugGameScene', 'SequenceGameScene']) {
          const s = window.__game.scene.getScene(key);
          if (s && s.scene.isActive()) {
            if (s.onComplete) {
              try { s.onComplete({ correct: 5, total: 5, ratio: 1 }); } catch (e) {}
            }
            window.__game.scene.stop(key);
            window.__game.scene.resume('WorldScene');
            if (key === 'MindscapeScene') w.events.emit('mindscapeReturn');
            return { sub: key };
          }
        }
        if (w.phoneMessage && w.phoneMessage.isShowing && w.phoneMessage.isShowing()) {
          w.phoneMessage._close(false);
          return { phone: true };
        }
        if (!w.dialogueActive) return { done: true };
        const eng = w.dialogueEngine;
        if (!eng || !eng.ui) return {};
        if (eng._typing || (eng._hasMorePages && eng._hasMorePages())) {
          eng._catcher && eng._catcher.emit('pointerdown');
          return { page: true };
        }
        const btns = [];
        eng.ui.iterate((o) => {
          if (o.type === 'Container') {
            o.iterate((ch) => { if (ch.type === 'Zone' && ch.input && ch.input.enabled) btns.push(ch); });
          } else if (o.type === 'Rectangle' && o.input && o.input.enabled && o.width < 900 && o.height < 120) {
            btns.push(o);
          }
        });
        // 多选项时点最后一个（医生 light 结局常在后；律师单结局无所谓）
        if (btns.length) btns[btns.length - 1].emit('pointerdown');
        else if (eng._catcher) eng._catcher.emit('pointerdown');
        return { click: true };
      });
      if (st.done || st.gone) return i;
      await sleep(120);
    }
    return max;
  }

  for (const { career, sub } of COMBOS) {
    await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await sleep(1600);
    await p.evaluate(async ({ career, sub }) => {
      localStorage.clear();
      localStorage.setItem('wdwtb_onboarded', '1');
      window.__game.scene.start('WorldScene', {
        career, subRole: sub, act: 1, deep: false,
      });
      await new Promise((r) => setTimeout(r, 3200));
    }, { career, sub });

    const boot = await p.evaluate(() => {
      const w = window.__game.scene.getScene('WorldScene');
      return {
        active: !!(w && w.scene.isActive()),
        light: !!(w && w.career),
        career: w && w.career,
        workLoop: w && w.workLoopEnabled,
        phase: w && w._story && w._story.phase,
        npcs: w ? w.npcs.length : 0,
        chain: w && w.questSystem ? w.questSystem.order.length : 0,
      };
    });
    t(`${career} 进世界 workLoop+名册+链`,
      boot.active && boot.workLoop && boot.npcs >= 4 && boot.chain >= 3,
      JSON.stringify(boot));

    // 播开场 light 剧情
    await p.evaluate(() => {
      const w = window.__game.scene.getScene('WorldScene');
      w._story.phase = 'ready';
      const senior = w.npcs.find((n) => n.id === 'senior');
      w.player.setPosition(senior.spr.x, senior.spr.y + 40);
      w._interactSenior(senior);
    });
    await sleep(600);
    const steps = await clickDialogue(100);
    const afterStory = await p.evaluate(() => {
      const w = window.__game.scene.getScene('WorldScene');
      const end = window.__game.scene.getScene('EndingScene');
      return {
        phase: w && w._story && w._story.phase,
        lightCareer: w && w._story && w._story.lightCareer,
        preferred: w && w._story && w._story.preferredEnding,
        pendingAct: w && w._story && w._story.pendingAct,
        dialogue: w && w.dialogueActive,
        inEnding: !!(end && end.scene.isActive()),
      };
    });
    t(`${career} light 剧情后进经营期(不直接结局)`,
      afterStory.phase === 'working' && !afterStory.inEnding && afterStory.lightCareer,
      JSON.stringify({ steps, ...afterStory }));
    t(`${career} 经营期无 pendingAct 软锁`,
      afterStory.pendingAct == null,
      JSON.stringify(afterStory));

    // 跑完整任务链到 100%
    const chain = await p.evaluate(async () => {
      const w = window.__game.scene.getScene('WorldScene');
      w.dialogueActive = false;
      w._story.phase = 'working';
      w._story.pendingAct = null;
      w._story.lightCareer = true;
      // 确保 preferredEnding 有值
      if (!w._story.preferredEnding) w._story.preferredEnding = 'light';
      const order = w.questSystem.order.slice();
      const gains = [];
      for (const qid of order) {
        // accept
        if (!w.questSystem.accepted[qid] && !w.questSystem.completed[qid]) {
          const senior = w.npcs.find((n) => n.id === 'senior');
          w._interactSenior(senior);
          w.dialogueActive = false;
        }
        if (!w.questSystem.accepted[qid] && !w.questSystem.completed[qid]) {
          return { fail: 'accept ' + qid, accepted: Object.keys(w.questSystem.accepted) };
        }
        if (w.questSystem.completed[qid]) continue;
        const q = w.questSystem.defs[qid];
        for (const o of q.objectives) {
          if (o.kind === 'talk') {
            const npc = w.npcs.find((n) => n.id === o.target);
            if (!npc) return { fail: 'missing npc ' + o.target };
            w._interact(npc);
            w.dialogueActive = false;
          } else if (o.kind === 'minigame') {
            w.questSystem.progress('minigame', o.target);
            w.questSystem.progress('minigame', 'work');
          } else {
            w.questSystem.progress(o.kind, o.target);
          }
        }
        if (!w.questSystem.isReady(qid)) {
          return { fail: 'not ready ' + qid, prog: w.questSystem.accepted[qid] };
        }
        const before = w.projectSystem.progress;
        const senior = w.npcs.find((n) => n.id === 'senior');
        w._interactSenior(senior);
        w.dialogueActive = false;
        gains.push(w.projectSystem.progress - before);
        // 模拟里程碑回调（light 应不挂 pendingAct）
        if (w.projectSystem.progress >= 25) {
          w._onProjectMilestone(25);
        }
        if (w.projectSystem.progress >= 50) {
          w._onProjectMilestone(50);
        }
        if (w.projectSystem.progress >= 75) {
          w._onProjectMilestone(75);
        }
        if (w.projectSystem.progress >= 100) {
          w._onProjectMilestone(100);
        }
      }
      return {
        progress: Math.round(w.projectSystem.progress),
        pendingAct: w._story.pendingAct,
        completed: Object.keys(w.questSystem.completed),
        gains,
        preferred: w._story.preferredEnding,
      };
    });
    t(`${career} 任务链跑满 100%`,
      !chain.fail && chain.progress >= 100,
      JSON.stringify(chain));
    t(`${career} 里程碑后仍无 pendingAct`,
      chain.pendingAct == null,
      JSON.stringify(chain));

    // 找导师收尾进结局
    await p.evaluate(() => {
      const w = window.__game.scene.getScene('WorldScene');
      w.dialogueActive = false;
      const senior = w.npcs.find((n) => n.id === 'senior');
      w.player.setPosition(senior.spr.x, senior.spr.y + 40);
      w._interactSenior(senior);
    });
    await sleep(800);
    const end = await p.evaluate(() => {
      const e = window.__game.scene.getScene('EndingScene');
      const w = window.__game.scene.getScene('WorldScene');
      return {
        inEnding: !!(e && e.scene.isActive()),
        ending: e && e.ending,
        career: e && e.career,
        preferred: w && w._story && w._story.preferredEnding,
      };
    });
    t(`${career} 100% 后进 EndingScene`,
      end.inEnding,
      JSON.stringify(end));
    t(`${career} 结局不是 career 键名`,
      end.inEnding && end.ending && end.ending !== career,
      JSON.stringify(end));
  }

  // 额外：律师首环在「假装刚过 25% 里程碑」后仍可接任务（防回归软锁）
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  const lock = await p.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('wdwtb_onboarded', '1');
    window.__game.scene.start('WorldScene', {
      career: 'lawyer', subRole: 'litigation', act: 1, deep: false,
    });
    await new Promise((r) => setTimeout(r, 3200));
    const w = window.__game.scene.getScene('WorldScene');
    w._story = {
      phase: 'working', act: 1, lightCareer: true, preferredEnding: 'light', pendingAct: null,
    };
    // 错误旧行为：挂 pendingAct=2
    const bad = w._story;
    // 用真实 milestone API
    w.projectSystem.progress = 30;
    w._onProjectMilestone(25);
    const pendingAfter = w._story.pendingAct;
    const senior = w.npcs.find((n) => n.id === 'senior');
    w._interactSenior(senior);
    w.dialogueActive = false;
    const accepted = Object.keys(w.questSystem.accepted);
    return { pendingAfter, accepted, phase: w._story.phase };
  });
  t('律师 25% 里程碑后仍可接首环(无软锁)',
    lock.pendingAfter == null && lock.accepted.length > 0,
    JSON.stringify(lock));

  console.log(`\n${ok} passed, ${bad} failed | pageerrors: ${errs.length}`);
  errs.slice(0, 6).forEach((e) => console.log(' ', e));
  await b.close();
  process.exit(bad || errs.length ? 1 : 0);
})();
