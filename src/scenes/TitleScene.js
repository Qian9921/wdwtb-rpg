import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem.js';

// TitleScene：游戏标题页 — 游戏名 + 主题金句 + 开始。demo 与正式流程的门面。
export class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  create() {
    const { width: W, height: H } = this.scale;
    this.cameras.main.setBackgroundColor('#15151f');
    this.cameras.main.fadeIn(700, 10, 8, 20);

    // 背景氛围:漂浮的光点(呼应心象世界)
    for (let i = 0; i < 14; i++) {
      const c = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
        Phaser.Math.Between(2, 5), 0xf5c86b, Phaser.Math.FloatBetween(0.06, 0.18)
      );
      this.tweens.add({
        targets: c, y: c.y - Phaser.Math.Between(30, 80),
        alpha: 0, duration: Phaser.Math.Between(3000, 6000),
        repeat: -1, delay: Phaser.Math.Between(0, 3000),
      });
    }

    // 顶部小字
    this.add.text(W / 2, H * 0.26, '腾讯云黑客松 · 职场疗愈叙事 RPG', {
      fontSize: '14px', color: '#6a6a8a', letterSpacing: 2,
    }).setOrigin(0.5);

    // 游戏名(大标题)
    const title = this.add.text(W / 2, H * 0.40, '你 想 成 为 谁', {
      fontSize: '58px', color: '#ffffff', fontStyle: 'bold', letterSpacing: 6,
    }).setOrigin(0.5);
    title.setShadow(0, 3, '#d4a35388', 12, false, true);
    // 标题呼吸
    this.tweens.add({ targets: title, scale: 1.02, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 主题金句
    this.add.text(W / 2, H * 0.55, '「 你不是要成为一个正确的人，\n而是要认出那个本来的你。 」', {
      fontSize: '18px', color: '#c8b88a', align: 'center', lineSpacing: 10,
      wordWrap: { width: W - 120, useAdvancedWrap: true },
    }).setOrigin(0.5);

    // 是否有存档决定按钮布局：有档 → 开始上移 + 下方"继续游戏"；无档 → 只有开始
    const hasSave = SaveSystem.has();

    // 新游戏（从头开场）
    const start = () => {
      SaveSystem.clear(); // 新游戏清掉旧档，避免续档串味
      this.cameras.main.fadeOut(500, 10, 8, 20);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('OpeningScene'));
    };
    // 继续游戏（读档回到当前职业与幕次）
    const resume = () => {
      const save = SaveSystem.load();
      if (!save) { start(); return; }
      this.cameras.main.fadeOut(500, 10, 8, 20);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('WorldScene', { career: save.career, act: save.act }));
    };

    // 通用按钮工厂：复用同款外观
    const makeBtn = (cy, label, fill, stroke, txtColor, onClick) => {
      const b = this.add.rectangle(W / 2, cy, 240, 50, fill, 0.95)
        .setStrokeStyle(2, stroke).setInteractive({ useHandCursor: true });
      this.add.text(W / 2, cy, label, {
        fontSize: '21px', color: txtColor, fontStyle: 'bold', letterSpacing: 4,
      }).setOrigin(0.5);
      const hi = Phaser.Display.Color.IntegerToColor(fill).lighten(12).color;
      b.on('pointerover', () => b.setFillStyle(hi));
      b.on('pointerout', () => b.setFillStyle(fill));
      b.on('pointerdown', onClick);
      return b;
    };

    if (hasSave) {
      // 有档：继续（主色，醒目）在上，开始新游戏（次色）在下
      makeBtn(H * 0.70, '继 续 游 戏', 0x2a4a3e, 0xd4a353, '#ffe08a', resume);
      makeBtn(H * 0.82, '重 新 开 始', 0x23232f, 0x555577, '#b8b8c8', start);
      // Enter/Space 默认继续；无档时默认开始
      this.input.keyboard.once('keydown-ENTER', resume);
      this.input.keyboard.once('keydown-SPACE', resume);
    } else {
      makeBtn(H * 0.74, '开 始', 0x2a4a3e, 0xd4a353, '#ffe08a', start);
      this.input.keyboard.once('keydown-ENTER', start);
      this.input.keyboard.once('keydown-SPACE', start);
    }

    // 底部键位提示(闪烁) — 与全局交互规范统一
    const hintTxt = hasSave ? '回车 继续 · 点击选择' : '点击开始 · 或按 回车 / 空格';
    const hint = this.add.text(W / 2, H * 0.92, hintTxt, {
      fontSize: '13px', color: '#6a6a8a',
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 1000, yoyo: true, repeat: -1 });

    // 右上角全屏切换按钮
    const fsBtn = this.add.text(W - 16, 14, '⛶ 全屏', {
      fontSize: '13px', color: '#8a8a9e',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    fsBtn.on('pointerover', () => fsBtn.setColor('#e6e6e6'));
    fsBtn.on('pointerout', () => fsBtn.setColor('#8a8a9e'));
    fsBtn.on('pointerdown', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });

    // 署名
    this.add.text(W - 8, H - 6, 'Art: LimeZu · Kenney　AI: 腾讯混元 hy3', {
      fontSize: '10px', color: '#4a4a5e',
    }).setOrigin(1, 1);
  }
}
