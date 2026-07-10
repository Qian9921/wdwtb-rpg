import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';
import { SceneRouter } from '../systems/SceneRouter.js';
import { FamilyMessages } from '../systems/FamilyMessages.js';
import { PhoneMessage } from '../systems/PhoneMessage.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { SceneBackdrop } from '../systems/SceneBackdrop.js';

// HomeScene：夜晚·回家——一天的收尾。家人消息 + 自我提升选择 + 睡觉进下一天。
// 自我提升：花精力/金钱换成长（skill/san/passion），玩家规划"下班后怎么过"。
// 睡觉 → endDay（DaySystem 在 WorldScene 管，这里通过 payload 通知）→ 进通勤或下一天。
export class HomeScene extends Phaser.Scene {
  constructor() { super('HomeScene'); }

  init(data) {
    this.career = data?.career || 'programmer';
    this.act = data?.act || 1;
    this.day = data?.day || 1;
    this.stats = data?.stats || {
      health: 80, energy: 100, san: 80, stress: 20, skill: 10, performance: 50, money: 0, passion: 70,
    };
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.cameras.main.setBackgroundColor('#0f0f1a');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    AudioSystem.playBgm('mindscape'); // 夜晚用空灵的 BGM

    // 出租屋场景画面(程序化:暖褐房间/夜窗/台灯/桌床),菜单浮在上面——"回家"有画面感
    this.backdrop = new SceneBackdrop(this);
    this.backdrop.show('apartment_night');
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14, 0.5).setDepth(800); // 压暗让菜单可读

    this.add.text(W / 2, 70, `第 ${this.day} 天 · 夜晚`, {
      fontSize: '26px', color: '#8b8ba0',
    }).setOrigin(0.5).setDepth(900);
    this.add.text(W / 2, 118, '🏠 回到出租屋', {
      fontSize: '40px', color: '#dfe3ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(900);

    // 家人消息系统
    this.familyMessages = new FamilyMessages();
    this.phoneMessage = new PhoneMessage(this);
    this.familyMessages.load();

    this._showSelfImprove();
  }

  // 自我提升选项：花精力/钱换成长
  _showSelfImprove() {
    const { width: W } = this.scale;
    if (this.ui) this.ui.destroy(true);
    this.ui = this.add.container(0, 0).setDepth(900); // 浮在场景画面+压暗层上

    this.ui.add(this.add.text(W / 2, 210, '这个夜晚，你想怎么过？', {
      fontSize: '28px', color: '#e8e8f4',
    }).setOrigin(0.5));

    const options = [
      { label: '📖 学习充电（技能+6，精力-10）', effect: { skill: 6, energy: -10 } },
      { label: '📱 看看家人消息（心态+8）', effect: { san: 8 }, family: true },
      { label: '🎮 打游戏放松（压力-10，热情+3）', effect: { stress: -10, passion: 3 } },
      { label: '😴 早点睡（精力+15，健康+5）', effect: { energy: 15, health: 5 } },
    ];
    let by = 290;
    options.forEach(opt => {
      const btn = this.add.rectangle(W / 2, by, 640, 60, 0x2a2a4a).setStrokeStyle(2, 0x4a4a66)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(W / 2, by, opt.label, { fontSize: '22px', color: '#e6e6e6' }).setOrigin(0.5);
      btn.on('pointerover', () => btn.setFillStyle(0x3a3a5a));
      btn.on('pointerout', () => btn.setFillStyle(0x2a2a4a));
      btn.on('pointerdown', () => { AudioSystem.uiClick(); this._doImprove(opt); });
      this.ui.add(btn); this.ui.add(txt);
      by += 76;
    });

    // 睡觉按钮（进下一天）
    const sleepBtn = this.add.rectangle(W / 2, by + 20, 400, 56, 0x3a2a4a).setStrokeStyle(2, 0xd4a353)
      .setInteractive({ useHandCursor: true });
    const sleepTxt = this.add.text(W / 2, by + 20, '🌙 睡觉，迎接新的一天', { fontSize: '22px', color: '#ffd68a' }).setOrigin(0.5);
    sleepBtn.on('pointerdown', () => { AudioSystem.uiClick(); this._sleep(); });
    this.ui.add(sleepBtn); this.ui.add(sleepTxt);
  }

  _doImprove(opt) {
    // 应用状态
    if (opt.effect) {
      for (const [k, v] of Object.entries(opt.effect)) {
        const cur = this.stats[k] || 0;
        this.stats[k] = k === 'money' ? cur + v : Math.max(0, Math.min(100, cur + v));
      }
    }
    Juice.floatText(this, this.scale.width / 2, 200, '✓', '#6aaa6a');
    // 看家人消息选项：弹出真实家人消息
    if (opt.family) {
      this.familyMessages.load().then(() => {
        const picked = this.familyMessages.pickForAct(this.act);
        if (picked) this.phoneMessage.show(picked.bubbles);
      });
    } else {
      // 其他选项：短暂反馈后可继续选或睡觉
      this._flashHint('嗯，这个夜晚没有白过。');
    }
  }

  _flashHint(msg) {
    const { width: W, height: H } = this.scale;
    const t = this.add.text(W / 2, H - 80, msg, {
      fontSize: '20px', color: '#ffd68a', backgroundColor: '#1e1e30', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(9999).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 250, yoyo: true, hold: 1400, onComplete: () => t.destroy() });
  }

  // 睡觉 → 进下一天。关键：推进剧情经营期计数 story.daysInAct（攒够天数才能解锁下一幕剧情）。
  // 这是"天数驱动剧情"的接线——没有它，经营期永远推进不了、剧情卡死。
  _sleep() {
    if (this._sleeping) return;
    this._sleeping = true;
    // 睡觉：把当日状态 + 经营期天数写回存档
    try {
      const saved = SaveSystem.load() || {};
      const story = saved.story || { phase: 'ready', act: this.act, daysInAct: 0 };
      if (story.phase === 'working') story.daysInAct = (story.daysInAct || 0) + 1; // 经营期才累加
      // 合并写：保留 project/subRole/quests（SaveSystem 合并，但 explicit extra 勿丢字段）
      SaveSystem.saveProgress({
        career: this.career, act: this.act, stats: this.stats,
        extra: {
          subRole: saved.subRole,
          quests: saved.quests,
          choiceLog: saved.choiceLog,
          thought: saved.thought,
          daySystem: saved.daySystem,
          project: saved.project,
          story,
        },
      });
    } catch (e) {}
    this.cameras.main.fadeOut(800, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      let subRole = null;
      try { subRole = (SaveSystem.load() || {}).subRole || null; } catch (e) {}
      this.scene.start('CommuteScene', {
        career: this.career, act: this.act, day: this.day + 1,
        stats: this.stats, subRole,
      });
    });
  }
}
