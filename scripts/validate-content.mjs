#!/usr/bin/env node
// 内容完整性校验：taskchain ↔ roster、quests、interactables、story 图。
// 用法：node scripts/validate-content.mjs
// 退出码：0=通过，1=有致命错误
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public/data');

let errs = 0, warns = 0;
const error = (m) => { errs++; console.log(`  ❌ ${m}`); };
const warn = (m) => { warns++; console.log(`  ⚠  ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

function loadJson(rel) {
  const p = join(DATA, rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { error(`${rel} JSON 解析失败: ${e.message}`); return null; }
}

function questList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.quests)) return data.quests;
  return Object.values(data).filter(q => q && q.id);
}

console.log('\n=== 内容完整性校验 ===\n');

// 与 WorldScene WORK_LOOP_CAREERS 对齐
const WORK_LOOPS = {
  programmer: ['dev', 'test'],
  product: ['biz', 'ux'],
  admin: ['office', 'student'],
  designer: ['visual', 'ui'],
  operation: ['content', 'growth'],
  teacher: ['homeroom', 'subject'],
  doctor: ['clinic', 'nurse'],
  civilservant: ['window', 'desk'],
  sales: ['field', 'inside'],
  lawyer: ['litigation', 'corporate'],
};

function validateTaskchain(career, roles, rosterIds) {
  for (const role of roles) {
    const file = `taskchain_${career}_${role}.json`;
    const data = loadJson(file);
    if (!data) { error(`${file} 缺失`); continue; }
    const quests = questList(data);
    if (quests.length < 3) error(`${file} 任务环过少: ${quests.length}`);
    else ok(`${file}: ${quests.length} 环`);

    const ids = new Set(quests.map(q => q.id));
    for (const q of quests) {
      if (!q.id) { error(`${file}: 任务缺 id`); continue; }
      if (!q.title) warn(`${file}:${q.id} 缺 title`);
      if (!q.giver) error(`${file}:${q.id} 缺 giver`);
      else if (!rosterIds.has(q.giver)) error(`${file}:${q.id} giver「${q.giver}」不在 roster`);
      if (Array.isArray(q.requires)) {
        for (const rid of q.requires) {
          if (!ids.has(rid)) error(`${file}:${q.id} requires 未知任务「${rid}」`);
        }
      }
      for (const o of (q.objectives || [])) {
        if (!o.id || !o.kind) error(`${file}:${q.id} 目标缺 id/kind`);
        if (o.kind === 'talk' && o.target && !rosterIds.has(o.target)) {
          error(`${file}:${q.id} talk 目标「${o.target}」不在 roster`);
        }
        if (o.kind === 'minigame' && o.target && !['work', 'coding', 'review', 'affairs'].includes(o.target)) {
          warn(`${file}:${q.id} minigame target「${o.target}」非常见值`);
        }
      }
      if (q.talkLines) {
        for (const nid of Object.keys(q.talkLines)) {
          if (!rosterIds.has(nid)) error(`${file}:${q.id} talkLines key「${nid}」不在 roster`);
        }
      }
      if (q.progressGain == null) warn(`${file}:${q.id} 缺 progressGain`);
    }
    const roots = quests.filter(q => !q.requires || q.requires.length === 0);
    if (roots.length === 0) error(`${file} 没有无前置的起点任务`);
    else ok(`${file} 起点: ${roots.map(q => q.id).join(',')}`);
  }
}

for (const [career, roles] of Object.entries(WORK_LOOPS)) {
  console.log(`· ${career} 任务链 ↔ 名册`);
  const roster = loadJson(`roster_${career}.json`);
  const rosterIds = new Set((roster?.npcs || []).map(n => n.id));
  if (!roster || rosterIds.size === 0) error(`roster_${career}.json 缺失或无 npcs`);
  else ok(`${career} roster: ${[...rosterIds].join(', ')}`);
  validateTaskchain(career, roles, rosterIds);
  console.log('');
}

console.log('· 工作日循环数据');
for (const career of Object.keys(WORK_LOOPS)) {
  const wo = loadJson(`work_orders_${career}.json`);
  const orders = wo?.orders || [];
  if (orders.length < 5) error(`${career} work_orders 过少: ${orders.length}`);
  else ok(`${career} work_orders: ${orders.length} 张`);
  for (const o of orders) {
    if (!o.id || !o.title) error(`${career} 工单缺 id/title`);
    if (o.progress == null || o.performance == null) warn(`${career} 工单 ${o.id} 缺 progress/performance`);
  }
  const ev = loadJson(`office_events_${career}.json`);
  const events = ev?.events || [];
  if (events.length < 3) error(`${career} office_events 过少: ${events.length}`);
  else ok(`${career} office_events: ${events.length} 个`);
  for (const e of events) {
    if (!e.id || !e.title) error(`${career} 事件缺 id/title`);
    if (!e.choices || e.choices.length < 2) error(`${career} 事件 ${e.id} 选项不足`);
  }
}
const onpcs = loadJson('office_npcs.json');
if (!onpcs?.workers?.length) warn('office_npcs.workers 为空');
else ok(`office_npcs workers: ${onpcs.workers.length}`);

console.log('\n· 全职业任务/交互文件');
const CAREERS = [
  'programmer', 'product', 'admin', 'designer', 'operation',
  'teacher', 'doctor', 'civilservant', 'sales', 'lawyer',
];
for (const c of CAREERS) {
  const qf = `quests_${c}.json`;
  const qd = loadJson(qf);
  if (!qd) warn(`${qf} 缺失`);
  else {
    const qs = questList(qd);
    if (qs.length === 0) warn(`${qf} 无任务`);
    else ok(`${qf}: ${qs.length} 任务`);
  }
  const inf = `interactables_${c}.json`;
  const ind = loadJson(inf);
  if (!ind) warn(`${inf} 缺失`);
  else {
    const list = ind.interactables || ind;
    const n = Array.isArray(list) ? list.length : 0;
    if (n === 0) warn(`${inf} 无交互物`);
    else ok(`${inf}: ${n} 交互`);
  }
}

console.log('\n· 剧情 JSON 可达性（内联）');
const storyFiles = [];
for (const c of ['programmer', 'product', 'admin']) {
  for (let a = 1; a <= 5; a++) storyFiles.push(`${c}_act${a}.json`);
}
for (const c of ['designer', 'operation', 'teacher', 'doctor', 'civilservant', 'sales', 'lawyer']) {
  storyFiles.push(`light_${c}.json`);
}
for (const file of storyFiles) {
  const d = loadJson(file);
  if (!d) { error(`${file} 缺失`); continue; }
  const nodes = d.nodes || {};
  const ids = new Set(Object.keys(nodes));
  if (!d.start || !ids.has(d.start)) { error(`${file} start 无效`); continue; }
  const reachable = new Set();
  const queue = [d.start];
  reachable.add(d.start);
  let hasTerminal = false;
  let localErr = 0;
  while (queue.length) {
    const id = queue.shift();
    const n = nodes[id];
    if (!n) continue;
    const choices = n.choices || [];
    if (choices.length === 0) {
      if (n.action === 'next_act' || n.action === 'ending') hasTerminal = true;
    }
    for (const c of choices) {
      if (!c.next) { error(`${file}:${id} 选项缺 next`); localErr++; continue; }
      if (!ids.has(c.next)) { error(`${file}:${id} → 不存在的 ${c.next}`); localErr++; continue; }
      if (!reachable.has(c.next)) { reachable.add(c.next); queue.push(c.next); }
    }
  }
  if (!hasTerminal) error(`${file} 无 next_act/ending 终点`);
  else if (localErr === 0) ok(`${file}: 节点${ids.size} 可达${reachable.size}`);
}

console.log('\n· 小游戏题库');
function countPuzzles(d) {
  if (!d) return 0;
  if (Array.isArray(d)) return d.length;
  for (const k of ['puzzles', 'questions', 'levels', 'items']) {
    if (Array.isArray(d[k])) return d[k].length;
  }
  let n = 0;
  for (const k of Object.keys(d)) {
    if (k === '_meta') continue;
    if (Array.isArray(d[k])) n += d[k].length;
  }
  return n;
}
for (const f of ['debug_puzzles.json', 'sequence_puzzles.json', 'minigame_coding.json', 'minigame_review.json', 'minigame_affairs.json']) {
  const d = loadJson(f);
  if (!d) { warn(`${f} 缺失`); continue; }
  const n = countPuzzles(d);
  if (n === 0) warn(`${f} 无题目`);
  else ok(`${f}: ${n} 题/关`);
}

// 程序员真实玩法题库：代码评审 / 写测试用例（P2）
{
  const cr = loadJson('code_review_puzzles.json');
  if (!Array.isArray(cr) || cr.length < 3) error('code_review_puzzles 少于3题');
  else {
    let bad = 0;
    for (const p of cr) {
      if (!Array.isArray(p.diff) || p.badIndex == null || p.badIndex < 0 || p.badIndex >= p.diff.length) bad++;
      else if (!p.category || !Array.isArray(p.options) || !p.options.includes(p.category)) bad++;
    }
    if (bad) error(`code_review_puzzles ${bad} 题 badIndex/category 非法`);
    else ok(`code_review_puzzles: ${cr.length} 题（badIndex/category 合法）`);
  }
  const tc = loadJson('test_case_puzzles.json');
  if (!Array.isArray(tc) || tc.length < 3) error('test_case_puzzles 少于3题');
  else {
    let bad = 0;
    for (const p of tc) {
      if (!Array.isArray(p.cases) || p.cases.length < 3) { bad++; continue; }
      if (!p.cases.some(c => c.mustCover)) bad++;      // 至少一个必测
      if (!p.cases.some(c => !c.mustCover)) bad++;     // 至少一个干扰项
    }
    if (bad) error(`test_case_puzzles ${bad} 题 cases 覆盖不合法`);
    else ok(`test_case_puzzles: ${tc.length} 题（必测/干扰项齐全）`);
  }
}


// sequence 职业分叉键（与 MinigameFlavor sequenceKey 对齐）
{
  const seq = loadJson('sequence_puzzles.json');
  const need = ['dev', 'test', 'product', 'admin', 'design', 'ops', 'teach', 'medical', 'gov', 'sales', 'law'];
  if (seq) {
    for (const k of need) {
      if (!Array.isArray(seq[k]) || seq[k].length < 2) error(`sequence_puzzles 缺/少 ${k}`);
      else ok(`sequence flavor ${k}: ${seq[k].length} 题`);
    }
  }
}


// debug 职业分池（与 MinigameFlavor.key 对齐）
{
  const dbg = loadJson('debug_puzzles.json');
  if (dbg) {
    if (!Array.isArray(dbg.puzzles) || dbg.puzzles.length < 3) warn('debug_puzzles.puzzles 过少（兼容旧字段）');
    else ok(`debug_puzzles.puzzles(兼容): ${dbg.puzzles.length}`);
    const pools = dbg.pools || {};
    const need = ['dev', 'test', 'product', 'admin', 'design', 'ops', 'teach', 'medical', 'gov', 'sales', 'law'];
    for (const k of need) {
      const arr = pools[k];
      if (!Array.isArray(arr) || arr.length < 2) error(`debug pools 缺/少 ${k}`);
      else {
        const bad = arr.filter(p => !p || !Array.isArray(p.lines) || !Number.isInteger(p.bugLine));
        if (bad.length) error(`debug pool ${k} 有 ${bad.length} 条缺 lines/bugLine`);
        else ok(`debug pool ${k}: ${arr.length} 题`);
      }
    }
  }
}

console.log(`\n${errs === 0 ? '✅ 内容校验通过' : '❌ 内容校验失败'} (${errs} errors, ${warns} warns)\n`);
process.exit(errs === 0 ? 0 : 1);
