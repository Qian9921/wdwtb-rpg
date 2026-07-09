// ThoughtSystem：内心独白系统（Disco Elysium 式"思维内阁"）——本作差异化核心。
// 纯逻辑、无 Phaser 依赖，可 node 单测。UI 呈现由 WorldScene 的思维气泡负责。
//
// 设计：玩家脑子里有几个"声音"（思维人格），各有性格和触发条件，会在合适时机主动插嘴。
// 声音的台词池来自 monologues.json 的 8 个 scene 键，按人格映射。
// 关键创新：台词可选 AI 生成（混元按当前状态+选择历史生成个性化独白），失败降级模板。
//
// 人格与触发（对标状态曲线）：
//   analyst 理性  → 压力高时提醒"停下来想想"（high_stress）
//   empath  共情  → 心态低时想起家人/初心（low_passion / healing）
//   critic  自我苛责 → 自我怀疑时放大焦虑（self_doubt / after_blame）
//   dreamer 追光  → 有成就时点燃热情（small_achievement）
//   weary   疲惫  → 深夜/健康低时的倦意（late_night_emo / low_health）
//
// 事件：'thought'({ voice, text, scene }) —— WorldScene 监听，浮现思维气泡。

// 人格定义：id + 显示名 + 台词来源 scene 键 + 触发判定
const VOICES = [
  {
    id: 'analyst', name: '理性', color: '#7ec8ff',
    scenes: ['high_stress'],
    trigger: (s) => s.stress >= 65,
    priority: (s) => s.stress, // 压力越高越想说话
  },
  {
    id: 'empath', name: '共情', color: '#ff9ec8',
    scenes: ['low_passion', 'healing'],
    trigger: (s) => s.passion <= 35 || s.san <= 40,
    priority: (s) => (100 - s.passion) + (100 - s.san),
  },
  {
    id: 'critic', name: '自我苛责', color: '#e8735a',
    scenes: ['self_doubt', 'after_blame'],
    trigger: (s) => s.san <= 35 || s.performance <= 30,
    priority: (s) => (100 - s.san),
  },
  {
    id: 'dreamer', name: '追光', color: '#ffd24d',
    scenes: ['small_achievement'],
    // 追光需要"状态好且有余力"：热情高、技能够、压力不高、心态稳
    trigger: (s) => s.passion >= 70 && s.skill >= 40 && s.stress < 50 && s.san >= 60,
    priority: (s) => s.passion + s.skill,
  },
  {
    id: 'weary', name: '疲惫', color: '#9a9ac0',
    scenes: ['late_night_emo', 'low_health'],
    trigger: (s) => s.health <= 40 || s.energy <= 30,
    priority: (s) => (100 - s.health) + (100 - s.energy),
  },
];

export class ThoughtSystem {
  constructor() {
    this.pools = {};       // { scene: [台词...] } 来自 monologues.json
    this._recentVoices = []; // 最近说话的人格 id，避免同一个声音连续刷屏
    this._loaded = false;
  }

  // 装载台词池（monologues.json 的 scenes 对象）
  load(monologuesJson) {
    if (!monologuesJson) return;
    const scenes = monologuesJson.scenes || monologuesJson;
    if (scenes && typeof scenes === 'object') {
      this.pools = scenes;
      this._loaded = true;
    }
  }

  isReady() { return this._loaded; }

  // 根据当前状态，选出此刻最该发声的人格（无人触发返回 null）。
  // 会避开最近刚说过的人格（防同一声音刷屏），按 priority 排序。
  pickVoice(stats) {
    if (!stats) return null;
    const candidates = VOICES
      .filter(v => {
        try { return v.trigger(stats); } catch (e) { return false; }
      })
      .filter(v => !this._recentVoices.includes(v.id)) // 避开最近说过的
      .sort((a, b) => {
        try { return b.priority(stats) - a.priority(stats); } catch (e) { return 0; }
      });
    // 若全被"最近说过"过滤光了，放开限制取触发的第一个
    if (candidates.length === 0) {
      const any = VOICES.filter(v => { try { return v.trigger(stats); } catch (e) { return false; } });
      return any.length ? any[0] : null;
    }
    return candidates[0];
  }

  // 从人格的台词池随机取一句（模板兜底用）
  pickLine(voice) {
    if (!voice || !this._loaded) return null;
    const pool = [];
    for (const sc of voice.scenes) {
      if (Array.isArray(this.pools[sc])) pool.push(...this.pools[sc]);
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 生成一条思维（模板版，同步）：选人格 + 取台词。返回 { voice, text, scene } 或 null。
  // 记录到 _recentVoices（保留最近 2 个），避免连续同人格。
  think(stats) {
    const voice = this.pickVoice(stats);
    if (!voice) return null;
    const text = this.pickLine(voice);
    if (!text) return null;
    this._noteVoice(voice.id);
    return { voice, text, scene: voice.scenes[0] };
  }

  _noteVoice(id) {
    this._recentVoices.push(id);
    if (this._recentVoices.length > 2) this._recentVoices.shift();
  }

  // 构造 AI 生成内心独白的 prompt（供 WorldScene 调 AIClient）。
  // 结合当前状态 + 选择历史，让内心声音"记得你做过什么"。
  buildAIPrompt(voice, stats, choiceSummary) {
    const persona = {
      analyst: '你是玩家脑中"理性"的声音，冷静、克制，提醒 ta 停下来权衡。',
      empath: '你是玩家脑中"共情"的声音，温柔，想起家人和最初的心动。',
      critic: '你是玩家脑中"自我苛责"的声音，尖锐、放大焦虑，但底色是害怕辜负。',
      dreamer: '你是玩家脑中"追光"的声音，明亮，为一点成就而雀跃。',
      weary: '你是玩家脑中"疲惫"的声音，倦怠、低声，只想歇一歇。',
    }[voice.id] || '你是玩家脑中的一个声音。';
    const sys = persona + ' 用第一人称"我"，1-2 句，像真实的念头闪过，不说教、不煽情、只用中文。';
    const user = `当前状态：健康${stats.health} 精力${stats.energy} 心态${stats.san} 压力${stats.stress} `
      + `热情${stats.passion} 技能${stats.skill}。`
      + (choiceSummary ? `最近的选择：${choiceSummary}。` : '')
      + `以这个声音的口吻，说一句此刻脑海里闪过的念头。`;
    return { sys, user };
  }

  // 存档：只需存 _recentVoices（台词池每次 load，无需存）
  serialize() { return { recentVoices: [...this._recentVoices] }; }
  restore(data) {
    if (data && Array.isArray(data.recentVoices)) this._recentVoices = [...data.recentVoices];
  }
}

// 导出 VOICES 供测试/UI 用
export { VOICES };
