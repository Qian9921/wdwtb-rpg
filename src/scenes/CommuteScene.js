import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';
import { SceneRouter } from '../systems/SceneRouter.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { pickCommuteEvent, applyCommuteChoice, pushRecent } from '../systems/CommuteEvents.js';
import { ensurePixelIcons, ICON_KEYS, makeIcon } from '../systems/PixelIcons.js';

// CommuteScene：晨间通勤——随机情境事件（无 tilemap，纯 UI）。
// 旧版是"6 条按 day%6 写死循环、永远第二天冒雨"；现改为【随机抽取 + 种子挂钩】:
//   · 事件池随机抽、排除最近看过的(不再可预测)
//   · 昨晚的选择(NightLife 埋的 seeds)+ 白天状态 决定今天更可能遇到什么情境
//   · 选项可埋 followupSeed → 过几天触发连锁事件(今天帮人、几天后收到回报)
// 状态 + 种子队列(commuteSeeds/commuteRecent)通过存档贯穿。
export class CommuteScene extends Phaser.Scene {
  constructor() { super('CommuteScene'); }

  init(data) {
    this.career = data?.career || 'programmer';
    this.act = data?.act || 1;
    this.day = data?.day || 1;
    this.stats = data?.stats || null; // 上一场景传来的状态快照
    this.subRole = data?.subRole || null;
    this.slot = data?.slot || 1;
    // ⚠️ 瞬时态复位(根因:Phaser 复用同一 CommuteScene 实例,scene.start 重跑 init 但
    // 不重置这些字段)。_chosen/_going 若残留上一天的 true,第2+次通勤 _choose/_goWork
    // 开头的 if(this._chosen)return 会直接返回 → "第三天通勤点什么都没用"卡死。每次进场清零。
    this._chosen = false;
    this._going = false;
    this._currentEvent = null;
    this._optKeyHandlers = [];
    // 从存档读种子队列(昨晚埋的 + followup 连锁)和最近看过的事件
    this._seeds = [];
    this._recent = [];
    try {
      const s = SaveSystem.loadSlot(this.slot);
      if (s) {
        if (!this.subRole && s.subRole) this.subRole = s.subRole;
        if (Array.isArray(s.commuteSeeds)) this._seeds = s.commuteSeeds;
        if (Array.isArray(s.commuteRecent)) this._recent = s.commuteRecent;
      }
    } catch (e) { /* */ }
  }

  create() {
    const { width: W, height: H } = this.scale;
    ensurePixelIcons(this); // 像素图标纹理（替代 emoji，幂等）
    this.cameras.main.setBackgroundColor('#141420');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    AudioSystem.playBgm('title'); // 通勤用温和的 BGM

    // 顶部：第 N 天 · 清晨
    this.add.text(W / 2, 80, `第 ${this.day} 天 · 清晨`, {
      fontSize: '26px', color: '#8b8ba0',
    }).setOrigin(0.5);
    const titleText = this.add.text(W / 2, 130, '通勤路上', {
      fontSize: '40px', color: '#dfe3ff', fontStyle: 'bold',
    }).setOrigin(0.5);
    makeIcon(this, W / 2 - titleText.width / 2 - 30, 130, ICON_KEYS.train, 0xdfe3ff, 40);

    this._loadEvent();
  }

