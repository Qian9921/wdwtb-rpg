// StoryProgress 纯逻辑单测（WorldScene 拆分）
import {
  createStoryState, mergeStoryState, isStoryPending,
  enterWorkingAfterAct, applyProjectMilestone,
  tryAdvanceByMilestone, tryAdvanceByDays,
  shouldDeferLightEnding, enterWorkingFromLightEnding, canFinishLightWorkLoop,
  seniorMarkKind, seniorMarkVisual, seniorUsesStoryMarks, bumpDaysInAct, buildWorldSaveExtra, chainHudStep,
  bottomGuideFromGoal, resolveCurrentGoal,
  isWorkLoopCareer, isLightCareer, defaultSubRole, actDaysNeeded,
  ACT_DAYS, MILESTONE_ACT,
} from '../src/systems/StoryProgress.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== StoryProgress ===\n');

ok('createStoryState 默认 ready/act1', createStoryState().phase === 'ready' && createStoryState().act === 1);
ok('mergeStoryState 覆盖', mergeStoryState({ phase: 'working', daysInAct: 2 }).daysInAct === 2);
ok('merge null 安全', mergeStoryState(null).phase === 'ready');

ok('isStoryPending ready', isStoryPending({ phase: 'ready', act: 1 }));
ok('isStoryPending pendingAct', isStoryPending({ phase: 'working', act: 1, pendingAct: 2 }));
ok('isStoryPending false', !isStoryPending({ phase: 'working', act: 2, pendingAct: null }));

const e1 = enterWorkingAfterAct(createStoryState({ act: 1 }), 1);
ok('enterWorking 后 phase working', e1.story.phase === 'working' && !e1.shouldEnd);
ok('enterWorking daysInAct 0', e1.story.daysInAct === 0);
const e5 = enterWorkingAfterAct(createStoryState({ act: 5 }), 5);
ok('act5 next → ending', e5.shouldEnd === true);

const m1 = applyProjectMilestone({ phase: 'working', act: 1 }, 26, 1);
// pct must be exact key 25/50/75/100（非阈值不解锁）
ok('milestone 26 非精确阈值 → unlocked=false', m1.unlocked === false);
const m25 = applyProjectMilestone({ phase: 'working', act: 1 }, 25, 1);
ok('milestone 25 → pendingAct 2', m25.unlocked && m25.pendingAct === 2);
const m50 = applyProjectMilestone({ phase: 'working', act: 1 }, 50, 1);
ok('milestone 50 → pendingAct 3', m50.unlocked && m50.pendingAct === 3);
const m75 = applyProjectMilestone({ phase: 'working', act: 1 }, 75, 1);
ok('milestone 75 → pendingAct 4', m75.unlocked && m75.pendingAct === 4);
const m100 = applyProjectMilestone({ phase: 'working', act: 1 }, 100, 1);
ok('milestone 100 → pendingAct 5', m100.unlocked && m100.pendingAct === 5);
const mlow = applyProjectMilestone({ phase: 'working', act: 2 }, 25, 2);
ok('milestone 不降幕', !mlow.unlocked);
ok('MILESTONE_ACT 100=5', MILESTONE_ACT[100] === 5);

const adv = tryAdvanceByMilestone({ phase: 'working', act: 1, pendingAct: 2 }, 1, 'programmer', true);
ok('tryAdvanceByMilestone 推进', adv.advanced && adv.act === 2 && adv.story.phase === 'ready');
ok('playUrl act2', adv.playUrl.includes('programmer_act2'));
const noadv = tryAdvanceByMilestone({ phase: 'working', act: 1 }, 1, 'programmer', true);
ok('无 pending 不推进', !noadv.advanced);

// ── 跨档保护回归(修 bug:一次进度跨两阈值曾跳过整幕剧情)──
// applyProjectMilestone 用 max 累积 pendingAct:已挂 2 再收到更高档,取较高值,不被覆盖。
const mAccum = applyProjectMilestone({ phase: 'working', act: 1, pendingAct: 2 }, 50, 1);
ok('跨档累积 max(2,3)=3', mAccum.unlocked && mAccum.pendingAct === 3);
// 低档不覆盖已挂的高档(防乱序 emit 回退)
const mNoRegress = applyProjectMilestone({ phase: 'working', act: 1, pendingAct: 3 }, 25, 1);
ok('低档不回退 max(3,2)=3', mNoRegress.pendingAct === 3);
// tryAdvance 一次只推一幕:pendingAct=3 时 act1→2(不跳到3),且保留 pendingAct=3 待续。
const advStep = tryAdvanceByMilestone({ phase: 'working', act: 1, pendingAct: 3 }, 1, 'programmer', true);
ok('跨档时一次只推一幕 act1→2', advStep.advanced && advStep.act === 2);
ok('推进后保留 pendingAct=3 待续', advStep.story.pendingAct === 3);
ok('续播 act2 剧情(不跳过)', advStep.playUrl.includes('programmer_act2'));
// 玩完 act2 再推:2→3,pendingAct 清空。
const advStep2 = tryAdvanceByMilestone({ phase: 'working', act: 2, pendingAct: 3 }, 2, 'programmer', true);
ok('续推 act2→3 且清 pendingAct', advStep2.advanced && advStep2.act === 3 && advStep2.story.pendingAct === null);

