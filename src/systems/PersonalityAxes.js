// PersonalityAxes：行为化职业人格轴（纯逻辑，无 Phaser，可 node 单测）。
// 主旨落点之一——不靠问卷，靠玩家一路的选择(choice.axes 增量)悄悄测绘职业人格。
//
// 四条轴（每条 -100..+100，0=中性）：
//   collab  独立(-) ↔ 协作(+)
//   plan    随性(-) ↔ 规划(+)
//   empathy 理性(-) ↔ 共情(+)
//   risk    求稳(-) ↔ 冒险(+)
// 累计来自 ChoiceLog.axisTotals()（原始增量和），再压缩到 -100..+100 便于展示与判定。

export const AXIS_KEYS = ['collab', 'plan', 'empathy', 'risk'];

// 每条轴两端的中文标签（负极 / 正极）+ 单字签 + 轴名
export const AXIS_META = {
  collab: { name: '协作取向', neg: '独立', pos: '协作', negChar: '独', posChar: '协' },
  plan: { name: '做事方式', neg: '随性', pos: '规划', negChar: '随', posChar: '规' },
  empathy: { name: '决策依据', neg: '理性', pos: '共情', negChar: '理', posChar: '共' },
  risk: { name: '风险态度', neg: '求稳', pos: '冒险', negChar: '稳', posChar: '冒' },
};

// 原始增量和 → 展示值(-100..+100) 的压缩尺度：约 ±20 的净累计即接近满极。
const SCALE = 20;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * 把原始增量和(axisTotals)归一到 -100..+100 的展示向量。
 * 用 tanh 式软压缩：小累计线性、大累计收敛，避免"选几次就顶满"。
 * @param {Record<string,number>} totals  如 { collab:-6, plan:8 }
 * @returns {Record<string,number>} 四轴齐全，缺省为 0
 */
export function normalizeAxes(totals = {}) {
  const out = {};
  for (const k of AXIS_KEYS) {
    const raw = Number(totals[k]) || 0;
    const t = raw / SCALE;
    // 软压缩：tanh 近似（避免引入依赖），保证单调、收敛到 ±1
    const squashed = t / (1 + Math.abs(t));
    out[k] = Math.round(clamp(squashed, -1, 1) * 100);
  }
  return out;
}

/**
 * 某条轴的强度(0..100)与倾向端("pos"/"neg"/"mid")。
 */
export function axisReading(value) {
  const v = Number(value) || 0;
  const strength = Math.abs(v);
  let pole = 'mid';
  if (v >= 12) pole = 'pos';
  else if (v <= -12) pole = 'neg';
  return { value: v, strength, pole };
}

/**
 * 四字人格签：每条轴取其倾向端的单字标签，中性取更贴近的一端的字（弱化）。
 * 例：独立/规划/理性/求稳 → "独规理稳"。轴接近 0 时用括注"偏"。
 * @param {Record<string,number>} axes  归一后的展示向量
 * @returns {{ code:string, parts:{key,label,pole,value}[] }}
 */
export function personalitySignature(axes = {}) {
  const parts = AXIS_KEYS.map((k) => {
    const r = axisReading(axes[k]);
    const meta = AXIS_META[k];
    // 中性时取更接近的一端（value>=0→pos），单字取标签首字
    const pole = r.pole === 'mid' ? (r.value >= 0 ? 'pos' : 'neg') : r.pole;
    const label = pole === 'pos' ? meta.pos : meta.neg;
    const char = pole === 'pos' ? meta.posChar : meta.negChar;
    return { key: k, label, char, pole, value: r.value, strength: r.strength };
  });
  const code = parts.map((p) => p.char).join('');
  return { code, parts };
}

/**
 * 从当前人格向量提炼强项 / 盲点（带证据的措辞由报告层补，这里给结构化标签）。
 * 强项 = 倾向鲜明(|v|≥30)的轴端；盲点 = 该端天然的代价。
 * @returns {{ strengths:{axis,pole,label,text}[], blindspots:{axis,pole,text}[] }}
 */
