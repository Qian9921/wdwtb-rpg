// ChoiceLog：选择记忆系统——记录玩家全程选择，按 tag 聚合统计。
// 纯逻辑、无 Phaser 依赖（与 SaveSystem/FamilyMessages 同级），可被 node 直接单测。
// 这是结局 AI 画像的数据源：让"心之画像"从"8数值反推"升级为"懂你的轨迹"。
//
// 记录结构：{ act, nodeId, choiceLabel, tag, ts }
// tag 是设计标注的行为标签（如 'report_good_news'=报喜不报忧、'overwork'=主动加班），
// 由剧情数据的 choice.tag 字段携带（可选，无 tag 的选择只记录不聚合）。
export class ChoiceLog {
  constructor() {
    this.entries = [];
  }

  // 记录一次选择。tag 可选；缺省不参与聚合统计
  record({ act, nodeId, choiceLabel, tag } = {}) {
    this.entries.push({
      act: act ?? null,
      nodeId: nodeId ?? null,
      choiceLabel: choiceLabel ?? '',
      tag: tag ?? null,
      ts: Date.now(),
    });
  }

  // 按 tag 聚合：返回 { tag: count }。只统计有 tag 的记录。
  tagCounts() {
    const counts = {};
    for (const e of this.entries) {
      if (e.tag) counts[e.tag] = (counts[e.tag] || 0) + 1;
    }
    return counts;
  }

  // 某个 tag 出现次数
  count(tag) {
    return this.entries.filter(e => e.tag === tag).length;
  }

  // 某个 tag 是否出现过（至少 N 次，默认 1）
  has(tag, min = 1) {
    return this.count(tag) >= min;
  }

  // 取最近 N 条记录（供 AI 画像用"最近的选择轨迹"）
  recent(n = 10) {
    return this.entries.slice(-n);
  }

  // 按 act 分组
  byAct(act) {
    return this.entries.filter(e => e.act === act);
  }

  // 总选择数
  get length() { return this.entries.length; }

  // 存档序列化
  serialize() { return [...this.entries]; }

  // 从存档恢复
  restore(data) {
    if (!Array.isArray(data)) return;
    this.entries = [...data];
  }

  clear() { this.entries = []; }
}
