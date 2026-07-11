// CareerReport：职业人格报告组装（纯逻辑，无 Phaser，可 node 单测）。
// 主旨的交付物——把一局的行为(选择/工作/状态) + 跨职业档案，组装成一份有证据链、
// 可对比、可执行的报告：不是命运判决，是「探索方向指引」。
//
// 报告结构：
//  ① 霍兰德 Top3 码 + 职业人格原型
//  ② RIASEC 雷达(0..100) + 五胜任力条
//  ③ 带行为证据的强项  ④ 诚实盲点
//  ⑤ 3 条可执行探索方向（相邻角色 + 补什么技能 + 去做这三件事）
//  ⑥ 置信度（画像鲜明 / 仍在探索）
//  ⑦ 跨职业对比

import { CAREER_NAMES, CAREER_ANCHORS, scoreCareer, rankCareers, buildCareerContrast, bodySignalsFromStats } from './CareerFit.js';
import { buildAxesProfile, AXIS_META } from './PersonalityAxes.js';
import { VALUE_META } from './WorkValues.js';
import { recommendDirections } from './ExplorationArchive.js';

const RIASEC_KEYS = ['R', 'I', 'A', 'S', 'E', 'C'];
const RIASEC_NAMES = { R: '实干', I: '研究', A: '艺术', S: '社交', E: '进取', C: '常规' };

// 子职业原型名（镜子）
const SUBROLE_ARCHETYPE = {
  programmer: { dev: '造物者', test: '守护者' },
};

/** riasec 向量 → 0..100 雷达（按自身最大值归一，保证形状可读） */
function riasecRadar(riasec = {}) {
  const vals = RIASEC_KEYS.map((k) => Math.max(0, Number(riasec[k]) || 0));
  const max = Math.max(1, ...vals);
  const out = {};
  RIASEC_KEYS.forEach((k, i) => { out[k] = Math.round((vals[i] / max) * 100); });
  return out;
}

