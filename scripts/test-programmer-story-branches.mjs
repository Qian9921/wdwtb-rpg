// 程序员五章·子职业分支可玩性单测（纯 Node）。
// 校验：dev 与 test 两条路径都能从 start 走到 next_act/ending；分叉节点两支都在；
// axes 键合法；第五章 5 个结局 id 齐全。运行：node scripts/test-programmer-story-branches.mjs
import { readFileSync } from 'fs';
import { checkChoiceCondition } from '../src/systems/DialogueRules.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== 程序员五章 · 子职业分支可玩性 ===\n');

const acts = [1, 2, 3, 4, 5].map(n => JSON.parse(readFileSync(`public/data/programmer_act${n}.json`, 'utf8')));
const VALID_AXES = new Set(['collab', 'plan', 'empathy', 'risk']);

// 模拟一条路径：给定 subRole，从 start BFS，选项按 subRole 过滤（stat/axis 条件视为可走，
// 因为状态因人而异——本测只验「子职业分支不会把路走断」）。要求能到达 next_act/ending 终点。
function reachesTerminal(data, subRole) {
  const nodes = data.nodes;
  const seen = new Set([data.start]);
  const queue = [data.start];
  let terminal = false;
  while (queue.length) {
    const n = nodes[queue.shift()];
    if (!n) continue;
    const choices = n.choices || [];
    if (choices.length === 0) {
      if (n.action === 'next_act' || n.action === 'ending') terminal = true;
      continue;
    }
    // 只保留 subRole 匹配（或无 subRole 门控）的选项；其余条件放行
    const visible = choices.filter(c => {
      const cond = c.condition;
      if (cond && cond.subRole) {
        const want = Array.isArray(cond.subRole) ? cond.subRole : [cond.subRole];
        return want.includes(subRole);
      }
      return true;
    });
    // 该 subRole 下必须至少有一个可走选项（否则走断）
    if (visible.length === 0) return { terminal: false, deadNode: Object.keys(nodes).find(k => nodes[k] === n) };
    for (const c of visible) {
      if (c.next && !seen.has(c.next)) { seen.add(c.next); queue.push(c.next); }
    }
  }
  return { terminal };
}

for (const subRole of ['dev', 'test']) {
  for (let i = 0; i < acts.length; i++) {
    const r = reachesTerminal(acts[i], subRole);
    ok(`${subRole} · 第${i + 1}章可走到终点`, r.terminal, r.deadNode ? `断在 ${r.deadNode}` : '无终点');
  }
}

// 分叉节点：每个带 subRole 门控的节点，dev 和 test 都得有对应支
for (let i = 0; i < acts.length; i++) {
  const nodes = acts[i].nodes;
  for (const [id, n] of Object.entries(nodes)) {
    const gated = (n.choices || []).filter(c => c.condition && c.condition.subRole);
    if (!gated.length) continue;
    const roles = new Set();
    gated.forEach(c => { const w = Array.isArray(c.condition.subRole) ? c.condition.subRole : [c.condition.subRole]; w.forEach(x => roles.add(x)); });
    ok(`第${i + 1}章 分叉节点 ${id} 含 dev+test 两支`, roles.has('dev') && roles.has('test'), [...roles].join(','));
  }
}

// axes 键合法
{
  let bad = 0;
  for (const data of acts) for (const n of Object.values(data.nodes)) for (const c of (n.choices || [])) {
    if (c.axes) for (const k of Object.keys(c.axes)) if (!VALID_AXES.has(k)) bad++;
  }
  ok('所有 axes 键合法', bad === 0, `非法 ${bad} 处`);
}

// 第五章 5 个结局 id 齐全
{
  const endings = new Set();
  for (const n of Object.values(acts[4].nodes)) if (n.action === 'ending' && n.ending) endings.add(n.ending);
  const need = ['backbone', 'switch', 'health', 'quit', 'light'];
  ok('第五章含 5 个职业探索画像结局', need.every(e => endings.has(e)), [...endings].join(','));
}

// 条件可用性抽查：checkChoiceCondition 对 subRole 生效
{
  const c = { subRole: 'dev' };
  ok('condition subRole 判定正确', checkChoiceCondition(c, () => 0, { subRole: 'dev' }) && !checkChoiceCondition(c, () => 0, { subRole: 'test' }));
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
