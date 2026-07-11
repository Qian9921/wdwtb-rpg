// ChoiceLog 单元测试（纯 Node，无 Phaser）。
// 运行：node scripts/test-choicelog.mjs
import { ChoiceLog } from '../src/systems/ChoiceLog.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== ChoiceLog 单元测试 ===\n');

// 基础记录
{
  const cl = new ChoiceLog();
  ok('初始 length=0', cl.length === 0);
  cl.record({ act: 1, nodeId: 'n1', choiceLabel: '加班赶工', tag: 'overwork' });
  cl.record({ act: 1, nodeId: 'n2', choiceLabel: '报喜不报忧', tag: 'report_good_news' });
  cl.record({ act: 2, nodeId: 'n3', choiceLabel: '继续加班', tag: 'overwork' });
  ok('记录后 length=3', cl.length === 3);
  ok('每条含 ts 时间戳', typeof cl.entries[0].ts === 'number');
}

// tag 聚合
{
  const cl = new ChoiceLog();
  cl.record({ tag: 'overwork' });
  cl.record({ tag: 'report_good_news' });
  cl.record({ tag: 'overwork' });
  cl.record({ tag: 'overwork' });
  cl.record({ tag: 'self_care' });
  const counts = cl.tagCounts();
  ok('tagCounts 返回聚合对象', counts.overwork === 3, JSON.stringify(counts));
  ok('count(tag) 正确', cl.count('overwork') === 3);
  ok('has(tag) 至少1次', cl.has('overwork') === true);
  ok('has(tag) 至少5次为 false', cl.has('overwork', 5) === false);
  ok('未记录的 tag count=0', cl.count('nonexistent') === 0);
}

// 无 tag 的记录不参与聚合但保留
{
  const cl = new ChoiceLog();
  cl.record({ choiceLabel: '随便选' });
  cl.record({ tag: 'overwork' });
  ok('无 tag 记录仍计入 length', cl.length === 2);
  ok('无 tag 不进 tagCounts', Object.keys(cl.tagCounts()).length === 1);
}

// axes 聚合（人格轴累计）
{
  const cl = new ChoiceLog();
  cl.record({ tag: 'solo', axes: { collab: -2 } });
  cl.record({ axes: { collab: -2, plan: 1 } });
  cl.record({ axes: { risk: 3 } });
  cl.record({ choiceLabel: '无轴' }); // 无 axes
  const totals = cl.axisTotals();
  ok('axisTotals 聚合 collab=-4', totals.collab === -4, JSON.stringify(totals));
  ok('axisTotals 聚合 plan=1', totals.plan === 1);
  ok('axisTotals 聚合 risk=3', totals.risk === 3);
  ok('无 axes 不影响聚合', Object.keys(totals).length === 3);
  ok('axes 存进 entry', cl.entries[0].axes.collab === -2);
  ok('无 axes 记录 axes=null', cl.entries[3].axes === null);
}

// axes serialize/restore 往返
{
  const cl = new ChoiceLog();
  cl.record({ axes: { collab: -2 }, tag: 't' });
  const cl2 = new ChoiceLog();
  cl2.restore(cl.serialize());
  ok('restore 后 axisTotals 一致', cl2.axisTotals().collab === -2);
}

// recent / byAct
{
  const cl = new ChoiceLog();
  for (let i = 0; i < 15; i++) cl.record({ act: i < 5 ? 1 : 2, choiceLabel: `选${i}`, tag: 't' });
  ok('recent(10) 返回最后10条', cl.recent(10).length === 10);
  ok('byAct(1) 返回 act1 的5条', cl.byAct(1).length === 5);
  ok('byAct(2) 返回 act2 的10条', cl.byAct(2).length === 10);
}

// serialize / restore 往返
{
  const cl = new ChoiceLog();
  cl.record({ act: 1, nodeId: 'a', choiceLabel: 'x', tag: 't1' });
  cl.record({ act: 2, nodeId: 'b', choiceLabel: 'y', tag: 't2' });
  const data = cl.serialize();
  const cl2 = new ChoiceLog();
  cl2.restore(data);
  ok('serialize→restore 往返 length 一致', cl2.length === 2);
  ok('restore 后 tagCounts 一致', JSON.stringify(cl2.tagCounts()) === JSON.stringify(cl.tagCounts()));
  ok('restore 后记录内容一致', cl2.entries[0].tag === 't1' && cl2.entries[1].nodeId === 'b');
}

// restore 容错
{
  const cl = new ChoiceLog();
  cl.restore(null); ok('restore null 不抛错', cl.length === 0);
  cl.restore('notarray'); ok('restore 非数组不抛错', cl.length === 0);
  cl.restore(undefined); ok('restore undefined 不抛错', cl.length === 0);
}

// clear
{
  const cl = new ChoiceLog();
  cl.record({ tag: 'x' }); cl.record({ tag: 'y' });
  cl.clear();
  ok('clear 后 length=0', cl.length === 0);
}

// 缺省字段容错
{
  const cl = new ChoiceLog();
  cl.record(); // 全空
  cl.record({ tag: 'ok' });
  ok('record() 无参不抛错', cl.length === 2);
  ok('空记录 tag=null', cl.entries[0].tag === null);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
