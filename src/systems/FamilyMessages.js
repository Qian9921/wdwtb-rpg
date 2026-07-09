// FamilyMessages：家人消息数据层 —— 加载、解析、情境匹配。
// 纯逻辑、无 Phaser 依赖（与 SaveSystem 同级），可被 node 直接单测。
// 与 PhoneMessage（纯 UI 渲染）解耦：本模块决定"显示什么"，PhoneMessage 决定"怎么显示"。
//
// 数据源：public/data/emotional_anchors.json
//   parents_messages[]: { text, context } —— text 含多行 【sender】body，context 描述适合的剧情情境
//   letter_options[]:    入职写信仪式的候选句子（由 OpeningScene/WorldScene 另行消费）
//   letter_callback:     结局开封对照模板（由 EndingScene 另行消费）
//
// 消息推送策略（呼应数据 _meta.usage："每幕1条、最多2条；低频高杀伤"）：
//   1. 幕次推进（深度职业 next_act）→ 按 act 关键词挑一条，不重复
//   2. 状态触底（threshold）→ 挑一条"至暗/触底"情境的消息（情感弧线最重的一击）
//   3. phone_message action（剧情数据显式触发）→ 按指定关键词挑一条
//   4. 结局 → pickForEnding 按 5 种结局挑专属回响消息

const DATA_URL = './data/emotional_anchors.json';

// 幕次 → 情境关键词（匹配 context 字段子串）。深度职业 5 幕各一档。
const ACT_KEYWORDS = {
  1: ['第一幕', '入职'],
  2: ['第二幕', '上手'],
  3: ['第三幕', '996', '消耗'],
  4: ['第四幕', '至暗'],
  5: ['抉择'],
};

// 状态触底时的情境关键词（health/san/passion 跌破阈值，玩家最脆弱时）
const THRESHOLD_KEYWORDS = ['至暗', '触底', 'stress高位', '最低点'];

// 结局 key（EndingScene.ENDING_NAMES）→ context 关键词
const ENDING_KEYWORDS = {
  backbone: '成为骨干',
  quit: '裸辞出走',
  health: '身体警告',
  switch: '转行',
  light: '找到你的光',
};

export class FamilyMessages {
  constructor() {
    this._cache = null;     // 解析后的 JSON（null=未加载/加载失败）
    this._seen = new Set(); // 已展示过的消息索引，去重保证"每幕尽量不重复"
  }

  // 加载数据（带缓存，重复调用只 fetch 一次）。失败不抛错，返回 null。
  async load() {
    if (this._cache) return this._cache;
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._cache = await res.json();
    } catch (e) {
      console.warn('[FamilyMessages] 加载失败，家人消息暂不可用:', e.message);
      this._cache = null;
    }
    return this._cache;
  }

  // 解析原始 text（多行 【sender】body）→ [{sender, text}]
  // 无前缀的续行追加到上一条气泡，空行跳过。
  parseText(raw) {
    if (!raw) return [];
    const bubbles = [];
    for (const line of String(raw).split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const m = trimmed.match(/^【(.+?)】(.*)$/);
      if (m) {
        bubbles.push({ sender: m[1], text: m[2] });
      } else if (bubbles.length > 0) {
        // 续行（无前缀）追加到上一条，保持整段完整
        bubbles[bubbles.length - 1].text += trimmed;
      }
    }
    return bubbles;
  }

  // 按关键词匹配非结局、未看过的消息，返回索引数组。
  _match(keywords) {
    if (!this._cache || !keywords.length) return [];
    const list = this._cache.parents_messages || [];
    const out = [];
    list.forEach((msg, i) => {
      if (this._seen.has(i)) return;
      const ctx = msg.context || '';
      if (/结局/.test(ctx)) return;            // 结局专属消息不在此匹配
      if (keywords.some(k => ctx.includes(k))) out.push(i);
    });
    return out;
  }

  // 随机取一个索引（标记已看），返回 { bubbles, context, index } 或 null
  _pick(indices) {
    if (!indices.length) return null;
    const i = indices[Math.floor(Math.random() * indices.length)];
    this._seen.add(i);
    const msg = this._cache.parents_messages[i];
    return { bubbles: this.parseText(msg.text), context: msg.context, index: i };
  }

  // 按幕次取一条家人消息（深度职业 next_act 推进时调用）
  pickForAct(act) {
    return this._pick(this._match(ACT_KEYWORDS[act] || []));
  }

  // 状态触底时取一条（health/san/passion 跌破阈值的至暗时刻）
  pickForThreshold() {
    return this._pick(this._match(THRESHOLD_KEYWORDS));
  }

  // 按指定关键词取一条（phone_message action 的显式触发）
  pickByKeyword(keyword) {
    return this._pick(this._match([keyword]));
  }

  // 按结局 key 取专属回响消息（EndingScene 调用）
  pickForEnding(endingKey) {
    if (!this._cache) return null;
    const kw = ENDING_KEYWORDS[endingKey];
    if (!kw) return null;
    const list = this._cache.parents_messages || [];
    for (let i = 0; i < list.length; i++) {
      if ((list[i].context || '').includes(kw) && !this._seen.has(i)) {
        this._seen.add(i);
        return { bubbles: this.parseText(list[i].text), context: list[i].context, index: i };
      }
    }
    return null;
  }

  // 入职写信候选句（供 write_letter 仪式）
  getLetterOptions() {
    return (this._cache && this._cache.letter_options) ? [...this._cache.letter_options] : [];
  }

  isReady() { return !!this._cache; }
}
