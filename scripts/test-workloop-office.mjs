// WorkLoopOffice + 真实 taskchain/roster：镜像 e2e-taskchain 的纯逻辑路径。
// 运行：node scripts/test-workloop-office.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  questDataUrl,
  npcDefsFromRoster,
  seniorInteractAction,
  applySeniorAccept,
  applySeniorDeliver,
  reportMinigameProgress,
  isWorkLoopCareer,
  defaultSubRole,
} from '../src/systems/WorkLoopOffice.js';
import { createStoryState } from '../src/systems/StoryProgress.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public/data');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

// Phaser stub for QuestSystem
globalThis.Phaser = {
  Events: {
    EventEmitter: class {
      constructor() { this._l = {}; }
      on(e, f) { (this._l[e] || (this._l[e] = [])).push(f); return this; }
      off() { return this; }
      emit(e, ...a) { (this._l[e] || []).forEach(fn => fn(...a)); return this; }
    },
  },
};

const questSrc = readFileSync(join(ROOT, 'src/systems/QuestSystem.js'), 'utf8')
  .replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;')
  .replace(/^import \{ AudioSystem \} from '\.\/AudioSystem\.js';/m, 'const AudioSystem = { questDone(){} };')
  .replace(/^import \{ Juice \} from '\.\/JuiceKit\.js';/m, 'const Juice = {};');
const { QuestSystem } = await import(
  'data:text/javascript;base64,' + Buffer.from(questSrc).toString('base64')
);

function makeState() {
  const stats = {
    health: 80, energy: 100, san: 80, stress: 20,
    skill: 10, performance: 50, money: 0, passion: 70,
  };
  return { stats, get(k) { return stats[k]; }, change(k, d) { stats[k] += d; } };
}

console.log('\n=== WorkLoopOffice (shipped path) ===\n');

// URL
ok('workLoop programmer → taskchain_programmer_dev',
  questDataUrl('programmer', 'dev', true).includes('taskchain_programmer_dev'));
ok('workLoop test subRole',
  questDataUrl('programmer', 'test', true).includes('taskchain_programmer_test'));
ok('非 workLoop → quests_',
  questDataUrl('programmer', 'dev', false).includes('quests_programmer'));
ok('isWorkLoopCareer programmer', isWorkLoopCareer('programmer'));
ok('defaultSubRole programmer=dev', defaultSubRole('programmer') === 'dev');

// Roster NPCs
const roster = JSON.parse(readFileSync(join(DATA, 'roster_programmer.json'), 'utf8'));
const defs = npcDefsFromRoster(roster, 'programmer');
ok('roster defs 非空', Array.isArray(defs) && defs.length >= 6);
const ids = new Set(defs.map(d => d.id));
ok('含 senior', ids.has('senior'));
ok('含 zhao', ids.has('zhao'));
ok('含 lin', ids.has('lin'));
ok('含 ting', ids.has('ting'));
ok('非 workLoop career → null', npcDefsFromRoster(roster, 'unknown_career_xyz') === null);

// Quest chain walk (mirrors e2e-taskchain)
const chain = JSON.parse(readFileSync(join(DATA, 'taskchain_programmer_dev.json'), 'utf8'));
const qs = new QuestSystem(makeState());
qs.load(chain);
ok('load 5 环', qs.order.length === 5 && qs.order[0] === 'dev_c1');

const storyReady = createStoryState({ phase: 'ready', act: 1 });
const noAcceptWhileStory = seniorInteractAction({
  questSystem: qs, story: storyReady, workLoopEnabled: true, act: 1,
});
ok('story ready 时不派活', noAcceptWhileStory.kind === 'none');

const storyWorking = createStoryState({ phase: 'working', act: 1, daysInAct: 0 });
const acceptAct = seniorInteractAction({
  questSystem: qs, story: storyWorking, workLoopEnabled: true, act: 1,
});
ok('working 可 accept', acceptAct.kind === 'accept' && acceptAct.questId === 'dev_c1');
const accepted = applySeniorAccept(qs, acceptAct);
ok('apply accept ok', accepted.ok === true);
ok('accept 后 accepted 含 dev_c1', !!qs.accepted.dev_c1);
ok('accept line 含下一步', accepted.line && accepted.line.includes('小赵'));

// talk zhao
qs.progress('talk', 'zhao');
let next = qs.nextObjective('dev_c1');
ok('talk zhao → o2 minigame', next && next.id === 'o2' && next.kind === 'minigame');

// reportMinigameProgress must complete work target
const targets = reportMinigameProgress(qs, 'coding');
ok('report 含 work', targets.includes('work'));
ok('report 含 coding', targets.includes('coding'));
ok('o2 完成后 isReady', qs.isReady('dev_c1') === true);

const deliverAct = seniorInteractAction({
  questSystem: qs, story: storyWorking, workLoopEnabled: true, act: 1,
});
ok('可交付', deliverAct.kind === 'deliver' && deliverAct.questId === 'dev_c1');
ok('progressGain 12', deliverAct.progressGain === 12);
const delivered = applySeniorDeliver(qs, deliverAct);
ok('deliver ok', delivered.ok === true);
ok('dev_c1 completed', !!qs.completed.dev_c1);
ok('dev_c2 解锁', qs.available({ act: 1 }).some(q => q.id === 'dev_c2'));

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
