// SaveSystem 单元测试（纯 Node，mock localStorage）。
// 运行：node scripts/test-save-system.mjs
import { SaveSystem } from '../src/systems/SaveSystem.js';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

// mock localStorage
let _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};
const reset = () => { _store = {}; };

console.log('\n=== SaveSystem 单元测试 ===\n');

reset();
ok('初始无档：has() 为 false', SaveSystem.has() === false);
ok('初始无档：load() 返回 null', SaveSystem.load() === null);

reset();
ok('save 成功返回 true', SaveSystem.save({ career: 'programmer', act: 2 }) === true);
ok('save 后 has() 为 true', SaveSystem.has() === true);
const loaded = SaveSystem.load();
ok('load 返回存入的 career', loaded.career === 'programmer');
ok('load 返回存入的 act', loaded.act === 2);
ok('save 自动加 version:2', loaded.version === 2, `got ${loaded.version}`);
ok('save 自动加 updatedAt 时间戳', typeof loaded.updatedAt === 'number');

reset();
SaveSystem.saveProgress({ career: 'product', act: 3, stats: { health: 50, passion: 30 } });
const p = SaveSystem.load();
ok('saveProgress：存入 career', p.career === 'product');
ok('saveProgress：存入 act', p.act === 3);
ok('saveProgress：存入 stats.health', p.stats && p.stats.health === 50);
ok('saveProgress：存入 stats.passion', p.stats && p.stats.passion === 30);

reset();
SaveSystem.saveProgress({ career: 'admin', act: 1, stats: {}, extra: { customField: 'abc' } });
ok('saveProgress：extra 字段合并', SaveSystem.load().customField === 'abc');

reset();
SaveSystem.save({ career: 'designer', act: 1 });
ok('向后兼容：旧格式可 load', SaveSystem.load().career === 'designer');

reset();
SaveSystem.save({ career: 'x', act: 1 });
ok('clear 前有档', SaveSystem.has() === true);
SaveSystem.clear();
ok('clear 后无档', SaveSystem.has() === false);

// localStorage 不可用时降级
globalThis.localStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
  removeItem: () => { throw new Error('denied'); },
};
ok('localStorage 不可用：save 返回 false 不抛错', SaveSystem.save({ career: 'x' }) === false);
ok('localStorage 不可用：load 返回 null 不抛错', SaveSystem.load() === null);
ok('localStorage 不可用：has 返回 false 不抛错', SaveSystem.has() === false);
ok('localStorage 不可用：clear 返回 false 不抛错', SaveSystem.clear() === false);
ok('localStorage 不可用：saveProgress 返回 false 不抛错', SaveSystem.saveProgress({ career: 'x', act: 1 }) === false);

// 恢复可用 localStorage，继续增强用例
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};

// ── 1. Full save with story/project/quests/subRole via extra ──
console.log('\n-- full saveProgress extra --');
reset();
const fullExtra = {
  subRole: 'dev',
  story: { phase: 'working', act: 1, daysInAct: 1, pendingAct: null },
  project: { progress: 42, performance: 15, hitMilestones: [25] },
  quests: { accepted: { dev_c1: { objectives: { o1: true } } }, completed: [] },
};
ok(
  'full saveProgress 返回 true',
  SaveSystem.saveProgress({
    career: 'programmer',
    act: 1,
    stats: { health: 80, energy: 90 },
    extra: fullExtra,
  }) === true,
);
const full = SaveSystem.load();
ok('full load career', full.career === 'programmer');
ok('full load subRole', full.subRole === 'dev');
ok('full load story.phase', full.story && full.story.phase === 'working');
ok('full load story.daysInAct', full.story && full.story.daysInAct === 1);
ok('full load project.progress', full.project && full.project.progress === 42);
ok('full load project.hitMilestones', full.project && Array.isArray(full.project.hitMilestones)
  && full.project.hitMilestones[0] === 25);
ok('full load quests.accepted', full.quests && full.quests.accepted && full.quests.accepted.dev_c1);
ok('full load stats.health', full.stats && full.stats.health === 80);

// ── 2. Partial overwrite preserves nested progress (BUG-1 class merge) ──
console.log('\n-- partial overwrite merge --');
ok('partial save act:2 返回 true', SaveSystem.save({ act: 2 }) === true);
const partial = SaveSystem.load();
ok('partial: act 更新为 2', partial.act === 2);
ok('partial: career 保留', partial.career === 'programmer');
ok('partial: subRole 保留', partial.subRole === 'dev');
ok('partial: story 保留', partial.story && partial.story.phase === 'working' && partial.story.daysInAct === 1);
ok('partial: project 保留', partial.project && partial.project.progress === 42);
ok('partial: quests 保留', partial.quests && partial.quests.accepted && partial.quests.accepted.dev_c1);
ok('partial: stats 保留', partial.stats && partial.stats.health === 80);

// ── 3. Sleep-shaped write: only story daysInAct bump keeps project ──
console.log('\n-- sleep-shaped story bump --');
const bumpedStory = { ...partial.story, daysInAct: (partial.story.daysInAct || 0) + 1 };
ok(
  'sleep saveProgress 返回 true',
  SaveSystem.saveProgress({
    career: partial.career,
    act: partial.act,
    stats: partial.stats,
    extra: { story: bumpedStory },
  }) === true,
);
const sleep = SaveSystem.load();
ok('sleep: daysInAct 递增', sleep.story && sleep.story.daysInAct === 2, `got ${sleep.story?.daysInAct}`);
ok('sleep: project 仍在', sleep.project && sleep.project.progress === 42);
ok('sleep: quests 仍在', sleep.quests && sleep.quests.accepted && sleep.quests.accepted.dev_c1);
ok('sleep: subRole 仍在', sleep.subRole === 'dev');

// ── 4. Corrupt JSON → load() === null ──
console.log('\n-- corrupt JSON --');
_store['wdwtb_save'] = '{not-valid-json!!!';
ok('corrupt JSON: load() === null', SaveSystem.load() === null);
// has() still true if key present — only load must be null
ok('corrupt JSON: has() 仍可能为 true（键存在）', SaveSystem.has() === true);

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
