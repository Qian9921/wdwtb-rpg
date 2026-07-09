// DaySystem 单元测试。继承 Phaser.EventEmitter，用 data-URL stub 拦截。
// 运行：node scripts/test-daysystem.mjs
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

globalThis.Phaser = {
  Events: { EventEmitter: class { constructor(){this._l={};} on(e,f){(this._l[e]||(this._l[e]=[])).push(f);return this;} off(e,f){if(this._l[e])this._l[e]=this._l[e].filter(h=>h!==f);return this;} emit(e,...a){(this._l[e]||[]).forEach(f=>f(...a));return this;} } },
};

const src = readFileSync(new URL('../src/systems/DaySystem.js', import.meta.url), 'utf8');
const patched = src.replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;');
const blob = 'data:text/javascript;base64,' + Buffer.from(patched).toString('base64');
const { DaySystem } = await import(blob);

console.log('\n=== DaySystem 单元测试 ===\n');

// 初始状态
{
  const d = new DaySystem();
  ok('初始 day=1', d.day === 1);
  ok('初始 phase=commute', d.phase === 'commute');
  ok('初始 dayInAct=1', d.dayInAct === 1);
  ok('初始精力预算=100', d.energyBudget === 100);
}

// startDay
{
  const d = new DaySystem();
  const ev = []; d.on('dayStart', day => ev.push(day));
  d.energyBudget = 30;
  d.startDay();
  ok('startDay 重置精力预算', d.energyBudget === 100);
  ok('startDay 回到 commute', d.phase === 'commute');
  ok('startDay emit dayStart', ev.length === 1 && ev[0] === 1);
}

// spendEnergy
{
  const d = new DaySystem();
  d.setPhase('work');
  d.spendEnergy(30);
  ok('spendEnergy 减少预算', d.energyBudget === 70);
  d.spendEnergy(100);
  ok('spendEnergy 不低于 0', d.energyBudget === 0);
}

// 精力耗尽强制下班
{
  const d = new DaySystem();
  d.setPhase('work');
  const ev = []; d.on('exhausted', () => ev.push(1));
  d.spendEnergy(100);
  ok('精力耗尽 emit exhausted', ev.length === 1);
  ok('精力耗尽强制进 home', d.phase === 'home');
}

// phaseChange
{
  const d = new DaySystem();
  const ev = []; d.on('phaseChange', (p) => ev.push(p));
  d.advancePhase();
  ok('advancePhase commute→work', d.phase === 'work');
  d.advancePhase();
  ok('advancePhase work→home', d.phase === 'home');
  d.advancePhase();
  ok('home 后不再前进', d.phase === 'home');
  ok('phaseChange emit 2 次', ev.length === 2);
}

// setPhase 相同不 emit
{
  const d = new DaySystem();
  const ev = []; d.on('phaseChange', () => ev.push(1));
  d.setPhase('commute'); // 已是 commute
  ok('setPhase 相同阶段不 emit', ev.length === 0);
  d.setPhase('invalid'); // 非法
  ok('setPhase 非法值忽略', d.phase === 'commute');
}

// endDay 推进天数
{
  const d = new DaySystem({ actDayMap: { 1: 3 } });
  const r1 = d.endDay(1);
  ok('endDay day+1', d.day === 2 && r1.day === 2);
  ok('endDay dayInAct+1', d.dayInAct === 2);
  ok('未到幕末 actEnd=false', r1.actEnd === false);
  ok('endDay 后重置精力', d.energyBudget === 100);
}

// endDay 触发幕末
{
  const d = new DaySystem({ actDayMap: { 1: 3 } });
  const ev = []; d.on('actEnd', (act) => ev.push(act));
  d.endDay(1); // day2 dayInAct2
  d.endDay(1); // day3 dayInAct3
  const r = d.endDay(1); // day4 dayInAct4 > 3 → actEnd
  ok('天数攒够触发 actEnd', r.actEnd === true);
  ok('actEnd emit 事件', ev.length === 1 && ev[0] === 1);
  ok('进新幕 dayInAct 重置为1', d.dayInAct === 1);
}

// phaseName / budgetRatio
{
  const d = new DaySystem();
  ok('phaseName commute', d.phaseName() === '清晨·通勤');
  d.setPhase('work');
  ok('phaseName work', d.phaseName() === '白天·工作');
  d.energyBudget = 50;
  ok('budgetRatio 0.5', d.budgetRatio() === 0.5);
}

// serialize / restore
{
  const d = new DaySystem();
  d.day = 5; d.dayInAct = 2; d.setPhase('home'); d.energyBudget = 40;
  const data = d.serialize();
  ok('serialize 含 day/phase/dayInAct/budget',
    data.day === 5 && data.phase === 'home' && data.dayInAct === 2 && data.energyBudget === 40);
  const d2 = new DaySystem();
  d2.restore(data);
  ok('restore day', d2.day === 5);
  ok('restore phase', d2.phase === 'home');
  ok('restore dayInAct', d2.dayInAct === 2);
  ok('restore energyBudget', d2.energyBudget === 40);
  d2.restore(null); ok('restore null 不抛错', d2.day === 5);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
