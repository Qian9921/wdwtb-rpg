// NightLife：回家过夜的"经营决策"纯逻辑（无 Phaser，可单测）。
//
// 设计意图（对抗旧版"无限点选项刷数值 + 和主链脱节"）：
//   1) 夜晚 = 有限【行动点】预算下的取舍——每晚只有 N 点(默认2),每个活动花点数,
//      点用光就必须睡觉。逼玩家想"今晚最该做什么"。
//   2) 活动可用性【与白天状态咬合】——累到没精力就学不进去(学习变灰)、压力高会
//      解锁"好好放松"、健康低会强推"早点睡"。不再是四个固定选项随便刷。
//   3) 选择【写回状态 + 埋下第二天的种子】(seeds)——今晚熬夜明天会困、今晚陪家人
//      明天心情好,通勤事件据此变化。让"白天→晚上→第二天"真正闭环。
//
// 用法：HomeScene 用 buildNightMenu(stats) 拿到今晚可选活动 + 行动点上限,
//       玩家每选一个 applyActivity 扣点+改状态+可能埋种子,点用光/主动睡觉 → finalizeNight。

// ── 活动定义 ──
// cost: 花几个行动点; effect: 状态增量; gate: 可用性判据(读 stats,返回 {ok, reason});
// seed: 选后埋给第二天的种子标记(通勤事件据此触发); tag: 分类(用于图标/文案)。
export const NIGHT_ACTIVITIES = [
  {
    id: 'study', tag: 'study', label: '学习充电', cost: 1,
    desc: '啃点新东西，技能长一点',
    effect: { skill: 6, energy: -12, stress: 3 },
    // 累到精力 < 25 学不进去
    gate: (s) => s.energy >= 25 ? { ok: true } : { ok: false, reason: '太累了，一个字都看不进去' },
    seed: 'studied',
  },
  {
    id: 'family', tag: 'family', label: '陪陪家人', cost: 1,
    desc: '给家里打个电话，说说话',
    effect: { san: 10, passion: 3, stress: -4 },
    gate: () => ({ ok: true }),
    seed: 'warm', // 明天心情好
    family: true, // HomeScene 据此弹家人消息
  },
  {
    id: 'relax', tag: 'game', label: '打游戏放松', cost: 1,
    desc: '开一局，把脑子放空',
    effect: { stress: -12, passion: 4, energy: -4 },
    gate: () => ({ ok: true }),
    seed: 'relaxed',
  },
  {
    id: 'exercise', tag: 'exercise', label: '出门跑两圈', cost: 1,
    desc: '夜跑一会，出出汗',
    effect: { health: 8, stress: -8, energy: -10 },
    // 精力太低跑不动
    gate: (s) => s.energy >= 20 ? { ok: true } : { ok: false, reason: '腿都抬不起来，还是算了' },
    seed: 'fit',
  },
  {
    id: 'overtime', tag: 'work', label: '在家再赶点活', cost: 1,
    desc: '把明天的活先做一点，绩效+，但更累',
    effect: { performance: 4, skill: 2, stress: 8, energy: -14, health: -4 },
    gate: (s) => s.energy >= 20 ? { ok: true } : { ok: false, reason: '硬撑只会出错，别熬了' },
    seed: 'burnout', // 明天会更疲惫
  },
  {
    id: 'cook', tag: 'cook', label: '好好做顿饭', cost: 1,
    desc: '不点外卖了，自己下厨',
    effect: { health: 10, san: 5, money: -20, energy: -6 },
    gate: (s) => s.money >= 20 ? { ok: true } : { ok: false, reason: '钱包空了，下次吧' },
    seed: 'nourished',
  },
  {
    id: 'rest', tag: 'moon', label: '啥也不干，躺着', cost: 1,
    desc: '什么都不想，纯放空回血',
    effect: { energy: 12, stress: -6, health: 3 },
    gate: () => ({ ok: true }),
    seed: 'rested',
  },
  {
    // 💰 私单换钱(接主旨的关键):明确"用 health/passion 换 money"的显性对冲。
    // 反复接私单的玩家 money 高但 passion/health 塌,正好喂 CareerFit 的"拿命换钱"信号。
    // 与 overtime(用 stress/health 换 performance)形成"换钱 vs 换绩效"两条透支路径。
    id: 'gig', tag: 'work', label: '接个私单赚外快', cost: 1,
    desc: '接私活能多挣一笔，但是拿身体和热情换的',
    effect: { money: 150, health: -6, passion: -5, stress: 8, energy: -12 },
    gate: (s) => s.energy >= 25 ? { ok: true } : { ok: false, reason: '太累了，接了也做砸' },
    seed: 'burnout',
  },
  {
    // 给家里寄钱:制造"钱少但心安"的取舍。挂 family 触发家人消息。
    id: 'remit', tag: 'family', label: '给家里寄点钱', cost: 1,
    desc: '往家里打一笔，爸妈嘴上说不用，心里高兴',
    effect: { money: -200, san: 8, passion: 4, stress: -4 },
    gate: (s) => (s.money || 0) >= 200 ? { ok: true } : { ok: false, reason: '这个月手头紧，下次吧' },
    seed: 'warm', family: true,
  },
];

