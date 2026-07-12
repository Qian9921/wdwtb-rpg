// CommuteEvents 单元测试（纯 Node，无 Phaser 依赖）+ commute_events.json 数据合法性校验。
// 运行：node scripts/test-commute-events.mjs
import { readFileSync } from 'fs';
import {
  eventEligible, pickCommuteEvent, applyCommuteChoice, pushRecent,
} from '../src/systems/CommuteEvents.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== CommuteEvents 单元测试 ===\n');

// ── eventEligible ──
{
  ok('无 requires → 总是可抽', eventEligible({ id: 'a' }, { seeds: new Set(), stats: {} }) === true);
}
{
  const ev = { id: 'a', requires: { seeds: ['burnout'] } };
  ok('seeds 命中 → 可抽', eventEligible(ev, { seeds: new Set(['burnout']), stats: {} }) === true);
  ok('seeds 未命中 → 不可抽', eventEligible(ev, { seeds: new Set(['warm']), stats: {} }) === false);
  ok('seeds 为空集合 → 不可抽', eventEligible(ev, { seeds: new Set(), stats: {} }) === false);
}
{
  // OR 语义：多个种子命中任一即可
  const ev = { id: 'a', requires: { seeds: ['burnout', 'warm'] } };
  ok('多种子 OR：命中其一即可', eventEligible(ev, { seeds: new Set(['warm']), stats: {} }) === true);
  ok('多种子 OR：都不命中则不可抽', eventEligible(ev, { seeds: new Set(['fit']), stats: {} }) === false);
}
{
  const ev = { id: 'a', requires: { statMin: { stress: 70 } } };
  ok('statMin 满足 → 可抽', eventEligible(ev, { seeds: new Set(), stats: { stress: 80 } }) === true);
  ok('statMin 恰好等于阈值 → 可抽', eventEligible(ev, { seeds: new Set(), stats: { stress: 70 } }) === true);
  ok('statMin 不满足 → 不可抽', eventEligible(ev, { seeds: new Set(), stats: { stress: 50 } }) === false);
  ok('statMin 缺失状态按0计 → 不可抽', eventEligible(ev, { seeds: new Set(), stats: {} }) === false);
}
{
  const ev = { id: 'a', requires: { statMax: { stress: 30 } } };
  ok('statMax 满足 → 可抽', eventEligible(ev, { seeds: new Set(), stats: { stress: 10 } }) === true);
  ok('statMax 恰好等于阈值 → 可抽', eventEligible(ev, { seeds: new Set(), stats: { stress: 30 } }) === true);
  ok('statMax 超出 → 不可抽', eventEligible(ev, { seeds: new Set(), stats: { stress: 50 } }) === false);
  ok('statMax 缺失状态按100计 → 不可抽', eventEligible({ id: 'a', requires: { statMax: { health: 35 } } }, { seeds: new Set(), stats: {} }) === false);
}
{
  // seeds + statMin/statMax 同时存在 → 全部满足才可抽（AND）
  const ev = { id: 'a', requires: { seeds: ['fit'], statMax: { stress: 40 } } };
  ok('组合条件全满足 → 可抽', eventEligible(ev, { seeds: new Set(['fit']), stats: { stress: 20 } }) === true);
  ok('组合条件种子满足但状态不满足 → 不可抽', eventEligible(ev, { seeds: new Set(['fit']), stats: { stress: 80 } }) === false);
  ok('组合条件状态满足但种子不满足 → 不可抽', eventEligible(ev, { seeds: new Set(), stats: { stress: 20 } }) === false);
}

