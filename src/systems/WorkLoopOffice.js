// WorkLoopOffice：办公室工作日循环纯逻辑（无 Phaser）。
// 从 WorldScene 拆出：任务链 URL、名册 NPC defs、导师派活/交付、小游戏进度上报。
// 目的：可单测 + 薄适配进 WorldScene，避免再整文件 thrash。

import {
  WORK_LOOP_CAREERS,
  DEFAULT_SUBROLE,
  isWorkLoopCareer,
  defaultSubRole,
  isStoryPending,
} from './StoryProgress.js';

export { WORK_LOOP_CAREERS, DEFAULT_SUBROLE, isWorkLoopCareer, defaultSubRole };

/**
 * 任务定义 URL：workLoop 用 taskchain_{career}_{subRole}，否则 quests_{career}。
 */
export function questDataUrl(career, subRole, workLoopEnabled) {
  if (workLoopEnabled && isWorkLoopCareer(career)) {
    const sub = subRole || defaultSubRole(career) || 'dev';
    return `./data/taskchain_${career}_${sub}.json`;
  }
  return `./data/quests_${career}.json`;
}

/**
 * 从 roster JSON 生成 NPC defs；无名册时返回 null（调用方走主题三槽回落）。
 * @param {object|null} roster  { npcs: [...] }
 * @param {string} career
 * @returns {Array|null}
 */
export function npcDefsFromRoster(roster, career) {
  if (!isWorkLoopCareer(career)) return null;
  const list = roster?.npcs;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.map(n => ({
    id: n.id,
    name: n.name,
    role: n.role,
    skin: n.skin,
    x: n.x,
    y: n.y,
    tint: n.tint != null
      ? (typeof n.tint === 'number' ? n.tint : parseInt(String(n.tint).replace(/^0x/i, ''), 16))
      : null,
    label: `${n.name}${n.role ? ` · ${n.role}` : ''}`,
    mark: n.mark || '💬',
    markColor: n.markColor || '#7ec8ff',
    act: n.act,
    line: n.line,
    linesByAct: n.linesByAct || null,
    // E5：按好感分档的寒暄池（cold/neutral/warm，可 string[] 或按幕）
    linesByAffinity: n.linesByAffinity || null,
    defaultMark: n.mark || '💬',
    defaultMarkColor: n.markColor || '#7ec8ff',
  }));
}

/**
 * NPC 寒暄台词随剧情幕变化：世界"记得"现在演到哪了。
 * linesByAct: { "1": [...], "3": [...] } —— 取 ≤ 当前幕的最大 key（act2 没写就沿用 act1）。
 * 数组内随机（rng 可注入便于单测）；没有 linesByAct 或全空时回落到 npc.line。
 *
 * @param {object} npc  含 linesByAct / line
 * @param {number} act  当前幕(1-5)
 * @param {() => number} [rng]  0..1 随机源，默认 Math.random
 * @returns {string|null}
 */
export function npcLineForAct(npc, act, rng = Math.random) {
  if (!npc) return null;
  const byAct = npc.linesByAct;
  if (byAct && typeof byAct === 'object') {
    const a = Number.isFinite(act) && act >= 1 ? Math.floor(act) : 1;
    // 找 ≤ act 的最大 key
    let best = -1;
    for (const k of Object.keys(byAct)) {
      const kn = Number(k);
      if (Number.isFinite(kn) && kn <= a && kn > best && Array.isArray(byAct[k]) && byAct[k].length) {
        best = kn;
      }
    }
    if (best >= 0) {
      const pool = byAct[String(best)];
      return pool[Math.floor(rng() * pool.length) % pool.length];
    }
  }
  return npc.line || null;
}

/**
 * 小游戏完成后的进度上报：同时推 mgType 与 'work'（任务链 o2 统一 target=work）。
 * @returns {string[]} 实际 progress 的 target 列表
 */
