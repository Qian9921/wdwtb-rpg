// InsightCodex：职业感悟图鉴（纯逻辑，无 Phaser，可 node 单测）。
// 收集要素——玩家反复做出某类选择,会"悟"出一条职业感悟卡(Disco Elysium 念头味)。
// 感悟由行为标签(choice.tag)累计解锁,写入跨职业档案(thoughts),报告与图鉴展示。
// 目的:让"选择"沉淀成可收藏、可回看的自我认知,增强长线动机与"啊哈"识别感。

// 每条感悟：id、标题、正文、解锁条件(某 tag 出现≥times)、关联人格轴提示
export const INSIGHTS = [
  { id: 'ins_solo', title: '一个人也能扛', text: '你一次次选择自己啃硬骨头。独立不是不合群，是你信得过自己的判断。', tag: 'solo', times: 3, axis: 'collab-' },
  { id: 'ins_align', title: '开口问,不丢人', text: '你学会了在卡住时抬头找人。协作的人走得慢一点，却走得稳、走得远。', tag: 'align', times: 3, axis: 'collab+' },
  { id: 'ins_plan', title: '谋定而后动', text: '你习惯先把路想清楚再迈步。规划让你少返工，也让别人信得过你的交付。', tag: 'steady', times: 3, axis: 'plan+' },
  { id: 'ins_ship', title: '先跑起来', text: '你更愿意先做出个能动的版本。敏捷不是马虎，是在不确定里快速逼近答案。', tag: 'ship_fast', times: 2, axis: 'plan-' },
  { id: 'ins_boundary', title: '守住那条线', text: '你不止一次顶住压力说了"不"。边界不是不合作，是你想在这行走得更远的底气。', tag: 'boundary', times: 2, axis: 'empathy-' },
  { id: 'ins_principle', title: '质量是我的名字', text: '你一次次守住了原则,哪怕当那个"扫兴的人"。有些坚持,时间会证明它值得。', tag: 'principle', times: 2, axis: 'empathy-' },
  { id: 'ins_please', title: '讨好的代价', text: '你常常先答应下来。照顾别人是温柔,但别忘了,你也需要被自己照顾。', tag: 'please', times: 3, axis: 'empathy+' },
  { id: 'ins_report', title: '报喜不报忧', text: '你总说"都好"。把累藏起来是懂事,可有些话,说出来才不会把自己憋坏。', tag: 'report_good_news', times: 2, axis: 'empathy+' },
  { id: 'ins_safe', title: '能回滚,才敢上', text: '关键时刻你选了稳妥。求稳不是胆小,是你懂得为下行风险留好退路。', tag: 'safe', times: 1, axis: 'risk-' },
  { id: 'ins_bold', title: '敢赌一把', text: '你在不确定里肯先迈一步。冒险要配一张回滚方案,但抓住窗口的,往往是你这样的人。', tag: 'bold', times: 1, axis: 'risk+' },
  { id: 'ins_ask_mentor', title: '站在前人肩上', text: '你懂得向老陈这样的过来人取经。会借力的人,成长得比谁都快。', tag: 'ask_mentor', times: 1, axis: 'collab+' },
  // ── 职业共鸣类：不测「你是谁」，测「你喜不喜欢这行的核心活动」——回答初衷的「喜欢」维度 ──
  // 用 tags 数组:任一职业热爱标签累计达标即解锁(love_building/love_debugging/love_impact 合计)。
  { id: 'ins_love_code', title: '和它较劲，会上瘾', text: '你一次次为「把它跑通」「看它立起来」心跳快了一下。这不是「适合」——适合可以靠性格凑;这是更难得的「喜欢」:这件事本身让你上头。这个信号，值得你认真对待。', tags: ['love_building', 'love_debugging', 'love_impact'], times: 2, axis: 'risk+' },
  { id: 'ins_code_neutral', title: '它是工具，不是心动', text: '你把代码当成一把趁手的工具用得不错，但它没真正点着你。「做得来」和「喜欢做」是两回事。也许你该再试一条离「人」或「创意」更近的线，对照着看——热爱值得多找几次。', tags: ['neutral_impact', 'prefer_structure', 'flee_hard'], times: 2, axis: 'plan+' },
];

const BY_ID = Object.fromEntries(INSIGHTS.map(i => [i.id, i]));

/** 取某 id 的感悟定义 */
export function getInsight(id) { return BY_ID[id] || null; }

/**
 * 根据行为标签计数,算出应解锁的感悟 id 列表。
 * @param {Record<string,number>} tagCounts  如 { solo:3, please:2 }
 * @returns {string[]} 解锁的 insight id
 */
export function unlockedInsights(tagCounts = {}) {
  const out = [];
  for (const ins of INSIGHTS) {
    // 单 tag：该标签计数达标即解锁。
    // 多 tags(数组)：这组标签的计数【合计】达标即解锁——用于「职业共鸣」类
    //   (love_building/love_debugging/love_impact 是同一种『喜欢』的不同表现,应合并计数)。
    const count = Array.isArray(ins.tags)
      ? ins.tags.reduce((sum, t) => sum + (Number(tagCounts[t]) || 0), 0)
      : (Number(tagCounts[ins.tag]) || 0);
    if (count >= ins.times) out.push(ins.id);
  }
  return out;
}

/**
 * 本局新解锁(相对已有 owned)的感悟 id。
 * @param {Record<string,number>} tagCounts
 * @param {string[]} owned  已拥有的 id
 */
export function newlyUnlocked(tagCounts = {}, owned = []) {
  const have = new Set(owned);
  return unlockedInsights(tagCounts).filter(id => !have.has(id));
}

/** 图鉴总数（完成度分母） */
export const INSIGHT_TOTAL = INSIGHTS.length;
