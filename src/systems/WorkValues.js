// WorkValues：五项职场胜任力（纯逻辑，无 Phaser，可 node 单测）。
// 与 Persona 五维社交属性同构，但由"真实工作行为"累积——玩家每完成一环工作 / 处理一个
// 事件，对应胜任力增长；报告里以条形呈现，也作为成长树的可视化数据源。
//
// 五维：
//   pro     专业力（写代码/评审/测试的质量）
//   comm    沟通力（对接、协作、表达）
//   resil   抗压力（在高压/加班/事故里稳住）
//   exec    执行力（把事推到落地、按时交付）
//   empco   共情力（顾及同事/用户/团队关系）

export const VALUE_KEYS = ['pro', 'comm', 'resil', 'exec', 'empco'];

export const VALUE_META = {
  pro: { name: '专业力', hint: '把活儿做对做扎实' },
  comm: { name: '沟通力', hint: '对齐、表达、协作' },
  resil: { name: '抗压力', hint: '高压下稳得住' },
  exec: { name: '执行力', hint: '把事推到落地' },
  empco: { name: '共情力', hint: '顾及人与关系' },
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * 胜任力累加器。values 是 { key: 0..100 }，从 0 起步（初值可传）。
 */
export class WorkValues {
  constructor(initial = {}) {
    this.values = {};
    for (const k of VALUE_KEYS) this.values[k] = clamp(Number(initial[k]) || 0, 0, 100);
  }

  get(key) { return this.values[key] || 0; }

  /** 施加一组增量，返回自身（链式）。自动 clamp 0..100。 */
  gain(delta = {}) {
    for (const [k, v] of Object.entries(delta)) {
      if (!VALUE_KEYS.includes(k)) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      this.values[k] = clamp(this.values[k] + n, 0, 100);
    }
    return this;
  }

  /** 归一到 0..100 展示向量（本身就是 0..100，这里返回拷贝） */
  vector() { return { ...this.values }; }

  /** 最强的一维（用于一句话画像） */
  top() {
    let best = VALUE_KEYS[0];
    for (const k of VALUE_KEYS) if (this.values[k] > this.values[best]) best = k;
    return { key: best, name: VALUE_META[best].name, value: this.values[best] };
  }

  serialize() { return { ...this.values }; }
  restore(data) {
    if (!data || typeof data !== 'object') return;
    for (const k of VALUE_KEYS) {
      if (data[k] != null) this.values[k] = clamp(Number(data[k]) || 0, 0, 100);
    }
  }
}

/**
 * 纯函数：从一次工作产出(quality 0..1)推导胜任力增量。
 * dev/test 侧重不同——dev 更长专业，test 更长专业+执行(把关严谨)。
 * @param {{ quality?:number, kind?:string, subRole?:string }} o
 * @returns {Record<string,number>}
 */
export function workGain({ quality = 0.6, kind = 'work', subRole = 'dev' } = {}) {
  const q = clamp(Number(quality) || 0, 0, 1);
  const base = 2 + Math.round(q * 4); // 2..6
  const g = { pro: base };
  if (kind === 'talk') { g.comm = 3; g.pro = 1; }
  else if (kind === 'review' || kind === 'gate') { g.pro = base; g.exec = 2; }
  else if (kind === 'testcase' || kind === 'regression') { g.pro = base; g.exec = 2; }
  else g.exec = 1 + Math.round(q * 2);
  if (subRole === 'test') g.exec = (g.exec || 0) + 1; // 守护者更长把关执行
  return g;
}