/** riasec 前三码 */
function topCode(riasec = {}) {
  return RIASEC_KEYS
    .map((k) => [k, Number(riasec[k]) || 0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join('');
}

/**
 * 置信度：画像是否鲜明。
 * 差异化 = riasec 顶端与均值的差 + 人格轴强度；越鲜明越"clear"。
 */
function computeConfidence(riasec, axes) {
  const vals = RIASEC_KEYS.map((k) => Math.max(0, Number(riasec[k]) || 0));
  const sum = vals.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...vals);
  const differentiation = max / sum; // 越高越集中
  const axisStrength = Object.values(axes).reduce((a, b) => a + Math.abs(b), 0) / 4; // 0..100
  const clear = differentiation >= 0.24 && axisStrength >= 24;
  return {
    level: clear ? 'clear' : 'exploring',
    differentiation: Math.round(differentiation * 100),
    axisStrength: Math.round(axisStrength),
    text: clear
      ? '你的职业画像已经比较鲜明——下面的方向可信度较高。'
      : '你的画像还在成形中——多试一条不同的职业线，对照会更清楚。',
  };
}

// 相邻角色转型建议（同职业内的邻近方向）+ 要补的技能 + 去做三件事
const ADJACENT_ROLES = {
  programmer: {
    dev: [
      { name: '架构 / 技术负责人', skill: '系统设计与权衡', do: ['读一个开源项目的架构文档', '给自己的项目画一版模块图', '找一位资深工程师聊"技术决策怎么做"'] },
      { name: '独立开发 / 全栈', skill: '产品到部署的全链路', do: ['做一个能上线的小工具', '学一次真实的部署与监控', '把它发给10个真实用户收反馈'] },
    ],
    test: [
      { name: '测试开发（测开）', skill: '自动化与工具建设', do: ['写一个自动化测试脚本', '学一个 CI 流水线', '给团队做一次质量数据看板'] },
      { name: '质量管理 / QA 负责人', skill: '流程与质量度量', do: ['梳理一次发布质量门禁', '统计一版缺陷分布', '推动一个流程改进'] },
    ],
  },
};

/**
 * 组装完整报告。
 * @param {object} o
 *   career, subRole, ending, stats, choiceLog(数组或含entries), archive, values(WorkValues.vector), profile(可选,含riasec)
 * @returns {object} report
 */
export function buildCareerReport({
  career = 'programmer',
  subRole = 'dev',
  ending = 'backbone',
  stats = {},
  choiceLog = null,
  archive = null,
  values = {},
  profile = null,
} = {}) {
  const careerName = CAREER_NAMES[career] || career;
  // 行为化人格轴
  const entries = Array.isArray(choiceLog) ? choiceLog : (Array.isArray(choiceLog?.entries) ? choiceLog.entries : []);
  const axisTotals = {};
  for (const e of entries) {
    if (!e || !e.axes) continue;
    for (const [k, v] of Object.entries(e.axes)) {
      const n = Number(v); if (Number.isFinite(n)) axisTotals[k] = (axisTotals[k] || 0) + n;
    }
  }
  const axesProfile = buildAxesProfile(axisTotals);

  // 兴趣向量（优先 profile.riasec，再 archive.riasec）
  const riasec = (profile && profile.riasec) || (archive && archive.riasec) || {};
  const radar = riasecRadar(riasec);
  const code = topCode(riasec);
  const archetypeSub = (SUBROLE_ARCHETYPE[career] || {})[subRole];
  const archetype = `${axesProfile.signature.code}·${archetypeSub || careerName}`;

  const fitScore = Object.keys(riasec).length ? scoreCareer({ riasec, holland: code }, career) : null;
  const confidence = computeConfidence(riasec, axesProfile.axes);

  // 强项：人格轴强项 + 行为证据
  const strengths = axesProfile.strengths.map((s) => ({
    text: s.text,
    evidence: axisEvidence(s.axis, s.pole, axisTotals),
  }));
  const blindspots = axesProfile.blindspots.map((b) => ({ text: b.text }));

  // 3 条探索方向：相邻角色(转型) + 未试职业(横向)
  const directions = buildDirections({ career, subRole, archive });

  // 胜任力条
  const competencies = VALUE_KEYS_ORDER.map((k) => ({
    key: k, name: VALUE_META[k].name, value: Math.round(Number(values[k]) || 0),
  }));

  // 身体/心情信号 + 跨职业对比
  const body = bodySignalsFromStats(stats);
  const contrast = buildCareerContrast({
    currentCareer: career,
    history: archive ? Object.keys(archive.careers || {}).map((c) => ({ career: c })) : [],
  });

  return {
    career, careerName, subRole, ending,
    code, codeName: code.split('').map((k) => RIASEC_NAMES[k] || k).join('·'),
    archetype,
    radar, axes: axesProfile.axes, signature: axesProfile.signature,
    competencies,
    fitScore,
    strengths, blindspots,
    directions,
    confidence,
    signals: body.signals,
    contrast,
    headline: `${careerName}${archetypeSub ? '·' + archetypeSub : ''} · ${archetype}`,
  };
}

const VALUE_KEYS_ORDER = ['pro', 'comm', 'resil', 'exec', 'empco'];

/** 某轴倾向的行为证据（从累计增量粗略反推次数级别的措辞） */
function axisEvidence(axisKey, pole, axisTotals) {
  const meta = AXIS_META[axisKey];
  const mag = Math.abs(Number(axisTotals[axisKey]) || 0);
  const times = Math.max(2, Math.round(mag / 2)); // 每次约 ±2
  const label = pole === 'pos' ? meta.pos : meta.neg;
  return `一路上你约 ${times} 次在关键处选了「${label}」。`;
}

/** 3 条探索方向 */
function buildDirections({ career, subRole, archive }) {
  const out = [];
  // 相邻角色（转型）
  const adj = (ADJACENT_ROLES[career] || {})[subRole] || [];
  for (const r of adj) {
    out.push({ type: 'adjacent', name: r.name, why: `你在「${career === 'programmer' && subRole === 'test' ? '守护质量' : '把东西做出来'}」上的倾向，天然衔接这个方向。`, skill: r.skill, doThree: r.do });
    if (out.length >= 2) break;
  }
  // 横向（未试职业）：用档案推荐补到 3 条
  if (archive) {
    const rec = recommendDirections(archive, { topN: 3 });
    for (const n of rec.next) {
      if (out.length >= 3) break;
      out.push({ type: 'career', name: n.name, why: n.why, skill: null, doThree: [n.tryHint] });
    }
  }
  return out.slice(0, 3);
}

/** 供 UI：轴/胜任力元数据透出 */
export { CAREER_ANCHORS, rankCareers };
