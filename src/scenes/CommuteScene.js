import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';
import { SceneRouter } from '../systems/SceneRouter.js';

// CommuteScene：晨间通勤——轻量事件卡场景（无 tilemap，纯 UI）。
// 每天早上抽一条 commute_events.json 的事件，玩家做选择微调状态，然后进办公室(work)。
// 状态通过存档 stats 贯穿（转场前存、下一场景 restore）。
export class CommuteScene extends Phaser.Scene {
  constructor() { super('CommuteScene'); }

  init(data) {
    this.career = data?.career || 'programmer';
    this.act = data?.act || 1;
    this.day = data?.day || 1;
    this.stats = data?.stats || null; // 上一场景传来的状态快照
    this.subRole = data?.subRole || null;
    // 续档兜底
    if (!this.subRole) {
      try {
        const s = JSON.parse(localStorage.getItem('wdwtb_save') || 'null');
        if (s && s.subRole) this.subRole = s.subRole;
      } catch (e) { /* */ }
    }
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.cameras.main.setBackgroundColor('#141420');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    AudioSystem.playBgm('title'); // 通勤用温和的 BGM

    // 顶部：第 N 天 · 清晨
    this.add.text(W / 2, 80, `第 ${this.day} 天 · 清晨`, {
      fontSize: '26px', color: '#8b8ba0',
    }).setOrigin(0.5);
    this.add.text(W / 2, 130, '🚇 通勤路上', {
      fontSize: '40px', color: '#dfe3ff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this._loadEvent();
  }

  _loadEvent() {
    fetch('./data/commute_events.json')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const events = data.events || [];
        if (events.length === 0) { this._goWork(); return; }
        // 按天数取事件（循环用，保证每天不同）
        const ev = events[(this.day - 1) % events.length];
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

    // 选项按钮
    const opts = ev.options || [];
    let by = cardY + cardH + 60;
    opts.forEach((opt, i) => {
      const btn = this.add.rectangle(W / 2, by, 700, 64, 0x2a2a4a).setStrokeStyle(2, 0x4a4a66)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(W / 2, by, opt.label, { fontSize: '24px', color: '#e6e6e6' }).setOrigin(0.5);
      btn.on('pointerover', () => btn.setFillStyle(0x3a3a5a));
      btn.on('pointerout', () => btn.setFillStyle(0x2a2a4a));
      btn.on('pointerdown', () => { AudioSystem.uiClick(); this._choose(opt); });
      Juice.pop(this, btn, 1);
      this.ui.add(btn); this.ui.add(txt);
      by += 84;
    });
  }

  // 选择后：应用 effect 到 stats 快照，显示 reply，然后进办公室
  _choose(opt) {
    // 应用状态变化到快照（clamp 0-100，money 不限）
    if (opt.effect && this.stats) {
      for (const [k, v] of Object.entries(opt.effect)) {
        const cur = this.stats[k] || 0;
        this.stats[k] = k === 'money' ? cur + v : Math.max(0, Math.min(100, cur + v));
      }
    }
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
    });
  }
}
