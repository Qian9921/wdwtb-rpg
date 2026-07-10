// 断言：quests_* 的 interact 目标在对应 interactables_* 中存在（真实 JSON，无 reimplement）。
// 运行：node scripts/test-interactables-quests.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public/data');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

function load(name) {
  const p = join(DATA, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function questList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.quests)) return data.quests;
  return [];
}

console.log('\n=== Interactables ↔ Quests ===\n');

const CAREERS = [
  'programmer', 'product', 'admin', 'designer', 'operation',
  'teacher', 'doctor', 'civilservant', 'sales', 'lawyer',
];

// 程序员主线 o3 必须能完成：computer 交互点存在
const progI = load('interactables_programmer.json');
const progIds = new Set((progI?.interactables || []).map(x => x.id));
ok('programmer 有 interactables', progIds.size > 0);
ok('programmer 有 computer（quests o3 目标）', progIds.has('computer'));
ok('programmer 有 phone 或 window（日常交互）', progIds.has('phone') || progIds.has('window'));
ok('programmer computer action 可触发', !!(progI?.interactables || []).find(x => x.id === 'computer' && x.action));

const progQ = load('quests_programmer.json');
const qFirst = questList(progQ).find(q => q.id === 'q_first_commit');
ok('quests 含 q_first_commit', !!qFirst);
if (qFirst) {
  const o3 = (qFirst.objectives || []).find(o => o.id === 'o3');
  ok('q_first_commit.o3 kind=interact', o3 && o3.kind === 'interact');
  ok('q_first_commit.o3 target=computer', o3 && o3.target === 'computer');
  ok('o3 target 在 interactables 中', o3 && progIds.has(o3.target));
}

// 全职业：每个 interact 目标都能找到 id（文件缺失则 skip 该职业）
for (const c of CAREERS) {
  const iq = load(`interactables_${c}.json`);
  const qq = load(`quests_${c}.json`);
  if (!iq || !qq) continue;
  const ids = new Set((iq.interactables || []).map(x => x.id));
  const missing = [];
  for (const q of questList(qq)) {
    for (const o of (q.objectives || [])) {
      if (o.kind === 'interact' && o.target && !ids.has(o.target)) {
        missing.push(`${q.id}.${o.id}→${o.target}`);
      }
    }
  }
  ok(`${c}: interact 目标均有物件`, missing.length === 0, missing.slice(0, 3).join(', '));
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