export function reportMinigameProgress(questSystem, mgType) {
  if (!questSystem || typeof questSystem.progress !== 'function') return [];
  const targets = [];
  const t = mgType || 'coding';
  questSystem.progress('minigame', t);
  targets.push(t);
  if (t !== 'work') {
    questSystem.progress('minigame', 'work');
    targets.push('work');
  }
  // 兼容老任务 interact computer
  if (typeof questSystem.progress === 'function') {
    questSystem.progress('interact', 'computer');
    targets.push('computer');
  }
  return targets;
}

/**
 * 导师交互的「任务层」动作（交付 / 接取 / 进行中提示）。
 * 不含剧情播报——调用方在 kind==='none' 时继续走 story 状态机。
 *
 * @returns {{
 *   kind: 'deliver'|'accept'|'hint'|'none',
 *   questId?: string,
 *   line?: string,
 *   progressGain?: number,
 * }}
 */
export function seniorInteractAction({
  questSystem,
  story,
  workLoopEnabled,
  act,
} = {}) {
  if (!questSystem) return { kind: 'none' };
  const ctx = { act: act != null ? act : (story?.act || 1) };

  // 1) 可交付优先
  for (const q of questSystem.active()) {
    if (q.giver === 'senior' && questSystem.isReady(q.id)) {
      return {
        kind: 'deliver',
        questId: q.id,
        line: q.doneLine || `「${q.title}」完成！干得漂亮。`,
        progressGain: typeof q.progressGain === 'number' ? q.progressGain : 0,
        title: q.title,
      };
    }
  }

  // 2) workLoop + 无待播剧情 → 派活 / 提示
  const pending = isStoryPending(story
    ? { ...story, act: ctx.act }
    : null);
  if (workLoopEnabled && !pending) {
    for (const q of questSystem.available(ctx)) {
      if (q.giver !== 'senior') continue;
      // accept 后才能 nextObjective；line 在 applySeniorAccept 里拼
      return {
        kind: 'accept',
        questId: q.id,
        title: q.title,
        acceptLine: q.acceptLine || `新任务：「${q.title}」`,
      };
    }
    for (const q of questSystem.active()) {
      if (q.giver !== 'senior') continue;
      const next = questSystem.nextObjective
        ? questSystem.nextObjective(q.id)
        : null;
      if (next) {
        return {
          kind: 'hint',
          questId: q.id,
          line: `「${q.title}」还在你手上。\n▸ ${next.text}`,
          title: q.title,
        };
      }
    }
  }

  return { kind: 'none' };
}

/**
 * 应用 accept：接任务 + 返回带 ▸ 下一步 的台词。
 * @returns {{ ok: boolean, line?: string, questId?: string }}
 */
export function applySeniorAccept(questSystem, action) {
  if (!questSystem || !action || action.kind !== 'accept' || !action.questId) {
    return { ok: false };
  }
  if (!questSystem.accept(action.questId)) return { ok: false };
  const next = questSystem.nextObjective
    ? questSystem.nextObjective(action.questId)
    : null;
  const hint = next ? `\n▸ ${next.text}` : '';
  return {
    ok: true,
    questId: action.questId,
    line: `${action.acceptLine || `新任务已接取`}${hint}`,
  };
}

/**
 * 应用 deliver。
 * @returns {{ ok: boolean, progressGain?: number, line?: string }}
 */
export function applySeniorDeliver(questSystem, action) {
  if (!questSystem || !action || action.kind !== 'deliver' || !action.questId) {
    return { ok: false };
  }
  if (!questSystem.complete(action.questId)) return { ok: false };
  return {
    ok: true,
    questId: action.questId,
    progressGain: action.progressGain || 0,
    line: action.line,
  };
}

/**
 * 办公室事件是否落在当前幕（minAct/maxAct 可选门槛）。
 * 裁员传闻不该出现在蜜月期 —— 数据侧写 minAct 即可。
 */
export function eventEligibleForAct(ev, act = 1) {
  if (!ev || typeof ev !== 'object') return false;
  const a = Number.isFinite(Number(act)) ? Math.floor(Number(act)) : 1;
  if (ev.minAct != null && a < Number(ev.minAct)) return false;
  if (ev.maxAct != null && a > Number(ev.maxAct)) return false;
  return true;
}

