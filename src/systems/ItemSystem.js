// ItemSystem：背包/物品——纯逻辑、无 Phaser，可序列化进存档槽。
// 物品目录来自 items.json（catalog 注入）；背包是 {itemId: count} 计数式。
//
// 核心行为：
//   add(id)        入包（容量上限 CAP=8 种，同种叠加不占新格）
//   use(id)        使用：返回 use 效果对象（调用方 apply 到 StateSystem），计数-1
//   removeOne(id)  减一个（送礼用）
//   list()         [{id, count, ...目录字段}] 供 UI 渲染
//   serialize/restore 存档
//
// 送礼（纯函数 applyGift）：好感 = giftAffinity 基础值；命中 NPC favoriteItem 时 ×2。
// 每 NPC 每天限收 1 件（giftedToday 记录，跨天由调用方 resetDaily 清）。

export const BAG_CAP = 8; // 最多 8 种（同种无上限叠加）

export class ItemSystem {
  constructor(catalog = {}) {
    this.catalog = catalog;        // { id: {name, icon, price, use, giftAffinity, desc, ...} }
    this.bag = Object.create(null); // { id: count }
    this.giftedToday = Object.create(null); // { npcId: true } 每天限送1件
  }

  setCatalog(catalog) { this.catalog = catalog || {}; }

  /** 目录里有这个物品定义吗 */
  known(id) { return !!(id && this.catalog[id]); }

  /** 背包里有吗 */
  has(id) { return (this.bag[id] || 0) > 0; }

  count(id) { return this.bag[id] || 0; }

  /** 当前占用的"种类"格数 */
  slotCount() { return Object.keys(this.bag).filter(k => this.bag[k] > 0).length; }

  /**
   * 入包。目录外物品/超容量拒绝。
   * @returns {{ ok: boolean, reason?: 'unknown'|'full' }}
   */
  add(id, n = 1) {
    if (!this.known(id)) return { ok: false, reason: 'unknown' };
    if (!this.has(id) && this.slotCount() >= BAG_CAP) return { ok: false, reason: 'full' };
    this.bag[id] = (this.bag[id] || 0) + n;
    return { ok: true };
  }

  /** 减一个（送礼/使用共用）。没有则 false。 */
  removeOne(id) {
    if (!this.has(id)) return false;
    this.bag[id] -= 1;
    if (this.bag[id] <= 0) delete this.bag[id];
    return true;
  }

  /**
   * 使用物品：返回效果对象（不直接改状态——调用方 apply），计数-1。
   * readonly 物品（期待记录）不可使用。
   * @returns {{ ok: boolean, effects?: object, reason?: string }}
   */
  use(id) {
    if (!this.has(id)) return { ok: false, reason: 'none' };
    const def = this.catalog[id];
    if (!def || def.readonly || !def.use) return { ok: false, reason: 'not_usable' };
    this.removeOne(id);
    return { ok: true, effects: { ...def.use } };
  }

  /** 供 UI 渲染的背包列表（带目录字段） */
  list() {
    return Object.keys(this.bag)
      .filter(id => this.bag[id] > 0)
      .map(id => ({ id, count: this.bag[id], ...(this.catalog[id] || {}) }));
  }

  /** 可送礼的物品（排除 readonly / giftAffinity=0） */
  giftable() {
    return this.list().filter(it => !it.readonly && (it.giftAffinity || 0) > 0);
  }

  /** 今天还能给这个 NPC 送吗 */
  canGiftTo(npcId) { return !this.giftedToday[npcId]; }

  /** 标记今天已送 */
  markGifted(npcId) { this.giftedToday[npcId] = true; }

  /** 新的一天：清空每日送礼记录 */
  resetDaily() { this.giftedToday = Object.create(null); }

  serialize() {
    return { bag: { ...this.bag }, giftedToday: { ...this.giftedToday } };
  }

  restore(data) {
    this.bag = Object.create(null);
    this.giftedToday = Object.create(null);
    if (!data || typeof data !== 'object') return;
    if (data.bag && typeof data.bag === 'object') {
      for (const [k, v] of Object.entries(data.bag)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) this.bag[k] = Math.floor(n);
      }
    }
    if (data.giftedToday && typeof data.giftedToday === 'object') {
      for (const k of Object.keys(data.giftedToday)) this.giftedToday[k] = true;
    }
  }
}

/**
 * 送礼结算（纯函数）：好感=giftAffinity，命中 favoriteItem ×2。
 * 不改 ItemSystem/RelationshipSystem 状态——调用方按返回值执行。
 *
 * @param {object} opts
 * @param {ItemSystem} opts.items
 * @param {{ id: string, favoriteItem?: string }} opts.npc
 * @param {string} opts.itemId
 * @returns {{ ok: boolean, reason?: string, affinity?: number, favorite?: boolean }}
 */
export function planGift({ items, npc, itemId } = {}) {
  if (!items || !npc || !npc.id || !itemId) return { ok: false, reason: 'bad_args' };
  if (!items.has(itemId)) return { ok: false, reason: 'no_item' };
  if (!items.canGiftTo(npc.id)) return { ok: false, reason: 'daily_limit' };
  const def = items.catalog[itemId];
  if (!def || def.readonly || !(def.giftAffinity > 0)) return { ok: false, reason: 'not_giftable' };
  const favorite = npc.favoriteItem === itemId;
  const affinity = favorite ? def.giftAffinity * 2 : def.giftAffinity;
  return { ok: true, affinity, favorite };
}

/**
 * 今日工资（纯函数）：底薪 + 今日绩效。让"干活挣钱"闭环。
 * @param {number} todayPerformance 今日绩效增量
 * @param {number} [base=50] 底薪
 */
export function dailySalary(todayPerformance, base = 50) {
  const perf = Number.isFinite(Number(todayPerformance)) ? Math.max(0, Number(todayPerformance)) : 0;
  return Math.round(base + perf);
}

/**
 * 压力产出折扣（纯函数）：stress ≥ 70 → 产出 ×0.8。
 * @returns {{ multiplier: number, stressed: boolean }}
 */
export function stressOutputMultiplier(stress) {
  const s = Number(stress) || 0;
  if (s >= 70) return { multiplier: 0.8, stressed: true };
  return { multiplier: 1, stressed: false };
}

/**
 * 技能时限加成（纯函数）：小游戏时限 + skill/2 秒（上限 +20s）。
 * @returns {number} 加成秒数
 */
export function skillTimeBonus(skill) {
  const s = Number(skill) || 0;
  return Math.min(20, Math.floor(Math.max(0, s) / 2));
}

/**
 * 精力门槛（纯函数）：energy < 15 不能开工；energy <= 0 强制下班。
 * @returns {{ canWork: boolean, forceOff: boolean }}
 */
export function energyGate(energy) {
  const e = Number(energy) || 0;
  return { canWork: e >= 15, forceOff: e <= 0 };
}
