// StoryProgress 纯逻辑单测（WorldScene 拆分）
import {
  createStoryState, mergeStoryState, isStoryPending,
  enterWorkingAfterAct, applyProjectMilestone,
  tryAdvanceByMilestone, tryAdvanceByDays,
  shouldDeferLightEnding, enterWorkingFromLightEnding, canFinishLightWorkLoop,
  seniorMarkKind, seniorMarkVisual, seniorUsesStoryMarks, bumpDaysInAct, buildWorldSaveExtra, chainHudStep,
  bottomGuideFromGoal,
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

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
