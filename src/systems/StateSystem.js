import Phaser from 'phaser';

// StateSystem：玩家 8 项状态数值管理。
// 继承 EventEmitter，自身可 emit 事件；引擎共用模块，不写死剧情。
export class StateSystem extends Phaser.Events.EventEmitter {
  constructor() {
    super();

    // 初始值（写死）
    this.stats = {
      health: 80,
      energy: 100,
      san: 80,
      stress: 20,
      skill: 10,
      performance: 50,
      money: 0,
      passion: 70,
    };

    // 阈值预警用：记录上次是否已低于 20（仅 health/san/passion 三项）
    this._belowThreshold = {
      health: this.stats.health < 20,
      san: this.stats.san < 20,
      passion: this.stats.passion < 20,
    };
  }

  get(key) {
    return this.stats[key];
  }

  getAll() {
    return { ...this.stats };
  }

  set(key, value) {
    // money 不限上限，其余 clamp 在 0~100
    let newValue = value;
    if (key !== 'money') {
      newValue = Phaser.Math.Clamp(newValue, 0, 100);
    }
    this.stats[key] = newValue;

    this.emit('change', key, newValue);
    this._checkThreshold(key, newValue);

    return newValue;
  }

  change(key, delta) {
    // 辅助模式（Celeste 式）：负面变化（掉血/涨压力等）减半，让任何人都能走到结局。
    // 正面变化不变。开关存 localStorage wdwtb_settings.assist。
    let d = delta;
    if (this._assistEnabled()) {
      const isNegative = (key === 'stress') ? delta > 0 : delta < 0; // stress 涨是负面，其余跌是负面
      if (isNegative) d = delta * 0.5;
    }
    // 在原值基础上加 d，复用 set 的 clamp 逻辑
    return this.set(key, this.stats[key] + d);
  }

  _assistEnabled() {
    try {
      const s = JSON.parse(localStorage.getItem('wdwtb_settings') || '{}');
      return !!s.assist;
    } catch (e) { return false; }
  }

  // 从存档恢复状态（续档用）。直接写入数值（不走 set，避免恢复到一个本就低于 20 的
  // 值时误触发 threshold 危机事件），之后统一重算阈值基线 + 发一次 change 让 HUD 刷新。
  // 未知键忽略，已知键缺省保持当前值，容错脏数据。
  restore(statsObj) {
    if (!statsObj || typeof statsObj !== 'object') return;
    for (const key of Object.keys(this.stats)) {
      if (typeof statsObj[key] === 'number') {
        // money 不 clamp，其余 clamp 0~100（与 set 一致）
        this.stats[key] = key === 'money'
          ? statsObj[key]
          : Phaser.Math.Clamp(statsObj[key], 0, 100);
      }
    }
    // 重算阈值基线：恢复到低位不算"刚刚跌破"，不触发危机事件
    for (const k of ['health', 'san', 'passion']) {
      this._belowThreshold[k] = this.stats[k] < 20;
    }
    // 通知 HUD 刷新（单次 change，key=null 表示批量恢复，StatusBarUI 据此全量刷新）
    this.emit('change', null, null);
  }

  // 阈值预警：health/san/passion 从 >=20 跨到 <20 时触发，避免重复
  _checkThreshold(key, newValue) {
    const dangerKeys = ['health', 'san', 'passion'];
    if (!dangerKeys.includes(key)) return;

    const wasBelow = this._belowThreshold[key];
    const isBelow = newValue < 20;

    if (!wasBelow && isBelow) {
      this.emit('threshold', { key, value: newValue });
    }
    this._belowThreshold[key] = isBelow;
  }
}