  _loadEvent() {
    fetch('./data/commute_events.json')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const events = data.events || [];
        if (events.length === 0) { this._goWork(); return; }
        // 随机抽取:情境事件(昨晚种子/白天状态命中)优先,排除最近看过的,带权重。
        const ev = pickCommuteEvent(events, {
          seeds: new Set(this._seeds),
          stats: this.stats || {},
          recent: this._recent,
          rng: () => Phaser.Math.RND.frac(),
        });
        if (!ev) { this._goWork(); return; }
        this._currentEvent = ev;
        this._showEvent(ev);
      })
      .catch(() => this._goWork()); // 加载失败直接进办公室
  }

  _showEvent(ev) {
    const { width: W, height: H } = this.scale;
    if (this.ui) this.ui.destroy(true);
    this.ui = this.add.container(0, 0);

    // 事件卡片
    const cardW = 1000, cardH = 200, cardY = 260;
    this.ui.add(this.add.rectangle(W / 2, cardY + cardH / 2, cardW, cardH, 0x1e1e30).setStrokeStyle(2, 0x3a3a5a));
    this.ui.add(this.add.text(W / 2, cardY + cardH / 2, ev.text, {
      fontSize: '26px', color: '#e8e8f4', lineSpacing: 12,
      wordWrap: { width: cardW - 80, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5));

    // 选项按钮:过滤掉 requiresSeed 不满足的选项(某些选项只在特定种子下出现)
    const seedSet = new Set(this._seeds);
    const opts = (ev.options || []).filter(o => !o.requiresSeed || seedSet.has(o.requiresSeed));
    let by = cardY + cardH + 60;
    const NUMS = ['ONE', 'TWO', 'THREE', 'FOUR'];
    this._optKeyHandlers = [];
    opts.forEach((opt, i) => {
      const btn = this.add.rectangle(W / 2, by, 700, 64, 0x2a2a4a).setStrokeStyle(2, 0x4a4a66)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(W / 2, by, `${i + 1}. ${opt.label}`, { fontSize: '24px', color: '#e6e6e6' }).setOrigin(0.5);
      btn.on('pointerover', () => btn.setFillStyle(0x3a3a5a));
      btn.on('pointerout', () => btn.setFillStyle(0x2a2a4a));
      btn.on('pointerdown', () => { AudioSystem.uiClick(); this._choose(opt); });
      // 键盘数字键 1-4 选(完全键盘可玩)
      if (i < NUMS.length) {
        const handler = () => { AudioSystem.uiClick(); this._choose(opt); };
        this.input.keyboard.on(`keydown-${NUMS[i]}`, handler);
        this._optKeyHandlers.push({ key: NUMS[i], handler });
      }
      Juice.pop(this, btn, 1);
      this.ui.add(btn); this.ui.add(txt);
      by += 84;
    });
  }

  // 选择后：应用 effect + followupSeed，更新种子/recent 存档，显示 reply，然后进办公室
  _choose(opt) {
    if (this._chosen) return; // 防数字键+点击双触发
    this._chosen = true;
    // 解绑选项数字键(防结算页误触发)
    if (this._optKeyHandlers) {
      for (const { key, handler } of this._optKeyHandlers) this.input.keyboard.off(`keydown-${key}`, handler);
      this._optKeyHandlers = [];
    }
    // 应用状态变化 + 收 followupSeed(连锁事件用)
    const res = applyCommuteChoice(this.stats || {}, opt);
    this.stats = res.stats;
    // 更新存档:埋 followupSeed + 把本事件加入 recent(避免短期重复) + 消费掉已命中的情境种子
    try {
      const saved = SaveSystem.loadSlot(this.slot) || {};
      let seeds = Array.isArray(saved.commuteSeeds) ? [...saved.commuteSeeds] : [];
      // 消费:若本事件是靠某情境种子触发的,用掉它(避免一直重复触发同一情境)
      const usedSeeds = (this._currentEvent && this._currentEvent.requires && this._currentEvent.requires.seeds) || [];
      seeds = seeds.filter(sd => !usedSeeds.includes(sd));
      // 埋新的 followup 连锁种子
      if (res.followupSeed) seeds.push(res.followupSeed);
      const recent = pushRecent(saved.commuteRecent || [], this._currentEvent ? this._currentEvent.id : '', 5);
      SaveSystem.saveSlot(this.slot, {
        ...saved,
        stats: this.stats,
        commuteSeeds: seeds.slice(-12),
        commuteRecent: recent,
      });
    } catch (e) { /* */ }
    if (this.ui) this.ui.destroy(true);
    const { width: W, height: H } = this.scale;
    // reply 反馈
    const reply = this.add.text(W / 2, H / 2, opt.reply || '', {
      fontSize: '28px', color: '#ffd68a', fontStyle: 'italic',
      wordWrap: { width: 900, useAdvancedWrap: true }, align: 'center', lineSpacing: 10,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: reply, alpha: 1, duration: 500 });
    this.add.text(W / 2, H - 120, '［点击继续 → 去上班］', {
      fontSize: '20px', color: '#8b8ba0',
    }).setOrigin(0.5);
    this.input.once('pointerdown', () => this._goWork());
    this.time.delayedCall(400, () => {
      this.input.keyboard.once('keydown-SPACE', () => this._goWork());
      this.input.keyboard.once('keydown-ENTER', () => this._goWork());
    });
  }

  // 进办公室（work 阶段）：把更新后的 stats 传给 WorldScene
  _goWork() {
    if (this._going) return;
    this._going = true;
    SceneRouter.goto(this, 'WorldScene', {
      career: this.career, act: this.act, day: this.day,
      stats: this.stats, phase: 'work', subRole: this.subRole,
      slot: this.slot,
    });
  }
}
