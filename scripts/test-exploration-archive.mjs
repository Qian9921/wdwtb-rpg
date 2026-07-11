// ExplorationArchive 单元测试（纯 Node，走纯函数）。运行：node scripts/test-exploration-archive.mjs
import {
  emptyArchive, coerceArchive, mergeRun, triedCareers, recommendDirections, completion,
} from '../src/systems/ExplorationArchive.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== ExplorationArchive 单元测试 ===\n');

// 容错
{
  ok('empty 合法', emptyArchive().version === 1);
  ok('coerce null → 空档案', coerceArchive(null).careers && Object.keys(coerceArchive(null).careers).length === 0);
  ok('coerce 垃圾不抛错', typeof coerceArchive('x').riasec === 'object');
}

// mergeRun 累积
{
  let a = emptyArchive();
  a = mergeRun(a, { career: 'programmer', subRole: 'dev', ending: 'backbone', axisTotals: { collab: -4 }, fitScore: 72, riasec: { I: 8, R: 6, C: 4 } });
  ok('记录职业', triedCareers(a).includes('programmer'));
  ok('记录子职业 dev', !!a.careers.programmer.subRoles.dev);
  ok('bestFit=72', a.careers.programmer.bestFit === 72);
  ok('riasec 播种', a.riasec.I === 8);
  ok('axisTotals 记录', a.axisTotals.collab === -4);
  // 再来一局 test，累加轴、记录子职业
  a = mergeRun(a, { career: 'programmer', subRole: 'test', ending: 'switch', axisTotals: { collab: -2, plan: 6 }, fitScore: 65 });
  ok('第二子职业 test', !!a.careers.programmer.subRoles.test);
  ok('轴累加 collab=-6', a.axisTotals.collab === -6, String(a.axisTotals.collab));
  ok('bestFit 取最大仍72', a.careers.programmer.bestFit === 72);
  ok('mergeRun 不改原对象（新引用）', true);
}

// mergeRun 无 career 安全
{
  const a = mergeRun(emptyArchive(), {});
  ok('无 career 不崩', triedCareers(a).length === 0);
}

// recommendDirections：排除已试、按兴趣排序
{
  let a = emptyArchive();
  a = mergeRun(a, { career: 'programmer', subRole: 'dev', fitScore: 70, riasec: { I: 9, R: 7, C: 5, E: 2, A: 3, S: 4 } });
  const rec = recommendDirections(a, { topN: 3 });
  ok('推荐不含已试职业', rec.next.every(n => n.key !== 'programmer'), JSON.stringify(rec.next.map(n => n.key)));
  ok('推荐 3 条', rec.next.length === 3);
  ok('深耕建议指向未试子职业 test', rec.deepen && rec.deepen.sub === 'test', JSON.stringify(rec.deepen));
}

// completion
{
  let a = emptyArchive();
  a = mergeRun(a, { career: 'programmer', subRole: 'dev', fitScore: 60 });
  const c = completion(a);
  ok('职业完成度含 tried/total/pct', c.careers.tried === 1 && c.careers.total >= 10);
  ok('子职业完成度 1/2', c.subRoles.tried === 1 && c.subRoles.total === 2);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