/** @returns {object[]} */
export function filterEventsByAct(events, act = 1) {
  if (!Array.isArray(events)) return [];
  return events.filter((e) => eventEligibleForAct(e, act));
}

/**
 * 纯逻辑：按幕过滤 + 优先未见过 + 可注入 rng。
 * @param {object[]} events
 * @param {Set<string>|string[]|null} seenIds
 * @param {number} act
 * @param {() => number} [rng]  0..1
 * @returns {{ event: object|null, seen: Set<string>, resetSeen: boolean }}
 */
export function pickOfficeEvent(events, seenIds = null, act = 1, rng = Math.random) {
  const eligible = filterEventsByAct(events, act);
  const seen = seenIds instanceof Set
    ? new Set(seenIds)
    : new Set(Array.isArray(seenIds) ? seenIds : []);
  if (!eligible.length) return { event: null, seen, resetSeen: false };

  let pool = eligible.filter((e) => e && (e.id == null || !seen.has(e.id)));
  let resetSeen = false;
  if (!pool.length) {
    seen.clear();
    pool = eligible.slice();
    resetSeen = true;
  }
  if (!pool.length) return { event: null, seen, resetSeen };

  const r = typeof rng === 'function' ? rng() : Math.random();
  const idx = Math.abs(Math.floor(r * pool.length)) % pool.length;
  const event = pool[idx] || null;
  if (event && event.id != null) seen.add(event.id);
  return { event, seen, resetSeen };
}

/**
 * 办公室随机事件「一次掷骰」的完整决策（纯逻辑）。
 * 合成：触发概率 → 幕次门槛 → 关系门槛 → 去重抽取。
 * WorldScene 只负责「现在能不能弹窗」的场景态（对话/UI/坐下），不在此。
 *
 * @param {object} opts
 * @param {object[]} opts.events
 * @param {Set|string[]|null} [opts.seenIds]
 * @param {number} [opts.act]
 * @param {{ getAffinity?: Function, knows?: Function }|null} [opts.relations]
 *   需满足 eventMeetsRelations 的接口（RelationshipSystem 实例即可）
 * @param {number} [opts.fireChance=0.55]  掷到 ≤ 该值才触发（与历史 55% 一致）
 * @param {() => number} [opts.rng]
 * @param {(ev: object, rel: object|null) => boolean} [opts.relationFilter]
 * @returns {{ fired: boolean, event: object|null, seen: Set, resetSeen: boolean, reason?: string }}
 */
export function tryPickOfficeEvent({
  events = [],
  seenIds = null,
  act = 1,
  relations = null,
  fireChance = 0.55,
  rng = Math.random,
  relationFilter = null,
} = {}) {
  const roll = typeof rng === 'function' ? rng() : Math.random();
  const seenBase = seenIds instanceof Set
    ? new Set(seenIds)
    : new Set(Array.isArray(seenIds) ? seenIds : []);

  if (!(roll <= fireChance)) {
    return { fired: false, event: null, seen: seenBase, resetSeen: false, reason: 'chance' };
  }

  let pool = Array.isArray(events) ? events.slice() : [];
  // 关系门槛（可选过滤器；默认放行全部）
  if (typeof relationFilter === 'function') {
    pool = pool.filter((e) => relationFilter(e, relations));
  }

  const picked = pickOfficeEvent(pool, seenBase, act, rng);
  if (!picked.event) {
    return {
      fired: false,
      event: null,
      seen: picked.seen,
      resetSeen: picked.resetSeen,
      reason: 'empty_pool',
    };
  }
  return {
    fired: true,
    event: picked.event,
    seen: picked.seen,
    resetSeen: picked.resetSeen,
  };
}

/**
 * 将 seniorInteractAction 的结果应用到 QuestSystem（accept/deliver）。
 * hint/none 不改系统状态。
 * @returns {{ ok: boolean, kind: string, line?: string, progressGain?: number, questId?: string }}
 */
