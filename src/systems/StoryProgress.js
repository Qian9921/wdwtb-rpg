// StoryProgress：WorldScene 剧情/经营期纯逻辑（无 Phaser）。
// 拆出目的：可单测、与 UI/场景解耦；行为与原 WorldScene 硬编码一致。

/** 深度职业每幕经营天数（非 workLoop 时用） */
export const ACT_DAYS = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 1 };

/** 轻量职业（单文件 light_*.json） */
export const LIGHT_CAREERS = [
  'designer', 'operation', 'teacher', 'doctor', 'civilservant', 'sales', 'lawyer',
];

/** 工作日循环职业：任务链 + 工单 + 事件 + 名册 */
export const WORK_LOOP_CAREERS = new Set([
  'programmer', 'product', 'admin', 'designer', 'operation',
  'teacher', 'doctor', 'civilservant', 'sales', 'lawyer',
]);

/** 各职业默认 subRole */
export const DEFAULT_SUBROLE = {
  programmer: 'dev',
  product: 'biz',
  admin: 'office',
  designer: 'visual',
  operation: 'content',
  teacher: 'homeroom',
  doctor: 'clinic',
  civilservant: 'window',
  sales: 'field',
  lawyer: 'litigation',
};

/** 项目进度 % → 解锁幕次 */
export const MILESTONE_ACT = { 25: 2, 50: 3, 75: 4, 100: 5 };

export function isWorkLoopCareer(career) {
  return WORK_LOOP_CAREERS.has(career);
}

export function isLightCareer(career) {
  return LIGHT_CAREERS.includes(career);
}

export function defaultSubRole(career) {
  return DEFAULT_SUBROLE[career] || 'dev';
}

export function actDaysNeeded(act) {
  return ACT_DAYS[act] || 1;
}

/** 默认剧情状态 */
export function createStoryState(overrides = {}) {
  return {
    phase: 'ready',
    act: 1,
    daysInAct: 0,
    checkpoint: null,
    pendingAct: null,
    ...overrides,
  };
}

/** 合并存档 story（浅合并，存档字段覆盖默认） */
export function mergeStoryState(savedStory) {
  const base = createStoryState();
  if (!savedStory || typeof savedStory !== 'object') return base;
  return { ...base, ...savedStory };
}

/** 是否有待播剧情（导师优先剧情而非派活） */
export function isStoryPending(story) {
  if (!story) return false;
  return story.phase === 'ready'
    || (story.pendingAct != null && story.pendingAct > (story.act || 0));
}

/**
 * 剧情 next_act 后进入经营期。
 * @returns {{ story, shouldEnd: boolean, nextAct: number }}
 */
export function enterWorkingAfterAct(story, currentAct) {
  const act = currentAct || (story && story.act) || 1;
  const next = act + 1;
  if (next > 5) {
    return { story: { ...story }, shouldEnd: true, nextAct: next };
  }
  return {
    story: {
      ...story,
      phase: 'working',
      act,
      daysInAct: 0,
      checkpoint: null,
    },
    shouldEnd: false,
    nextAct: next,
  };
}

/**
 * 项目里程碑：若 pct 对应幕次大于当前 act，则挂 pendingAct。
 * @returns {{ story, unlocked: boolean, pendingAct: number|null, toastOnly: boolean }}
 */
export function applyProjectMilestone(story, pct, currentAct) {
  const act = currentAct != null ? currentAct : (story?.act || 1);
  const actForPct = MILESTONE_ACT[pct];
  if (!actForPct || actForPct <= act) {
    return {
      story: { ...story },
      unlocked: false,
      pendingAct: story?.pendingAct ?? null,
      toastOnly: true,
    };
  }
  return {
    story: { ...story, pendingAct: actForPct },
    unlocked: true,
    pendingAct: actForPct,
    toastOnly: false,
  };
}

/**
 * workLoop 经营期：有 pendingAct 则推进到该幕 ready。
 * @returns {{ story, act, advanced: boolean, playUrl: string|null }}
 */
export function tryAdvanceByMilestone(story, currentAct, career, deep = true) {
  const act = currentAct != null ? currentAct : (story?.act || 1);
  if (story?.pendingAct != null && story.pendingAct > act) {
    const newAct = story.pendingAct;
    return {
      story: {
        ...story,
        act: newAct,
        phase: 'ready',
        pendingAct: null,
      },
      act: newAct,
      advanced: true,
      playUrl: deep && !isLightCareer(career)
        ? `./data/${career}_act${newAct}.json`
        : (isLightCareer(career) ? `./data/light_${career}.json` : `./data/${career}_act${newAct}.json`),
    };
  }
  return {
    story: { ...story },
    act,
    advanced: false,
    playUrl: null,
  };
}

/**
 * 非 workLoop 深度职业：按 daysInAct 攒天推进。
 * @returns {{ story, act, advanced: boolean, daysLeft: number, playUrl: string|null }}
 */
export function tryAdvanceByDays(story, currentAct, career) {
  const act = currentAct != null ? currentAct : (story?.act || 1);
  const need = actDaysNeeded(act);
  const days = story?.daysInAct || 0;
  if (days >= need) {
    const newAct = act + 1;
    return {
      story: {
        ...story,
        act: newAct,
        phase: 'ready',
        daysInAct: 0,
      },
      act: newAct,
      advanced: true,
      daysLeft: 0,
      playUrl: `./data/${career}_act${newAct}.json`,
    };
  }
  return {
    story: { ...story },
    act,
    advanced: false,
    daysLeft: need - days,
    playUrl: null,
  };
}

