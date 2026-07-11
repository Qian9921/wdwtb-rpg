// RelationshipSystem：办公室关系网（好感 / 记忆）— 纯逻辑、无 Phaser。
// 服务 E5：和谁多说话、一起扛过活，会改寒暄与可触发事件（至少程序员线）。
// 与 ChoiceLog 同级：可 serialize 进存档，可单测。

import { npcLineForAct } from './WorkLoopOffice.js';

export const DEFAULT_AFFINITY = 50;
export const AFFINITY_MIN = 0;
export const AFFINITY_MAX = 100;

/** @param {unknown} n @returns {number} */
export function clampAffinity(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_AFFINITY;
  return Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, Math.round(v)));
}

/**
 * 好感分档：cold / neutral / warm
 * @param {number} score
 * @returns {'cold'|'neutral'|'warm'}
 */
export function affinityBand(score) {
  const s = clampAffinity(score);
  if (s < 35) return 'cold';
  if (s < 65) return 'neutral';
  return 'warm';
}

/**
 * 把 linesByAffinity 某一档解析成台词池。
 * 支持 string[] 或按幕 { "1": [...], "3": [...] }（≤act 最大 key）。
 * @param {unknown} entry
 * @param {number} act
 * @returns {string[]|null}
 */
export function normalizeAffinityPool(entry, act = 1) {
  if (Array.isArray(entry)) {
    const pool = entry.filter((x) => typeof x === 'string' && x.length);
    return pool.length ? pool : null;
  }
  if (entry && typeof entry === 'object') {
    const a = Number.isFinite(Number(act)) ? Math.floor(Number(act)) : 1;
    let best = -1;
    let pool = null;
    for (const k of Object.keys(entry)) {
      const kn = Number(k);
      if (!Number.isFinite(kn) || kn > a || kn <= best) continue;
      if (!Array.isArray(entry[k]) || !entry[k].length) continue;
      best = kn;
      pool = entry[k].filter((x) => typeof x === 'string' && x.length);
    }
    return pool && pool.length ? pool : null;
  }
  return null;
}

/**
 * 关系感知台词：linesByAffinity[band] → linesByAct → line。
 * @param {{ npc: object, act?: number, affinity?: number, rng?: () => number }} opts
 * @returns {string|null}
 */
export function pickRelationAwareLine({
  npc,
  act = 1,
  affinity = DEFAULT_AFFINITY,
  rng = Math.random,
} = {}) {
  if (!npc) return null;
  const band = affinityBand(affinity);
  const byAff = npc.linesByAffinity;
  if (byAff && typeof byAff === 'object') {
    const order = band === 'warm'
      ? ['warm', 'neutral', 'cold']
      : band === 'cold'
        ? ['cold', 'neutral', 'warm']
        : ['neutral', 'warm', 'cold'];
    for (const key of order) {
      const pool = normalizeAffinityPool(byAff[key], act);
      if (pool && pool.length) {
        const r = typeof rng === 'function' ? rng() : Math.random();
        return pool[Math.abs(Math.floor(r * pool.length)) % pool.length];
      }
    }
  }
  return npcLineForAct(npc, act, rng);
}

/**
 * 事件是否满足关系门槛（minAffinity / requiresMemory）。
 * @param {object} ev
 * @param {RelationshipSystem|null} rel
 */
export function eventMeetsRelations(ev, rel) {
  if (!ev) return false;
  if (ev.minAffinity) {
    const spec = ev.minAffinity;
    const npcId = spec.npc || spec.id || spec.npcId;
    const min = spec.min != null ? Number(spec.min) : 60;
    if (npcId) {
      const score = rel ? rel.getAffinity(npcId) : DEFAULT_AFFINITY;
      if (score < min) return false;
    }
  }
  if (ev.requiresMemory) {
    const spec = ev.requiresMemory;
    const npcId = spec.npc || spec.id || spec.npcId;
    const tag = spec.tag || spec.memory;
    if (npcId && tag) {
      if (!rel || !rel.knows(npcId, tag)) return false;
    }
  }
  return true;
}

/**
 * 在 act 过滤之后再过关系门槛。
 * @param {object[]} events
 * @param {number} act
 * @param {RelationshipSystem|null} rel
 * @param {(ev: object, act: number) => boolean} [actFilter]
 */
export function filterEventsForRelations(events, act, rel, actFilter = null) {
  if (!Array.isArray(events)) return [];
  return events.filter((e) => {
    if (actFilter && !actFilter(e, act)) return false;
    return eventMeetsRelations(e, rel);
  });
}

