// CareerReport 单元测试（纯 Node）。运行：node scripts/test-career-report.mjs
import { buildCareerReport } from '../src/systems/CareerReport.js';
import { mergeRun, emptyArchive } from '../src/systems/ExplorationArchive.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== CareerReport 单元测试 ===\n');

// 构造一局 choiceLog（带 axes）
// 一个"独立"倾向鲜明的玩家：多次在关键处选独立深工 + 求稳
const choiceLog = [
  { axes: { collab: -3 }, tag: 'solo' },
  { axes: { collab: -3 }, tag: 'solo' },
  { axes: { collab: -3 }, tag: 'solo' },
  { axes: { collab: -3 }, tag: 'solo' },
  { axes: { plan: 2 } },
  { axes: { risk: -4 } },
  { axes: { risk: -4 } },
  { axes: { risk: -3 } },
];
const archive = mergeRun(emptyArchive(), { career: 'programmer', subRole: 'dev', fitScore: 70, riasec: { I: 9, R: 7, C: 5, A: 3, S: 4, E: 2 } });

{
  const r = buildCareerReport({
    career: 'programmer', subRole: 'dev', ending: 'backbone',
    stats: { health: 70, stress: 40, passion: 60, skill: 55, performance: 60, san: 60, energy: 60 },
    choiceLog, archive, values: { pro: 60, comm: 30, resil: 45, exec: 50, empco: 25 },
    profile: { riasec: { I: 9, R: 7, C: 5, A: 3, S: 4, E: 2 } },
  });

  ok('含霍兰德码', /[RIASEC]{3}/.test(r.code), r.code);
  ok('原型含子职业造物者', r.archetype.includes('造物者'), r.archetype);
  ok('雷达六维齐全', ['R', 'I', 'A', 'S', 'E', 'C'].every(k => typeof r.radar[k] === 'number'));
  ok('四轴齐全', ['collab', 'plan', 'empathy', 'risk'].every(k => typeof r.axes[k] === 'number'));
  ok('独立倾向被测出（collab<0）', r.axes.collab < 0, String(r.axes.collab));
  ok('胜任力5条', r.competencies.length === 5);
  ok('强项带证据', r.strengths.length >= 1 && !!r.strengths[0].evidence, JSON.stringify(r.strengths));
  ok('证据含次数措辞', /\d+\s*次/.test(r.strengths[0].evidence), r.strengths[0].evidence);
  ok('3条探索方向', r.directions.length === 3, JSON.stringify(r.directions.map(d => d.name)));
  ok('方向含相邻角色', r.directions.some(d => d.type === 'adjacent'));
  ok('方向含横向未试职业', r.directions.some(d => d.type === 'career'));
  ok('方向不含当前职业(程序员)', r.directions.every(d => d.name !== '程序员'), JSON.stringify(r.directions.map(d => d.name)));
  ok('每个方向有"去做三件事"', r.directions.every(d => Array.isArray(d.doThree) && d.doThree.length >= 1));
  ok('含置信度', r.confidence && (r.confidence.level === 'clear' || r.confidence.level === 'exploring'));
  ok('含契合分', typeof r.fitScore === 'number');
  ok('含跨职业对比', !!r.contrast && typeof r.contrast.line === 'string');
  ok('headline 无溢出（<40字）', r.headline.length < 40, r.headline);
}

// 空输入不崩
{
  const r = buildCareerReport({});
  ok('空输入不崩且四轴齐全', ['collab', 'plan', 'empathy', 'risk'].every(k => typeof r.axes[k] === 'number'));
  ok('空输入仍有方向', r.directions.length >= 1);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
