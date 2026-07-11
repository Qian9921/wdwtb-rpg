// MinigameScoring 单元测试（纯 Node）。运行：node scripts/test-minigame-scoring.mjs
import { normalizeQuality, valueGainFor, playStyleAxes, scoreMinigame } from '../src/systems/MinigameScoring.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== MinigameScoring 单元测试 ===\n');

// normalizeQuality
{
  ok('全对→quality≈1', normalizeQuality({ correct: 3, total: 3 }).quality === 1);
  ok('全错→quality=0', normalizeQuality({ correct: 0, total: 3 }).quality === 0);
  const half = normalizeQuality({ correct: 2, total: 4 });
  ok('半对→ratio0.5', half.ratio === 0.5);
  ok('连击加成有上限0.1', normalizeQuality({ correct: 1, total: 10, maxCombo: 99 }).comboBonus === 0.1);
  ok('quality 不超1', normalizeQuality({ correct: 3, total: 3, maxCombo: 9 }).quality === 1);
  ok('total=0 不崩', Number.isFinite(normalizeQuality({}).quality));
  ok('correct 超 total 被夹', normalizeQuality({ correct: 9, total: 3 }).ratio === 1);
}

// valueGainFor
{
  const g = valueGainFor({ quality: 1, kind: 'review', subRole: 'dev' });
  ok('评审→含专业增益', g.pro >= 6, JSON.stringify(g));
  const t = valueGainFor({ quality: 0.8, kind: 'gate', subRole: 'test' });
  ok('test门禁→执行更高', t.exec >= 3, JSON.stringify(t));
}

// playStyleAxes
{
  ok('又快又准→冒险+', playStyleAxes({ timeUsedRatio: 0.3, maxCombo: 3, ratio: 0.8 }).risk === 1);
  ok('慢工细活→规划+', playStyleAxes({ timeUsedRatio: 0.8, maxCombo: 0, ratio: 0.7 }).plan === 1);
  ok('中庸不推轴', Object.keys(playStyleAxes({ timeUsedRatio: 0.5, maxCombo: 0, ratio: 0.5 })).length === 0);
}

// scoreMinigame 一站式
{
  const s = scoreMinigame({ correct: 3, total: 3, maxCombo: 3 }, { kind: 'review', subRole: 'dev', timeUsedRatio: 0.3 });
  ok('含 quality/valueGain/axes', typeof s.quality === 'number' && !!s.valueGain && !!s.axes);
  ok('全对高质量', s.quality === 1);
  ok('快准推冒险', s.axes.risk === 1);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
