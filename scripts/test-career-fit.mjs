// CareerFit 单测：测评推荐 + 体感信号 + 报告上下文（服务初衷三柱）
import {
  CAREER_ANCHORS, CAREER_NAMES,
  scoreCareer, rankCareers, buildTryFirstAdvice,
  bodySignalsFromStats, summarizeChoices, buildEndingReportContext,
  buildReportHistoryEntry, mergeReportHistory,
  formatTriedCareersLine, resolveInteractGoalPos, buildPauseInsight,
  buildCareerContrast,
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

ok('formatTried 空', formatTriedCareersLine(null) === '' && formatTriedCareersLine([]) === '');
ok('formatTried 有职业', formatTriedCareersLine([
  { career: 'designer', careerName: '设计师' },
]).includes('设计师'));
ok('resolveInteract 从 pos', resolveInteractGoalPos('vending', {
  interactables: [{ id: 'vending', pos: [1, 2] }],
})?.x === 1);

const pause = buildPauseInsight({
  profile: geek,
  stats: { stress: 80, health: 40, passion: 60, energy: 30 },
  career: 'programmer',
  act: 2,
});
ok('pauseInsight headline 含幕', pause.headline.includes('第2幕'));
ok('pauseInsight body 含体感或建议', pause.body.includes('体感') || pause.body.includes('建议'));
ok('pauseInsight tryKeys 非空', Array.isArray(pause.tryKeys) && pause.tryKeys.length >= 1);
ok('pauseInsight 有 fitScore', typeof pause.fitScore === 'number');
ok('pauseInsight signals 数组', Array.isArray(pause.signals) && pause.signals.length >= 1);

// 无 profile：仍可读 headline / 默认兜底
const pauseBare = buildPauseInsight({ stats: null, career: 'product', act: 1 });
ok('pause 无 profile 不崩', pauseBare.headline.includes('产品') && pauseBare.headline.includes('第1幕'));
ok('pause 无 profile 有兜底 body', (pauseBare.body || '').length > 8);
ok('pause 无 profile fitScore null', pauseBare.fitScore == null);

// 低契合分支文案
const lowFit = buildPauseInsight({
  profile: salesy,
  stats: { stress: 40, health: 70, passion: 40, energy: 60 },
  career: 'programmer',
  act: 1,
});
ok('低契合提示再试', lowFit.body.includes('再试') || lowFit.body.includes('契合') || lowFit.body.includes('建议'));

// 高契合 + 高热情
const highFit = buildPauseInsight({
  profile: geek,
  stats: { stress: 30, health: 80, passion: 80, energy: 70 },
  career: 'programmer',
  act: 3,
});
ok('高契合热情提示', highFit.body.includes('热情') || highFit.body.includes('值得') || highFit.fitScore >= 60);

// 多周目对照
const contrastEmpty = buildCareerContrast({ currentCareer: 'programmer', history: [] });
ok('contrast 空历史有兜底', contrastEmpty.others.length === 0 && contrastEmpty.line.includes('再点'));
const contrast = buildCareerContrast({
  currentCareer: 'programmer',
  history: [
    { career: 'programmer', careerName: '程序员' },
    { career: 'designer', careerName: '设计师' },
    { career: 'lawyer', careerName: '律师' },
    { career: 'designer', careerName: '设计师' }, // 去重
  ],
});
ok('contrast 排除本局', !contrast.otherKeys.includes('programmer'));
ok('contrast 含设计师律师', contrast.others.includes('设计师') && contrast.others.includes('律师'));
ok('contrast 去重', contrast.otherKeys.filter(k => k === 'designer').length === 1);
ok('contrast line 含本局名', contrast.line.includes('程序员'));

const ctxHist = buildEndingReportContext({
  career: 'programmer',
  stats: { stress: 50, health: 60, passion: 55, energy: 50 },
  profile: geek,
  history: [{ career: 'sales', careerName: '销售', fitScore: 70 }],
});
ok('reportCtx 含 contrast', ctxHist.contrast && ctxHist.contrast.others.includes('销售'));
ok('promptBlock 含多职业对照', ctxHist.promptBlock.includes('多职业对照') || ctxHist.promptBlock.includes('销售'));

const ctxRel = buildEndingReportContext({
  career: 'programmer',
  stats: { stress: 40, health: 70, passion: 55, energy: 50 },
  relationSummary: '办公室关系：江野（更熟·80）',
});
ok('report 吃关系摘要', ctxRel.promptBlock.includes('江野') && ctxRel.relationSummary.includes('江野'));

// Pause 洞察吃关系
const pauseRel = buildPauseInsight({
  profile: geek,
  stats: { stress: 40, health: 70, passion: 60, energy: 50 },
  career: 'product',
  act: 2,
  relationSummary: '办公室关系：小杜（更熟·70）',
});
ok('pause 含关系行', pauseRel.body.includes('小杜') || pauseRel.body.includes('办公室关系'));
ok('pause.relationSummary', pauseRel.relationSummary && pauseRel.relationSummary.includes('小杜'));
const pauseNoRel = buildPauseInsight({ career: 'lawyer', act: 1 });
ok('pause 无关系不崩', pauseNoRel.body.length > 4 && pauseNoRel.relationSummary == null);

// 💰 金钱信号(死字段复活):money 参与"适不适合"判断,能说出职业取舍
{
  const richTired = bodySignalsFromStats({ money: 900, passion: 30, health: 80, stress: 40 });
  ok('钱多但热情低→"拿热情/健康换钱"信号', richTired.signals.some(s => s.includes('划不划算') || s.includes('换来')));
  const brokeStress = bodySignalsFromStats({ money: -50, passion: 50, health: 60 });
  ok('入不敷出→"钱变成压力源"信号', brokeStress.signals.some(s => s.includes('入不敷出') || s.includes('压力源')));
  const poorButLove = bodySignalsFromStats({ money: 120, passion: 75, stress: 40, health: 70 });
  ok('钱少但热情高→"喜欢更纯粹"信号', poorButLove.signals.some(s => s.includes('更纯粹') || s.includes('没被它绑')));
  const balanced = bodySignalsFromStats({ money: 600, passion: 65, stress: 40, health: 70 });
  ok('钱够热情在→"没逼你二选一"信号', balanced.signals.some(s => s.includes('二选一') || s.includes('钱够花')));
  const midMoney = bodySignalsFromStats({ money: 300, passion: 50, stress: 40, health: 70 });
  ok('中性钱不误触发金钱信号', !midMoney.signals.some(s => s.includes('划不划算') || s.includes('入不敷出') || s.includes('更纯粹')));
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
