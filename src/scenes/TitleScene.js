import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { makeButton } from '../systems/UI.js';
import { buildWorldResumeData } from '../systems/Resume.js';
import { Juice } from '../systems/JuiceKit.js';

const VERSION = 'v0.1.0';

const TIPS = [
  'ESC 随时打开任务日志，查看下一步该做什么。',
  '走近头顶有 ! 的同事按 E，他会给你派活。',
  'Tab 键展开完整状态面板，看看你的身心数据。',
  '累了就去窗边看看风景，或进心象世界（T）调整状态。',
  '同一个职业可以试不同细分方向——开发 vs 测试是完全不同的一天。',
  '通关一个职业会生成专属结局画像，多试几个对比。',
  '多跟同事聊天送礼，关系变熟后台词会不一样。',
  '叙事辅助模式可以在设置里开启，让旅程更轻松。',
];

const CAREER_NAMES = {
  programmer: '程序员', product: '产品经理', admin: '高校行政',
  designer: '设计师', operation: '运营', teacher: '教师',
  doctor: '医生／护士', civilservant: '公务员', sales: '销售', lawyer: '律师',
};

// TitleScene：像素 RPG 特色标题——城市天际线 + 角色阵容 + 像素字体 logo
export class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }

  preload() {
    // 加载 SkyOffice 角色 atlas（标题角色阵容用）
    const SO = './assets/skyoffice/character';
    for (const c of ['adam', 'ash', 'lucy', 'nancy']) {
      const key = `title_${c}`;
      if (!this.textures.exists(key)) {
        this.load.atlas(key, `${SO}/${c}.png`, `${SO}/${c}.json`);
      }
    }
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.cameras.main.fadeIn(800, 100, 140, 180);
    AudioSystem.playBgm('title');
    SaveSystem._migrateLegacy();

    // ===== 背景：明亮日出天际线 =====
    this._drawSkyline(W, H);

    // ===== 可爱动态元素：飘云 + 飞鸟 + 热气球 =====
    this._drawClouds(W, H);
    this._drawBirds(W, H);
    this._drawBalloon(W, H);

    // ===== 暖色光粒子 =====
    for (let i = 0; i < 20; i++) {
      const c = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(H * 0.3, H),
        Phaser.Math.Between(2, 5), 0xfff0b0, Phaser.Math.FloatBetween(0.08, 0.22),
      ).setDepth(-2).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: c, y: c.y - Phaser.Math.Between(40, 100), alpha: 0,
        duration: Phaser.Math.Between(4000, 8000), repeat: -1,
        delay: Phaser.Math.Between(0, 4000), ease: 'Sine.out',
      });
    }

    // ===== 顶部小字 =====
    this.add.text(W / 2, H * 0.07, '腾讯云黑客松 · WorkBuddy × 混元 hy3', {
      fontSize: '18px', color: '#3a6a9a', letterSpacing: 4,
    }).setOrigin(0.5).setAlpha(0.7);

    // ===== 主标题 OFFERED：像素字体 + 描边 + 逐字弹入 =====
    // 一个词就把职场语境立住:拿到 offer=被录用,悬念在"录用之后——这份工作真的适合你吗"。
    const titleChars = 'OFFERED'.split('');
    const titleY = H * 0.20;
    const charSpacing = 92; // 英文 7 字母,间距略小于中文
    const titleStartX = W / 2 - ((titleChars.length - 1) * charSpacing) / 2;
    titleChars.forEach((ch, i) => {
      const t = this.add.text(titleStartX + i * charSpacing, titleY, ch, {
        fontSize: '84px', color: '#fff8e8', fontStyle: 'bold',
        stroke: '#c47020', strokeThickness: 9,
      }).setOrigin(0.5).setDepth(10).setScale(0);
      this.tweens.add({
        targets: t, scale: 1, duration: 400, delay: 200 + i * 90,
        ease: 'Back.out', onComplete: () => {
          this.tweens.add({
            targets: t, scale: 1.04, duration: 2400 + i * 100,
            yoyo: true, repeat: -1, ease: 'Sine.inOut',
          });
        },
      });
      t.setShadow(0, 6, '#e8a05099', 16, false, true);
    });
    // 中文副标题:让不熟英文的玩家也秒懂这是什么
    const subTitle = this.add.text(W / 2, H * 0.285, '录用通知', {
      fontSize: '22px', color: '#d4a353', letterSpacing: 10, fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: subTitle, alpha: 0.95, duration: 700, delay: 700 });

    // ===== Slogan =====
    const slogan = this.add.text(W / 2, H * 0.33, '入职之后，才知道适不适合', {
      fontSize: '24px', color: '#5a8aaa', letterSpacing: 4,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: slogan, alpha: 0.9, duration: 800, delay: 900 });

    // ===== 职业标签横排：主打「程序员」金亮突出 + 其余灰色「敬请期待」=====
    // 软灰度后不再平铺 10 职业(误导以为都能玩),明确当前主打程序员线、更多陆续开放。
    const CAREER_TAGS = [
      { name: '程序员', color: '#7ec8ff', playable: true },
      { name: '产品', color: '#5a6070' },
      { name: '行政', color: '#5a6070' },
      { name: '设计', color: '#5a6070' },
      { name: '运营', color: '#5a6070' },
      { name: '教师', color: '#5a6070' },
      { name: '医生', color: '#5a6070' },
      { name: '公务员', color: '#5a6070' },
      { name: '销售', color: '#5a6070' },
      { name: '律师', color: '#5a6070' },
    ];
    const tagY = H * 0.40;
    const tagSpacing = Math.min(120, (W - 200) / CAREER_TAGS.length);
    const tagStartX = W / 2 - ((CAREER_TAGS.length - 1) * tagSpacing) / 2;
    CAREER_TAGS.forEach((tag, i) => {
      const tx = tagStartX + i * tagSpacing;
      const on = !!tag.playable;
      const bg = this.add.rectangle(tx, tagY, 90, 28, on ? 0x1a3a4a : 0x14141c, on ? 0.85 : 0.5)
        .setStrokeStyle(on ? 2.5 : 1, Phaser.Display.Color.HexStringToColor(tag.color).color, on ? 0.9 : 0.35)
        .setAlpha(0).setDepth(6);
      const txt = this.add.text(tx, tagY, tag.name, {
        fontSize: on ? '15px' : '13px', color: tag.color, fontStyle: on ? 'bold' : 'normal',
      }).setOrigin(0.5).setAlpha(0).setDepth(7);
      // 主打程序员:头顶一颗小星,更醒目
      const star = on ? this.add.text(tx, tagY - 22, '★', { fontSize: '13px', color: '#ffd24d' }).setOrigin(0.5).setAlpha(0).setDepth(7) : null;
      const targets = star ? [bg, txt, star] : [bg, txt];
      this.tweens.add({
        targets, alpha: on ? 1 : 0.55, duration: 300, delay: 1200 + i * 60,
        onComplete: () => {
          if (on) { // 只有主打的持续浮动+呼吸,其余静置(灰)
            this.tweens.add({ targets: [bg, txt, star].filter(Boolean), y: '-=3', duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
          }
        },
      });
    });

    // ===== 角色阵容：4 个 SkyOffice 角色站立 =====
    this._drawCast(W, H);

    // ===== 按钮区 =====
    const latest = SaveSystem.latestSlot();
    const hasSave = latest !== null;
    const btns = [];
    if (hasSave) btns.push({ label: '继续游戏', fill: 0x2e6e4e, stroke: 0x7ee89a, color: '#e0ffe8', action: 'resume' });
    btns.push({ label: '读取存档', fill: 0x2a4a7a, stroke: 0x7ac0f0, color: '#e0e8ff', action: 'load' });
    btns.push({ label: '重新开始', fill: 0x4a3a7a, stroke: 0xa890e8, color: '#e8e0ff', action: 'newgame' });
    btns.push({ label: '设置', fill: 0x5a5a2a, stroke: 0xe8d870, color: '#fff8d8', action: 'settings' });
    btns.push({ label: '制作组', fill: 0x5a2a4a, stroke: 0xe890b0, color: '#ffe0ec', action: 'credits' });

    const btnSpacing = 50;
    const startY = H * 0.66;
    this._menuButtons = [];
    btns.forEach((b, i) => {
      const cy = startY + i * btnSpacing;
      const btn = makeButton(this, {
        x: W / 2, y: cy, label: b.label, fill: b.fill, stroke: b.stroke, color: b.color,
        fontSize: 22, minW: 280, padX: 36, padY: 12, letterSpacing: 4,
        sound: () => AudioSystem.uiClick(), onClick: () => this._handleAction(b.action),
      });
      this._menuButtons.push(btn);
    });

    this._selectedBtn = hasSave ? 0 : btns.findIndex(b => b.action === 'newgame');
    if (this._selectedBtn < 0) this._selectedBtn = 0;
    this.input.keyboard.on('keydown-DOWN', () => this._navButton(1));
    this.input.keyboard.on('keydown-UP', () => this._navButton(-1));
    this.input.keyboard.on('keydown-ENTER', () => {
      if (this._overlayActive) return;
      const b = btns[this._selectedBtn];
      if (b) this._handleAction(b.action);
    });
    if (hasSave) {
      this.input.keyboard.once('keydown-SPACE', () => { if (!this._overlayActive) this._handleAction('resume'); });
    } else {
      this.input.keyboard.once('keydown-SPACE', () => { if (!this._overlayActive) this._handleAction('newgame'); });
    }
    this._highlightSelected();

    // ===== 底部 =====
    const tip = TIPS[Phaser.Math.Between(0, TIPS.length - 1)];
    this.add.text(W / 2, H * 0.94, tip, {
      fontSize: '14px', color: '#4a6a8a',
    }).setOrigin(0.5);
    this.add.text(20, H - 8, VERSION, { fontSize: '11px', color: '#5a7a9a' }).setOrigin(0, 1);

    const fsBtn = this.add.text(W - 20, 18, '全屏', { fontSize: '16px', color: '#4a6a8a' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    fsBtn.on('pointerover', () => fsBtn.setColor('#1a4a7a'));
    fsBtn.on('pointerout', () => fsBtn.setColor('#4a6a8a'));
    fsBtn.on('pointerdown', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen(); else this.scale.startFullscreen();
    });

    this.add.text(W - 12, H - 8, 'Built with WorkBuddy · Art: LimeZu · Kenney · AI: 腾讯混元 hy3', {
      fontSize: '12px', color: '#4a6a8a',
    }).setOrigin(1, 1);
  }

  // ===== 明亮日出天际线 =====
  _drawSkyline(W, H) {
    const sky = this.add.graphics().setDepth(-10);
    sky.fillGradientStyle(0x3a7ab4, 0x6aa8d4, 0xffd89a, 0xffb878, 1);
    sky.fillRect(0, 0, W, H);
    sky.fillStyle(0xffe0a8, 0.16); sky.fillRect(0, H * 0.52, W, H * 0.14);

    // 朝阳（右上角，不挡标题）
    const sunX = W * 0.78, sunY = H * 0.18;
    for (let i = 6; i >= 1; i--) {
      this.add.circle(sunX, sunY, 24 + i * 24, 0xfff0c0, 0.05)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(-9);
    }
    const sunCore = this.add.circle(sunX, sunY, 30, 0xfff8e0, 0.9).setDepth(-9);
    this.tweens.add({ targets: sunCore, scale: 1.08, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // 楼群：3 层视差，中亮度蓝灰（不死黑），暖窗闪烁
    const layers = [
      { base: H * 0.66, col: 0x6088a8, wmin: 70, wmax: 150, hmin: 50, hmax: 130, lit: 0.28, tint: 0xfff0b0, depth: -8 },
      { base: H * 0.74, col: 0x506e90, wmin: 60, wmax: 130, hmin: 100, hmax: 230, lit: 0.42, tint: 0xffe89a, depth: -6 },
      { base: H * 0.84, col: 0x3e5c80, wmin: 84, wmax: 176, hmin: 150, hmax: 320, lit: 0.58, tint: 0xffd870, depth: -4 },
    ];
    for (const L of layers) {
      let x = -40;
      while (x < W + 40) {
        const bw = Phaser.Math.Between(L.wmin, L.wmax);
        const bh = Phaser.Math.Between(L.hmin, L.hmax);
        const by = L.base - bh;
        this.add.rectangle(x, by, bw, H - by + 40, L.col).setOrigin(0, 0).setDepth(L.depth);
        for (let wy = by + 14; wy < L.base - 8; wy += 18) {
          for (let wx = x + 10; wx < x + bw - 10; wx += 14) {
            if (Math.random() < L.lit) {
              const a = Phaser.Math.FloatBetween(0.5, 0.95);
              const win = this.add.rectangle(wx, wy, 6, 8, L.tint, a).setOrigin(0, 0).setDepth(L.depth + 0.5);
              if (Math.random() < 0.14) this.tweens.add({
                targets: win, alpha: 0.25, duration: Phaser.Math.Between(1800, 4000),
                yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 3000),
              });
            }
          }
        }
        x += bw + Phaser.Math.Between(4, 14);
      }
    }
    // 前景地面
    this.add.rectangle(0, H * 0.84, W, H * 0.16, 0x5a6a82).setOrigin(0, 0).setDepth(-3);
    this.add.rectangle(0, H * 0.84, W, 3, 0x7a8aa2).setOrigin(0, 0).setDepth(-3);
  }

  // ===== 可爱飘云：像素方块堆成的胖云，缓缓横向漂移，循环回绕 =====
  _drawClouds(W, H) {
    const puff = (cx, cy, scale, alpha) => {
      const g = this.add.container(cx, cy).setDepth(-7).setAlpha(alpha);
      // 用几个圆角方块堆成胖云
      const parts = [
        [0, 0, 46, 26], [-26, 6, 34, 20], [26, 6, 34, 20], [0, 10, 64, 20],
      ];
      for (const [dx, dy, pw, ph] of parts) {
        g.add(this.add.rectangle(dx, dy, pw * scale, ph * scale, 0xffffff, 0.9));
        g.add(this.add.rectangle(dx, dy + ph * scale * 0.35, pw * scale, ph * scale * 0.5, 0xeaf2ff, 0.9));
      }
      return g;
    };
    const clouds = [
      { x: W * 0.15, y: H * 0.14, s: 1.1, a: 0.85, dur: 60000 },
      { x: W * 0.55, y: H * 0.09, s: 0.8, a: 0.7, dur: 80000 },
      { x: W * 0.82, y: H * 0.22, s: 1.3, a: 0.9, dur: 52000 },
      { x: W * 0.38, y: H * 0.26, s: 0.7, a: 0.6, dur: 72000 },
    ];
    for (const cl of clouds) {
      const g = puff(cl.x, cl.y, cl.s, cl.a);
      const span = W + 200;
      const travel = () => {
        this.tweens.add({
          targets: g, x: g.x + span, duration: cl.dur, ease: 'Linear',
          onComplete: () => { g.x = -160; travel(); },
        });
      };
      travel();
      // 轻微上下浮（可爱呼吸感）
      this.tweens.add({ targets: g, y: cl.y - 6, duration: 4000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  // ===== 飞鸟：一小群 V 形鸟偶尔飞过（拍翅动画）=====
  _drawBirds(W, H) {
    const flock = () => {
      const baseY = Phaser.Math.Between(H * 0.1, H * 0.24);
      const n = Phaser.Math.Between(3, 5);
      const birds = [];
      for (let i = 0; i < n; i++) {
        const g = this.add.graphics().setDepth(-6);
        const bx = -60 - i * 34, by = baseY + i * (i % 2 ? 16 : -16) * 0.6;
        g.x = bx; g.y = by;
        const redraw = (flap) => {
          g.clear(); g.lineStyle(3, 0x3a5a72, 0.8);
          g.beginPath(); g.moveTo(-9, 0); g.lineTo(0, flap ? -5 : -1); g.lineTo(9, 0); g.strokePath();
        };
        redraw(true);
        this.tweens.addCounter({
          from: 0, to: 1, duration: 320, yoyo: true, repeat: -1,
          onUpdate: (t) => redraw(t.getValue() > 0.5),
        });
        this.tweens.add({
          targets: g, x: W + 80, y: `+=${Phaser.Math.Between(-30, 30)}`,
          duration: Phaser.Math.Between(9000, 13000), ease: 'Sine.inOut',
          delay: i * 120, onComplete: () => g.destroy(),
        });
        birds.push(g);
      }
    };
    // 首次延迟出现，之后每隔一段随机再来一群
    this.time.delayedCall(3000, flock);
    this.time.addEvent({ delay: 18000, loop: true, callback: () => { if (Math.random() < 0.7) flock(); } });
  }

  // ===== 可爱热气球：缓缓从下往上飘过一次又一次（希望/上升感）=====
  _drawBalloon(W, H) {
    const g = this.add.container(0, 0).setDepth(-5);
    const colors = [0xff9a7a, 0xffd870, 0x7ec8ff, 0x90e8b0, 0xe890b0];
    const col = Phaser.Utils.Array.GetRandom(colors);
    // 气球体
    g.add(this.add.ellipse(0, 0, 44, 54, col, 0.95));
    g.add(this.add.ellipse(-9, -6, 12, 22, 0xffffff, 0.35));
    g.add(this.add.rectangle(0, 30, 18, 14, 0x8a5a3a, 0.95)); // 吊篮
    g.add(this.add.line(0, 0, -14, 24, -7, 30, 0x6a4a2a).setLineWidth(1.5));
    g.add(this.add.line(0, 0, 14, 24, 7, 30, 0x6a4a2a).setLineWidth(1.5));
    const fly = () => {
      g.x = Phaser.Math.Between(W * 0.2, W * 0.8); g.y = H + 80;
      this.tweens.add({
        targets: g, y: -100, duration: Phaser.Math.Between(26000, 34000), ease: 'Sine.inOut',
        delay: Phaser.Math.Between(0, 8000), onComplete: fly,
      });
      this.tweens.add({ targets: g, x: g.x + Phaser.Math.Between(-60, 60), duration: 6000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    };
    fly();
  }

  // ===== 角色阵容：4 个 SkyOffice 角色站立，呼吸+阴影 =====
  _drawCast(W, H) {
    const chars = [
      { key: 'title_adam', frame: 'Adam_idle_anim_1', scale: 2.5 },
      { key: 'title_ash', frame: 'Ash_idle_anim_1', scale: 2.5 },
      { key: 'title_lucy', frame: 'Lucy_idle_anim_1', scale: 2.5 },
      { key: 'title_nancy', frame: 'Nancy_idle_anim_1', scale: 2.5 },
    ];
    const castY = H * 0.55;
    const spacing = 160;
    const startX = W / 2 - ((chars.length - 1) * spacing) / 2;

    chars.forEach((c, i) => {
      const x = startX + i * spacing;
      // 阴影椭圆
      this.add.ellipse(x, castY + 58, 48, 14, 0x000000, 0.2).setDepth(4);

      const spr = this.add.sprite(x, castY, c.key, c.frame)
        .setScale(c.scale).setOrigin(0.5, 1).setDepth(5).setAlpha(0);
      // 淡入
      this.tweens.add({
        targets: spr, alpha: 1, duration: 600, delay: 1200 + i * 200,
        onComplete: () => {
          // 持续呼吸（上下浮动）
          this.tweens.add({
            targets: spr, y: castY - 4, duration: 2000 + i * 200,
            yoyo: true, repeat: -1, ease: 'Sine.inOut',
          });
        },
      });

      // idle 动画循环（如果帧存在）
      const animKey = `title_idle_${i}`;
      if (!this.anims.exists(animKey) && this.textures.exists(c.key)) {
        const frames = [];
        for (let f = 1; f <= 4; f++) {
          const fn = c.frame.replace('_1', `_${f}`);
          if (this.textures.getFrame(c.key, fn)) frames.push({ key: c.key, frame: fn });
        }
        if (frames.length >= 2) {
          this.anims.create({ key: animKey, frames, frameRate: 4, repeat: -1 });
        }
      }
      if (this.anims.exists(animKey)) {
        spr.play(animKey);
      }
    });
  }

  _highlightSelected() {
    if (!this._menuButtons || !this._menuButtons.length) return;
    this._menuButtons.forEach((b, i) => {
      if (b.setSelected) b.setSelected(i === this._selectedBtn);
    });
  }
  _navButton(dir) {
    if (this._overlayActive || !this._menuButtons || !this._menuButtons.length) return;
    this._selectedBtn = (this._selectedBtn + dir + this._menuButtons.length) % this._menuButtons.length;
    this._highlightSelected();
    AudioSystem.blip && AudioSystem.blip('导航');
  }
  _handleAction(action) {
    if (this._overlayActive) return;
    switch (action) {
      case 'resume': this._doResume(); break;
      case 'load': this._showLoadPanel(); break;
      case 'newgame': this._showNewGamePanel(); break;
      case 'settings': this._showSettingsPanel(); break;
      case 'credits': this._showCreditsPanel(); break;
    }
  }
  _doResume() {
    const latest = SaveSystem.latestSlot();
    if (latest === null) { this._showNewGamePanel(); return; }
    const save = SaveSystem.loadSlot(latest);
    const data = buildWorldResumeData(save);
    if (!data) { this._showNewGamePanel(); return; }
    this.cameras.main.fadeOut(500, 100, 140, 180);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('WorldScene', data));
  }

  _openOverlay() {
    this._overlayActive = true;
    const { width: W, height: H } = this.scale;
    const c = this.add.container(0, 0).setDepth(20000);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x06060c, 0.92).setInteractive());
    const pw = 760, ph = 820, px = W / 2, py = H / 2;
    c.add(this.add.rectangle(px, py, pw, ph, 0x12121e, 0.98).setStrokeStyle(2, 0xd4a353, 0.6));
    this._overlay = c;
    this.input.keyboard.once('keydown-ESC', () => this._closeOverlay());
    return { c, pw, ph, px, py };
  }
  _closeOverlay() { this._overlayActive = false; if (this._overlay) { this._overlay.destroy(true); this._overlay = null; } }
  _overlayTitle(text) {
    const px = this.scale.width / 2, py = this.scale.height / 2, ph = 820;
    this._overlay.add(this.add.text(px, py - ph / 2 + 36, text, { fontSize: '30px', color: '#ffd24d', fontStyle: 'bold' }).setOrigin(0.5));
  }
  _overlayCloseButton() {
    const { width: W, height: H } = this.scale; const pw = 760;
    const btn = this.add.text(W / 2 + pw / 2 - 20, H / 2 - 820 / 2 + 18, 'x', { fontSize: '24px', color: '#8a8a9e' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ff9a7a'));
    btn.on('pointerout', () => btn.setColor('#8a8a9e'));
    btn.on('pointerdown', () => this._closeOverlay());
    this._overlay.add(btn);
  }

  _showLoadPanel() {
    this._openOverlay(); this._overlayTitle('读取存档'); this._overlayCloseButton();
    const { width: W, height: H } = this.scale;
    const slots = SaveSystem.listSlots();
    const cardW = 520, cardH = 120, gap = 16, startY = H / 2 - 170;
    slots.forEach((s) => {
      const cy = startY + (s.slot - 1) * (cardH + gap), cx = W / 2;
      const card = this.add.rectangle(cx, cy, cardW, cardH, s.exists ? 0x1a1a2e : 0x0e0e18, 0.95)
        .setStrokeStyle(2, s.exists ? 0x4a4a6a : 0x2a2a3e);
      if (s.exists) {
        const name = CAREER_NAMES[s.career] || s.career || '未知';
        const act = s.act ? `第 ${s.act} 幕` : '';
        const day = s.day ? ` · 第 ${s.day} 天` : '';
        const time = s.updatedAt ? this._fmtTime(s.updatedAt) : '';
        this._overlay.add(this.add.text(cx - cardW / 2 + 20, cy - 40, `槽位 ${s.slot}  ${name}`, { fontSize: '22px', color: '#ffe08a', fontStyle: 'bold' }));
        this._overlay.add(this.add.text(cx - cardW / 2 + 20, cy - 8, `${act}${day}  ${time}`, { fontSize: '16px', color: '#9a9ab0' }));
        const loadBtn = this.add.text(cx + cardW / 2 - 130, cy + 18, '读取', { fontSize: '18px', color: '#7eff9a', backgroundColor: '#1a3a2aee', padding: { x: 12, y: 6 } })
          .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        loadBtn.on('pointerover', () => loadBtn.setBackgroundColor('#2a5a3aee'));
        loadBtn.on('pointerout', () => loadBtn.setBackgroundColor('#1a3a2aee'));
        loadBtn.on('pointerdown', () => {
          this._closeOverlay();
          const save = SaveSystem.loadSlot(s.slot);
          const data = buildWorldResumeData(save);
          if (data) { this.cameras.main.fadeOut(500, 100, 140, 180); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('WorldScene', data)); }
        });
        const delBtn = this.add.text(cx + cardW / 2 - 40, cy + 18, '删', { fontSize: '18px', color: '#ff9a9a', backgroundColor: '#3a1a1aee', padding: { x: 10, y: 6 } })
          .setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        delBtn.on('pointerover', () => delBtn.setBackgroundColor('#5a2a2aee'));
        delBtn.on('pointerout', () => delBtn.setBackgroundColor('#3a1a1aee'));
        delBtn.on('pointerdown', () => { SaveSystem.clearSlot(s.slot); this._closeOverlay(); this._showLoadPanel(); });
        this._overlay.add([loadBtn, delBtn]);
      } else {
        this._overlay.add(this.add.text(cx, cy, `槽位 ${s.slot}  -- 空 --`, { fontSize: '20px', color: '#4a4a5e' }).setOrigin(0.5));
      }
      this._overlay.add(card);
    });
  }

  _showNewGamePanel() {
    this._openOverlay(); this._overlayTitle('新的旅程'); this._overlayCloseButton();
    const { width: W, height: H } = this.scale;
    this._overlay.add(this.add.text(W / 2, H / 2 - 200, '选择一个存档槽位开始', { fontSize: '18px', color: '#9a9ab0' }).setOrigin(0.5));
    const slots = SaveSystem.listSlots();
    const cardW = 520, cardH = 110, gap = 14, startY = H / 2 - 140;
    slots.forEach((s) => {
      const cy = startY + (s.slot - 1) * (cardH + gap), cx = W / 2;
      const card = this.add.rectangle(cx, cy, cardW, cardH, s.exists ? 0x2a1a1e : 0x1a2a1e, 0.95)
        .setStrokeStyle(2, s.exists ? 0x8a4a4a : 0x4a8a4a).setInteractive({ useHandCursor: true });
      const label = s.exists ? `槽位 ${s.slot}  ${CAREER_NAMES[s.career] || s.career}（将被覆盖）` : `槽位 ${s.slot}  -- 空 --`;
      const txt = this.add.text(cx, cy, label, { fontSize: '20px', color: s.exists ? '#ffaaaa' : '#aaffaa' }).setOrigin(0.5);
      this._overlay.add([card, txt]);
      card.on('pointerover', () => card.setFillStyle(0x3a3a4e));
      card.on('pointerout', () => card.setFillStyle(s.exists ? 0x2a1a1e : 0x1a2a1e));
      card.on('pointerdown', () => {
        SaveSystem.clearSlot(s.slot); this._closeOverlay();
        this.cameras.main.fadeOut(500, 100, 140, 180);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('OpeningScene', { newGameSlot: s.slot }));
      });
    });
  }

  _showSettingsPanel() {
    this._openOverlay(); this._overlayTitle('设置'); this._overlayCloseButton();
    const { width: W, height: H } = this.scale;
    let settings = { bgm: 70, sfx: 80 };
    try { settings = { ...settings, ...JSON.parse(localStorage.getItem('wdwtb_settings') || '{}') }; } catch (e) {}
    const save = () => { try { localStorage.setItem('wdwtb_settings', JSON.stringify(settings)); } catch (e) {} };
    const slider = (y, label, key) => {
      const trackX = W / 2 - 60, trackW = 220;
      this._overlay.add(this.add.text(W / 2 - 200, y, label, { fontSize: '18px', color: '#c8c8dc' }).setOrigin(0, 0.5));
      this._overlay.add(this.add.rectangle(trackX, y, trackW, 6, 0x2a2a3e).setOrigin(0, 0.5));
      const fill = this.add.rectangle(trackX, y, trackW * settings[key] / 100, 6, 0x4ec9b0).setOrigin(0, 0.5);
      const knob = this.add.circle(trackX + trackW * settings[key] / 100, y, 10, 0xf0d68a).setInteractive({ useHandCursor: true, draggable: true });
      const valTxt = this.add.text(trackX + trackW + 24, y, `${settings[key]}`, { fontSize: '16px', color: '#9aa0c0' }).setOrigin(0, 0.5);
      this._overlay.add([fill, knob, valTxt]); this.input.setDraggable(knob);
      knob.on('drag', (p, dx) => {
        const nx = Phaser.Math.Clamp(dx, trackX, trackX + trackW); knob.x = nx;
        const val = Math.round((nx - trackX) / trackW * 100); settings[key] = val; fill.width = trackW * val / 100; valTxt.setText(`${val}`);
        AudioSystem.setVolume(key, val); save();
      });
      knob.on('dragend', () => { if (key === 'sfx') AudioSystem.uiClick(); });
    };
    slider(H / 2 - 160, '背景音乐', 'bgm');
    slider(H / 2 - 100, '音效', 'sfx');
    const SPEED_NAMES = ['慢', '中', '快'];
    const speedVal = () => settings.textSpeed ?? 1;
    const speedBtn = this.add.text(W / 2, H / 2 - 30, `文字速度：${SPEED_NAMES[speedVal()]}`, { fontSize: '20px', color: '#e8e8f4', backgroundColor: '#232338', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    speedBtn.on('pointerover', () => speedBtn.setBackgroundColor('#33334e')); speedBtn.on('pointerout', () => speedBtn.setBackgroundColor('#232338'));
    speedBtn.on('pointerdown', () => { settings.textSpeed = (speedVal() + 1) % 3; save(); speedBtn.setText(`文字速度：${SPEED_NAMES[speedVal()]}`); AudioSystem.uiClick(); });
    this._overlay.add(speedBtn);
    const assistOn = () => !!settings.assist;
    const assistBtn = this.add.text(W / 2, H / 2 + 30, '', { fontSize: '20px', color: '#e8e8f4', padding: { x: 20, y: 10 }, backgroundColor: assistOn() ? '#2a4436' : '#232338' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const updateAssist = () => { assistBtn.setText(`叙事辅助：${assistOn() ? '开' : '关'}（减轻状态消耗）`); assistBtn.setBackgroundColor(assistOn() ? '#2a4436' : '#232338'); };
    updateAssist();
    assistBtn.on('pointerover', () => assistBtn.setBackgroundColor(assistOn() ? '#3a5a46' : '#33334e'));
    assistBtn.on('pointerout', () => assistBtn.setBackgroundColor(assistOn() ? '#2a4436' : '#232338'));
    assistBtn.on('pointerdown', () => { settings.assist = !settings.assist; save(); updateAssist(); AudioSystem.uiClick(); });
    this._overlay.add(assistBtn);
    const fsBtn = this.add.text(W / 2, H / 2 + 90, '全屏 / 退出全屏', { fontSize: '20px', color: '#e8e8f4', backgroundColor: '#232338', padding: { x: 20, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    fsBtn.on('pointerover', () => fsBtn.setBackgroundColor('#33334e')); fsBtn.on('pointerout', () => fsBtn.setBackgroundColor('#232338'));
    fsBtn.on('pointerdown', () => { if (this.scale.isFullscreen) this.scale.stopFullscreen(); else this.scale.startFullscreen(); AudioSystem.uiClick(); });
    this._overlay.add(fsBtn);
  }

  _showCreditsPanel() {
    this._openOverlay(); this._overlayTitle('制作组'); this._overlayCloseButton();
    const { width: W, height: H } = this.scale;
    const lines = [
      { t: 'OFFERED · 录用通知', c: '#ffd24d', s: '24px' },
      { t: '', c: '#888' },
      { t: 'AI 开发引擎', c: '#8fd08f', s: '20px' },
      { t: 'WorkBuddy — 腾讯 AI 办公智能体', c: '#ffe08a', s: '18px' },
      { t: '从代码到内容，全程 AI 驱动开发', c: '#c8c8dc' },
      { t: '', c: '#888' },
      { t: 'AI 内容引擎', c: '#8fd08f', s: '18px' },
      { t: '腾讯混元 hy3 — 结局画像 / NPC 台词', c: '#c8c8dc' },
      { t: '5 幕叙事，AI 实时生成', c: '#9a9ab0' },
      { t: '', c: '#888' },
      { t: '游戏设计', c: '#8fd08f', s: '18px' },
      { t: '职场探索叙事 RPG · 当前主打程序员线', c: '#c8c8dc' },
      { t: '任务链 / 好感 / 物品 / 事件 / 五结局', c: '#9a9ab0' },
      { t: '', c: '#888' },
      { t: '像素美术', c: '#8fd08f', s: '18px' },
      { t: 'LimeZu / Kenney / SkyOffice (MIT)', c: '#c8c8dc' },
      { t: '', c: '#888' },
      { t: '技术栈', c: '#8fd08f', s: '18px' },
      { t: 'Phaser 3.80 · Vite 5 · WebAudio', c: '#c8c8dc' },
      { t: 'Fusion Pixel 12px 字体 (OFL)', c: '#9a9ab0' },
      { t: '', c: '#888' },
      { t: '部署：腾讯云 EdgeOne Pages', c: '#8fd08f', s: '18px' },
      { t: '', c: '#888' },
      { t: '入职之后，才知道适不适合。', c: '#ffd24d', s: '20px' },
      { t: '腾讯云黑客松 2026 · WorkBuddy 出品', c: '#6a6a82' },
    ];
    const lineH = 26; // 略缩行距,容下更多行且不撞标题
    // 从面板标题(y = H/2 - 410 + 36)下方留足 56px 开始,避免居中算法把长列表顶到标题上重叠。
    const startY = H / 2 - 820 / 2 + 36 + 56;
    lines.forEach((line, i) => {
      this._overlay.add(this.add.text(W / 2, startY + i * lineH, line.t, {
        fontSize: line.s || '16px', color: line.c || '#c8c8dc', fontStyle: line.s ? 'bold' : 'normal',
      }).setOrigin(0.5));
    });
  }

  _fmtTime(ts) {
    try {
      const d = new Date(ts);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (e) { return ''; }
  }
}
