// 对话树纯规则：无 Phaser 依赖，便于单测与引擎共用。

/**
 * 检查 choice.condition：
 *  - 普通状态键：{ min(≥), max(≤) }（如 { passion:{max:20}, stress:{min:55} }）
 *  - 特殊键 subRole：字符串或字符串数组，命中当前子职业才通过（dev/test 分支节点）
 *  - 特殊键 axis：{ 轴键:{min,max} }，按当前人格轴向量判定（人格门控节点）
 * @param {object|null|undefined} condition
 * @param {(key:string)=>number} getStat  取当前状态值
 * @param {{ subRole?:string, axes?:object }} [ctx]  子职业 + 人格轴向量（可选）
 * @returns {boolean}
 */
export function checkChoiceCondition(condition, getStat, ctx = {}) {
  if (!condition) return true;
  for (const [key, rule] of Object.entries(condition)) {
    // 子职业门控：subRole: 'dev' 或 ['dev','test']
    if (key === 'subRole') {
      const want = Array.isArray(rule) ? rule : [rule];
      if (!want.includes(ctx && ctx.subRole)) return false;
      continue;
    }
    // 人格轴门控：axis: { collab:{min:2}, risk:{max:-1} }
    if (key === 'axis') {
      if (!rule || typeof rule !== 'object') continue;
      const axes = (ctx && ctx.axes) || {};
      for (const [ak, arule] of Object.entries(rule)) {
        if (!arule || typeof arule !== 'object') continue;
        const av = Number(axes[ak]);
        const anum = Number.isFinite(av) ? av : 0;
        if (arule.min != null && anum < arule.min) return false;
        if (arule.max != null && anum > arule.max) return false;
      }
      continue;
    }
    // 普通状态键
    if (!rule || typeof rule !== 'object') continue;
    if (typeof getStat !== 'function') continue;
    const value = getStat(key);
    const v = Number(value);
    const num = Number.isFinite(v) ? v : 0;
    if (rule.min != null && num < rule.min) return false;
    if (rule.max != null && num > rule.max) return false;
  }
  return true;
}

/**
 * 过滤可见选项；全被滤掉时返回空数组（引擎层决定兜底）。
 * @param {Array} choices
 * @param {(key:string)=>number} getStat
 * @param {{ subRole?:string, axes?:object }} [ctx]
 */
export function filterVisibleChoices(choices, getStat, ctx = {}) {
  if (!Array.isArray(choices)) return [];
  return choices.filter(c => checkChoiceCondition(c && c.condition, getStat, ctx));
}
