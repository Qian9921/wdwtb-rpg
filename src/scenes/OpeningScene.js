import Phaser from 'phaser';
import { AIClient } from '../systems/AIClient.js';
import { AudioSystem } from '../systems/AudioSystem.js';

// OpeningScene：开场"认识你" — 捏人 + 7 道情境测评(RIASEC+大五双通道) + AI 专属小传。
// 测评题库来自 data/assessment.json（专业规格：霍兰德 RIASEC + 大五人格，玩家全程不见术语）。
export class OpeningScene extends Phaser.Scene {
  constructor() { super('OpeningScene'); }

  preload() {
    this.load.json('assessment', './data/assessment.json');
    // LimeZu 四款 16×32
    for (const n of ['Adam', 'Alex', 'Amelia', 'Bob']) {
      this.load.spritesheet(n.toLowerCase(), `./assets/limezu/characters/${n}.png`, {
        frameWidth: 16, frameHeight: 32,
      });
    }
    // SkyOffice 四款 atlas（更精细，捏人可选）
    for (const c of ['adam', 'ash', 'lucy', 'nancy']) {
      this.load.atlas(`so_${c}`, `./assets/skyoffice/character/${c}.png`, `./assets/skyoffice/character/${c}.json`);
    }
  }

  create() {
    AudioSystem.playBgm('title'); // 与标题同氛围（相同 mood 不重启，无缝衔接）
    this.cameras.main.setBackgroundColor('#1a1a2e');
    // 960×540 硬编码坐标；zoom 2 + 居中让其在 1920 屏铺满原生锐利，坐标零改。
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);
    // 角色皮肤模板（真实游戏立绘,主角形象=进办公室的形象）
    // 两套素材混池：LimeZu(spritesheet 16×32,帧号索引) + SkyOffice(atlas 32×48,帧名索引)。
    // 每条带 type/pv(预览缩放)/th(缩略图缩放)/idle(静止帧)，捏人 UI 只调工厂、不碰底层格式。
    // pv/th 让两套素材缩放后等高：LimeZu 32px×3.6≈115，SkyOffice 48px×2.4≈115（视觉齐平不遮标题）。
    this.charSkins = [
      { key: 'alex',   name: '利落短发 · 男',  gender: 'male',    type: 'limezu', pv: 3.6, th: 2.0, idle: 3 },
      { key: 'bob',    name: '沉稳黑发 · 男',  gender: 'male',    type: 'limezu', pv: 3.6, th: 2.0, idle: 3 },
      { key: 'amelia', name: '栗色长发 · 女',  gender: 'female',  type: 'limezu', pv: 3.6, th: 2.0, idle: 3 },
      { key: 'adam',   name: '慵懒绿发 · 中性', gender: 'neutral', type: 'limezu', pv: 3.6, th: 2.0, idle: 3 },
      { key: 'so_adam',  cap: 'Adam',  name: '干练寸头 · 男', gender: 'male',   type: 'skyoffice', pv: 2.4, th: 1.3, idle: 'Adam_idle_anim_19.png' },
      { key: 'so_ash',   cap: 'Ash',   name: '金棕短发 · 男', gender: 'male',   type: 'skyoffice', pv: 2.4, th: 1.3, idle: 'Ash_idle_anim_19.png' },
      { key: 'so_lucy',  cap: 'Lucy',  name: '棕发利落 · 女', gender: 'female', type: 'skyoffice', pv: 2.4, th: 1.3, idle: 'Lucy_idle_anim_19.png' },
      { key: 'so_nancy', cap: 'Nancy', name: '黑发知性 · 女', gender: 'female', type: 'skyoffice', pv: 2.4, th: 1.3, idle: 'Nancy_idle_anim_19.png' },
    ];
    // 色调滤镜：给立绘加一层轻染色,四款皮肤 × 五种色调 = 20 种组合
    this.tints = [
      { name: '原色', tint: null },
      { name: '暖阳', tint: 0xffe8cc }, { name: '冷青', tint: 0xcce8ff },
      { name: '桃粉', tint: 0xffd8e8 }, { name: '薄荷', tint: 0xd8ffe0 },
    ];
    this.avatar = { skinIdx: 0, tintIdx: 0 };
    this.answers = [];
    this.riasec = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    this.big5 = { O: 0, C: 0, E: 0, A: 0, N: 0 };
    this.ui = null;
    this._buildCustomize();
  }

  _clearUI() { if (this.ui) { this.ui.destroy(true); this.ui = null; } }

  _button(x, y, w, h, label, cb, color = 0x2a2a3e, fontSize = '15px') {
    const btn = this.add.rectangle(x, y, w, h, color, 0.95)
      .setStrokeStyle(1, 0x4a4a6a).setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, y, label, {
      fontSize, color: '#e6e6f0', wordWrap: { width: w - 30, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x3a3a5e));
    btn.on('pointerout', () => btn.setFillStyle(color));
    btn.on('pointerdown', cb);
    this.ui.add(btn); this.ui.add(txt);
    return btn;
  }

  // ============ 阶段A：捏人（真实立绘 + 走路动画预览） ============
  _buildCustomize() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    this.ui.add(this.add.text(480, 40, '你是谁？', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 76, '选一个「即将走进职场的你」——这就是你在游戏里的样子', { fontSize: '14px', color: '#8b8ba0' }).setOrigin(0.5));

    // 预览台：聚光底座 + 大立绘（原地走路动画,像试衣间）
    // 立绘底部对齐 baseline=250，高约 115 → 顶部落 ~135，稳在副标题(y=76)下方，绝不遮标题。
    const cx = 480, baseline = 250;
    this.ui.add(this.add.ellipse(cx, baseline + 4, 120, 30, 0x2a2a44, 0.9));
    this.ui.add(this.add.ellipse(cx, baseline, 92, 22, 0x3a3a5e, 0.9));
    const first = this.charSkins[0];
    this.previewSpr = this.add.sprite(cx, baseline + 8, first.key, first.idle).setOrigin(0.5, 1);
    this._showSkinOn(this.previewSpr, first);
    this.previewSpr.setScale(first.pv);
    this.ui.add(this.previewSpr);
    // 预览台下方：当前皮肤名（随选择更新，取代拥挤的逐图小字）
    this.skinNameLabel = this.add.text(cx, baseline + 26, first.name, {
      fontSize: '15px', color: '#d4a353', fontStyle: 'bold', letterSpacing: 1,
    }).setOrigin(0.5);
    this.ui.add(this.skinNameLabel);

    // 缩略图池：8 款 → 2 行 × 4 列，居中排布（可点选,当前高亮金框）
    this.thumbFrames = [];
    const cols = 4, gx = 108, gy = 80, x0 = cx - (cols - 1) * gx / 2, y0 = 328;
    this.charSkins.forEach((s, i) => {
      const tx = x0 + (i % cols) * gx, ty = y0 + Math.floor(i / cols) * gy;
      const frame = this.add.rectangle(tx, ty, 74, 76, 0x232338, 0.95)
        .setStrokeStyle(2, i === 0 ? 0xd4a353 : 0x3a3a52)
        .setInteractive({ useHandCursor: true });
      const spr = this.add.sprite(tx, ty + 30, s.key, s.idle).setScale(s.th).setOrigin(0.5, 1);
      this._showSkinOn(spr, s); // 缩略图也动起来（试衣间感）
      frame.on('pointerover', () => { if (this.avatar.skinIdx !== i) frame.setStrokeStyle(2, 0x6a6a8a); });
      frame.on('pointerout', () => { if (this.avatar.skinIdx !== i) frame.setStrokeStyle(2, 0x3a3a52); });
      frame.on('pointerdown', () => this._pickSkin(i));
      this.ui.add(frame); this.ui.add(spr);
      this.thumbFrames.push(frame);
    });

    // 色调选择（染色滤镜,一排色块）
    this.ui.add(this.add.text(346, 470, '色调', { fontSize: '14px', color: '#aaaabc' }).setOrigin(0.5));
    this.tintDots = [];
    this.tints.forEach((t, i) => {
      const dx = 400 + i * 44;
      const dot = this.add.circle(dx, 470, 13, t.tint ?? 0x8888a0)
        .setStrokeStyle(2, i === 0 ? 0xd4a353 : 0x3a3a52)
        .setInteractive({ useHandCursor: true });
      dot.on('pointerdown', () => this._pickTint(i));
      this.ui.add(dot);
      this.tintDots.push(dot);
    });

    this._button(480, 512, 200, 40, '下一步 →', () => { this.qIdx = 0; this._showQuestion(); });
  }

  // —— 皮肤工厂：吸收 LimeZu(帧号) 与 SkyOffice(帧名) 两种格式差异 ——
  // 走路动画懒创建：down 方向循环。LimeZu 用 42..47 帧号；SkyOffice 用 Xxx_run_19..24 帧名。
  _ensureWalkAnim(s) {
    const k = `open_walk_${s.key}`;
    if (this.anims.exists(k)) return k;
    const frames = s.type === 'skyoffice'
      ? this.anims.generateFrameNames(s.key, { prefix: `${s.cap}_run_`, suffix: '.png', start: 19, end: 24 })
      : this.anims.generateFrameNumbers(s.key, { start: 42, end: 47 });
    this.anims.create({ key: k, frames, frameRate: s.type === 'skyoffice' ? 10 : 7, repeat: -1 });
    return k;
  }

  // 把一个 sprite 换成某皮肤并播放走路动画（预览/缩略图共用）。
  _showSkinOn(spr, s) {
    spr.setTexture(s.key, s.idle);
    spr.play(this._ensureWalkAnim(s));
  }

  _pickSkin(i) {
    this.avatar.skinIdx = i;
    const s = this.charSkins[i];
    this._showSkinOn(this.previewSpr, s);
    this.previewSpr.setScale(s.pv);
    if (this.skinNameLabel) this.skinNameLabel.setText(s.name);
    this._applyTint();
    this.thumbFrames.forEach((f, j) => f.setStrokeStyle(2, j === i ? 0xd4a353 : 0x3a3a52));
  }

  _pickTint(i) {
    this.avatar.tintIdx = i;
    this._applyTint();
    this.tintDots.forEach((d, j) => d.setStrokeStyle(2, j === i ? 0xd4a353 : 0x3a3a52));
  }

  _applyTint() {
    const t = this.tints[this.avatar.tintIdx];
    if (t.tint) this.previewSpr.setTint(t.tint);
    else this.previewSpr.clearTint();
  }

  // ============ 阶段B：7 道情境测评 ============
  _showQuestion() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const data = this.cache.json.get('assessment');
    const qs = data?.questions || [];
    if (this.qIdx >= qs.length) { this._finishQuiz(); return; }
    const q = qs[this.qIdx];

    this.ui.add(this.add.text(480, 36, `认识你 · ${this.qIdx + 1} / ${qs.length}`, {
      fontSize: '14px', color: '#8b8ba0',
    }).setOrigin(0.5));
    // 进度条
    this.ui.add(this.add.rectangle(480, 58, 400, 4, 0x2a2a3e).setOrigin(0.5));
    this.ui.add(this.add.rectangle(280, 58, 400 * ((this.qIdx + 1) / qs.length), 4, 0xd4a353).setOrigin(0, 0.5));

    this.ui.add(this.add.text(480, 92, q.intro, { fontSize: '15px', color: '#c8b88a' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 132, q.text, {
      fontSize: '17px', color: '#e6e6f0', wordWrap: { width: 720, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 165, '（没有标准答案 · 可随意选 · 约 1 分钟，仅影响推荐方向）', { fontSize: '12px', color: '#5a5a6e' }).setOrigin(0.5));

    q.options.forEach((op, i) => {
      this._button(480, 215 + i * 62, 640, 52, op.label, () => {
        // 双通道计分
        for (const [k, v] of Object.entries(op.riasec || {})) this.riasec[k] += v;
        for (const [k, v] of Object.entries(op.big5 || {})) this.big5[k] += v;
        this.answers.push({ q: q.id, pick: i, label: op.label });
        this.qIdx++;
        this._showQuestion();
      }, 0x232338, '14px');
    });
  }

  // ============ 阶段C：算画像 + AI 小传 ============
  _finishQuiz() {
    this._clearUI();
    this.ui = this.add.container(0, 0);

    // Holland 三码
    const hollandCode = Object.entries(this.riasec).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join('');
    // 大五 → MBTI 四字母（McCrae-Costa 映射：E→E/I, O→N/S, A→F/T, C→J/P）
    const b = this.big5;
    const mbti = (b.E >= 0 ? 'E' : 'I') + (b.O >= 0 ? 'N' : 'S') + (b.A >= 0 ? 'F' : 'T') + (b.C >= 0 ? 'J' : 'P');

    const skin = this.charSkins[this.avatar.skinIdx];
    const tint = this.tints[this.avatar.tintIdx];
    const profile = {
      avatar: {
        skinKey: skin.key,          // WorldScene 读它换主角贴图
        skinName: skin.name,
        gender: skin.gender,
        tint: tint.tint,            // 染色滤镜(可空)
        tintName: tint.name,
      },
      riasec: this.riasec, big5: this.big5,
      holland: hollandCode, mbti,
      answers: this.answers,
    };
    try { localStorage.setItem('wdwtb_profile', JSON.stringify(profile)); } catch (e) {}

    this.ui.add(this.add.text(480, 200, '正在读懂你…', { fontSize: '22px', color: '#d4a353' }).setOrigin(0.5));
    const tip = this.add.text(480, 245, 'AI 正在把你的 7 个选择，拼成一幅「初见画像」', { fontSize: '13px', color: '#8b8ba0' }).setOrigin(0.5);
    this.ui.add(tip);
    this.tweens.add({ targets: tip, alpha: 0.4, duration: 800, yoyo: true, repeat: -1 });

    this._generateBio(profile);
  }

  async _generateBio(profile) {
    const picks = profile.answers.map(a => a.label).join('；');
    const res = await AIClient.call([
      { role: 'system', content: '你是一款职场疗愈游戏的旁白。根据玩家在7道情境题里的选择，写一段50-70字的第二人称"人物小传"，语气温柔、具体、有画面感，像懂ta的朋友。禁止术语、禁止套话、只用中文。结尾不要句号以外的标点堆砌。' },
      { role: 'user', content: `玩家的选择：${picks}。ta的性格倾向代码：${profile.mbti}（不要在文中出现这个代码），兴趣倾向：${profile.holland}（也不要出现）。请直接输出小传正文。` },
    ], { model: 'hy3', timeoutMs: 12000, fallbackFn: () => ({ text: '你嘴上说随缘，其实很怕辜负别人的期待。你习惯把事情先扛下来，再一个人慢慢消化。你对世界还有很多好奇——这一点，别弄丢了。' }) });

    const bio = (res.text || '').trim();
    this._showPortraitCard(profile, bio, res.source);
  }

  _showPortraitCard(profile, bio, source) {
    this._clearUI();
    this.ui = this.add.container(0, 0);

    this.ui.add(this.add.rectangle(480, 270, 640, 400, 0x1e1e30).setStrokeStyle(2, 0xd4a353));
    this.ui.add(this.add.text(480, 110, '· 初见画像 ·', { fontSize: '24px', color: '#d4a353' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 148, `${profile.mbti} · ${profile.holland}`, {
      fontSize: '30px', color: '#ffffff', fontStyle: 'bold', letterSpacing: 4,
    }).setOrigin(0.5));

    this.ui.add(this.add.text(480, 235, bio, {
      fontSize: '15px', color: '#c8c8d8', wordWrap: { width: 540, useAdvancedWrap: true }, align: 'center', lineSpacing: 8,
    }).setOrigin(0.5));

    this.ui.add(this.add.text(480, 330, source === 'ai' ? '· 由腾讯混元为你撰写 ·' : '· 来自你的选择 ·', {
      fontSize: '11px', color: '#5a6a8a',
    }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 360, '灵感来源：霍兰德职业兴趣理论 · 大五人格模型', {
      fontSize: '10px', color: '#4a4a5e',
    }).setOrigin(0.5));

    this._button(480, 420, 260, 46, '带着这幅画像，出发 →', () => {
      this.scene.start('HubScene');
    }, 0x2a4a3e, '16px');
  }
}