// ── pickCommuteEvent ──
{
  const events = [{ id: 'g1' }, { id: 'g2' }];
  const r = pickCommuteEvent(events, { seeds: new Set(), stats: {}, recent: [], rng: () => 0.5 });
  ok('无情境事件时从常驻池抽', ['g1', 'g2'].includes(r.id));
}
{
  const events = [{ id: 'g1' }];
  const r = pickCommuteEvent([], { seeds: new Set(), stats: {}, recent: [], rng: () => 0.5 });
  ok('空事件池 → 返回 null', r === null);
}
{
  // rng<0.7 且有 contextual → 优先情境事件
  const events = [
    { id: 'generic1' },
    { id: 'ctx1', requires: { seeds: ['fit'] } },
  ];
  const r = pickCommuteEvent(events, { seeds: new Set(['fit']), stats: {}, recent: [], rng: () => 0.1 });
  ok('情境命中+rng<0.7 → 优先抽情境事件', r.id === 'ctx1', r?.id);
}
{
  // rng>=0.7 → 走常驻池（若常驻池非空）
  const events = [
    { id: 'generic1' },
    { id: 'ctx1', requires: { seeds: ['fit'] } },
  ];
  const r = pickCommuteEvent(events, { seeds: new Set(['fit']), stats: {}, recent: [], rng: () => 0.9 });
  ok('rng>=0.7 → 走常驻池', r.id === 'generic1', r?.id);
}
{
  // recent 排除：唯一常驻事件在 recent 中 → 放宽限制后仍能抽到（因为没有其他选择）
  const events = [{ id: 'only1' }];
  const r = pickCommuteEvent(events, { seeds: new Set(), stats: {}, recent: ['only1'], rng: () => 0.9 });
  ok('全部看过时放宽 recent 限制仍可抽到', r.id === 'only1');
}
{
  // recent 排除：多个常驻事件时优先避开 recent
  const events = [{ id: 'g1' }, { id: 'g2' }];
  const r = pickCommuteEvent(events, { seeds: new Set(), stats: {}, recent: ['g1'], rng: () => 0.9 });
  ok('有其他可选时排除 recent', r.id === 'g2');
}
{
  // requires 不满足的事件永不被抽中
  const events = [{ id: 'ctx1', requires: { seeds: ['fit'] } }];
  const r = pickCommuteEvent(events, { seeds: new Set(), stats: {}, recent: [], rng: () => 0.1 });
  ok('requires 不满足则不会被抽中', r === null);
}
{
  // 权重：weight 越高抽中概率越大——用固定 rng 验证边界落点
  const events = [{ id: 'low', weight: 1 }, { id: 'high', weight: 9 }];
  // total=10；rng()=0.05 → r=0.5，落在 low(weight1) 区间内(r-1<=0 后立即命中第一个)
  const r1 = pickCommuteEvent(events, { seeds: new Set(), stats: {}, recent: [], rng: () => 0.05 });
  ok('加权抽取：低权重区间命中 low', r1.id === 'low', r1?.id);
  // rng()=0.5 → r=5，扣掉 low(1) 剩4，扣掉 high(9) → -5<=0 命中 high
  const r2 = pickCommuteEvent(events, { seeds: new Set(), stats: {}, recent: [], rng: () => 0.5 });
  ok('加权抽取：高权重区间命中 high', r2.id === 'high', r2?.id);
}
{
  // 无 weight 字段默认为1
  const events = [{ id: 'a' }, { id: 'b' }];
  const r = pickCommuteEvent(events, { seeds: new Set(), stats: {}, recent: [], rng: () => 0 });
  ok('默认权重1时 rng=0 命中第一个', r.id === 'a', r?.id);
}

// ── applyCommuteChoice ──
{
  const stats = { health: 50, energy: 50, money: 50 };
  const opt = { effect: { health: 5, energy: -3, money: -10 } };
  const r = applyCommuteChoice(stats, opt);
  ok('effect 正确应用到新对象', r.stats.health === 55 && r.stats.energy === 47 && r.stats.money === 40);
  ok('不改动原 stats', stats.health === 50);
  ok('无 followupSeed 时返回 null', r.followupSeed === null);
}
{
  const r = applyCommuteChoice({ stress: 50 }, { effect: { stress: 200 } });
  ok('非 money 字段 clamp 到100', r.stats.stress === 100);
}
{
  const r = applyCommuteChoice({ san: 5 }, { effect: { san: -50 } });
  ok('非 money 字段 clamp 到0下限', r.stats.san === 0);
}
{
  const r = applyCommuteChoice({ money: 10 }, { effect: { money: -50 } });
  ok('money 不 clamp，可为负', r.stats.money === -40, r.stats.money);
}
{
  const r = applyCommuteChoice({}, { effect: { skill: 5 }, followupSeed: 'kind_karma' });
  ok('followupSeed 正确透传', r.followupSeed === 'kind_karma');
}
{
  const r = applyCommuteChoice({ health: 50 }, {});
  ok('option 无 effect 不抛错', r.stats.health === 50);
  ok('option 无 effect 时 followupSeed 为 null', r.followupSeed === null);
}
{
  const r = applyCommuteChoice(null, { effect: { health: 5 } });
  ok('stats 为 null 时按空对象处理', r.stats.health === 5);
}
{
  const r = applyCommuteChoice({ health: 10 }, null);
  ok('option 为 null 不抛错', r.stats.health === 10 && r.followupSeed === null);
}

