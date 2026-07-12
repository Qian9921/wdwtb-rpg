// CommuteEvents：通勤/晨间事件的抽取逻辑（无 Phaser，可单测）。
//
// 对抗旧版"6 条按 day % 6 写死循环、永远第二天冒雨"：
//   1) 随机抽取,且记录【最近看过的】避免短期重复(不再可预测)。
//   2) 事件可声明 requires(种子/状态条件),昨晚的选择(NightLife 埋的 seeds)+ 白天状态
//      决定今天更可能遇到什么——熬夜→"困到坐过站",陪家人→"路上心情好"。
//   3) 事件可声明 followupSeed:选了某选项 → 埋一个后续种子,过几天触发【连锁事件】
//      (今天帮了人 → 几天后收到回报)。让事件之间有记忆、有因果。
//
// 数据在 public/data/commute_events.json,结构:
//   { events: [{ id, text, weight?, requires?:{seeds?:[], statMin?:{}, statMax?:{}},
//                options:[{ label, effect, reply, followupSeed?, requiresSeed? }] }] }
//   requires 全部满足才可能抽到;无 requires = 常驻池。

/**
 * 判断一个事件在当前上下文下是否【可被抽取】。
 * @param ev 事件
 * @param ctx { seeds:Set<string>, stats:object }
 */
export function eventEligible(ev, ctx) {
  const req = ev.requires;
  if (!req) return true;
  if (req.seeds && req.seeds.length) {
    // 需要的种子里至少有一个命中(OR 语义,便于"熬夜或压力大 → 疲惫事件")
    if (!req.seeds.some(sd => ctx.seeds.has(sd))) return false;
  }
  if (req.statMin) {
    for (const [k, v] of Object.entries(req.statMin)) {
      if ((ctx.stats?.[k] ?? 0) < v) return false;
    }
  }
  if (req.statMax) {
    for (const [k, v] of Object.entries(req.statMax)) {
      if ((ctx.stats?.[k] ?? 100) > v) return false;
    }
  }
  return true;
}

/**
 * 从事件池抽一条：优先满足种子/状态条件的"情境事件"(它们更贴合此刻),
 * 否则从常驻池抽;都排除最近看过的(recent)避免重复。带权重随机。
 * @param events 全部事件
 * @param ctx { seeds:Set<string>, stats:object, recent:string[], rng:()=>number }
 * @returns 抽中的事件 或 null
 */
export function pickCommuteEvent(events, ctx) {
  const rng = ctx.rng || Math.random;
  const recent = new Set(ctx.recent || []);
  const eligible = events.filter(ev => eventEligible(ev, ctx));
  // 情境事件(有 requires 且命中)优先——它们是"因为你昨晚/最近状态"才出现的,更有代入感
  const contextual = eligible.filter(ev => ev.requires && !recent.has(ev.id));
  const generic = eligible.filter(ev => !ev.requires && !recent.has(ev.id));
  // 70% 概率优先情境事件(若有),否则常驻;都用完了放宽 recent 限制
  let pool;
  if (contextual.length && rng() < 0.7) pool = contextual;
  else if (generic.length) pool = generic;
  else pool = eligible.filter(ev => !recent.has(ev.id));
  if (!pool.length) pool = eligible; // 实在没有(全看过)→ 放宽
  if (!pool.length) return null;
  return weightedPick(pool, rng);
}

function weightedPick(pool, rng) {
  const total = pool.reduce((sum, ev) => sum + (ev.weight || 1), 0);
  let r = rng() * total;
  for (const ev of pool) {
    r -= (ev.weight || 1);
    if (r <= 0) return ev;
  }
  return pool[pool.length - 1];
}

/**
 * 应用通勤选择：改状态 + 收集 followupSeed(埋给未来的连锁事件)。纯函数。
 * @returns {{ stats, followupSeed:?string }}
 */
export function applyCommuteChoice(stats, option) {
  const s = { ...(stats || {}) };
  if (option?.effect) {
    for (const [k, v] of Object.entries(option.effect)) {
      const cur = s[k] || 0;
      s[k] = k === 'money' ? cur + v : Math.max(0, Math.min(100, cur + v));
    }
  }
  return { stats: s, followupSeed: option?.followupSeed || null };
}

/**
 * 维护"最近看过"队列：加入新 id,保留最近 N 条(默认5),防短期重复。
 */
export function pushRecent(recent, id, keep = 5) {
  const arr = [...(recent || []), id];
  return arr.slice(-keep);
}
