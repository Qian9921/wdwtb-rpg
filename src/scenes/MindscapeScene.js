import Phaser from 'phaser';
import { AIClient } from '../systems/AIClient.js';
import { AudioSystem } from '../systems/AudioSystem.js';

// MindscapeScene — 招牌机制「心象世界」
// 玩家内心的可视化空间:氛围随心理状态实时变化,AI内心独白浮现,
// 玩家亲手点亮光=疗愈(能动性)。对标获奖作品的"内心可视化"DNA。
//
// 进入方式:主线对话 action:"enter_mindscape" → scene.launch/start 传入
//   { stateSystem, returnScene, monoScene } 或 { stateSnapshot }
export class MindscapeScene extends Phaser.Scene {
  constructor() { super('MindscapeScene'); }

  init(data) {
    this._exiting = false; // 场景重进时复位防重入标志
    this.data0 = data || {};
    this.stateSystem = data?.stateSystem || null;
    this.returnScene = data?.returnScene || null; // 返回哪个场景(如WorldScene)恢复
    this.monoScene = data?.monoScene || 'auto';    // 独白情绪键,'auto'=按状态选
    const s = data?.stateSnapshot
      || (this.stateSystem ? this.stateSystem.getAll() : null)
      || { health: 55, energy: 55, san: 50, stress: 50, skill: 10, performance: 50, money: 0, passion: 55 };
    this.snap = s;
    // 内心明暗度 mood 0~100:心态+热情+抗压+健康 的均值
    this.mood = Phaser.Math.Clamp(
      (s.san + s.passion + (100 - s.stress) + s.health) / 4, 0, 100
    );
    this.healed = false;
  }

  preload() {
    if (!this.cache.json.has('monologues')) {
      this.load.json('monologues', './data/monologues.json');
    }
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    AudioSystem.playBgm('mindscape'); // 空灵慢板，衬内心空间

    this._buildPalette();  // 按 mood 定调色板（低落/迷雾/治愈，都精心和谐）
    // 溶入黑场（用调色板天空色，衔接更自然）
    this.cameras.main.fadeIn(700, (this.pal.skyTop >> 16) & 255, (this.pal.skyTop >> 8) & 255, this.pal.skyTop & 255);

    this._renderSky();       // 渐变天空 + 雾
    this._renderMountains();  // 远景山峦剪影（视差层次）
    this._renderGlowOrb();    // 月/日柔光辉光
    this._renderStardust();   // 星尘（ADD 辉光 + twinkle）
    this._renderIsland();     // 浮岛 + 倒影
    this._renderPlant();      // 精致的树 + 光晕
    this._renderFloatingWords(); // 负面词（低落时）
    this._renderTitle();

    // 稍候浮现内心独白 → 再给疗愈选择
    this.time.delayedCall(200, () => this._showMonologue());

    // 右上角离开按钮 + ESC：随时可以离开内心世界（不强留玩家）
    const exitBtn = this.add.text(this.W - 16, 14, '离开 ›', {
      fontSize: '13px', color: '#8a8a9e',
    }).setOrigin(1, 0).setDepth(50).setInteractive({ useHandCursor: true });
    exitBtn.on('pointerover', () => exitBtn.setColor('#fff2c0'));
    exitBtn.on('pointerout', () => exitBtn.setColor('#8a8a9e'));
    exitBtn.on('pointerdown', () => this._exit());
    this.input.keyboard.on('keydown-ESC', () => this._exit());
  }