// ── pushRecent ──
{
  const r = pushRecent([], 'a');
  ok('首次加入', r.length === 1 && r[0] === 'a');
}
{
  const r = pushRecent(['a', 'b', 'c', 'd', 'e'], 'f');
  ok('保留最近5条（默认keep=5）', r.length === 5 && r.join(',') === 'b,c,d,e,f');
}
{
  const r = pushRecent(['a', 'b'], 'c', 2);
  ok('自定义 keep=2', r.length === 2 && r.join(',') === 'b,c');
}
{
  const r = pushRecent(undefined, 'a');
  ok('recent 为 undefined 不抛错', r.length === 1 && r[0] === 'a');
}
{
  const r = pushRecent(['a'], 'a', 5);
  ok('允许重复 id（不去重，只裁剪长度）', r.join(',') === 'a,a');
}

// ══════════════════════════════════════════════════
// 数据合法性：public/data/commute_events.json
// ══════════════════════════════════════════════════
console.log('\n=== commute_events.json 数据合法性 ===\n');

const STAT_KEYS = new Set(['health', 'energy', 'san', 'stress', 'skill', 'performance', 'money', 'passion']);
// NightLife.js finalizeNight 里白名单透传的通勤种子来源
const KNOWN_SEED_SOURCES = new Set([
  'warm', 'burnout', 'studied', 'relaxed', 'fit', 'healed', 'nourished', 'rested', 'treated',
]);

const raw = readFileSync(new URL('../public/data/commute_events.json', import.meta.url), 'utf8');
const data = JSON.parse(raw);
const events = data.events || [];

ok(`事件总数 >= 22（实际 ${events.length}）`, events.length >= 22);

const genericCount = events.filter(e => !e.requires).length;
const contextualCount = events.filter(e => e.requires).length;
console.log(`  · 常驻事件 ${genericCount} 条 / 情境事件 ${contextualCount} 条`);
ok('常驻事件 >= 10', genericCount >= 10, `实际 ${genericCount}`);
ok('情境事件 >= 5', contextualCount >= 5, `实际 ${contextualCount}`);

// 每条事件基本结构
{
  let allHaveId = true, allHaveText = true, allHaveOptions = true, allOptionsValid = true;
  const badEvents = [];
  for (const ev of events) {
    if (!ev.id || typeof ev.id !== 'string') { allHaveId = false; badEvents.push(ev.id || '(无id)'); }
    if (!ev.text || typeof ev.text !== 'string') { allHaveText = false; badEvents.push(ev.id); }
    if (!Array.isArray(ev.options) || ev.options.length < 2) { allHaveOptions = false; badEvents.push(ev.id); }
    for (const opt of ev.options || []) {
      if (!opt.label || !opt.effect || !opt.reply) { allOptionsValid = false; badEvents.push(`${ev.id}/${opt.label || '?'}`); }
    }
  }
  ok('所有事件都有 id', allHaveId, badEvents.join(','));
  ok('所有事件都有 text', allHaveText, badEvents.join(','));
  ok('所有事件至少2个选项', allHaveOptions, badEvents.join(','));
  ok('所有选项都有 label/effect/reply', allOptionsValid, badEvents.join(','));
}

