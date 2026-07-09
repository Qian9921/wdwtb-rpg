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

    // 溶入黑场
    this.cameras.main.fadeIn(600, 10, 8, 20);

    this._renderSky();
    this._renderIsland();
    this._renderPlant();
    this._renderFloatingWords();
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

  // ===== 天空/氛围(冷暖插值) =====
  _renderSky() {
    const m = this.mood / 100;
    // 低落 深渊靛 #1b1b2e → 治愈 暖夜紫 #2e2a3e,高治愈再偏暖
    const lerp = (a, b) => Math.round(a + (b - a) * m);
    const bg = Phaser.Display.Color.GetColor(
      lerp(0x1b, 0x2e), lerp(0x1b, 0x2a), lerp(0x2e, 0x3e)
    );
    this.cameras.main.setBackgroundColor(bg);

    if (this.mood < 40) {
      // 低落:阴云 + 裂缝
      for (let i = 0; i < 5; i++) {
        this.add.ellipse(
          Phaser.Math.Between(80, this.W - 80), Phaser.Math.Between(40, 160),
          Phaser.Math.Between(160, 280), Phaser.Math.Between(40, 70),
          0x14141f, 0.55
        ).setDepth(1);
      }
      const g = this.add.graphics().setDepth(1);
      g.lineStyle(2, 0x101018, 0.8);
      for (let i = 0; i < 5; i++) {
        const x = Phaser.Math.Between(100, this.W - 100);
        g.beginPath(); g.moveTo(x, 180);
        g.lineTo(x + Phaser.Math.Between(-40, 40), this.H - 120);
        g.strokePath();
      }
    } else if (this.mood > 65) {
      // 治愈:天光 + 光缝
      for (let i = 0; i < 6; i++) {
        this.add.circle(
          Phaser.Math.Between(60, this.W - 60), Phaser.Math.Between(40, 200),
          Phaser.Math.Between(18, 42), 0xf5c86b, 0.10
        ).setDepth(1);
      }
      // 顶部一束天光
      const beam = this.add.triangle(this.W / 2, 0, -60, 0, 60, 0, 220, 360, 0xf5e0a0, 0.06).setDepth(1);
    } else {
      // 迷雾
      this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x8888aa, 0.10).setDepth(1);
    }
  }

  // ===== 中心浮地(内心岛屿) =====
  _renderIsland() {
    const cx = this.W / 2, cy = this.H / 2 + 40;
    const m = this.mood / 100;
    // 岛屿颜色:枯褐 → 生机绿褐
    const top = Phaser.Display.Color.GetColor(
      Math.round(0x4a + (0x6a - 0x4a) * m),
      Math.round(0x44 + (0x8a - 0x44) * m),
      Math.round(0x3a + (0x5a - 0x3a) * m)
    );
    // 主岛(椭圆浮地)
    this.add.ellipse(cx, cy + 60, 340, 120, top, 0.95).setDepth(2);
    this.add.ellipse(cx, cy + 60, 340, 120).setStrokeStyle(2, 0x2a2a38).setDepth(2);
    // 治愈态:岛下发光根须
    if (this.mood > 65) {
      this.add.ellipse(cx, cy + 110, 200, 40, 0xf5c86b, 0.12).setDepth(1);
    }
    // 环绕碎块(心事碎片),缓慢浮动
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI * 2 / 4) * i;
      const bx = cx + Math.cos(a) * 260;
      const by = cy + Math.sin(a) * 90;
      const frag = this.add.rectangle(bx, by, 34, 22, top, 0.8).setDepth(2).setAngle(Phaser.Math.Between(-20, 20));
      this.tweens.add({ targets: frag, y: by - 10, duration: 1800 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  // ===== 中心绿植(情感锚点,状态灯塔) =====
  _renderPlant() {
    const cx = this.W / 2, cy = this.H / 2 + 40;
    const m = this.mood / 100;
    // 茎
    const stemCol = Phaser.Display.Color.GetColor(
      Math.round(0x6a + (0x3a - 0x6a) * m),
      Math.round(0x5a + (0x8a - 0x5a) * m),
      Math.round(0x3a + (0x4a - 0x3a) * m)
    );
    this.plantStem = this.add.rectangle(cx, cy + 20, 6, 70, stemCol).setDepth(5);
    // 叶(数量随mood)
    const leafCol = Phaser.Display.Color.GetColor(
      Math.round(0x8a + (0x4e - 0x8a) * m),
      Math.round(0x7a + (0xc9 - 0x7a) * m),
      Math.round(0x4a + (0xb0 - 0x4a) * m)
    );
    this.leaves = [];
    const leafCount = 2 + Math.floor(this.mood / 14);
    for (let i = 0; i < leafCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const lf = this.add.ellipse(cx + side * (12 + i * 3), cy - 5 - i * 9, 16, 9, leafCol, 0.95)
        .setDepth(5).setAngle(side * 25);
      this.leaves.push(lf);
    }
    // 治愈态光晕
    if (this.mood > 65) {
      this.plantGlow = this.add.circle(cx, cy - 10, 46, 0x66ffcc, 0.12).setDepth(4);
      this.tweens.add({ targets: this.plantGlow, alpha: 0.22, scale: 1.15, duration: 1400, yoyo: true, repeat: -1 });
    }
    this.plantCX = cx; this.plantCY = cy;
  }

  // ===== 飘浮的负面词(压力具象) =====
  _renderFloatingWords() {
    if (this.mood >= 55) return;
    const words = ['KPI', '又改需求', '是不是我不行', 'deadline', '还没做完', '对不起'];
    const n = this.mood < 30 ? 5 : 3;
    this.words = [];
    for (let i = 0; i < n; i++) {
      const w = Phaser.Utils.Array.GetRandom(words);
      const x = Phaser.Math.Between(120, this.W - 120);
      const y = Phaser.Math.Between(80, this.H - 160);
      const t = this.add.text(x, y, w, { fontSize: '15px', color: '#556', fontStyle: 'italic' })
        .setAlpha(0.5).setDepth(3);
      this.tweens.add({ targets: t, y: y - 20, alpha: 0.15, duration: 2600 + i * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
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
