// MinigameScoring：小游戏结果 → 质量/胜任力/人格轴 的纯函数评分层（无 Phaser，可单测）。
// 让"真实工作玩法"的产出统一反哺：项目进度(quality)、胜任力(workValue)、人格轴(playStyle)。
import { workGain } from './WorkValues.js';

/**
 * 把一局结果归一为质量 0..1。
 * ratio = 答对/总数；连击给小幅加成（手感好=更专注），但不超过 1。
 * @param {{correct?:number,total?:number,maxCombo?:number}} result
 * @returns {{ quality:number, ratio:number, comboBonus:number }}
 */
export function normalizeQuality(result = {}) {
  const total = Math.max(1, Number(result.total) || 0);
  const correct = Math.max(0, Math.min(total, Number(result.correct) || 0));
  const ratio = correct / total;
  const combo = Math.max(0, Number(result.maxCombo) || 0);
  const comboBonus = Math.min(0.1, combo * 0.03); // 连击最多 +0.1
  const quality = Math.max(0, Math.min(1, ratio + comboBonus));
  return { quality, ratio, comboBonus };
}

/**
 * 质量 → 胜任力增量（委托 WorkValues.workGain，按玩法类型与子职业侧重）。
 * @param {{quality:number, kind?:string, subRole?:string}} o
 */
export function valueGainFor({ quality = 0.6, kind = 'work', subRole = 'dev' } = {}) {
  return workGain({ quality, kind, subRole });
}

/**
 * 从玩法风格轻推人格轴（工作中的行为也在测绘你）：
 *  - 又快又准(高连击/用时短) → 冒险+(敢押注)
 *  - 稳扎稳打(用时充分、少失误) → 规划+ / 求稳+
 * 幅度很小(±1)，避免盖过剧情选择；只在信号明确时给。
 * @param {{ timeUsedRatio?:number, maxCombo?:number, ratio?:number }} o
 * @returns {Record<string,number>} 轴增量（可能为空）
 */
export function playStyleAxes({ timeUsedRatio = 0.5, maxCombo = 0, ratio = 0.6 } = {}) {
  const axes = {};
  const fast = timeUsedRatio <= 0.45;
  const careful = timeUsedRatio >= 0.75;
  if (fast && maxCombo >= 2 && ratio >= 0.66) axes.risk = 1;        // 又快又准=敢冲
  if (careful && ratio >= 0.66) axes.plan = 1;                       // 慢工出细活=规划
  return axes;
}

/**
 * 一站式：结果 → { quality, valueGain, axes }
 */
export function scoreMinigame(result = {}, { kind = 'work', subRole = 'dev', timeUsedRatio = 0.5 } = {}) {
  const q = normalizeQuality(result);
  return {
    quality: q.quality,
    ratio: q.ratio,
    valueGain: valueGainFor({ quality: q.quality, kind, subRole }),
    axes: playStyleAxes({ timeUsedRatio, maxCombo: result.maxCombo, ratio: q.ratio }),
  };
}