// id 唯一
{
  const ids = events.map(e => e.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  ok('事件 id 全部唯一', dupes.length === 0, dupes.join(','));
}

// id 命名规范：英文小写下划线
{
  const bad = events.filter(e => !/^[a-z][a-z0-9_]*$/.test(e.id)).map(e => e.id);
  ok('id 均为英文小写下划线命名', bad.length === 0, bad.join(','));
}

// effect 键都是合法状态名
{
  const badKeys = [];
  for (const ev of events) {
    for (const opt of ev.options || []) {
      for (const k of Object.keys(opt.effect || {})) {
        if (!STAT_KEYS.has(k)) badKeys.push(`${ev.id}/${opt.label}:${k}`);
      }
    }
  }
  ok('所有 effect 键都是合法状态名', badKeys.length === 0, badKeys.join(','));
}

// effect 数值范围合理（温和：非money ±3~±8, money ±10~30 大致区间；只做粗校验防止离谱数值）
{
  const bad = [];
  for (const ev of events) {
    for (const opt of ev.options || []) {
      for (const [k, v] of Object.entries(opt.effect || {})) {
        if (typeof v !== 'number' || Number.isNaN(v)) { bad.push(`${ev.id}/${opt.label}:${k}=${v}`); continue; }
        const limit = k === 'money' ? 60 : 20;
        if (Math.abs(v) > limit) bad.push(`${ev.id}/${opt.label}:${k}=${v}`);
      }
    }
  }
  ok('effect 数值在合理区间内（非离谱大数）', bad.length === 0, bad.join(','));
}

// requires.seeds 引用的种子都有来源（NightLife 9种，或本文件内某选项埋的 followupSeed）
{
  const followupSeeds = new Set();
  for (const ev of events) {
    for (const opt of ev.options || []) {
      if (opt.followupSeed) followupSeeds.add(opt.followupSeed);
    }
  }
  const allKnownSeeds = new Set([...KNOWN_SEED_SOURCES, ...followupSeeds]);
  const badRefs = [];
  for (const ev of events) {
    const seeds = ev.requires?.seeds || [];
    for (const sd of seeds) {
      if (!allKnownSeeds.has(sd)) badRefs.push(`${ev.id}:requires.seeds=${sd}`);
    }
  }
  ok('requires.seeds 引用的种子都有明确来源', badRefs.length === 0, badRefs.join(','));
  console.log(`  · followupSeed 种类：${[...followupSeeds].join(', ') || '(无)'}`);
}

// requires.statMin/statMax 键都是合法状态名
{
  const bad = [];
  for (const ev of events) {
    for (const k of Object.keys(ev.requires?.statMin || {})) if (!STAT_KEYS.has(k)) bad.push(`${ev.id}:statMin.${k}`);
    for (const k of Object.keys(ev.requires?.statMax || {})) if (!STAT_KEYS.has(k)) bad.push(`${ev.id}:statMax.${k}`);
  }
  ok('requires.statMin/statMax 键都是合法状态名', bad.length === 0, bad.join(','));
}

// followupSeed 和 requiresSeed 成对：每个埋下的 followupSeed，至少被某处 requires.seeds 或某选项 requiresSeed 用到；
// 每个 requiresSeed，必须有对应选项埋过同名 followupSeed。
{
  const followupSeeds = new Set();
  const requiresSeedRefs = new Set();
  const requiresSeedsRefs = new Set(); // event 级 requires.seeds
  for (const ev of events) {
    const seeds = ev.requires?.seeds || [];
    for (const sd of seeds) requiresSeedsRefs.add(sd);
    for (const opt of ev.options || []) {
      if (opt.followupSeed) followupSeeds.add(opt.followupSeed);
      if (opt.requiresSeed) requiresSeedRefs.add(opt.requiresSeed);
    }
  }
  // 通勤自定义链式种子（非 NightLife 9种白名单）应被消费
  const chainSeeds = [...followupSeeds];
  const unusedChainSeeds = chainSeeds.filter(sd => !requiresSeedsRefs.has(sd) && !requiresSeedRefs.has(sd));
  ok('每个 followupSeed 都被某处 requires.seeds/requiresSeed 消费（因果闭环）', unusedChainSeeds.length === 0, unusedChainSeeds.join(','));

  // 每个 option.requiresSeed 必须有对应的 followupSeed 埋点（否则该选项永远不会出现）
  const orphanRequiresSeed = [...requiresSeedRefs].filter(sd => !followupSeeds.has(sd) && !KNOWN_SEED_SOURCES.has(sd));
  ok('每个 requiresSeed 都有对应埋点（followupSeed 或 NightLife 种子）', orphanRequiresSeed.length === 0, orphanRequiresSeed.join(','));

  console.log(`  · 因果链种子（followupSeed→requires 消费）：${chainSeeds.join(', ') || '(无)'}`);
}

// 至少存在完整因果链（followupSeed 被独立事件的 requires.seeds 消费，形成"世界记得你"）
{
  let chainCount = 0;
  const chains = [];
  for (const ev of events) {
    for (const opt of ev.options || []) {
      if (!opt.followupSeed) continue;
      const consumer = events.find(e2 => e2.id !== ev.id && e2.requires?.seeds?.includes(opt.followupSeed));
      if (consumer) { chainCount++; chains.push(`${ev.id} --[${opt.followupSeed}]--> ${consumer.id}`); }
    }
  }
  ok('至少2条完整因果链（followupSeed 被其他事件 requires.seeds 消费）', chainCount >= 2, `实际 ${chainCount}`);
  console.log('  · 因果链：\n    ' + chains.join('\n    '));
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
