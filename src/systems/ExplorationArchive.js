// ExplorationArchive：跨职业·跨存档的「职业探索档案」（引导方向的落点）。
// 纯逻辑核心 + 薄 localStorage 封装（node 单测走纯函数，浏览器走类）。
//
// 一个迷茫学生靠体验单一职业很难找方向——方向感来自横向比较。本档案跨周目累积：
//  - riasec：开局测评的兴趣向量（行为可再校准）
//  - axisTotals：四条人格轴的累计增量（跨职业汇总）
//  - careers：每个试过的职业 { subRoles:{sub:{fit,ending,ts}}, bestFit }
//  - thoughts / achievements：解锁的职业感悟 / 成就
// 报告与探索仪表盘据此做「你试过什么、更像什么、下一步去试什么」。

import { CAREER_ANCHORS, CAREER_NAMES, rankCareers } from './CareerFit.js';
import { AXIS_KEYS } from './PersonalityAxes.js';

export const ARCHIVE_KEY = 'wdwtb_archive';
const ARCHIVE_VERSION = 1;

/** 空档案 */
export function emptyArchive() {
  return {
    version: ARCHIVE_VERSION,
    riasec: {},
    axisTotals: {},
    careers: {},        // { career: { subRoles:{}, bestFit:number } }
    thoughts: [],       // 解锁的感悟 id
    achievements: [],   // 解锁的成就 id
    updatedAt: 0,
  };
}

/** 容错读取：任意输入 → 合法档案 */
export function coerceArchive(a) {
  const base = emptyArchive();
  if (!a || typeof a !== 'object') return base;
  base.riasec = (a.riasec && typeof a.riasec === 'object') ? { ...a.riasec } : {};
  base.axisTotals = (a.axisTotals && typeof a.axisTotals === 'object') ? { ...a.axisTotals } : {};
  base.careers = (a.careers && typeof a.careers === 'object') ? JSON.parse(JSON.stringify(a.careers)) : {};
  base.thoughts = Array.isArray(a.thoughts) ? [...a.thoughts] : [];
  base.achievements = Array.isArray(a.achievements) ? [...a.achievements] : [];
  base.updatedAt = Number(a.updatedAt) || 0;
  return base;
}

/**
 * 合并一局结果（纯函数，返回新档案，不改原对象）。
 * @param {object} archive
 * @param {{career,subRole,ending,axisTotals,fitScore,riasec}} run
 */
export function mergeRun(archive, run = {}) {
  const a = coerceArchive(archive);
  const career = run.career;
  if (!career) return a;
  // 兴趣向量：若本局带了（首次开局播种），覆盖式记录
  if (run.riasec && typeof run.riasec === 'object' && Object.keys(run.riasec).length) {
    a.riasec = { ...run.riasec };
  }
  // 人格轴：累加
  if (run.axisTotals && typeof run.axisTotals === 'object') {
    for (const k of AXIS_KEYS) {
      const v = Number(run.axisTotals[k]);
      if (Number.isFinite(v)) a.axisTotals[k] = (a.axisTotals[k] || 0) + v;
    }
  }
  // 职业/子职业记录
  const c = a.careers[career] || { subRoles: {}, bestFit: 0 };
  const fit = Number(run.fitScore);
  if (run.subRole) {
    c.subRoles[run.subRole] = {
      ending: run.ending || null,
      fit: Number.isFinite(fit) ? fit : null,
      ts: Date.now(),
    };
  }
  if (Number.isFinite(fit)) c.bestFit = Math.max(c.bestFit || 0, fit);
  a.careers[career] = c;
  a.updatedAt = Date.now();
  return a;
}

/** 已试职业 key 列表 */
export function triedCareers(archive) {
  const a = coerceArchive(archive);
  return Object.keys(a.careers);
}

/**
 * 推荐下一步探索方向：用兴趣锚点排序未试职业（O*NET 式），附一句理由与试点提示。
 * 若档案没有 riasec，则退化为通用锚点顺序（仍可用）。
 * @returns {{ next:{key,name,score,why,tryHint}[], deepen:{career,sub}|null }}
 */
export function recommendDirections(archive, { topN = 3 } = {}) {
  const a = coerceArchive(archive);
  const tried = new Set(Object.keys(a.careers));
  const profile = { riasec: a.riasec || {}, holland: hollandFromRiasec(a.riasec) };
  const ranked = rankCareers(profile).filter((r) => !tried.has(r.key));
  const next = ranked.slice(0, Math.max(1, topN));
  // 深耕建议：已试职业里契合最高、且还有未试子职业的
  let deepen = null;
  let bestFit = -1;
  for (const [career, c] of Object.entries(a.careers)) {
    const subs = SUBROLES_BY_CAREER[career] || [];
    const untried = subs.filter((s) => !(c.subRoles && c.subRoles[s]));
    if (untried.length && (c.bestFit || 0) > bestFit) {
      bestFit = c.bestFit || 0;
      deepen = { career, careerName: CAREER_NAMES[career] || career, sub: untried[0] };
    }
  }
  return { next, deepen };
}

/** 探索完成度：试过的职业数 / 总职业数（含子职业细分） */
export function completion(archive) {
  const a = coerceArchive(archive);
  const totalCareers = Object.keys(CAREER_ANCHORS).length;
  const triedN = Object.keys(a.careers).length;
  let subTotal = 0, subTried = 0;
  for (const [career, subs] of Object.entries(SUBROLES_BY_CAREER)) {
    subTotal += subs.length;
    const c = a.careers[career];
    if (c && c.subRoles) subTried += subs.filter((s) => c.subRoles[s]).length;
  }
  return {
    careers: { tried: triedN, total: totalCareers, pct: Math.round((triedN / totalCareers) * 100) },
    subRoles: { tried: subTried, total: subTotal, pct: subTotal ? Math.round((subTried / subTotal) * 100) : 0 },
    thoughts: (a.thoughts || []).length,
    achievements: (a.achievements || []).length,
  };
}

// 各职业已知子职业（用于完成度/深耕推荐；随内容扩充）
const SUBROLES_BY_CAREER = {
  programmer: ['dev', 'test'],
};

/** 从 riasec 向量取前三码拼霍兰德码（scoreCareer 会用到） */
function hollandFromRiasec(riasec = {}) {
  const KEYS = ['R', 'I', 'A', 'S', 'E', 'C'];
  return KEYS
    .map((k) => [k, Number(riasec[k]) || 0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .join('');
}

// ============ 浏览器封装（localStorage）============
export class ExplorationArchive {
  constructor() { this.data = ExplorationArchive.load(); }

  static _ls() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }
  static load() {
    const ls = ExplorationArchive._ls();
    if (!ls) return emptyArchive();
    try { return coerceArchive(JSON.parse(ls.getItem(ARCHIVE_KEY) || 'null')); }
    catch (e) { return emptyArchive(); }
  }
  save() {
    const ls = ExplorationArchive._ls();
    if (!ls) return;
    try { ls.setItem(ARCHIVE_KEY, JSON.stringify(this.data)); } catch (e) {}
  }
  mergeRun(run) { this.data = mergeRun(this.data, run); this.save(); return this.data; }
  recommendDirections(opts) { return recommendDirections(this.data, opts); }
  completion() { return completion(this.data); }
  triedCareers() { return triedCareers(this.data); }
  unlockThought(id) {
    if (id && !this.data.thoughts.includes(id)) { this.data.thoughts.push(id); this.save(); }
  }
  unlockAchievement(id) {
    if (id && !this.data.achievements.includes(id)) { this.data.achievements.push(id); this.save(); }
  }
}
