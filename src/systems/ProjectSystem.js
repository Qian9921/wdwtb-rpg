import Phaser from 'phaser';

// ProjectSystem：职场模拟经营的核心中枢——把"做工作"变成看得见的产出。
// 玩法翻转的关键：小游戏成绩 → 项目进度 + 绩效，而不只是加减状态条。
//
// 概念：
//  - 一个"项目"有 0–100% 的进度条，你每天在工位上完成【工单】来推进它。
//  - 每天从工单池抽 N 张【今日工单】（有难度/预计工时/推进值/奖励/消耗）。
//  - 在工位电脑上做某张工单 → 玩职业专属小游戏 → 成绩(quality 0..1)决定这张工单
//    推进多少进度、给多少绩效。做得好推进多、绩效高；做得差推进少、还涨压力。
//  - 项目进度跨过【里程碑阈值】(如 25/50/75/100) → emit 'milestone' → 外部接一段剧情。
//
// 纯逻辑（不碰渲染），继承 EventEmitter，可 node 单测。
//
// 事件：
//  'ordersDrawn'(orders)         —— 新一天抽出今日工单
//  'orderDone'(order, result)    —— 完成一张工单（result: {progressGain, perfGain, quality}）
//  'progress'(progress, delta)   —— 项目进度变化
//  'milestone'(pct)              —— 进度跨过某里程碑阈值
export class ProjectSystem extends Phaser.Events.EventEmitter {
  constructor(opts = {}) {
    super();
    this.progress = opts.progress || 0;        // 项目总进度 0–100
    this.performance = opts.performance || 0;   // 累计绩效
    this.todayPerformance = 0;                  // 今日绩效（日结算用）
    this.pool = opts.pool || [];                // 工单池（数据驱动）
    this.orders = [];                           // 今日工单（含 done 标记）
    this.dailyCount = opts.dailyCount || 3;     // 每天抽几张
    // 里程碑阈值（跨过即 emit）。默认对应 5 幕：入职即 0，之后 25/50/75/100。
    this.milestones = opts.milestones || [25, 50, 75, 100];
    this._hitMilestones = new Set(opts.hitMilestones || []);
    this.deadlineDay = opts.deadlineDay || 12; // 项目交付截止日(天数),制造紧迫感
  }

  // 剩余天数(deadline 紧迫感)。needSpeed=距达标还需的日均推进
  daysLeft(currentDay) { return Math.max(0, this.deadlineDay - (currentDay || 1)); }
  isBehind(currentDay) {
    const left = this.daysLeft(currentDay);
    return left <= 3 && this.progress < 100 - left * 10; // 临近且进度不够→落后
  }

  // 外部直接调整进度(如需求变更导致返工回退)
  adjustProgress(delta) { this._addProgress(delta); }

  // 任务链的"回工位干活"完成(不走工单,没有 order)——同样是工作成果,该计入绩效+项目进度。
  // 修 bug:此前任务链工作只加 skill/passion、不碰 projectSystem,导致"做了活但绩效纹丝不动、
  // 项目进度不涨"(玩家实测:项目推进了绩效却是 0)。用基础值 × 质量给一份产出,口径与 completeOrder 一致。
  // @param quality 0..1 小游戏成绩;@param opts.baseProgress/basePerf 基础产出(默认贴近一张普通工单)
  creditWork(quality = 1, opts = {}) {
    const q = Phaser.Math.Clamp(quality, 0, 1);
    const baseProgress = opts.baseProgress != null ? opts.baseProgress : 8;
    const basePerf = opts.basePerf != null ? opts.basePerf : 10;
    const progressGain = Math.round(baseProgress * (0.4 + 0.6 * q) * 10) / 10;
    const perfGain = Math.round(basePerf * (0.3 + 0.7 * q));
    this.performance += perfGain;
    this.todayPerformance += perfGain;
    this._addProgress(progressGain);
    return { progressGain, perfGain, quality: q };
  }

  // 插入一张紧急工单(随机事件触发,插队的活)
  addUrgentOrder(order) {
    const o = { id: `urgent_${Date.now()}`, title: '🔥 紧急插单', difficulty: 'hard',
      est: 3, progress: 10, performance: 14, cost: { energy: -16, stress: 8 }, urgent: true, done: false, ...order };
    this.orders.push(o);
    this.emit('ordersDrawn', this.orders);
    return o;
  }

  // 抽今日工单：按难度加权随机，不重复。清空今日绩效。
  startDay(rng = Math) {
    this.todayPerformance = 0;
    const pick = [];
    const avail = [...this.pool];
    const n = Math.min(this.dailyCount, avail.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((rng.frac ? rng.frac() : rng.random()) * avail.length);
      const o = avail.splice(idx, 1)[0];
      pick.push({ ...o, done: false });
    }
    this.orders = pick;
    this.emit('ordersDrawn', this.orders);
    return this.orders;
  }

  getOrders() { return this.orders; }
  pendingOrders() { return this.orders.filter(o => !o.done); }
  allOrdersDone() { return this.orders.length > 0 && this.orders.every(o => o.done); }

  // 完成一张工单：quality 0..1（小游戏成绩），决定推进量与绩效。
  // 推进 = 工单基础推进值 × (0.4 + 0.6×quality)（做得再差也有基础产出，做得好翻倍）。
  completeOrder(orderId, quality = 1) {
    const o = this.orders.find(x => x.id === orderId && !x.done);
    if (!o) return null;
    const q = Phaser.Math.Clamp(quality, 0, 1);
    const base = o.progress || 8;
    const progressGain = Math.round(base * (0.4 + 0.6 * q) * 10) / 10;
    const perfGain = Math.round((o.performance || 10) * (0.3 + 0.7 * q));
    o.done = true;
    o.quality = q;
    this.performance += perfGain;
    this.todayPerformance += perfGain;
    this._addProgress(progressGain);
    const result = { progressGain, perfGain, quality: q };
    this.emit('orderDone', o, result);
    return result;
  }

  _addProgress(delta) {
    const before = this.progress;
    this.progress = Phaser.Math.Clamp(this.progress + delta, 0, 100);
    this.emit('progress', this.progress, this.progress - before);
    // 里程碑跨越检测（一次性）
    for (const m of this.milestones) {
      if (before < m && this.progress >= m && !this._hitMilestones.has(m)) {
        this._hitMilestones.add(m);
        this.emit('milestone', m);
      }
    }
  }

  // 手动把某里程碑标记为已触发（剧情已播时用，避免重复触发）
  markMilestone(pct) { this._hitMilestones.add(pct); }
  isMilestoneHit(pct) { return this._hitMilestones.has(pct); }

  serialize() {
    return {
      progress: this.progress,
      performance: this.performance,
      orders: this.orders,
      hitMilestones: [...this._hitMilestones],
    };
  }

  restore(data) {
    if (!data) return;
    if (typeof data.progress === 'number') this.progress = data.progress;
    if (typeof data.performance === 'number') this.performance = data.performance;
    if (Array.isArray(data.orders)) this.orders = data.orders;
    if (Array.isArray(data.hitMilestones)) this._hitMilestones = new Set(data.hitMilestones);
  }
}
