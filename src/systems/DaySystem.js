import Phaser from 'phaser';

// DaySystem：多天循环——把"天(Day)"作为核心时间单位，让玩家"经营一段职业时光"。
// 继承 EventEmitter，与 StateSystem/QuestSystem 同构。纯逻辑（不碰渲染），可 node 单测。
//
// 每天三阶段：commute(晨·通勤) → work(日·办公室) → home(晚·回家)。
// 精力预算：每天 energyBudget，行为消耗，归零强制进入 home 阶段（下班）。
// 幕末解耦：天数攒够 actDayMap[act] → emit 'actEnd'，让"幕"有厚度（多天才解锁幕末抉择）。
//
// 事件：
//   'dayStart'(day)            —— 新一天开始
//   'phaseChange'(phase, day)  —— 阶段推进 commute→work→home
//   'exhausted'(day)           —— 精力耗尽，强制下班
//   'actEnd'(act, day)         —— 当前幕天数攒够，触发幕末抉择
export class DaySystem extends Phaser.Events.EventEmitter {
  constructor(opts = {}) {
    super();
    this.day = 1;              // 全局天数
    this.phase = 'commute';    // 'commute' | 'work' | 'home'
    this.dayInAct = 1;         // 当前幕内第几天
    this.energyBudget = 100;   // 每日精力预算
    this._maxBudget = 100;
    // 每幕占几天（数据驱动，缺省用默认）
    this.actDayMap = opts.actDayMap || { 1: 3, 2: 4, 3: 5, 4: 4, 5: 2 };
  }

  // 开新一天：重置精力预算，进入 commute 阶段，emit dayStart
  startDay() {
    this.energyBudget = this._maxBudget;
    this.phase = 'commute';
    this.emit('dayStart', this.day);
    return this.day;
  }

  // 消耗精力（行为调用）。归零则 emit exhausted 并强制进 home。
  spendEnergy(n) {
    this.energyBudget = Math.max(0, this.energyBudget - n);
    if (this.energyBudget === 0 && this.phase === 'work') {
      this.emit('exhausted', this.day);
      this.setPhase('home');
    }
    return this.energyBudget;
  }

  // 手动设置阶段（转场用），emit phaseChange
  setPhase(phase) {
    if (!['commute', 'work', 'home'].includes(phase)) return;
    if (this.phase === phase) return;
    this.phase = phase;
    this.emit('phaseChange', phase, this.day);
  }

  // 推进到下一阶段：commute→work→home。home 之后需调 endDay 进下一天。
  advancePhase() {
    const order = ['commute', 'work', 'home'];
    const idx = order.indexOf(this.phase);
    if (idx < order.length - 1) {
      this.setPhase(order[idx + 1]);
    }
    return this.phase;
  }

  // 结算当日 + 进下一天。天数攒够当前幕 → emit actEnd（触发幕末抉择）。
  // 返回 { day, actEnd:bool }。
  endDay(act) {
    this.day += 1;
    this.dayInAct += 1;
    const needDays = this.actDayMap[act] || 3;
    let actEnd = false;
    if (this.dayInAct > needDays) {
      actEnd = true;
      this.dayInAct = 1; // 进新幕，幕内天数重置
      this.emit('actEnd', act, this.day);
    }
    this.startDay();
    return { day: this.day, actEnd };
  }

  // 当前时段中文名（HUD 显示用）
  phaseName() {
    return { commute: '清晨·通勤', work: '白天·工作', home: '夜晚·回家' }[this.phase] || this.phase;
  }

  // 精力预算比例（0-1，HUD 进度条用）
  budgetRatio() {
    return this._maxBudget > 0 ? this.energyBudget / this._maxBudget : 0;
  }

  serialize() {
    return {
      day: this.day, phase: this.phase, dayInAct: this.dayInAct,
      energyBudget: this.energyBudget,
    };
  }

  restore(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.day === 'number') this.day = data.day;
    if (typeof data.dayInAct === 'number') this.dayInAct = data.dayInAct;
    if (typeof data.energyBudget === 'number') this.energyBudget = data.energyBudget;
    if (['commute', 'work', 'home'].includes(data.phase)) this.phase = data.phase;
  }
}
