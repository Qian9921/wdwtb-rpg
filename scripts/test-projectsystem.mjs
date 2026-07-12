// ProjectSystem 单元测试。运行：node scripts/test-projectsystem.mjs
import { readFileSync } from 'fs';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

globalThis.Phaser = {
  Events: { EventEmitter: class { constructor(){this._l={};} on(e,f){(this._l[e]||(this._l[e]=[])).push(f);return this;} off(e,f){if(this._l[e])this._l[e]=this._l[e].filter(h=>h!==f);return this;} emit(e,...a){(this._l[e]||[]).forEach(f=>f(...a));return this;} } },
  Math: { Clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
};
const src = readFileSync(new URL('../src/systems/ProjectSystem.js', import.meta.url), 'utf8');
const patched = src.replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;');
const { ProjectSystem } = await import('data:text/javascript;base64,' + Buffer.from(patched).toString('base64'));

const POOL = [
  { id: 'a', title: 'A', progress: 10, performance: 10, cost: {} },
  { id: 'b', title: 'B', progress: 10, performance: 10, cost: {} },
  { id: 'c', title: 'C', progress: 10, performance: 10, cost: {} },
  { id: 'd', title: 'D', progress: 10, performance: 10, cost: {} },
];

console.log('\n=== ProjectSystem 单元测试 ===\n');

// startDay 抽取
{
  const ps = new ProjectSystem({ pool: POOL, dailyCount: 3 });
  const ev = []; ps.on('ordersDrawn', o => ev.push(o.length));
  const orders = ps.startDay();
  ok('抽出 3 张今日工单', orders.length === 3);
  ok('工单带 done=false', orders.every(o => o.done === false));
  ok('emit ordersDrawn', ev.length === 1 && ev[0] === 3);
  ok('不重复', new Set(orders.map(o => o.id)).size === 3);
}

// completeOrder 满分推进
{
  const ps = new ProjectSystem({ pool: POOL, dailyCount: 3 });
  ps.startDay();
  const id = ps.orders[0].id;
  const pev = []; ps.on('progress', (p, d) => pev.push([p, d]));
  const r = ps.completeOrder(id, 1);
  ok('满分推进=base(10)', r.progressGain === 10, String(r.progressGain));
  ok('满分绩效=base(10)', r.perfGain === 10, String(r.perfGain));
  ok('progress 到 10', ps.progress === 10);
  ok('今日绩效累计', ps.todayPerformance === 10);
  ok('emit progress', pev.length === 1 && pev[0][0] === 10 && pev[0][1] === 10);
  ok('工单标记 done', ps.orders[0].done === true);
  ok('重复完成返回 null', ps.completeOrder(id, 1) === null);
}

// creditWork:任务链工作(无工单)也计入绩效+进度(修 bug:此前任务链工作绩效纹丝不动)
{
  const ps = new ProjectSystem({ pool: POOL, dailyCount: 3 });
  const r = ps.creditWork(1); // 满分,默认基础值 baseProgress=8 basePerf=10
  ok('creditWork 满分进度=8', r.progressGain === 8, String(r.progressGain));
  ok('creditWork 满分绩效=10', r.perfGain === 10, String(r.perfGain));
  ok('creditWork 累计 performance', ps.performance === 10, String(ps.performance));
  ok('creditWork 累计 todayPerformance', ps.todayPerformance === 10);
  ok('creditWork 推进 progress', ps.progress === 8);
  // 低质量仍有基础产出(不为 0),绩效>0——核心:做了活绩效一定会动
  const r2 = ps.creditWork(0);
  ok('creditWork 零分仍有绩效', r2.perfGain > 0, String(r2.perfGain));
  ok('creditWork 零分仍推进进度', r2.progressGain > 0, String(r2.progressGain));
  ok('creditWork 绩效持续累加', ps.performance > 10, String(ps.performance));
}

// 低质量仍有基础产出
{
  const ps = new ProjectSystem({ pool: POOL, dailyCount: 3 });
  ps.startDay();
  const r = ps.completeOrder(ps.orders[0].id, 0);
  ok('0 分仍推进 40%基础 = 4', r.progressGain === 4, String(r.progressGain));
  ok('0 分绩效 = 30%基础 = 3', r.perfGain === 3, String(r.perfGain));
}

// 里程碑跨越
{
  const ps = new ProjectSystem({ pool: POOL, dailyCount: 4, milestones: [25, 50] });
  ps.startDay();
  const ms = []; ps.on('milestone', m => ms.push(m));
  ps.completeOrder(ps.orders[0].id, 1); // 10
  ps.completeOrder(ps.orders[1].id, 1); // 20
  ok('未到 25 不触发', ms.length === 0);
  ps.completeOrder(ps.orders[2].id, 1); // 30 → 跨 25
  ok('跨 25 触发一次', ms.length === 1 && ms[0] === 25);
  ps.completeOrder(ps.orders[3].id, 1); // 40
  ok('40 未跨 50', ms.length === 1);
}

// allOrdersDone
{
  const ps = new ProjectSystem({ pool: POOL, dailyCount: 2 });
  ps.startDay();
  ok('未全完成', ps.allOrdersDone() === false);
  ps.orders.forEach(o => ps.completeOrder(o.id, 1));
  ok('全完成', ps.allOrdersDone() === true);
}

// clamp 100 + 序列化/恢复
{
  const ps = new ProjectSystem({ pool: POOL, dailyCount: 4 });
  ps.startDay();
  ps.orders.forEach(o => ps.completeOrder(o.id, 1)); // 40
  ps.progress = 96; ps._addProgress(20);
  ok('进度封顶 100', ps.progress === 100);
  const s = ps.serialize();
  const ps2 = new ProjectSystem({ pool: POOL });
  ps2.restore(s);
  ok('恢复 progress', ps2.progress === 100);
  ok('恢复 performance', ps2.performance === ps.performance);
  ok('恢复 hitMilestones', ps2.isMilestoneHit(25) === ps.isMilestoneHit(25));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
