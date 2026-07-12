import Phaser from 'phaser';

// TimeSystem：日内时段系统。把"一天"切成若干时段（早会→上午→午休→下午→加班→深夜），
// 用来驱动办公室的"作息感"：不同时段人数不同、灯光不同、氛围不同。
//
// 关键设计：时间不是每秒流逝，而是**事件驱动**——完成任务 / 推进剧情 → advance() → 跨入下一时段。
// 这样时间的推进和玩家的行动绑定，符合"随着事件推进进入一天不同时段"的诉求。
//
// 纯逻辑（不碰渲染），继承 EventEmitter，与 DaySystem/StateSystem 同构，可 node 单测。
//
// 每个时段字段：
//   id        —— 唯一标识
//   label     —— HUD 显示名（如"上午"）
//   clock     —— HUD 时钟字符串（如"10:30"）
//   icon      —— HUD 图标（☀/🌤/🌙）
//   ambient   —— 传给 _applyAmbient 的灯光 key
//   population—— 在岗人数比例 0..1（1=坐满，0.15=只剩零星加班的人）
//
// 事件：
//   'segmentChange'(segment, index) —— 进入新时段（驱动灯光 + NPC 人数/日程）
// population: 各时段在岗背景同事比例。⚠️ 低谷时段别降太狠——用户反馈"做完一件事一抬头
// 人少了大半、像NPC消失了"。午休 0.35→0.7(午休也有不少人在工位吃/加班)、深夜 0.15→0.4
// (加班的人还在),让办公室始终有人气,时段变化平缓不突兀,而不是骤然空场。
export const SEGMENTS = [
  { id: 'morning_meeting', label: '早会',  clock: '09:00', icon: '☀', ambient: 'office_day',     population: 1.0 },
  { id: 'forenoon',        label: '上午',  clock: '10:30', icon: '☀', ambient: 'office_day',     population: 1.0 },
  { id: 'noon',            label: '午休',  clock: '12:00', icon: '🌤', ambient: 'office_day',     population: 0.7 },
  { id: 'afternoon',       label: '下午',  clock: '14:00', icon: '☀', ambient: 'office_day',     population: 1.0 },
  { id: 'overtime',        label: '加班',  clock: '18:30', icon: '🌆', ambient: 'office_evening', population: 0.65 },
  { id: 'deep_night',      label: '深夜',  clock: '21:30', icon: '🌙', ambient: 'office_night',   population: 0.4 },
];

export class TimeSystem extends Phaser.Events.EventEmitter {
  constructor(opts = {}) {
    super();
    this.segments = opts.segments || SEGMENTS;
    this.index = 0; // 当前时段下标
  }

  // 当前时段对象
  get current() {
    return this.segments[this.index];
  }

  // 是否已到最后一个时段（深夜）
  get isLast() {
    return this.index >= this.segments.length - 1;
  }

  // 直接跳到某时段（存档恢复用），越界钳制；变化才 emit
  setIndex(i) {
    const clamped = Phaser.Math.Clamp(i | 0, 0, this.segments.length - 1);
    if (clamped === this.index) return this.current;
    this.index = clamped;
    this.emit('segmentChange', this.current, this.index);
    return this.current;
  }

  // 推进到下一时段（完成任务/剧情事件时调用）。已在最后时段则不动，返回 null。
  advance() {
    if (this.isLast) return null;
    this.index += 1;
    this.emit('segmentChange', this.current, this.index);
    return this.current;
  }

  // 首次进入世界时触发一次 segmentChange，让灯光/人数按当前时段就位。
  kick() {
    this.emit('segmentChange', this.current, this.index);
    return this.current;
  }

  // HUD 文本："☀ 上午 10:30"
  hudText() {
    const s = this.current;
    return `${s.icon} ${s.label} ${s.clock}`;
  }
}
