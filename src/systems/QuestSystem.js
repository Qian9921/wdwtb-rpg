import Phaser from 'phaser';
import { AudioSystem } from './AudioSystem.js';
import { Juice } from './JuiceKit.js';

// QuestSystem：任务系统——接取/追踪/完成/奖励。继承 EventEmitter，与 StateSystem 同构。
// 数据驱动：从 public/data/quests_{career}.json 加载任务定义。
//
// 任务生命周期：available(池中未接) → accepted(进行中) → completed(已完成，发过奖励)。
// 进度靠 progress(kind, target) 上报：对话 talk / 小游戏 minigame / 交互 interact。
// 目标完成检查：每个 objective 有 kind+target，上报匹配的推进它；全目标完成→可交付。
//
// 事件：'accepted'(id) / 'progress'(id,objective) / 'objectiveDone'(id,objectiveId) / 'completed'(id,reward)
export class QuestSystem extends Phaser.Events.EventEmitter {
  constructor(stateSystem) {
    super();
    this.state = stateSystem;
    this.defs = {};        // 任务定义 { id: questDef }
    this.order = [];       // 任务 id 顺序（保持数据文件顺序）
    this.accepted = {};    // 已接 { id: { objectives: {oid: done} } }
    this.completed = {};   // 已完成 { id: true }
  }

  // 从 JSON 装载任务定义（幂等，重复 load 只更新定义不丢进度）。
  // 兼容两种格式：{ quests: [...] } 或 [...] 或 { id: quest }
  load(questDefs) {
    if (!questDefs || typeof questDefs !== 'object') return;
    const list = Array.isArray(questDefs) ? questDefs
      : Array.isArray(questDefs.quests) ? questDefs.quests
      : Object.values(questDefs);
    for (const q of list) {
      if (!q || !q.id) continue;
      if (!this.defs[q.id]) this.order.push(q.id);
      this.defs[q.id] = q;
    }
  }

  // 当前可接的任务（未接、未完成、触发条件满足）
  available(context = {}) {
    return this.order
      .map(id => this.defs[id])
      .filter(q => {
        if (this.accepted[q.id] || this.completed[q.id]) return false;
        return this._triggerMet(q.trigger, context);
      });
  }

  // 进行中的任务
  active() {
    return Object.keys(this.accepted)
      .map(id => this.defs[id])
      .filter(q => q && !this.completed[q.id]);
  }

  // 已完成任务
  done() {
    return Object.keys(this.completed).map(id => this.defs[id]).filter(Boolean);
  }

  // 触发条件检查（act/day 等，缺省视为满足）
  _triggerMet(trigger, context) {
    if (!trigger) return true;
    if (trigger.act != null && context.act != null && context.act < trigger.act) return false;
    if (trigger.day != null && context.day != null && context.day < trigger.day) return false;
    return true;
  }

  // 接任务
  accept(id) {
    const q = this.defs[id];
    if (!q || this.accepted[id] || this.completed[id]) return false;
    this.accepted[id] = { objectives: {} };
    (q.objectives || []).forEach(o => { this.accepted[id].objectives[o.id] = false; });
    this.emit('accepted', id);
    return true;
  }

  // 上报一个行为，推进匹配的进行中任务的目标
  progress(kind, target) {
    for (const id of Object.keys(this.accepted)) {
      if (this.completed[id]) continue;
      const q = this.defs[id];
      if (!q || !q.objectives) continue;
      const prog = this.accepted[id];
      for (const o of q.objectives) {
        if (prog.objectives[o.id]) continue;       // 已完成的目标跳过
        if (o.kind !== kind) continue;
        if (o.target && target && o.target !== target) continue;
        prog.objectives[o.id] = true;
        this.emit('progress', id, o);
        this.emit('objectiveDone', id, o.id);
      }
    }
  }

  // 任务是否所有目标都完成（可交付）
  isReady(id) {
    const q = this.defs[id];
    const prog = this.accepted[id];
    if (!q || !prog || this.completed[id]) return false;
    if (!q.objectives || q.objectives.length === 0) return true; // 无目标=接了即可交
    return q.objectives.every(o => prog.objectives[o.id]);
  }

  // 交付任务：发奖励（调 stateSystem.change），标记完成，emit 事件
  complete(id) {
    if (!this.isReady(id)) return false;
    const q = this.defs[id];
    if (q.reward) {
      for (const [key, delta] of Object.entries(q.reward)) {
        this.state.change(key, delta);
      }
    }
    this.completed[id] = true;
    delete this.accepted[id];
    this.emit('completed', id, q.reward);
    AudioSystem.questDone();
    return true;
  }

  // 任务给指定 NPC id 时，该 NPC 该显示什么标记
  // 返回 'available'(❗可接) / 'deliver'(❓可交付) / 'progress'(…进行中目标指向) / null
  npcMark(npcId, context = {}) {
    // 可接：有任务 giver=npcId 且未接未完成
    const canAccept = this.available(context).some(q => q.giver === npcId);
    if (canAccept) return 'available';
    // 可交付：进行中且全目标完成 且 giver=npcId
    for (const q of this.active()) {
      if (q.giver === npcId && this.isReady(q.id)) return 'deliver';
    }
    // 进行中目标指向该 NPC（talk 目标）
    for (const q of this.active()) {
      if ((q.objectives || []).some(o => o.kind === 'talk' && o.target === npcId && !this._objDone(q.id, o.id))) {
        return 'progress';
      }
    }
    return null;
  }

  _objDone(id, oid) {
    return this.accepted[id] && this.accepted[id].objectives[oid];
  }

  // 存档序列化（accepted id+objective 进度 + completed id 列表）
  serialize() {
    return {
      accepted: Object.fromEntries(
        Object.entries(this.accepted).map(([id, p]) => [id, { objectives: { ...p.objectives } }])
      ),
      completed: Object.keys(this.completed),
    };
  }

  // 从存档恢复（load 定义后调）
  restore(data) {
    if (!data || typeof data !== 'object') return;
    this.accepted = {};
    this.completed = {};
    if (data.accepted) {
      for (const [id, p] of Object.entries(data.accepted)) {
        this.accepted[id] = { objectives: { ...(p.objectives || {}) } };
      }
    }
    if (Array.isArray(data.completed)) {
      for (const id of data.completed) this.completed[id] = true;
    }
  }
}
