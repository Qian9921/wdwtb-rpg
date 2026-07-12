// TimeSystem 单元测试。运行：node scripts/test-timesystem.mjs
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

globalThis.Phaser = {
  Events: { EventEmitter: class { constructor(){this._l={};} on(e,f){(this._l[e]||(this._l[e]=[])).push(f);return this;} off(e,f){if(this._l[e])this._l[e]=this._l[e].filter(h=>h!==f);return this;} emit(e,...a){(this._l[e]||[]).forEach(f=>f(...a));return this;} } },
  Math: { Clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
};

const src = readFileSync(new URL('../src/systems/TimeSystem.js', import.meta.url), 'utf8');
const patched = src.replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;');
const blob = 'data:text/javascript;base64,' + Buffer.from(patched).toString('base64');
const { TimeSystem, SEGMENTS } = await import(blob);

console.log('\n=== TimeSystem 单元测试 ===\n');

// 初始状态
{
  const t = new TimeSystem();
  ok('初始 index=0', t.index === 0);
  ok('初始 current=早会', t.current.id === 'morning_meeting');
  ok('初始 population=1', t.current.population === 1.0);
  ok('初始非最后时段', t.isLast === false);
}

// advance 逐段推进 + emit
{
  const t = new TimeSystem();
  const ev = []; t.on('segmentChange', (s, i) => ev.push([s.id, i]));
  const r = t.advance();
  ok('advance 返回下一时段', r.id === 'forenoon');
  ok('advance 后 index=1', t.index === 1);
  ok('advance emit segmentChange', ev.length === 1 && ev[0][0] === 'forenoon' && ev[0][1] === 1);
}

// 推进到底 + isLast + 不越界
{
  const t = new TimeSystem();
  let last;
  for (let i = 0; i < 10; i++) last = t.advance();
  ok('推进到最后 index=末段', t.index === SEGMENTS.length - 1);
  ok('末段 id=deep_night', t.current.id === 'deep_night');
  ok('isLast=true', t.isLast === true);
  ok('深夜人数=0.4(调高,避免办公室骤然空场)', t.current.population === 0.4);
  ok('末段 advance 返回 null', t.advance() === null);
  ok('末段 advance 不越界', t.index === SEGMENTS.length - 1);
}

// setIndex 钳制 + 仅变化才 emit
{
  const t = new TimeSystem();
  const ev = []; t.on('segmentChange', (s, i) => ev.push(i));
  t.setIndex(3);
  ok('setIndex 跳段', t.index === 3 && t.current.id === 'afternoon');
  ok('setIndex emit 一次', ev.length === 1 && ev[0] === 3);
  t.setIndex(3);
  ok('setIndex 相同不 emit', ev.length === 1);
  t.setIndex(99);
  ok('setIndex 越界上钳制', t.index === SEGMENTS.length - 1);
  t.setIndex(-5);
  ok('setIndex 越界下钳制', t.index === 0);
}

// kick 立即 emit 当前段
{
  const t = new TimeSystem();
  t.setIndex(2);
  const ev = []; t.on('segmentChange', (s) => ev.push(s.id));
  t.kick();
  ok('kick emit 当前段', ev.length === 1 && ev[0] === 'noon');
}

// hudText
{
  const t = new TimeSystem();
  ok('hudText 含图标+名+时钟', t.hudText() === '☀ 早会 09:00', t.hudText());
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