export function applySeniorAction(questSystem, action) {
  if (!action || !action.kind) return { ok: false, kind: 'none' };
  if (action.kind === 'deliver') {
    const r = applySeniorDeliver(questSystem, action);
    return { ...r, kind: 'deliver', line: r.line || action.line };
  }
  if (action.kind === 'accept') {
    const r = applySeniorAccept(questSystem, action);
    return { ...r, kind: 'accept' };
  }
  if (action.kind === 'hint') {
    return {
      ok: true,
      kind: 'hint',
      line: action.line,
      questId: action.questId,
    };
  }
  return { ok: false, kind: action.kind || 'none' };
}

/**
 * 办公室事件选项 → 待应用的纯副作用计划（无 Phaser / 无 StateSystem）。
 * WorldScene 只负责 change/adjust/UI。
 *
 * @param {object} choice
 * @param {object} [ev]
 * @returns {{
 *   effects: Record<string, number>,
 *   projectDelta: number,
 *   addOrder: boolean,
 *   result: string|null,
 *   resultColor: string,
 * }}
 */
export function planEventChoiceEffects(choice = {}, ev = {}) {
  const effects = {};
  if (choice && choice.effects && typeof choice.effects === 'object') {
    for (const [k, v] of Object.entries(choice.effects)) {
      const n = Number(v);
      if (Number.isFinite(n) && n !== 0) effects[k] = n;
    }
  }
  const projectDelta = Number(choice?.projectDelta);
  return {
    effects,
    projectDelta: Number.isFinite(projectDelta) ? projectDelta : 0,
    addOrder: !!(choice && choice.addOrder),
    result: (choice && choice.result) ? String(choice.result) : null,
    resultColor: ev && ev.urgent ? '#ff9a7a' : '#ffd24d',
  };
}

/**
 * 今日工作日报的数据行（纯展示结构，无 Phaser）。
 *
 * @param {object} opts
 * @returns {{ day: number, progGain: number, rows: Array<{label:string,value:string,color:string,key?:string}> }}
 */
export function buildDailyReportRows({
  day = 1,
  progressNow = 0,
  dayStartProgress = 0,
  todayPerformance = 0,
  daysLeft = null,
  isBehind = false,
  statsNow = {},
  statsStart = {},
  salary = null,
} = {}) {
  const progGain = Math.max(0, Math.round((Number(progressNow) - Number(dayStartProgress || 0)) * 10) / 10);
  const rows = [
    { key: 'progGain', label: '📈 项目推进', value: `+${progGain}%`, color: '#5fbf7f' },
    { key: 'perf', label: '⭐ 今日绩效', value: `+${Number(todayPerformance) || 0}`, color: '#ffd24d' },
    { key: 'progTotal', label: '📊 项目总进度', value: `${Math.round(Number(progressNow) || 0)}%`, color: '#8fd0ff' },
  ];
  if (salary != null) {
    rows.push({ key: 'salary', label: '💰 今日工资', value: `+${Number(salary) || 0}`, color: '#f0c060' });
  }
  if (daysLeft != null) {
    rows.push({
      key: 'daysLeft',
      label: '⏳ 距交付',
      value: `${daysLeft} 天`,
      color: isBehind ? '#ff7a7a' : '#bfb0d0',
    });
  }
  const LABELS = {
    health: '健康', energy: '精力', san: '理智', stress: '压力', passion: '热情', skill: '技能',
  };
  for (const [k, lbl] of Object.entries(LABELS)) {
    const d = Math.round((Number(statsNow[k]) || 0) - (Number(statsStart[k]) || 0));
    if (d === 0) continue;
    const good = (k === 'stress') ? d < 0 : d > 0;
    rows.push({
      key: `stat_${k}`,
      label: `　${lbl}`,
      value: `${d > 0 ? '+' : ''}${d}`,
      color: good ? '#8fd08f' : '#e08a8a',
    });
  }
  return { day: Number(day) || 1, progGain, rows };
}