  // ===== 调色板：按 mood 分三档，每档精心和谐（参考 Gris/Journey 情绪美学）=====
  _buildPalette() {
    const m = this.mood;
    if (m < 40) {
      // 低落：深靛蓝夜，冷色，稀疏冷白星，枯树微光
      this.pal = {
        mood: 'low',
        skyTop: 0x0a0e2a, skyBot: 0x1b1c3e,
        mountains: [0x11132e, 0x171a38, 0x1e2244],
        orb: 0xb8c4e8, orbGlow: 0x7a88c0,
        star: 0x9aa8d8, starCount: 34,
        island: 0x2a2e4a, islandDark: 0x1c1f38,
        trunk: 0x3a3850, leaf: 0x484d68, leafGlow: null,
        fog: 0x2a2c50,
      };
    } else if (m > 65) {
      // 治愈：暖紫→粉金渐变，温暖，密集金星尘，生机树+暖光晕
      this.pal = {
        mood: 'heal',
        skyTop: 0x2a1e48, skyBot: 0x5e3f62,
        mountains: [0x3a2a56, 0x4a3560, 0x5c4468],
        orb: 0xffe0a0, orbGlow: 0xffb868,
        star: 0xffd880, starCount: 80,
        island: 0x46583e, islandDark: 0x2e3a2e,
        trunk: 0x6a5240, leaf: 0x74c49a, leafGlow: 0xa8ecc8,
        fog: null,
      };
    } else {
      // 迷雾：灰蓝紫，朦胧，薄雾层，半生机
      this.pal = {
        mood: 'mid',
        skyTop: 0x18203e, skyBot: 0x342e50,
        mountains: [0x222448, 0x2a2a52, 0x34305c],
        orb: 0xcac0dc, orbGlow: 0x9a8cc0,
        star: 0xb4acce, starCount: 52,
        island: 0x3c3c56, islandDark: 0x2a2a42,
        trunk: 0x5a5248, leaf: 0x7a9a80, leafGlow: null,
        fog: 0x8a84b0,
      };
    }
  }

  _ensureDot() {
    if (this.textures.exists('_ms_dot')) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillCircle(5, 5, 5);
    g.generateTexture('_ms_dot', 10, 10); g.destroy();
  }