const dayNeed = actDaysNeeded(2);
ok('act2 需要 2 天', dayNeed === 2 && ACT_DAYS[2] === 2);
const d0 = tryAdvanceByDays({ phase: 'working', act: 2, daysInAct: 0 }, 2, 'admin');
ok('天数不足', !d0.advanced && d0.daysLeft === 2);
const d2 = tryAdvanceByDays({ phase: 'working', act: 2, daysInAct: 2 }, 2, 'admin');
ok('天数够推进', d2.advanced && d2.act === 3);

ok('workLoop programmer', isWorkLoopCareer('programmer'));
ok('light designer', isLightCareer('designer'));
ok('default subRole lawyer', defaultSubRole('lawyer') === 'litigation');

ok('defer light ending', shouldDeferLightEnding(true, 'teacher', 40));
ok('不 defer 满进度', !shouldDeferLightEnding(true, 'teacher', 100));
ok('不 defer 非 light', !shouldDeferLightEnding(true, 'programmer', 0));
const lw = enterWorkingFromLightEnding({ phase: 'ready', act: 1 }, 1);
ok('light ending → working', lw.phase === 'working');
ok('canFinish light 100', canFinishLightWorkLoop({ phase: 'working' }, 100));
ok('cannot finish 99', !canFinishLightWorkLoop({ phase: 'working' }, 99));

ok('seniorMark ready=story', seniorMarkKind({ phase: 'ready' }) === 'story');
ok('seniorMark workLoop pending=story', seniorMarkKind({ phase: 'working', pendingAct: 3, act: 1 }, { workLoopEnabled: true, act: 1 }) === 'story');
ok('seniorMark workLoop quest', seniorMarkKind({ phase: 'working', act: 1 }, { workLoopEnabled: true, hasSeniorQuest: true, act: 1 }) === 'quest');
ok('seniorMark workLoop sleep', seniorMarkKind({ phase: 'working', act: 1 }, { workLoopEnabled: true, hasSeniorQuest: false, act: 1 }) === 'sleep');

ok('seniorUsesStoryMarks 深度', seniorUsesStoryMarks('programmer', false) === true);
ok('seniorUsesStoryMarks light 无 workLoop', seniorUsesStoryMarks('designer', false) === false);
ok('seniorUsesStoryMarks light+workLoop', seniorUsesStoryMarks('designer', true) === true);

const vReady = seniorMarkVisual({ phase: 'ready', act: 1 }, { career: 'programmer', act: 1 });
ok('visual ready ❗', vReady && vReady.emoji === '❗' && vReady.kind === 'story');
const vDel = seniorMarkVisual({ phase: 'ready', act: 1 }, {
  career: 'programmer', act: 1, hasSeniorDeliver: true,
});
ok('visual deliver 优先 ❓', vDel && vDel.emoji === '❓' && vDel.kind === 'deliver');
const vSleep = seniorMarkVisual({ phase: 'working', act: 1 }, {
  career: 'programmer', workLoopEnabled: true, hasSeniorQuest: false, act: 1,
});
ok('visual sleep 💤', vSleep && vSleep.emoji === '💤');
const vQuest = seniorMarkVisual({ phase: 'working', act: 1 }, {
  career: 'programmer', workLoopEnabled: true, hasSeniorQuest: true, act: 1,
});
ok('visual quest ❗', vQuest && vQuest.emoji === '❗' && vQuest.kind === 'quest');
const vLight = seniorMarkVisual({ phase: 'ready' }, { career: 'designer', workLoopEnabled: false });
ok('visual light 无 workLoop → null', vLight === null);
const vLightWL = seniorMarkVisual({ phase: 'ready', act: 1 }, { career: 'designer', workLoopEnabled: true, act: 1 });
ok('visual light+workLoop ready ❗', vLightWL && vLightWL.emoji === '❗');

ok('bumpDays', bumpDaysInAct({ daysInAct: 1 }, 1).daysInAct === 2);
const extra = buildWorldSaveExtra({ subRole: 'dev', story: { phase: 'working' } });
ok('save extra shape', extra.subRole === 'dev' && extra.story.phase === 'working');

// chainHudStep mock
const mockQs = {
  active: () => [{ id: 'c1', giver: 'senior', ordered: true, title: '测试链' }],
  available: () => [],
  accepted: { c1: { objectives: { o1: false } } },
  nextObjective: () => ({ text: '去找人对接' }),
};
const hud = chainHudStep(mockQs, 1);
ok('chainHud 有 title', hud.title === '测试链');
ok('chainHud step', hud.step.includes('对接'));
const hudDone = chainHudStep({ active: () => [], available: () => [] }, 1);
ok('chainHud 完成文案', hudDone.step.includes('全部完成'));

