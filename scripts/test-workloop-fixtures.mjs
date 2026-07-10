// Work-loop fixtures：真实 work_orders / taskchain + ProjectSystem / QuestSystem。
// 运行：node scripts/test-workloop-fixtures.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public/data');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

// Phaser stub（与 test-projectsystem / test-questsystem 同构）
globalThis.Phaser = {
  Events: {
    EventEmitter: class {
      constructor() { this._l = {}; }
      on(e, f) { (this._l[e] || (this._l[e] = [])).push(f); return this; }
      off(e, f) { if (this._l[e]) this._l[e] = this._l[e].filter(h => h !== f); return this; }
      emit(e, ...a) { (this._l[e] || []).forEach(fn => fn(...a)); return this; }
    },
  },
  Math: { Clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
};

const projSrc = readFileSync(join(ROOT, 'src/systems/ProjectSystem.js'), 'utf8');
const projPatched = projSrc.replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;');
const { ProjectSystem } = await import(
  'data:text/javascript;base64,' + Buffer.from(projPatched).toString('base64')
);

const questSrc = readFileSync(join(ROOT, 'src/systems/QuestSystem.js'), 'utf8');
const questPatched = questSrc
  .replace(/^import Phaser from 'phaser';/m, 'const Phaser = globalThis.Phaser;')
  .replace(/^import \{ AudioSystem \} from '\.\/AudioSystem\.js';/m, 'const AudioSystem = { questDone(){} };')
  .replace(/^import \{ Juice \} from '\.\/JuiceKit\.js';/m, 'const Juice = {};');
const { QuestSystem } = await import(
  'data:text/javascript;base64,' + Buffer.from(questPatched).toString('base64')
);

function makeState() {
  const stats = {
    health: 80, energy: 100, san: 80, stress: 20,
    skill: 10, performance: 50, money: 0, passion: 70,
  };
  return {
    stats,
    get(k) { return stats[k]; },
    change(k, d) { stats[k] += d; },
  };
}

function loadOrders(name) {
  const j = JSON.parse(readFileSync(join(DATA, name), 'utf8'));
  return Array.isArray(j) ? j : (j.orders || []);
}

console.log('\n=== Workloop Fixtures ===\n');

// ── 1. ProjectSystem + real work_orders_programmer.json ──
console.log('-- ProjectSystem programmer orders --');
{
  const pool = loadOrders('work_orders_programmer.json');
  ok('programmer pool ≥5', pool.length >= 5, `len=${pool.length}`);

  const ps = new ProjectSystem({ pool, dailyCount: 3, milestones: [25, 50, 75, 100] });
  const ms = [];
  ps.on('milestone', m => ms.push(m));

  const day1 = ps.startDay();
  ok('startDay 抽 ≥1 张', day1.length >= 1, `len=${day1.length}`);
  ok('今日工单 id 唯一', new Set(day1.map(o => o.id)).size === day1.length);

  const before = ps.progress;
  const firstId = day1[0].id;
  const r = ps.completeOrder(firstId, 1);
  ok('completeOrder quality1 有推进', r && r.progressGain > 0, String(r?.progressGain));
  ok('progress 增加', ps.progress > before, `${before}→${ps.progress}`);

  // 继续做工单 / 跨天直到跨过 25（真实进度值 6–15，可能需多天）
  let guard = 0;
  while (ps.progress < 25 && guard < 40) {
    guard++;
    if (ps.pendingOrders().length === 0) ps.startDay();
    const next = ps.pendingOrders()[0];
    if (!next) break;
    ps.completeOrder(next.id, 1);
  }
  ok('能推进到 ≥25', ps.progress >= 25, `progress=${ps.progress}`);
  ok('跨 25 里程碑只 emit 一次', ms.filter(m => m === 25).length === 1, `ms=${JSON.stringify(ms)}`);
}

// ── 2. Smoke load product / lawyer pools ──
console.log('\n-- work_orders smoke --');
{
  const product = loadOrders('work_orders_product.json');
  const lawyer = loadOrders('work_orders_lawyer.json');
  ok('product pool ≥5', product.length >= 5, `len=${product.length}`);
  ok('lawyer pool ≥5', lawyer.length >= 5, `len=${lawyer.length}`);
}

// ── 3. QuestSystem empty load / accept miss ──
console.log('\n-- QuestSystem empty --');
{
  let threw = false;
  const qs1 = new QuestSystem(makeState());
  try {
    qs1.load([]);
  } catch (e) {
    threw = true;
  }
  ok('load([]) 不抛', !threw);
  ok('load([]) available 空', qs1.available().length === 0);

  threw = false;
  const qs2 = new QuestSystem(makeState());
  try {
    qs2.load({ quests: [] });
  } catch (e) {
    threw = true;
  }
  ok('load({quests:[]}) 不抛', !threw);
  ok('load({quests:[]}) available 空', qs2.available().length === 0);
  ok("accept('nope')===false", qs2.accept('nope') === false);
}

// ── 4. Full light chain walk: designer visual ──
console.log('\n-- designer visual chain walk --');
{
  const chain = JSON.parse(readFileSync(join(DATA, 'taskchain_designer_visual.json'), 'utf8'));
  const quests = chain.quests || chain;
  ok('designer visual ≥3 环', Array.isArray(quests) && quests.length >= 3, `len=${quests?.length}`);

  const qs = new QuestSystem(makeState());
  qs.load(chain);

  const first = qs.available()[0];
  ok('初始可接第一环', first && first.id === 'vis_c1', first?.id);

  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const av = qs.available();
    ok(`${q.id}: 解锁可接`, av.some(a => a.id === q.id), av.map(a => a.id).join(','));
    ok(`${q.id}: accept`, qs.accept(q.id) === true);

    // 按 objectives 顺序推进 talk / minigame
    for (const obj of (q.objectives || [])) {
      if (obj.kind === 'talk' || obj.kind === 'minigame' || obj.kind === 'interact') {
        qs.progress(obj.kind, obj.target);
      }
    }
    ok(`${q.id}: isReady`, qs.isReady(q.id) === true);
    ok(`${q.id}: complete`, qs.complete(q.id) === true);
  }

  ok('全链完成后 available 为空', qs.available().length === 0, `len=${qs.available().length}`);
  ok('全链 done 数=环数', qs.done().length === quests.length, `done=${qs.done().length}`);
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
