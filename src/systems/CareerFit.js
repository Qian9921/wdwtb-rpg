// CareerFit：职业契合纯逻辑（无 Phaser）。
// 服务初衷三柱——测评坐标 × 全职业锚点 → 可行动推荐；本局体感 → 报告上下文。
// 模型依据：霍兰德 RIASEC 兴趣码 + 大五倾向（与 OpeningScene / assessment.json 一致）。

/** 中文名 */
export const CAREER_NAMES = {
  programmer: '程序员',
  product: '产品经理',
  admin: '高校行政',
  designer: '设计师',
  operation: '运营',
  teacher: '教师',
  doctor: '医生／护士',
  civilservant: '公务员',
  sales: '销售',
  lawyer: '律师',
};

/**
 * 各职业 RIASEC 锚点（按相关度排序的兴趣码）+ 一句话「为什么适合试」。
 * 与 assessment.json careerAnchors 应对齐；代码侧为权威完整表（10 职业）。
 */
export const CAREER_ANCHORS = {
  programmer: {
    codes: ['I', 'R', 'C'],
    why: '爱把问题拆开、做出能跑的东西；适合试「和系统死磕」的日常。',
    tryHint: '开发/测试两条细分，体感差很大，值得都点开看看。',
  },
  product: {
    // 与 assessment.json careerAnchors.product 对齐：E/I/A（S 在运营/教师更突出）
    codes: ['E', 'I', 'A'],
    why: '既要想清楚「做什么」，又要推动一群人对齐——夹心层最见性格。',
    tryHint: '业务向 vs 体验向：一个盯指标，一个盯好不好用。',
  },
  admin: {
    codes: ['C', 'S', 'E'],
    why: '流程、服务、稳定节奏；想体验「安稳背面是什么」就来这。',
    tryHint: '综合办与学工：文书规范 vs 对人服务，压力源不同。',
  },
  designer: {
    codes: ['A', 'R', 'I'],
    why: '审美与秩序并重；适合试「改稿、对齐、把感觉做成像素」的消耗。',
    tryHint: '视觉与 UI：灵感密度 vs 组件规范，喜欢哪一种累法？',
  },
  operation: {
    codes: ['E', 'A', 'S', 'C'],
    why: '内容与增长都围着「真实的人」转；适合试节奏快、反馈密的日常。',
    tryHint: '内容向讲表达，增长向讲数据——看你更想被哪边推着跑。',
  },
  teacher: {
    codes: ['S', 'A', 'I'],
    why: '人与成长在场；适合试「备课、班会、家校」那种持续输出的消耗。',
    tryHint: '班主任与任课：带班关系 vs 专业课堂，热情点不同。',
  },
  doctor: {
    codes: ['I', 'S', 'C'],
    why: '专业判断 + 照护；适合试高压、作息乱、但意义感极强的环境。',
    tryHint: '临床与护理：决策责任 vs 执行与陪伴，身体账怎么算。',
  },
  civilservant: {
    codes: ['C', 'S', 'E'],
    why: '规则、窗口、文书；适合试「稳定结构里如何保持温度」。',
    tryHint: '窗口服务与内勤：对人瞬间 vs 对文件长跑。',
  },
  sales: {
    codes: ['E', 'S', 'R'],
    why: '每一单都是一段对话；适合试拒绝、节奏与自我驱动。',
    tryHint: '大客户与电销：深度关系 vs 高频触达，看你怕哪种空。',
  },
  lawyer: {
    codes: ['I', 'C', 'E'],
    why: '证据、论证、对抗或交易；适合试「天平两端」的精神负荷。',
    tryHint: '诉讼与非诉：庭上张力 vs 合同与结构，理性如何被消耗。',
  },
};

const RIASEC_KEYS = ['R', 'I', 'A', 'S', 'E', 'C'];

function sumRiasec(riasec = {}) {
  let t = 0;
  for (const k of RIASEC_KEYS) t += Math.max(0, Number(riasec[k]) || 0);
  return t || 1;
}

/**
 * 计算玩家兴趣向量与职业锚点的契合分（0–100）。
 * 锚点靠前的码权重更高。
 */
export function scoreCareer(profile, careerKey) {
  const anchor = CAREER_ANCHORS[careerKey];
  if (!anchor) return 0;
  const r = profile?.riasec || {};
  const total = sumRiasec(r);
  const codes = anchor.codes || [];
  let weighted = 0;
  let wSum = 0;
  codes.forEach((code, i) => {
    const w = codes.length - i; // 首位权重最大
    weighted += w * (Math.max(0, Number(r[code]) || 0) / total);
    wSum += w;
  });
  const base = wSum > 0 ? (weighted / wSum) * 100 : 0;
  // 轻微用 holland 三码加分
  const holland = String(profile?.holland || '');
  let bonus = 0;
  for (const code of codes.slice(0, 2)) {
    if (holland.includes(code)) bonus += 4;
  }
  return Math.round(Math.min(100, base + bonus));
}

