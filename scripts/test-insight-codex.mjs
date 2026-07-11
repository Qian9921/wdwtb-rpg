// InsightCodex 单元测试（纯 Node）。运行：node scripts/test-insight-codex.mjs
import { INSIGHTS, getInsight, unlockedInsights, newlyUnlocked, INSIGHT_TOTAL } from '../src/systems/InsightCodex.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== InsightCodex 单元测试 ===\n');

ok('目录非空', INSIGHTS.length >= 8 && INSIGHT_TOTAL === INSIGHTS.length);
ok('每条含 id/title/text/tag/times', INSIGHTS.every(i => i.id && i.title && i.text && i.tag && i.times >= 1));
ok('id 唯一', new Set(INSIGHTS.map(i => i.id)).size === INSIGHTS.length);

// getInsight
ok('getInsight 命中', getInsight('ins_solo')?.title === '一个人也能扛');
ok('getInsight 未知返回 null', getInsight('nope') === null);

// unlockedInsights：阈值判定
{
  ok('solo×3 解锁', unlockedInsights({ solo: 3 }).includes('ins_solo'));
  ok('solo×2 未解锁', !unlockedInsights({ solo: 2 }).includes('ins_solo'));
  ok('bold×1 即解锁', unlockedInsights({ bold: 1 }).includes('ins_bold'));
  ok('空计数不解锁', unlockedInsights({}).length === 0);
  const multi = unlockedInsights({ solo: 3, please: 3, safe: 1 });
  ok('多标签同时解锁', multi.includes('ins_solo') && multi.includes('ins_please') && multi.includes('ins_safe'), JSON.stringify(multi));
}

// newlyUnlocked：排除已拥有
{
  const nw = newlyUnlocked({ solo: 3, bold: 1 }, ['ins_solo']);
  ok('newlyUnlocked 排除已拥有', nw.includes('ins_bold') && !nw.includes('ins_solo'), JSON.stringify(nw));
  ok('全已拥有则为空', newlyUnlocked({ solo: 3 }, ['ins_solo']).length === 0);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
