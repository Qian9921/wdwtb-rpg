// SaveSystem 单元测试（纯 Node，mock localStorage）。
// 运行：node scripts/test-save-system.mjs
import { SaveSystem } from '../src/systems/SaveSystem.js';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

// mock localStorage
let _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};
const reset = () => { _store = {}; };

console.log('\n=== SaveSystem 单元测试 ===\n');

reset();
ok('初始无档：has() 为 false', SaveSystem.has() === false);
ok('初始无档：load() 返回 null', SaveSystem.load() === null);

reset();
ok('save 成功返回 true', SaveSystem.save({ career: 'programmer', act: 2 }) === true);
ok('save 后 has() 为 true', SaveSystem.has() === true);
const loaded = SaveSystem.load();
ok('load 返回存入的 career', loaded.career === 'programmer');
ok('load 返回存入的 act', loaded.act === 2);
ok('save 自动加 version:2', loaded.version === 2, `got ${loaded.version}`);
ok('save 自动加 updatedAt 时间戳', typeof loaded.updatedAt === 'number');

reset();
SaveSystem.saveProgress({ career: 'product', act: 3, stats: { health: 50, passion: 30 } });
const p = SaveSystem.load();
ok('saveProgress：存入 career', p.career === 'product');
ok('saveProgress：存入 act', p.act === 3);
ok('saveProgress：存入 stats.health', p.stats && p.stats.health === 50);
ok('saveProgress：存入 stats.passion', p.stats && p.stats.passion === 30);

reset();
SaveSystem.saveProgress({ career: 'admin', act: 1, stats: {}, extra: { customField: 'abc' } });
ok('saveProgress：extra 字段合并', SaveSystem.load().customField === 'abc');

reset();
SaveSystem.save({ career: 'designer', act: 1 });
ok('向后兼容：旧格式可 load', SaveSystem.load().career === 'designer');

reset();
SaveSystem.save({ career: 'x', act: 1 });
ok('clear 前有档', SaveSystem.has() === true);
SaveSystem.clear();
ok('clear 后无档', SaveSystem.has() === false);

// localStorage 不可用时降级
globalThis.localStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
  removeItem: () => { throw new Error('denied'); },
};
ok('localStorage 不可用：save 返回 false 不抛错', SaveSystem.save({ career: 'x' }) === false);
ok('localStorage 不可用：load 返回 null 不抛错', SaveSystem.load() === null);
ok('localStorage 不可用：has 返回 false 不抛错', SaveSystem.has() === false);
ok('localStorage 不可用：clear 返回 false 不抛错', SaveSystem.clear() === false);
ok('localStorage 不可用：saveProgress 返回 false 不抛错', SaveSystem.saveProgress({ career: 'x', act: 1 }) === false);

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
