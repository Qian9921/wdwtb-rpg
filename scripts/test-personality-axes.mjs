// PersonalityAxes 单元测试（纯 Node）。运行：node scripts/test-personality-axes.mjs
import {
  AXIS_KEYS, normalizeAxes, axisReading, personalitySignature, axisHighlights, buildAxesProfile, microInsight, axesFromBig5,
} from '../src/systems/PersonalityAxes.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== PersonalityAxes 单元测试 ===\n');

// normalize：空 → 全 0
{
  const a = normalizeAxes({});
  ok('空输入四轴齐全且为0', AXIS_KEYS.every(k => a[k] === 0), JSON.stringify(a));
}

// normalize：单调、收敛、正负对称
{
  const small = normalizeAxes({ collab: 4 });
  const big = normalizeAxes({ collab: 40 });
  ok('小累计 < 大累计（单调）', small.collab < big.collab, `${small.collab} vs ${big.collab}`);
  ok('大累计接近满极但不超100', big.collab > 60 && big.collab <= 100, String(big.collab));
  const neg = normalizeAxes({ collab: -40 });
  ok('负向对称', neg.collab === -big.collab, `${neg.collab} vs ${-big.collab}`);
}

// axisReading 极性
{
  ok('强正→pos', axisReading(40).pole === 'pos');
  ok('强负→neg', axisReading(-40).pole === 'neg');
  ok('接近0→mid', axisReading(5).pole === 'mid');
}

// 四字签
{
  // collab+（协作）, plan-（随性）, empathy+（共情）, risk-（求稳）
  const axes = normalizeAxes({ collab: 40, plan: -40, empathy: 40, risk: -40 });
  const sig = personalitySignature(axes);
  ok('四字签长度=4', sig.code.length === 4, sig.code);
  ok('四字签=协随共稳', sig.code === '协随共稳', sig.code);
  ok('parts 含 char 单字', sig.parts.every(p => typeof p.char === 'string' && p.char.length === 1));
}

// 强项/盲点：只对鲜明倾向给结论
{
  const weak = axisHighlights(normalizeAxes({ collab: 2 }));
  ok('弱倾向不产出强项', weak.strengths.length === 0);
  const strong = axisHighlights(normalizeAxes({ collab: -40, risk: 40 }));
  ok('鲜明倾向产出强项', strong.strengths.length >= 1, JSON.stringify(strong.strengths.map(s => s.axis)));
  ok('每个强项配盲点', strong.blindspots.length >= 1);
  ok('强项最多3条', axisHighlights(normalizeAxes({ collab: 40, plan: 40, empathy: 40, risk: 40 })).strengths.length <= 3);
}

// buildAxesProfile 一站式
{
  const p = buildAxesProfile({ collab: -30, plan: 20 });
  ok('含 axes/signature/strengths/blindspots', !!p.axes && !!p.signature && !!p.strengths && !!p.blindspots);
  ok('独立倾向→签首字为独', p.signature.parts[0].label === '独立', p.signature.code);
}

// axesFromBig5（开场问卷派生 4 轴基线）
{
  const a = axesFromBig5({ E: 3, C: 4, A: -2, O: 2, N: 1 });
  ok('E→collab', a.collab > 0 && a.collab === Math.round(3 * 1.4));
  ok('C→plan', a.plan === Math.round(4 * 1.4));
  ok('A负→empathy负', a.empathy < 0);
  ok('O-N/2→risk', a.risk === Math.round((2 - 0.5) * 1.4));
  ok('空输入四轴齐全为0', ['collab', 'plan', 'empathy', 'risk'].every(k => axesFromBig5({})[k] === 0));
}

// microInsight
{
  ok('鲜明独立→独处洞察', microInsight(normalizeAxes({ collab: -40 })).includes('独处'));
  ok('鲜明冒险→押注洞察', microInsight(normalizeAxes({ risk: 40 })).includes('押注'));
  ok('都不鲜明→通用鼓励', microInsight(normalizeAxes({ collab: 2 })).includes('慢慢拼'));
  ok('空输入不崩', typeof microInsight({}) === 'string');
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