export function axisHighlights(axes = {}) {
  const strengths = [];
  const blindspots = [];
  for (const k of AXIS_KEYS) {
    const r = axisReading(axes[k]);
    if (r.strength < 30) continue; // 只对鲜明倾向给结论
    const meta = AXIS_META[k];
    const s = STRENGTH_TEXT[k][r.pole];
    const b = BLINDSPOT_TEXT[k][r.pole];
    if (s) strengths.push({ axis: k, pole: r.pole, label: r.pole === 'pos' ? meta.pos : meta.neg, text: s });
    if (b) blindspots.push({ axis: k, pole: r.pole, text: b });
  }
  // 强项按倾向强度降序，最多 3 条；盲点最多 2 条
  strengths.sort((a, b) => Math.abs(axes[b.axis] || 0) - Math.abs(axes[a.axis] || 0));
  blindspots.sort((a, b) => Math.abs(axes[b.axis] || 0) - Math.abs(axes[a.axis] || 0));
  return { strengths: strengths.slice(0, 3), blindspots: blindspots.slice(0, 2) };
}

const STRENGTH_TEXT = {
  collab: { pos: '你在协作里被点亮：主动对齐、乐于借力，是团队黏合剂。', neg: '你在独处深工里最高效：能自我驱动，扛得住一个人啃硬骨头。' },
  plan: { pos: '你做事有章法：会先规划再动手，交付稳、少返工。', neg: '你灵活敏捷：先跑起来再迭代，适合模糊、快变的场景。' },
  empathy: { pos: '你决策带温度：会顾及人的感受，团队关系处得好。', neg: '你判断冷静：就事论事、按证据与逻辑推进，不被情绪带偏。' },
  risk: { pos: '你敢押注：在不确定里也肯先迈一步，能抓住窗口。', neg: '你稳健可靠：先兜住风险再前进，是关键时刻的定海神针。' },
};
const BLINDSPOT_TEXT = {
  collab: { pos: '过度协作可能牺牲深度专注——留出无人打扰的整块时间。', neg: '太独立容易信息孤岛——重要节点主动同步一句会更省事。' },
  plan: { pos: '计划太满会怕变化——给需求留一点弹性空间。', neg: '太随性可能欠沉淀——关键决策不妨先写下再动手。' },
  empathy: { pos: '太顾及感受可能难说"不"——练习守住必要的边界。', neg: '太就事论事可能显冷——一句共情能让协作顺很多。' },
  risk: { pos: '爱冒险要配一张回滚方案——把下行风险先兜住。', neg: '太求稳会错过窗口——有些机会值得算清后果就上。' },
};

// 每日复盘用·一句人格微洞察（按当日最鲜明的轴给一句)
const MICRO = {
  collab: { pos: '今天你更愿意找人协作——借力也是一种能力。', neg: '今天你更爱独处深工——一个人也能扛。' },
  plan: { pos: '今天你谋定而后动——规划让你稳。', neg: '今天你先跑起来再说——敏捷是你的节奏。' },
  empathy: { pos: '今天你更顾及了人——温柔别忘了也留给自己。', neg: '今天你更就事论事——理性帮你守住判断。' },
  risk: { pos: '今天你敢押注——记得给冒险配张回滚方案。', neg: '今天你选了稳妥——求稳是你的定海神针。' },
};

/**
 * 一句人格微洞察：取当前最鲜明(|v|≥12)的轴给一句;都不鲜明则给通用鼓励。
 * @param {Record<string,number>} axes  归一向量
 * @returns {string}
 */
export function microInsight(axes = {}) {
  let best = null, mag = 12;
  for (const k of AXIS_KEYS) {
    const v = Math.abs(Number(axes[k]) || 0);
    if (v >= mag) { mag = v; best = k; }
  }
  if (!best) return '今天的选择还在慢慢拼出「你」——继续走。';
  return MICRO[best][(Number(axes[best]) || 0) >= 0 ? 'pos' : 'neg'];
}

/**
 * 一站式：从 ChoiceLog 的 axisTotals → 归一向量 + 四字签 + 强项盲点。
 * @param {Record<string,number>} totals
 */
export function buildAxesProfile(totals = {}) {
  const axes = normalizeAxes(totals);
  const signature = personalitySignature(axes);
  const highlights = axisHighlights(axes);
  return { axes, signature, ...highlights };
}