  // ===== 渐变天空 + 薄雾 =====
  _renderSky() {
    const g = this.add.graphics().setDepth(0);
    // 垂直渐变（顶深→底暖），Phaser 四角渐变填全屏
    g.fillGradientStyle(this.pal.skyTop, this.pal.skyTop, this.pal.skyBot, this.pal.skyBot, 1);
    g.fillRect(0, 0, this.W, this.H);
    // 迷雾层（呼吸）
    if (this.pal.fog && this.pal.mood !== 'heal') {
      const fog = this.add.rectangle(this.W / 2, this.H * 0.66, this.W, this.H * 0.55, this.pal.fog, 0.07).setDepth(3);
      this.tweens.add({ targets: fog, alpha: 0.14, duration: 4500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  // ===== 远景山峦剪影（多层视差，营造景深）=====
  _renderMountains() {
    const { W, H } = this;
    this.pal.mountains.forEach((col, layer) => {
      const g = this.add.graphics().setDepth(1);
      g.fillStyle(col, 1);
      const baseY = H * (0.5 + layer * 0.09);
      const amp = 70 - layer * 16;
      const seg = 9;
      g.beginPath();
      g.moveTo(0, H);
      g.lineTo(0, baseY);
      for (let i = 0; i <= seg; i++) {
        const x = (W / seg) * i;
        const y = baseY + Math.sin(i * 1.2 + layer * 2.3) * amp;
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fillPath();
    });
  }

  // ===== 月/日柔光辉光（ADD 混合多层同心圆）=====
  _renderGlowOrb() {
    const mx = this.W * 0.76, my = this.H * 0.22;
    const r = this.pal.mood === 'heal' ? 46 : 38;
    for (let i = 8; i >= 1; i--) {
      this.add.circle(mx, my, r * (0.5 + i * 0.42), this.pal.orbGlow, 0.045)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    }
    const core = this.add.circle(mx, my, r, this.pal.orb, 0.95).setDepth(2);
    this.tweens.add({ targets: core, scale: 1.06, duration: 3800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  // ===== 星尘：静态星点 twinkle（ADD 辉光）+ 治愈态上升光尘 =====
  _renderStardust() {
    for (let i = 0; i < this.pal.starCount; i++) {
      const x = Phaser.Math.Between(0, this.W);
      const y = Phaser.Math.Between(0, this.H * 0.72);
      const r = Phaser.Math.FloatBetween(0.7, 2.3);
      const star = this.add.circle(x, y, r, this.pal.star, Phaser.Math.FloatBetween(0.3, 0.9))
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
      this.tweens.add({
        targets: star, alpha: Phaser.Math.FloatBetween(0.1, 0.4),
        duration: Phaser.Math.Between(1600, 4200), yoyo: true, repeat: -1,
        ease: 'Sine.inOut', delay: Phaser.Math.Between(0, 2200),
      });
    }
    // 治愈态：从下方缓缓上升的暖金光尘（希望感）
    if (this.pal.mood === 'heal') {
      this._ensureDot();
      this.add.particles(0, 0, '_ms_dot', {
        x: { min: 0, max: this.W }, y: this.H + 12,
        frequency: 280, lifespan: 9500,
        scale: { min: 0.4, max: 1.4 }, alpha: { start: 0.85, end: 0 },
        speedY: { min: -30, max: -12 }, speedX: { min: -8, max: 8 },
        tint: 0xffd880, blendMode: 'ADD',
      }).setDepth(2);
    }
  }

  // ===== 中心浮岛 + 水面倒影 =====
  _renderIsland() {
    const cx = this.W / 2, cy = this.H * 0.6;
    this.plantCX = cx; this.plantCY = cy - 8;
    // 倒影（岛下方，暗淡模糊感）
    this.add.ellipse(cx, cy + 96, 300, 46, this.pal.islandDark, 0.28).setDepth(2);
    // 岛体（双层做厚度：底暗 + 顶亮）
    this.add.ellipse(cx, cy + 48, 330, 92, this.pal.islandDark, 0.95).setDepth(3);
    this.add.ellipse(cx, cy + 40, 330, 86, this.pal.island, 1).setDepth(3);
    // 岛面柔光高光
    this.add.ellipse(cx, cy + 34, 250, 52, this.pal.island, 0.4)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    // 治愈态：岛下发光根须
    if (this.pal.mood === 'heal') {
      const glow = this.add.ellipse(cx, cy + 78, 270, 66, this.pal.orbGlow, 0.14)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
      this.tweens.add({ targets: glow, alpha: 0.24, scaleX: 1.1, duration: 2800, yoyo: true, repeat: -1 });
    }
  }

  // ===== 中心的树（情感锚点）：弯曲枝干 + 蓬松渐变叶簇 + 光晕 =====
  _renderPlant() {
    const cx = this.plantCX, cy = this.plantCY + 34; // 树根落在岛面
    const g = this.add.graphics().setDepth(5);
    // 主干（略呈锥形）
    g.fillStyle(this.pal.trunk, 1);
    g.beginPath();
    g.moveTo(cx - 6, cy);
    g.lineTo(cx - 3, cy - 74);
    g.lineTo(cx + 3, cy - 74);
    g.lineTo(cx + 6, cy);
    g.closePath();
    g.fillPath();
    // 分枝
    g.lineStyle(3, this.pal.trunk, 1);
    g.beginPath();
    g.moveTo(cx, cy - 52); g.lineTo(cx - 26, cy - 76);
    g.moveTo(cx, cy - 60); g.lineTo(cx + 24, cy - 88);
    g.strokePath();

    // 蓬松树冠（多个渐变椭圆叠加成有机形态），叶数随 mood
    this.leaves = [];
    const topY = cy - 94;
    const cluster = this.pal.mood === 'low' ? 4 : this.pal.mood === 'mid' ? 8 : 12;
    for (let i = 0; i < cluster; i++) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const rr = Phaser.Math.FloatBetween(0, 44);
      const lx = cx + Math.cos(a) * rr;
      const ly = topY + Math.sin(a) * rr * 0.68;
      const sz = Phaser.Math.Between(26, 46);
      const leaf = this.add.ellipse(lx, ly, sz, sz * 0.82, this.pal.leaf, 0.82).setDepth(5);
      this.leaves.push(leaf);
      // 缓慢呼吸
      this.tweens.add({
        targets: leaf, scaleX: 1.08, scaleY: 1.08,
        duration: Phaser.Math.Between(2200, 3800), yoyo: true, repeat: -1,
        ease: 'Sine.inOut', delay: i * 90,
      });
    }
    // 树冠光晕（治愈态）
    if (this.pal.leafGlow) {
      this.plantGlow = this.add.circle(cx, topY, 62, this.pal.leafGlow, 0.14)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
      this.tweens.add({ targets: this.plantGlow, alpha: 0.26, scale: 1.16, duration: 2400, yoyo: true, repeat: -1 });
    }
  }

  // ===== 飘浮的负面词（压力具象，低落时）=====
  _renderFloatingWords() {
    if (this.mood >= 55) return;
    const words = ['KPI', '又改需求', '是不是我不行', 'deadline', '还没做完', '对不起'];
    const n = this.mood < 30 ? 5 : 3;
    this.words = [];
    for (let i = 0; i < n; i++) {
      const w = Phaser.Utils.Array.GetRandom(words);
      const x = Phaser.Math.Between(160, this.W - 160);
      const y = Phaser.Math.Between(130, this.H * 0.58);
      const t = this.add.text(x, y, w, { fontSize: '20px', color: '#6a6a90', fontStyle: 'italic' })
        .setOrigin(0.5).setAlpha(0.32).setDepth(4);
      this.tweens.add({
        targets: t, y: y - 26, alpha: 0.08,
        duration: 3200 + i * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
      this.words.push(t);
    }
  }

  _renderTitle() {
    this.add.text(this.W / 2, 30, '· 心 象 ·', {
      fontSize: '20px', color: '#cfc8e0', letterSpacing: 8,
    }).setOrigin(0.5).setDepth(20).setAlpha(0.85);
  }

  // ===== AI内心独白(逐字浮现) =====
  _pickMonologue() {
    const mono = this.cache.json.get('monologues');
    const scenes = mono?.scenes || mono || {};
    let key = this.monoScene;
    if (!key || key === 'auto') {
      const s = this.snap;
      if (s.health < 30) key = 'low_health';
      else if (s.stress > 70) key = 'high_stress';
      else if (s.passion < 30) key = 'low_passion';
      else if (s.san < 35) key = 'self_doubt';
      else if (this.mood > 70) key = 'small_achievement';
      else key = 'late_night_emo';
    }
    const arr = scenes[key] || scenes['late_night_emo'] || ['……'];
    return Phaser.Utils.Array.GetRandom(arr);
  }

  async _showMonologue() {
    console.log('[Mind] _showMonologue enter');
    // AI优先(结合实时状态个性化),模板兜底
    const tpl = this._pickMonologue();
    let text = tpl;
    try {
      const sp = this.snap;
      const res = await AIClient.call([
        { role: 'system', content: '你是职场疗愈游戏里玩家的内心独白。第一人称,2-3句,克制走心,写画面不写形容,像深夜对自己说的话。只用中文。' },
        { role: 'user', content: `我的状态:健康${sp.health} 精力${sp.energy} 心态${sp.san} 压力${sp.stress} 热情${sp.passion}。写一段此刻我站在自己内心世界里的独白。` },
      ], { model: 'hy3', timeoutMs: 7000, fallbackFn: () => ({ text: tpl }) });
      if (res.text && res.text.length > 6 && res.text.length < 160) text = res.text.trim();
    } catch (e) { /* 用模板 */ }
    console.log('[Mind] render box, text=', text.slice(0,20));
    const box = this.add.container(0, 0).setDepth(30);
    const bg = this.add.rectangle(this.W / 2, this.H - 90, this.W - 120, 120, 0x000000, 0.5);
    box.add(bg);
    const tf = this.add.text(this.W / 2, this.H - 90, '', {
      fontSize: '18px', color: '#eae6ff', align: 'center',
      wordWrap: { width: this.W - 180, useAdvancedWrap: true }, lineSpacing: 8,
    }).setOrigin(0.5);
    box.add(tf);
    this.monoBox = box;

    // 打字机
    let i = 0;
    this.time.addEvent({
      delay: 55, repeat: text.length - 1,
      callback: () => { tf.setText(text.slice(0, ++i)); },
    });
    // 独白完 → 疗愈选择
    this.time.delayedCall(text.length * 55 + 700, () => this._showHealingChoices());
  }

  // ===== 玩家亲手点亮光(疗愈,能动性) =====
  _showHealingChoices() {
    const choices = [
      { label: '给自己泡杯热茶，早点睡', eff: { stress: -8, health: 4, san: 5 } },
      { label: '给爸妈回个电话，说说话', eff: { san: 6, passion: 3 } },
      { label: '写下今天唯一做成的一件小事', eff: { passion: 5, san: 4 } },
    ];
    const startY = this.H / 2 - 150;
    const c = this.add.container(0, 0).setDepth(31);
    this.choiceBox = c;
    c.add(this.add.text(this.W / 2, startY - 30, '此刻，你想为自己做点什么？', {
      fontSize: '16px', color: '#ffe08a',
    }).setOrigin(0.5));

    choices.forEach((ch, idx) => {
      const by = startY + idx * 46;
      const btn = this.add.rectangle(this.W / 2, by, 420, 38, 0x2a2a3e, 0.9)
        .setStrokeStyle(1, 0x5a5a7e).setInteractive({ useHandCursor: true }).setDepth(31);
      const label = this.add.text(this.W / 2, by, ch.label, { fontSize: '15px', color: '#e6e6ff' }).setOrigin(0.5).setDepth(32);
      c.add(btn); c.add(label);
      btn.on('pointerover', () => btn.setFillStyle(0x3a3a5e));
      btn.on('pointerout', () => btn.setFillStyle(0x2a2a3e));
      btn.on('pointerdown', () => this._doHeal(ch.eff));
    });
  }

  _doHeal(eff) {
    if (this.healed) return;
    this.healed = true;
    if (this.choiceBox) this.choiceBox.destroy(true);
    if (this.monoBox) this.monoBox.destroy(true);

    // 应用疗愈到真实状态
    if (this.stateSystem) {
      for (const [k, v] of Object.entries(eff)) this.stateSystem.change(k, v);
    }

    // 亲手点亮光的演出:一束光从绿植升起,绿植复苏,负面词消散
    const cx = this.plantCX, cy = this.plantCY;
    const light = this.add.circle(cx, cy - 10, 8, 0xfff2b0, 0.9).setDepth(40);
    this.tweens.add({
      targets: light, radius: 120, alpha: 0, duration: 1400, ease: 'Cubic.out',
    });
    // 绿植叶片变绿变多
    this.leaves.forEach((lf, i) => {
      this.tweens.add({ targets: lf, fillColor: 0x4ec9b0, scaleX: 1.3, scaleY: 1.3, delay: i * 80, duration: 500 });
    });
    // 负面词消散
    if (this.words) this.words.forEach(w => this.tweens.add({ targets: w, alpha: 0, y: w.y - 60, duration: 1000 }));
    // 天光渐亮
    this.cameras.main.flash(600, 60, 50, 70);

    // 疗愈完成语 → 返回
    const done = this.add.text(this.W / 2, this.H / 2 + 170, '你为自己，点亮了一点光。', {
      fontSize: '17px', color: '#fff2c0',
    }).setOrigin(0.5).setDepth(41).setAlpha(0);
    this.tweens.add({ targets: done, alpha: 1, duration: 800, delay: 600 });

    this.time.delayedCall(2600, () => this._exit());
  }

  _exit() {
    if (this._exiting) return; // 防重入：手动离开与自动返回可能双触发
    this._exiting = true;
    this.cameras.main.fadeOut(600, 10, 8, 20);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      if (this.returnScene) {
        this.scene.stop();
        this.scene.resume(this.returnScene);
        // 通知返回场景心象结束
        const rs = this.scene.get(this.returnScene);
        if (rs && rs.events) rs.events.emit('mindscapeReturn', { healed: this.healed });
      } else {
        this.scene.start('WorldScene');
      }
    });
  }
}
