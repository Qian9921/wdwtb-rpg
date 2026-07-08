import Phaser from 'phaser';

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

    // 开始按钮
    const btn = this.add.rectangle(W / 2, H * 0.74, 240, 52, 0x2a4a3e, 0.95)
      .setStrokeStyle(2, 0xd4a353).setInteractive({ useHandCursor: true });
    const btnTxt = this.add.text(W / 2, H * 0.74, '开 始', {
      fontSize: '22px', color: '#ffe08a', fontStyle: 'bold', letterSpacing: 4,
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x3a5a4e));
    btn.on('pointerout', () => btn.setFillStyle(0x2a4a3e));
    const start = () => {
      this.cameras.main.fadeOut(500, 10, 8, 20);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('OpeningScene'));
    };
    btn.on('pointerdown', start);
    this.input.keyboard.once('keydown-ENTER', start);
    this.input.keyboard.once('keydown-SPACE', start);

    // "按 Enter 开始" 提示(闪烁)
    const hint = this.add.text(W / 2, H * 0.84, '点击开始 · 或按 Enter', {
      fontSize: '13px', color: '#6a6a8a',
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 1000, yoyo: true, repeat: -1 });

    // 署名
    this.add.text(W - 8, H - 6, 'Art: LimeZu · Kenney　AI: 腾讯混元 hy3', {
      fontSize: '10px', color: '#4a4a5e',
    }).setOrigin(1, 1);
  }
}
