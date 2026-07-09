// StateSystem 单元测试。
// StateSystem 顶部 import Phaser（需 window 环境，Node 跑不了），
// 这里读源码、把 Phaser 依赖替换成最小 stub 后动态 import，专注测数值/阈值/restore 逻辑。
// 运行：node scripts/test-state-system.mjs
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

// 最小 Phaser stub：只实现 StateSystem 用到的 EventEmitter + Math.Clamp
const PHASER_STUB = `
const __l = Symbol('listeners');
class EventEmitter {
  constructor() { this[__l] = {}; }
  on(e, f) { (this[__l][e] || (this[__l][e] = [])).push(f); return this; }
  off(e, f) { if (this[__l][e]) this[__l][e] = this[__l][e].filter(h => h !== f); return this; }
  emit(e, ...a) { (this[__l][e] || []).forEach(f => f(...a)); return this; }
}
const Phaser = { Events: { EventEmitter }, Math: { Clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) } };
`;

// 读源码，把 import Phaser 行换成内联 stub
const src = readFileSync(new URL('../src/systems/StateSystem.js', import.meta.url), 'utf8');
const patched = src.replace(/^import Phaser from 'phaser';/m, PHASER_STUB);
const blobUrl = 'data:text/javascript;base64,' + Buffer.from(patched).toString('base64');
const { StateSystem } = await import(blobUrl);

console.log('\n=== StateSystem 单元测试 ===\n');

// 初始值
{
  const s = new StateSystem();
  ok('初始 health=80', s.get('health') === 80);
  ok('初始 energy=100', s.get('energy') === 100);
  ok('初始 passion=70', s.get('passion') === 70);
  ok('初始 money=0', s.get('money') === 0);
  ok('getAll 返回 8 项', Object.keys(s.getAll()).length === 8);
}

// change / clamp
{
  const s = new StateSystem();
  const emitted = [];
  s.on('change', (k, v) => emitted.push([k, v]));
  s.change('health', -10);
  ok('change 正确减值', s.get('health') === 70);
  ok('change 触发 change 事件', emitted.length === 1 && emitted[0][0] === 'health');
  s.change('health', -200);
  ok('clamp 下限 0', s.get('health') === 0);
  s.change('energy', 999);
  ok('clamp 上限 100', s.get('energy') === 100);
  s.change('money', 5000);
  ok('money 不 clamp（可超 100）', s.get('money') === 5000);
}

// 阈值事件
{
  const s = new StateSystem();
  const t = [];
  s.on('threshold', (info) => t.push(info));
  s.set('health', 25);
  ok('25 不触发 threshold', t.length === 0);
  s.set('health', 19);
  ok('19 触发 threshold', t.length === 1 && t[0].key === 'health');
  s.set('health', 10);
  ok('重复低位不再触发', t.length === 1);
  s.set('health', 50);
  s.set('health', 15);
  ok('回升后再降再次触发', t.length === 2);
}
{
  const s = new StateSystem();
  const t = [];
  s.on('threshold', (info) => t.push(info));
  s.set('skill', 0); s.set('stress', 100); s.set('performance', 0);
  ok('非危险键不触发 threshold', t.length === 0);
}

// restore
{
  const s = new StateSystem();
  const stats = { health: 30, energy: 45, san: 15, stress: 80, skill: 60, performance: 40, money: 1200, passion: 10 };
  s.restore(stats);
  ok('restore health', s.get('health') === 30);
  ok('restore san', s.get('san') === 15);
  ok('restore money（不 clamp）', s.get('money') === 1200);
  ok('restore passion', s.get('passion') === 10);
  ok('restore stress', s.get('stress') === 80);
  ok('getAll 与传入一致', JSON.stringify(s.getAll()) === JSON.stringify(stats));
}
{
  const s = new StateSystem();
  const t = [];
  s.on('threshold', (info) => t.push(info));
  s.restore({ health: 10, san: 10, passion: 10 });
  ok('restore 到低位不触发 threshold', t.length === 0);
  s.set('health', 5);
  ok('restore 后同向再降不触发', t.length === 0);
  // restore 后回升再降应正常触发
  s.set('health', 50);
  s.set('health', 15);
  ok('restore 后回升再降能触发', t.length === 1);
}
{
  const s = new StateSystem();
  s.restore({ health: 50, unknownKey: 999 });
  ok('restore 忽略未知键', s.get('health') === 50);
  ok('restore 缺失键保持原值', s.get('energy') === 100);
  let threw = false;
  try { s.restore(null); s.restore(undefined); s.restore('x'); } catch (e) { threw = true; }
  ok('restore null/undefined/非对象 不抛错', !threw);
}

// 辅助模式：负面消耗减半（需 mock localStorage）
{
  globalThis.localStorage = {
    _d: { wdwtb_settings: JSON.stringify({ assist: true }) },
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; },
  };
  const s = new StateSystem();
  s.change('health', -20);
  ok('辅助模式：掉血减半（-20→-10）', s.get('health') === 70, 'got ' + s.get('health'));
  s.change('stress', 20);
  ok('辅助模式：涨压力减半（+20→+10）', s.get('stress') === 30, 'got ' + s.get('stress'));
  s.change('skill', 10);
  ok('辅助模式：正面变化不减（skill +10）', s.get('skill') === 20, 'got ' + s.get('skill'));
  // 关闭辅助
  globalThis.localStorage._d.wdwtb_settings = JSON.stringify({ assist: false });
  const s2 = new StateSystem();
  s2.change('health', -20);
  ok('关闭辅助：掉血正常（-20）', s2.get('health') === 60, 'got ' + s2.get('health'));
  delete globalThis.localStorage;
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
