// Career / work-loop / resume 矩阵单测：对照真实 StoryProgress + Resume + taskchain JSON。
// 运行：node scripts/test-career-logic-matrix.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIGHT_CAREERS,
  WORK_LOOP_CAREERS,
  DEFAULT_SUBROLE,
  MILESTONE_ACT,
  isLightCareer,
  isWorkLoopCareer,
  defaultSubRole,
  applyProjectMilestone,
  tryAdvanceByMilestone,
  shouldDeferLightEnding,
  canFinishLightWorkLoop,
  enterWorkingFromLightEnding,
  createStoryState,
} from '../src/systems/StoryProgress.js';
import { buildWorldResumeData, DEEP_CAREERS } from '../src/systems/Resume.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public/data');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

console.log('\n=== Career Logic Matrix ===\n');

// ── 1. WORK_LOOP_CAREERS × defaultSubRole × taskchain JSON ──
console.log('-- workLoop taskchains --');
for (const career of WORK_LOOP_CAREERS) {
  const sub = defaultSubRole(career);
  ok(`${career}: isWorkLoopCareer`, isWorkLoopCareer(career));
  ok(`${career}: defaultSubRole 有值`, typeof sub === 'string' && sub.length > 0, String(sub));
  ok(`${career}: DEFAULT_SUBROLE 一致`, DEFAULT_SUBROLE[career] === sub, `${DEFAULT_SUBROLE[career]} vs ${sub}`);
  const path = join(DATA, `taskchain_${career}_${sub}.json`);
  ok(`${career}: taskchain 文件存在`, existsSync(path), path);
  if (existsSync(path)) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      ok(`${career}: taskchain 可解析`, false, e.message);
      continue;
    }
    const quests = Array.isArray(raw) ? raw : (Array.isArray(raw.quests) ? raw.quests : null);
    ok(`${career}: quests ≥3`, Array.isArray(quests) && quests.length >= 3, `len=${quests?.length}`);
  }
}

// ── 2. LIGHT_CAREERS 轻量结局/经营期 ──
console.log('\n-- light careers --');
for (const c of LIGHT_CAREERS) {
  ok(`${c}: isLightCareer`, isLightCareer(c) === true);
  ok(`${c}: defer @40`, shouldDeferLightEnding(true, c, 40) === true);
  ok(`${c}: 不 defer @100`, shouldDeferLightEnding(true, c, 100) === false);
  ok(`${c}: canFinish working@100`, canFinishLightWorkLoop({ phase: 'working' }, 100) === true);
  ok(`${c}: 不可 finish ready@100`, canFinishLightWorkLoop({ phase: 'ready' }, 100) === false);
  ok(`${c}: 不可 finish working@99`, canFinishLightWorkLoop({ phase: 'working' }, 99) === false);
}
// enterWorkingFromLightEnding smoke
{
  const st = enterWorkingFromLightEnding(createStoryState({ phase: 'ready', act: 1 }), 1);
  ok('enterWorkingFromLightEnding → working', st.phase === 'working' && st.act === 1);
}

// ── 3. Milestone ladder ──
console.log('\n-- milestone ladder --');
ok('MILESTONE_ACT 25→2', MILESTONE_ACT[25] === 2);
ok('MILESTONE_ACT 50→3', MILESTONE_ACT[50] === 3);
ok('MILESTONE_ACT 75→4', MILESTONE_ACT[75] === 4);
ok('MILESTONE_ACT 100→5', MILESTONE_ACT[100] === 5);

for (const [pct, expectAct] of [[25, 2], [50, 3], [75, 4], [100, 5]]) {
  const r = applyProjectMilestone({ phase: 'working', act: 1 }, pct, 1);
  ok(`pct ${pct}: unlocked + pendingAct=${expectAct}`,
    r.unlocked === true && r.pendingAct === expectAct && r.story.pendingAct === expectAct,
    `unlocked=${r.unlocked} pending=${r.pendingAct}`);
}
{
  const r26 = applyProjectMilestone({ phase: 'working', act: 1 }, 26, 1);
  ok('pct 26: unlocked===false', r26.unlocked === false);
}

// ── 4. tryAdvanceByMilestone playUrl ──
console.log('\n-- tryAdvance playUrl --');
{
  const deep = tryAdvanceByMilestone(
    { phase: 'working', act: 1, pendingAct: 2 },
    1, 'programmer', true,
  );
  ok('programmer deep advanced', deep.advanced === true && deep.act === 2);
  ok('programmer playUrl act2', deep.playUrl && deep.playUrl.includes('programmer_act2'), deep.playUrl);

  for (const career of ['lawyer', 'designer']) {
    const light = tryAdvanceByMilestone(
      { phase: 'working', act: 1, pendingAct: 2 },
      1, career, true,
    );
    ok(`${career} light advanced`, light.advanced === true);
    ok(`${career} playUrl light_`, light.playUrl && light.playUrl.includes(`light_${career}`), light.playUrl);
  }
}

// ── 5. buildWorldResumeData × 10 careers ──
console.log('\n-- resume deep defaults --');
const ALL_CAREERS = [
  'programmer', 'product', 'admin',
  'designer', 'operation', 'teacher', 'doctor', 'civilservant', 'sales', 'lawyer',
];
for (const career of ALL_CAREERS) {
  const r = buildWorldResumeData({ career, act: 1 });
  const expectDeep = DEEP_CAREERS.has(career);
  ok(`${career}: deep default=${expectDeep}`, r && r.deep === expectDeep && r.career === career,
    `got deep=${r?.deep}`);
  const forced = buildWorldResumeData({ career, act: 2, deep: false });
  ok(`${career}: deep:false override`, forced && forced.deep === false && forced.act === 2);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