/**
 * 全职业排序（高分在前）。
 * @returns {{ key, name, score, why, tryHint }[]}
 */
export function rankCareers(profile) {
  return Object.keys(CAREER_ANCHORS)
    .map((key) => ({
      key,
      name: CAREER_NAMES[key] || key,
      score: scoreCareer(profile, key),
      why: CAREER_ANCHORS[key].why,
      tryHint: CAREER_ANCHORS[key].tryHint,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh'));
}

/**
 * 开局可行动建议：先试 Top2（分数接近时取前两名）。
 */
export function buildTryFirstAdvice(profile, topN = 2) {
  const ranked = rankCareers(profile);
  const picks = ranked.slice(0, Math.max(1, topN));
  return {
    ranked,
    tryFirst: picks,
    headline: picks.length >= 2
      ? `建议先试「${picks[0].name}」和「${picks[1].name}」`
      : `建议先试「${picks[0]?.name || '程序员'}」`,
    detail: picks.map((p, i) => ({
      rank: i + 1,
      key: p.key,
      name: p.name,
      score: p.score,
      reason: p.why,
      tip: p.tryHint,
    })),
  };
}

/**
 * 从本局状态提炼「身体/心情体感」信号（给报告用，不用术语压人）。
 */
export function bodySignalsFromStats(stats = {}) {
  const s = {
    health: num(stats.health, 80),
    energy: num(stats.energy, 100),
    san: num(stats.san, 80),
    stress: num(stats.stress, 20),
    skill: num(stats.skill, 10),
    performance: num(stats.performance, 50),
    passion: num(stats.passion, 70),
    money: num(stats.money, 0),
  };
  const signals = [];
  if (s.stress >= 70) signals.push('压力长期偏高，身体比嘴先喊停');
  if (s.health <= 35) signals.push('健康被透支，这门职业的作息账很重');
  if (s.energy <= 30) signals.push('精力见底，日常消耗大于回血');
  if (s.passion >= 70 && s.stress < 55) signals.push('热情还在，且压力尚可——「喜欢」的信号偏强');
  if (s.passion <= 35) signals.push('热情明显冷却，要问是职业不对还是阶段太难');
  if (s.performance >= 70 && s.san <= 40) signals.push('成绩好看但心态在掉——「适合」不等于「无代价」');
  if (s.skill >= 60 && s.passion >= 55) signals.push('越干越会，且还想继续——成长感与喜欢叠在一起');
  if (signals.length === 0) signals.push('状态整体平稳，适合再对比另一条职业线的体感差');
  return { stats: s, signals };
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/**
 * 选择轨迹摘要（与 EndingScene 逻辑兼容，可单测）。
 * @param {Array|{entries?:Array}|null} choiceLog  serialize 数组或带 length 的 log
 */
export function summarizeChoices(choiceLog) {
  const log = Array.isArray(choiceLog)
    ? choiceLog
    : (Array.isArray(choiceLog?.entries) ? choiceLog.entries : []);
  if (!log.length) return { text: '', tagCounts: {}, repeated: [] };
  const counts = {};
  for (const e of log) {
    if (e && e.tag) counts[e.tag] = (counts[e.tag] || 0) + 1;
  }
  const repeated = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `${tag}×${n}`);
  const recent = log.slice(-5).map((e) => e.choiceLabel || e.label || '').filter(Boolean);
  const parts = [];
  if (repeated.length) parts.push(`反复出现的选择倾向：${repeated.join('、')}`);
  if (recent.length) parts.push(`最近的选择：${recent.join(' → ')}`);
  return { text: parts.join('。'), tagCounts: counts, repeated };
}

/**
 * 组装结局报告用的用户上下文（喂 AI 或模板增强）。
 */
export function buildEndingReportContext({
  career = 'programmer',
  subRole = null,
  ending = 'backbone',
  stats = {},
  choiceLog = null,
  profile = null,
  projectProgress = null,
} = {}) {
  const careerName = CAREER_NAMES[career] || career;
  const body = bodySignalsFromStats(stats);
  const choices = summarizeChoices(choiceLog);
  const fit = profile ? scoreCareer(profile, career) : null;
  const anchor = CAREER_ANCHORS[career];
  const tryAdvice = profile ? buildTryFirstAdvice(profile, 3) : null;

  const lines = [
    `本局职业：${careerName}${subRole ? `（方向 ${subRole}）` : ''}`,
    fit != null ? `开局兴趣与该职业锚点契合约 ${fit} 分（仅供对照，不是判决）` : null,
    anchor ? `该职业兴趣锚点：${(anchor.codes || []).join('-')}` : null,
    projectProgress != null ? `项目/主线进度约 ${Math.round(projectProgress)}%` : null,
    `身体与心情信号：${body.signals.join('；')}`,
    choices.text ? `选择轨迹：${choices.text}` : '选择轨迹：记录较少，多依据状态推断',
    tryAdvice
      ? `若还迷茫，开局模型还曾建议对比：${tryAdvice.tryFirst.map((t) => t.name).join('、')}`
      : null,
  ].filter(Boolean);

  return {
    career,
    careerName,
    subRole,
    ending,
    fitScore: fit,
    body,
    choices,
    promptBlock: lines.join('\n'),
    summaryLine: `${careerName}线 · 契合${fit != null ? fit : '—'} · ${body.signals[0]}`,
  };
}

/**
 * 写入/读取「最近一局报告摘要」，供多职业对比（localStorage 键）。
 */
export const LAST_REPORT_KEY = 'wdwtb_last_career_report';
export const REPORT_HISTORY_KEY = 'wdwtb_career_report_history';

export function buildReportHistoryEntry(ctx, portrait = null) {
  return {
    ts: Date.now(),
    career: ctx.career,
    careerName: ctx.careerName,
    subRole: ctx.subRole,
    fitScore: ctx.fitScore,
    summaryLine: ctx.summaryLine,
    signals: ctx.body?.signals || [],
    oneLine: portrait?.oneLineForYou || null,
    fitText: portrait?.fitText || null,
  };
}

/** 纯函数：合并历史（最多保留 max 条） */
export function mergeReportHistory(prevList, entry, max = 8) {
  const list = Array.isArray(prevList) ? prevList.slice() : [];
  list.unshift(entry);
  return list.slice(0, max);
}

/**
 * 暂停菜单「一眼读懂自己」：开局建议 + 本局体感 + 当前职业。
 * @returns {{ headline: string, body: string, tryKeys: string[] }}
 */
export function buildPauseInsight({ profile = null, stats = null, career = 'programmer', act = 1 } = {}) {
  const careerName = CAREER_NAMES[career] || career;
  const body = bodySignalsFromStats(stats || {});
  const advice = profile ? buildTryFirstAdvice(profile, 2) : null;
  const fit = profile ? scoreCareer(profile, career) : null;
  const tryKeys = (advice?.tryFirst || []).map(t => t.key);
  const tryNames = (advice?.tryFirst || []).map(t => t.name).join('、');
  const headline = fit != null
    ? `${careerName} · 第${act}幕 · 开局契合 ${fit}`
    : `${careerName} · 第${act}幕`;
  const lines = [];
  if (tryNames) lines.push(`测评曾建议先试：${tryNames}（可改）`);
  if (body.signals[0]) lines.push(`此刻体感：${body.signals[0]}`);
  if (fit != null && fit < 40) lines.push('契合偏低不代表失败——对照体感，再试一条线往往更清楚。');
  if (fit != null && fit >= 60 && (stats?.passion ?? 50) >= 55) {
    lines.push('兴趣与热情都在线：这条路值得再多过几天班对照。');
  }
  if (!lines.length) lines.push('过完几天班，再问自己：适不适合、喜不喜欢。');
  return { headline, body: lines.join('\n'), tryKeys, fitScore: fit, signals: body.signals };
}

/**
 * Hub/暂停用：把试过的职业历史格式化成一行提示（关闭测评→体验→报告多周目）。
 * @param {Array|null} hist
 * @param {number} maxNames
 */
export function formatTriedCareersLine(hist, maxNames = 3) {
  if (!Array.isArray(hist) || hist.length === 0) return '';
  const seen = [];
  const keys = new Set();
  for (const e of hist) {
    if (!e || !e.career || keys.has(e.career)) continue;
    keys.add(e.career);
    seen.push(e.careerName || CAREER_NAMES[e.career] || e.career);
    if (seen.length >= maxNames) break;
  }
  if (!seen.length) return '';
  const more = hist.length > seen.length ? '…' : '';
  return `你试过：${seen.join('、')}${more} · 再点一条职业对照体感`;
}

/**
 * 解析 interact 目标的世界坐标（供 WorldScene._currentGoal 使用，可单测）。
 * @param {string} targetId
 * @param {{ interactables?: Array<{id,x?,y?,pos?}>, playerDesk?: {chair?:{x,y}, computer?:{x,y}} }} world
 */
export function resolveInteractGoalPos(targetId, world = {}) {
  if (!targetId) return null;
  // 手机：HUD 功能，引导回工位区附近即可（或列表里的 phone 点）
  const list = world.interactables || [];
  for (const o of list) {
    if (o && o.id === targetId) {
      if (o.x != null && o.y != null) return { x: o.x, y: o.y };
      if (Array.isArray(o.pos) && o.pos.length >= 2) return { x: o.pos[0], y: o.pos[1] };
    }
  }
  if (targetId === 'computer' && world.playerDesk?.chair) {
    return { x: world.playerDesk.chair.x, y: world.playerDesk.chair.y };
  }
  if (targetId === 'phone' && world.playerDesk?.chair) {
    // 无地图 phone 时仍指向工位，避免箭头失踪
    return { x: world.playerDesk.chair.x, y: world.playerDesk.chair.y };
  }
  return null;
}
