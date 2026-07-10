// CareerFit 单测：测评推荐 + 体感信号 + 报告上下文（服务初衷三柱）
import {
  CAREER_ANCHORS, CAREER_NAMES,
  scoreCareer, rankCareers, buildTryFirstAdvice,
  bodySignalsFromStats, summarizeChoices, buildEndingReportContext,
  buildReportHistoryEntry, mergeReportHistory,
} from '../src/systems/CareerFit.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); }
};

console.log('\n=== CareerFit ===\n');

ok('10 职业锚点齐全', Object.keys(CAREER_ANCHORS).length === 10);
ok('每职业有 why/tryHint', Object.values(CAREER_ANCHORS).every(a => a.why && a.tryHint && a.codes?.length));

// 高 I/R 应更偏程序员
const geek = {
  riasec: { R: 4, I: 8, A: 1, S: 1, E: 1, C: 3 },
  holland: 'IRC',
  big5: { O: 1, C: 1, E: -1, A: 0, N: 0 },
};
const salesy = {
  riasec: { R: 1, I: 1, A: 2, S: 5, E: 9, C: 2 },
  holland: 'ESA',
};
ok('geek 程序员分 > 销售', scoreCareer(geek, 'programmer') > scoreCareer(geek, 'sales'));
ok('salesy 销售分 > 程序员', scoreCareer(salesy, 'sales') > scoreCareer(salesy, 'programmer'));

const ranked = rankCareers(geek);
ok('rank 长度 10', ranked.length === 10);
ok('rank 降序', ranked.every((x, i) => i === 0 || ranked[i - 1].score >= x.score));
ok('geek top1 合理(I/R 向)', ['programmer', 'lawyer', 'doctor', 'product'].includes(ranked[0].key));

const advice = buildTryFirstAdvice(geek, 2);
ok('tryFirst 两条', advice.tryFirst.length === 2);
ok('headline 含职业名', advice.headline.includes(advice.tryFirst[0].name));
ok('detail 有 reason', advice.detail[0].reason.length > 5);

const bodyHiStress = bodySignalsFromStats({ stress: 80, health: 30, passion: 20, energy: 20 });
ok('高压出信号', bodyHiStress.signals.some(s => s.includes('压力') || s.includes('健康') || s.includes('热情')));
const bodyOk = bodySignalsFromStats({ stress: 30, health: 80, passion: 75, energy: 70 });
ok('平稳/热情有信号', bodyOk.signals.length >= 1);

const sum = summarizeChoices([
  { tag: 'people', choiceLabel: '找队友' },
  { tag: 'people', choiceLabel: '再找人' },
  { tag: 'solo', choiceLabel: '自己扛' },
  { choiceLabel: '最后一搏' },
]);
ok('repeated people', sum.repeated.some(r => r.includes('people')));
ok('summary 非空', sum.text.length > 10);

const ctx = buildEndingReportContext({
  career: 'programmer',
  subRole: 'dev',
  stats: { stress: 75, health: 40, passion: 55, energy: 35, skill: 50, performance: 60, san: 45 },
  choiceLog: [{ tag: 'overwork', choiceLabel: '通宵' }, { tag: 'overwork', choiceLabel: '再肝' }],
  profile: geek,
  projectProgress: 88,
});
ok('ctx 含职业名', ctx.careerName === '程序员');
ok('ctx fitScore 数字', typeof ctx.fitScore === 'number' && ctx.fitScore > 0);
ok('promptBlock 含本局', ctx.promptBlock.includes('程序员') && ctx.promptBlock.includes('信号'));
ok('summaryLine 可读', ctx.summaryLine.includes('程序员'));

const entry = buildReportHistoryEntry(ctx, { oneLineForYou: '试试', fitText: '契合' });
ok('history entry career', entry.career === 'programmer');
const hist = mergeReportHistory([{ career: 'old' }], entry, 2);
ok('history 新在前', hist[0].career === 'programmer' && hist.length === 2);
ok('history 截断', mergeReportHistory([1, 2, 3], entry, 2).length === 2);

// CAREER_NAMES 与锚点 key 一致
ok('NAMES 覆盖锚点', Object.keys(CAREER_ANCHORS).every(k => CAREER_NAMES[k]));

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
