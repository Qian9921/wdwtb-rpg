// QuestSystem 单元测试。
// QuestSystem 依赖 Phaser.EventEmitter + AudioSystem + JuiceKit，用 data-URL stub 拦截。
// 运行：node scripts/test-questsystem.mjs
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

// Phaser stub
globalThis.Phaser = {
  Events: { EventEmitter: class { constructor(){this._l={};} on(e,f){(this._l[e]||(this._l[e]=[])).push(f);return this;} off(e,f){if(this._l[e])this._l[e]=this._l[e].filter(h=>h!==f);return this;} emit(e,...a){(this._l[e]||[]).forEach(f=>f(...a));return this;} } },
};

// StateSystem stub（只实现 get/change）
function makeState() {
  const stats = { health: 80, energy: 100, san: 80, stress: 20, skill: 10, performance: 50, money: 0, passion: 70 };
  return {
    stats, get(k){return stats[k];}, change(k,d){stats[k]+=d;},
  };
}

// 加载 QuestSystem，stub 掉 Phaser/AudioSystem/JuiceKit import
const src = readFileSync(new URL('../src/systems/QuestSystem.js', import.meta.url), 'utf8');
const patched = src
  .replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;')
  .replace(/^import \{ AudioSystem \} from '\.\/AudioSystem\.js';/m, "const AudioSystem = { questDone(){} };")
  .replace(/^import \{ Juice \} from '\.\/JuiceKit\.js';/m, "const Juice = {};");
const blob = 'data:text/javascript;base64,' + Buffer.from(patched).toString('base64');
const { QuestSystem } = await import(blob);

// 测试用任务定义
const TEST_QUESTS = {
  q_first: {
    id: 'q_first', title: '第一段代码', giver: 'senior', type: 'main',
    trigger: { act: 1 },
    objectives: [
      { id: 'o1', kind: 'talk', target: 'peer', text: '问同事要权限' },
      { id: 'o2', kind: 'minigame', target: 'coding', text: '完成 coding' },
      { id: 'o3', kind: 'interact', target: 'computer', text: '提交代码' },
    ],
    reward: { skill: 5, performance: 3, money: 200 },
  },
  q_simple: {
    id: 'q_simple', title: '简单任务', giver: 'peer', type: 'side',
    objectives: [{ id: 'o1', kind: 'talk', target: 'vet', text: '找前辈聊聊' }],
    reward: { san: 5 },
  },
  q_noobj: {
    id: 'q_noobj', title: '无目标任务', giver: 'vet', type: 'side',
    objectives: [],
    reward: { energy: 10 },
  },
};

console.log('\n=== QuestSystem 单元测试 ===\n');

// load
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  ok('load 后 defs 含 3 个任务', Object.keys(qs.defs).length === 3);
  ok('order 保持顺序', qs.order.length === 3 && qs.order[0] === 'q_first');
}

// available（触发条件）
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  // act=1 时 q_first(act1触发) 可接
  const a1 = qs.available({ act: 1 });
  ok('act=1 时 3 个任务都可接（无更高 act 限制）', a1.length === 3, 'got ' + a1.length);
  // 改触发条件测过滤
  qs.defs.q_first.trigger = { act: 3 };
  const a1b = qs.available({ act: 1 });
  ok('act=1 时 q_first(act3触发)不可接', a1b.length === 2 && !a1b.find(q=>q.id==='q_first'));
}

// accept + active
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  ok('accept 返回 true', qs.accept('q_first') === true);
  ok('accept 后在 active 中', qs.active().length === 1 && qs.active()[0].id === 'q_first');
  ok('accept 后不在 available', qs.available({}).find(q => q.id === 'q_first') === undefined);
  ok('重复 accept 返回 false', qs.accept('q_first') === false);
  // 事件
  const ev = []; qs.on('accepted', id => ev.push(id));
  qs.accept('q_simple');
  ok('accept emit accepted 事件', ev.length === 1 && ev[0] === 'q_simple');
}

