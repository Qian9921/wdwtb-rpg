// 剧情图完整性校验：每个 next 指向存在的节点、start 存在、终点带 next_act/ending、无孤儿。
// 用法：node scripts/validate-story.mjs public/data/programmer_act1.json [...more]
import { readFileSync } from 'fs';

const VALID_ACTIONS = new Set(['plant_tree','write_letter','enter_mindscape','next_act','ending',
  'minigame:coding','minigame:review','minigame:affairs']);
const VALID_AXES = new Set(['collab','plan','empathy','risk']);

let totalFail = 0;
for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const nodes = d.nodes || {};
  const ids = new Set(Object.keys(nodes));
  const errs = [];
  const warns = [];
  if (!d.start || !ids.has(d.start)) errs.push(`start '${d.start}' 不存在`);

  // 引用完整性 + 可达性
  const reachable = new Set();
  const queue = d.start && ids.has(d.start) ? [d.start] : [];
  reachable.add(d.start);
  let hasTerminal = false;
  while (queue.length) {
    const id = queue.shift();
    const n = nodes[id];
    if (!n) continue;
    if (n.action && !VALID_ACTIONS.has(n.action)) warns.push(`节点 ${id} action '${n.action}' 非已知动作`);
    const choices = n.choices || [];
    if (choices.length === 0) {
      if (n.action === 'next_act' || n.action === 'ending') hasTerminal = true;
      else warns.push(`节点 ${id} 无 choices 且非 next_act/ending 终点(会卡死)`);
    }
    for (const c of choices) {
      if (!c.next) { errs.push(`节点 ${id} 的选项「${c.label}」缺 next`); continue; }
      if (!ids.has(c.next)) { errs.push(`节点 ${id} → '${c.next}' 目标不存在`); continue; }
      // axes 键合法性（人格轴增量）
      if (c.axes) {
        for (const [ak, av] of Object.entries(c.axes)) {
          if (!VALID_AXES.has(ak)) errs.push(`节点 ${id} 选项 axes 未知轴 '${ak}'`);
          else if (!Number.isFinite(Number(av))) errs.push(`节点 ${id} 选项 axes.${ak} 非数值`);
        }
      }
      // condition.subRole / condition.axis 合法性
      if (c.condition && c.condition.axis) {
        for (const ak of Object.keys(c.condition.axis)) {
          if (!VALID_AXES.has(ak)) errs.push(`节点 ${id} 选项 condition.axis 未知轴 '${ak}'`);
        }
      }
      if (!reachable.has(c.next)) { reachable.add(c.next); queue.push(c.next); }
    }
  }
  // 孤儿节点（不可达）
  for (const id of ids) if (!reachable.has(id)) warns.push(`孤儿节点(不可达): ${id}`);
  if (!hasTerminal) errs.push('没有 next_act/ending 终点节点');

  const tag = errs.length ? '❌' : '✅';
  console.log(`\n${tag} ${file}  节点=${ids.size} 可达=${reachable.size}`);
  errs.forEach(e => console.log('   ERROR: ' + e));
  warns.forEach(w => console.log('   warn : ' + w));
  totalFail += errs.length;
}
console.log(totalFail ? `\n共 ${totalFail} 个致命错误` : '\n全部通过');
process.exit(totalFail ? 1 : 0);