// 特殊活动：仅在特定白天状态下才【解锁出现】(不是常驻),制造"今晚状态特殊"的感觉。
export const SPECIAL_ACTIVITIES = [
  {
    id: 'decompress', tag: 'heart', label: '好好和自己待会儿', cost: 1,
    desc: '压力太大了，需要跟自己和解一下',
    effect: { stress: -18, san: 8, passion: 3 },
    // 仅当压力高(>=60)时出现
    unlock: (s) => s.stress >= 60,
    gate: () => ({ ok: true }),
    seed: 'healed',
  },
  {
    id: 'splurge', tag: 'gift', label: '给自己买点好的', cost: 1,
    desc: '这个月还有闲钱，犒劳一下自己',
    effect: { passion: 8, stress: -8, money: -50 },
    // 仅当有余钱(>=80)时出现
    unlock: (s) => (s.money || 0) >= 80,
    gate: () => ({ ok: true }),
    seed: 'treated',
  },
  {
    // 📚 报课充电:大额金钱→成长出口。给钱一个"投资自己"的去处,把技能成长从夜晚 study
    // 独占里分流,让"月光 vs 存钱充电"成为真实选择(需攒够 400,配合房租才有取舍)。
    id: 'course', tag: 'study', label: '报个技能班充电', cost: 1,
    desc: '花笔钱系统学一学，值不值看你怎么想',
    effect: { money: -400, skill: 8, passion: 5, energy: -8 },
    unlock: (s) => (s.money || 0) >= 400,
    gate: () => ({ ok: true }),
    seed: 'studied',
  },
];

export const NIGHT_ACTION_POINTS = 2; // 每晚行动点预算

/**
 * 构造今晚的活动菜单：常驻活动 + 满足解锁条件的特殊活动，各自算好本晚是否可用(gate)。
 * @param {object} stats 白天结束时的状态快照
 * @param {number} pointsLeft 剩余行动点(默认满)
 * @returns {{ activities: Array, pointsLeft:number, pointsMax:number, forced:?string }}
 *   activities[i] = { ...def, available:boolean, reason?:string }
 *   forced: 若某状态危急(如 health<15)返回强推提示语
 */
export function buildNightMenu(stats, pointsLeft = NIGHT_ACTION_POINTS) {
  const s = stats || {};
  const specials = SPECIAL_ACTIVITIES.filter(a => a.unlock(s));
  const pool = [...NIGHT_ACTIVITIES, ...specials];
  const activities = pool.map(a => {
    const g = a.gate(s);
    return { ...a, available: !!g.ok, reason: g.reason || '' };
  });
  // 健康/精力危急：给一句"今晚真的该早点睡"的强推(不强制,只提示)
  let forced = null;
  if ((s.health != null && s.health < 15) || (s.energy != null && s.energy < 15)) {
    forced = '身体已经在报警了——今晚别折腾，早点睡吧。';
  }
  return { activities, pointsLeft, pointsMax: NIGHT_ACTION_POINTS, forced };
}

/**
 * 应用一个活动：扣行动点 + 改状态 + 收集种子。纯函数,返回新状态,不改入参。
 * @returns {{ stats, pointsLeft, seed:?string, family:boolean, ok:boolean, reason?:string }}
 */
export function applyActivity(stats, activity, pointsLeft) {
  const s = { ...(stats || {}) };
  if (!activity) return { stats: s, pointsLeft, ok: false, reason: '无活动' };
  // 再验一次可用性(防 UI 与逻辑不同步)
  const g = activity.gate ? activity.gate(s) : { ok: true };
  if (!g.ok) return { stats: s, pointsLeft, ok: false, reason: g.reason };
  const cost = activity.cost || 1;
  if (pointsLeft < cost) return { stats: s, pointsLeft, ok: false, reason: '今晚没精力再做别的了' };
  // 应用状态增量(money 不 clamp,其余 0~100)
  if (activity.effect) {
    for (const [k, v] of Object.entries(activity.effect)) {
      const cur = s[k] || 0;
      s[k] = k === 'money' ? cur + v : Math.max(0, Math.min(100, cur + v));
    }
  }
  return {
    stats: s,
    pointsLeft: pointsLeft - cost,
    seed: activity.seed || null,
    family: !!activity.family,
    ok: true,
  };
}

/**
 * 收尾一晚：根据这晚做过的事(seeds)+ 睡前状态,计算睡眠恢复 + 埋给第二天的通勤种子。
 * 睡眠恢复：精力回满前提是没熬夜(overtime/burnout);熬夜则回得少。
 * @param {object} stats 睡前状态
 * @param {string[]} seeds 这晚累积的种子
 * @returns {{ stats, commuteSeeds:string[] }}
 */
export function finalizeNight(stats, seeds = []) {
  const s = { ...(stats || {}) };
  const set = new Set(seeds);
  // 睡眠恢复：基础 energy 回满;熬夜(burnout)只回到 70;跑步/做饭额外健康
  const burnedOut = set.has('burnout');
  s.energy = burnedOut ? Math.min(70, (s.energy || 0) + 30) : 100;
  // 压力过夜自然回落一点
  s.stress = Math.max(0, (s.stress || 0) - 4);
  // 种子传给第二天通勤(只保留会影响通勤的)
  const commuteSeeds = [...set].filter(x =>
    ['warm', 'burnout', 'studied', 'relaxed', 'fit', 'healed', 'nourished', 'rested', 'treated'].includes(x));
  return { stats: s, commuteSeeds };
}