// progress + objectiveDone
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  qs.accept('q_first');
  const done = [];
  qs.on('objectiveDone', (id, oid) => done.push([id, oid]));
  qs.progress('talk', 'peer');
  ok('progress(talk,peer) 完成 o1', done.length === 1 && done[0][1] === 'o1');
  qs.progress('minigame', 'coding');
  ok('progress(minigame,coding) 完成 o2', done.length === 2);
  // 不匹配的 progress 不推进
  qs.progress('talk', 'vet');
  ok('不匹配 target 的 progress 不推进', done.length === 2);
  // 已完成的目标不再推进
  qs.progress('talk', 'peer');
  ok('已完成目标不重复推进', done.length === 2);
}

// isReady + complete + reward
{
  const state = makeState();
  const qs = new QuestSystem(state);
  qs.load(TEST_QUESTS);
  qs.accept('q_first');
  ok('未完成所有目标 isReady=false', qs.isReady('q_first') === false);
  qs.progress('talk', 'peer');
  qs.progress('minigame', 'coding');
  qs.progress('interact', 'computer');
  ok('全目标完成后 isReady=true', qs.isReady('q_first') === true);
  const ev = []; qs.on('completed', (id, reward) => ev.push([id, reward]));
  qs.complete('q_first');
  ok('complete emit completed 事件', ev.length === 1 && ev[0][0] === 'q_first');
  ok('奖励发到 state（skill +5）', state.stats.skill === 15);
  ok('奖励 money +200', state.stats.money === 200);
  ok('complete 后在 done 中', qs.done().length === 1);
  ok('complete 后不在 active', qs.active().length === 0);
  ok('完成后 complete 再调返回 false', qs.complete('q_first') === false);
}

// 无目标任务：接了即可交
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  qs.accept('q_noobj');
  ok('无目标任务 accept 后 isReady=true', qs.isReady('q_noobj') === true);
  qs.complete('q_noobj');
  ok('无目标任务可完成', qs.done().length === 1);
}

// npcMark
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  qs.accept('q_first'); // q_first giver=senior，o1 是 talk peer
  ok('senior 标记=null（已接，无新可接）', qs.npcMark('senior') === null || qs.npcMark('senior') === 'deliver');
  // vet 有可接任务（q_noobj giver=vet）
  ok('vet 标记=available（有未接任务）', qs.npcMark('vet') === 'available');
  // peer 既有可接(q_simple)又有进行中 talk 目标——available 优先
  ok('peer 标记=available（可接优先于进行中）', qs.npcMark('peer') === 'available');
}

// serialize / restore 往返
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  qs.accept('q_first');
  qs.progress('talk', 'peer');
  qs.accept('q_simple');
  qs.progress('talk', 'vet'); // 完成 q_simple 的唯一目标
  qs.complete('q_simple');    // 现在能完成
  const data = qs.serialize();
  ok('serialize 含 accepted(q_first)', Object.keys(data.accepted).length === 1 && data.accepted.q_first);
  ok('serialize 含 completed(q_simple)', data.completed.length === 1 && data.completed[0] === 'q_simple');
  ok('serialize 记录 objective 进度', data.accepted.q_first.objectives.o1 === true);

  // restore
  const qs2 = new QuestSystem(makeState());
  qs2.load(TEST_QUESTS);
  qs2.restore(data);
  ok('restore 后 active 含 q_first', qs2.active().find(q => q.id === 'q_first') !== undefined);
  ok('restore 后 done 含 q_simple', qs2.done().find(q => q.id === 'q_simple') !== undefined);
  ok('restore 后 q_first o1 仍完成', qs2.accepted.q_first.objectives.o1 === true);
  qs2.progress('minigame', 'coding');
  qs2.progress('interact', 'computer');
  ok('restore 后能继续推进到完成', qs2.isReady('q_first') === true);
}

// restore 容错
{
  const qs = new QuestSystem(makeState());
  qs.load(TEST_QUESTS);
  qs.restore(null); ok('restore null 不抛', Object.keys(qs.accepted).length === 0);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