/**
 * 轻量+workLoop：light 剧情 ending 且项目未满 → 进经营期。
 */
export function shouldDeferLightEnding(workLoopEnabled, career, projectProgress) {
  return !!(workLoopEnabled && isLightCareer(career)
    && (projectProgress == null || projectProgress < 100));
}

export function enterWorkingFromLightEnding(story, currentAct) {
  const act = currentAct || story?.act || 1;
  return {
    ...story,
    phase: 'working',
    act,
    checkpoint: null,
  };
}

/**
 * 轻量+workLoop 经营期：项目 100% 可结局。
 */
export function canFinishLightWorkLoop(story, projectProgress) {
  return story?.phase === 'working' && (projectProgress ?? 0) >= 100;
}

/**
 * 导师头顶标记语义（不含任务 deliver 覆盖）。
 * @returns {'story'|'quest'|'sleep'|null}
 */
export function seniorMarkKind(story, {
  workLoopEnabled,
  hasSeniorQuest,
  act,
} = {}) {
  if (!story) return null;
  if (story.phase === 'ready') return 'story';
  if (story.phase === 'working') {
    if (workLoopEnabled) {
      if (story.pendingAct != null && story.pendingAct > (act ?? story.act ?? 0)) return 'story';
      if (hasSeniorQuest) return 'quest';
      return 'sleep';
    }
    const need = actDaysNeeded(act ?? story.act ?? 1);
    if ((story.daysInAct || 0) >= need) return 'story';
    return 'sleep';
  }
  return null;
}

/**
 * 导师是否显示头顶浮标（深度职业，或 light+workLoop）。
 * 与 WorldScene 原条件一致：!LIGHT || workLoop
 */
export function seniorUsesStoryMarks(career, workLoopEnabled) {
  return !isLightCareer(career) || !!workLoopEnabled;
}

/**
 * 导师最终头顶图标（deliver 优先于剧情/任务/睡觉）。
 * @returns {{ emoji: string, color: string, kind: string }|null}
 */
export function seniorMarkVisual(story, {
  workLoopEnabled,
  hasSeniorQuest,
  hasSeniorDeliver,
  act,
  career,
} = {}) {
  if (career != null && !seniorUsesStoryMarks(career, workLoopEnabled)) return null;
  // 可交付优先 ❓（与原 _updateNpcMarks 一致）
  if (hasSeniorDeliver) {
    return { emoji: '❓', color: '#7eff7e', kind: 'deliver' };
  }
  const kind = seniorMarkKind(story, { workLoopEnabled, hasSeniorQuest, act });
  if (kind === 'story' || kind === 'quest') {
    return { emoji: '❗', color: '#ffdd33', kind };
  }
  if (kind === 'sleep') {
    return { emoji: '💤', color: '#8a8a9e', kind };
  }
  return null;
}

/**
 * 睡觉推进经营天数（HomeScene / 跨天）。
 */
export function bumpDaysInAct(story, delta = 1) {
  if (!story) return createStoryState({ phase: 'working', daysInAct: delta });
  return {
    ...story,
    daysInAct: (story.daysInAct || 0) + delta,
  };
}

/**
 * 组装写入存档的 extra 字段形状（不写 localStorage）。
 */
export function buildWorldSaveExtra({
  subRole = null,
  quests = null,
  choiceLog = null,
  thought = null,
  daySystem = null,
  segment = null,
  project = null,
  story = null,
} = {}) {
  return {
    subRole,
    quests,
    choiceLog,
    thought,
    daySystem,
    segment,
    project,
    story,
  };
}

/**
 * 任务链 HUD 下一步文案（纯展示）。
 */
export function chainHudStep(questSystem, act) {
  if (!questSystem) {
    return { title: null, step: '⛓ 主线任务链暂不可用' };
  }
  const chainQ = questSystem.active().find(q => q.giver === 'senior' && q.ordered)
    || questSystem.available({ act }).find(q => q.giver === 'senior');
  if (!chainQ) {
    return { title: null, step: '⛓ 主线任务链已全部完成,把手头工单收尾吧', quest: null };
  }
  const accepted = questSystem.accepted[chainQ.id];
  const next = accepted ? questSystem.nextObjective(chainQ.id) : null;
  const step = next
    ? `▸ ${next.text}`
    : (accepted ? '▸ 回去找导师交付' : '▸ 去找导师领任务');
  return { title: chainQ.title, step, quest: chainQ };
}

/**
 * 底部引导条文案：与 objectiveHud 同源，避免静态「新人报到」与真实下一步打架。
 * @param {{ text?: string }|null} goal  _currentGoal() 结果
 * @param {string} [seniorName] 导师显示名
 */
export function bottomGuideFromGoal(goal, seniorName = '导师') {
  if (goal && goal.text) return `📋 ${goal.text}`;
  return `▸ 找头顶 ❗ 的人，或按 ESC 打开任务日志（导师：${seniorName}）`;
}