ok('bottomGuide 有目标', bottomGuideFromGoal({ text: '领任务:「登录」' }).includes('领任务'));
ok('bottomGuide 无目标 fallback 含 ESC', bottomGuideFromGoal(null, '老陈').includes('ESC'));
ok('bottomGuide 无目标含导师名', bottomGuideFromGoal(null, '老陈').includes('老陈'));
ok('bottomGuide null goal 不抛', typeof bottomGuideFromGoal(undefined) === 'string');

// ---------- resolveCurrentGoal（从 WorldScene 抽出） ----------
console.log('\n-- resolveCurrentGoal --');
const posMap = {
  senior: { x: 100, y: 200 },
  zhao: { x: 300, y: 400 },
};
const npcPos = (id) => posMap[id] || null;

ok('无 questSystem → null', resolveCurrentGoal({ questSystem: null, npcPos }) === null);

// 剧情 ready → 找导师
const gReady = resolveCurrentGoal({
  questSystem: { active: () => [], available: () => [], isReady: () => false },
  story: { phase: 'ready', act: 1 },
  act: 1,
  npcPos,
  seniorName: '老陈',
});
ok('ready → 剧情目标', gReady && gReady.text.includes('老陈') && gReady.text.includes('剧情'));
ok('ready → senior 坐标', gReady.x === 100 && gReady.y === 200);

// pendingAct 里程碑
const gPend = resolveCurrentGoal({
  questSystem: { active: () => [], available: () => [] },
  story: { phase: 'working', act: 1, pendingAct: 2 },
  act: 1,
  npcPos,
  seniorName: '林姐',
});
ok('pendingAct → 剧情目标', gPend && gPend.text.includes('林姐'));

// 可交付优先
const gDel = resolveCurrentGoal({
  questSystem: {
    active: () => [{ id: 'c1', giver: 'senior', title: '登录接口' }],
    available: () => [],
    isReady: (id) => id === 'c1',
    nextObjective: () => null,
  },
  story: { phase: 'working', act: 1 },
  act: 1,
  npcPos,
});
ok('isReady → 交付文案', gDel && gDel.text.includes('交付') && gDel.text.includes('登录'));
ok('交付指 senior', gDel.x === 100);

// talk 目标
const gTalk = resolveCurrentGoal({
  questSystem: {
    active: () => [{ id: 'c1', giver: 'senior', title: '链' }],
    available: () => [],
    isReady: () => false,
    nextObjective: () => ({ kind: 'talk', target: 'zhao', text: '找小赵对接' }),
  },
  story: { phase: 'working', act: 1 },
  act: 1,
  npcPos,
});
ok('talk → 文案+坐标', gTalk && gTalk.text === '找小赵对接' && gTalk.x === 300);

// minigame → 工位椅
const gMg = resolveCurrentGoal({
  questSystem: {
    active: () => [{ id: 'c1', giver: 'senior', title: '链' }],
    available: () => [],
    isReady: () => false,
    nextObjective: () => ({ kind: 'minigame', target: 'work', text: '坐工位干活' }),
  },
  story: { phase: 'working', act: 1 },
  act: 1,
  npcPos,
  playerDesk: { chair: { x: 50, y: 60 } },
});
ok('minigame → 工位', gMg && gMg.x === 50 && gMg.y === 60 && gMg.text.includes('工位'));

// interact 经 resolveInteract（注入假实现验证调用）
const gInt = resolveCurrentGoal({
  questSystem: {
    active: () => [{ id: 'c1', giver: 'senior', title: '链' }],
    available: () => [],
    isReady: () => false,
    nextObjective: () => ({ kind: 'interact', target: 'vending', text: '去贩卖机' }),
  },
  story: { phase: 'working', act: 1 },
  act: 1,
  npcPos,
  resolveInteract: (id) => (id === 'vending' ? { x: 9, y: 8 } : null),
});
ok('interact → 注入坐标', gInt && gInt.x === 9 && gInt.y === 8);

// 可接任务
const gAvail = resolveCurrentGoal({
  questSystem: {
    active: () => [],
    available: () => [{ id: 'c2', giver: 'senior', title: '第二环' }],
    isReady: () => false,
  },
  story: { phase: 'working', act: 1 },
  act: 1,
  npcPos,
});
ok('available → 领任务', gAvail && gAvail.text.includes('领任务') && gAvail.text.includes('第二环'));

// 无目标
const gNone = resolveCurrentGoal({
  questSystem: { active: () => [], available: () => [] },
  story: { phase: 'working', act: 1 },
  act: 1,
  npcPos,
});
ok('无目标 null', gNone === null);

// 与 bottomGuide 同源
ok('goal→bottomGuide', bottomGuideFromGoal(gTalk).includes('找小赵'));

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
