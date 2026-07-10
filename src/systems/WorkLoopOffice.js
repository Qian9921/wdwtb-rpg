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
    defaultMark: n.mark || '💬',
    defaultMarkColor: n.markColor || '#7ec8ff',
  }));
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