/**
 * 一次聊天的好感/记忆结算（寒暄 or 任务对接）。
 * @returns {{ affinity: number, delta: number, band: string, firstTalk: boolean }}
 */
export function applyNpcChat(rel, npcId, { questTalk = false } = {}) {
  if (!rel || !npcId) {
    return {
      affinity: DEFAULT_AFFINITY,
      delta: 0,
      band: affinityBand(DEFAULT_AFFINITY),
      firstTalk: false,
    };
  }
  const firstTalk = !rel.knows(npcId, 'talked');
  const delta = questTalk ? 5 : 3;
  const affinity = rel.bump(npcId, delta);
  rel.remember(npcId, 'talked');
  if (questTalk) rel.remember(npcId, 'quest_talk');
  return {
    affinity,
    delta,
    band: affinityBand(affinity),
    firstTalk,
  };
}

/**
 * 报告用一句话：关系网摘要。
 * @param {RelationshipSystem|null} rel
 * @param {Record<string, string>} [namesMap]
 */
export function summarizeRelations(rel, namesMap = {}) {
  if (!rel) return { text: '', top: [] };
  const ids = new Set([
    ...Object.keys(rel.affinity || {}),
    ...Object.keys(rel.memories || {}),
  ]);
  const top = [...ids]
    .map((id) => {
      const affinity = rel.getAffinity(id);
      return {
        id,
        name: namesMap[id] || id,
        affinity,
        band: affinityBand(affinity),
        talked: rel.knows(id, 'talked'),
      };
    })
    .filter((r) => r.talked || r.affinity !== DEFAULT_AFFINITY)
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, 3);

  if (!top.length) {
    return { text: '', top: [] };
  }
  const parts = top.map((r) => {
    const tone = r.band === 'warm' ? '更熟' : r.band === 'cold' ? '偏生' : '还行';
    return `${r.name}（${tone}·${r.affinity}）`;
  });
  return {
    text: `办公室关系：${parts.join('、')}`,
    top,
  };
}

export class RelationshipSystem {
  constructor() {
    /** @type {Record<string, number>} */
    this.affinity = Object.create(null);
    /** @type {Record<string, string[]>} */
    this.memories = Object.create(null);
  }

  getAffinity(npcId) {
    if (!npcId) return DEFAULT_AFFINITY;
    return this.affinity[npcId] != null
      ? clampAffinity(this.affinity[npcId])
      : DEFAULT_AFFINITY;
  }

  /**
   * @param {string} npcId
   * @param {number} delta
   * @returns {number} 新好感
   */
  bump(npcId, delta) {
    if (!npcId) return DEFAULT_AFFINITY;
    const next = clampAffinity(this.getAffinity(npcId) + (Number(delta) || 0));
    this.affinity[npcId] = next;
    return next;
  }

  /**
   * @param {string} npcId
   * @param {string} tag
   * @param {number} [max]
   * @returns {boolean} 是否新写入
   */
  remember(npcId, tag, max = 12) {
    if (!npcId || !tag || typeof tag !== 'string') return false;
    const list = this.memories[npcId] || (this.memories[npcId] = []);
    if (list.includes(tag)) return false;
    list.push(tag);
    while (list.length > max) list.shift();
    return true;
  }

  knows(npcId, tag) {
    if (!npcId || !tag) return false;
    const list = this.memories[npcId];
    return !!(list && list.includes(tag));
  }

  serialize() {
    const memories = {};
    for (const [k, v] of Object.entries(this.memories)) {
      if (Array.isArray(v) && v.length) memories[k] = [...v];
    }
    return {
      affinity: { ...this.affinity },
      memories,
    };
  }

  restore(data) {
    this.affinity = Object.create(null);
    this.memories = Object.create(null);
    if (!data || typeof data !== 'object') return;
    if (data.affinity && typeof data.affinity === 'object') {
      for (const [k, v] of Object.entries(data.affinity)) {
        this.affinity[k] = clampAffinity(v);
      }
    }
    if (data.memories && typeof data.memories === 'object') {
      for (const [k, v] of Object.entries(data.memories)) {
        if (Array.isArray(v)) {
          this.memories[k] = v.filter((x) => typeof x === 'string' && x.length);
        }
      }
    }
  }

  clear() {
    this.affinity = Object.create(null);
    this.memories = Object.create(null);
  }
}
