import Phaser from 'phaser';
import { AIClient } from '../systems/AIClient.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { buildTryFirstAdvice } from '../systems/CareerFit.js';
import { makeCuteChoice, makeCutePanel, THEME, TONES } from '../systems/UI.js';
import { typeInfo, mbtiDimReadings, mbtiFromBig5 } from '../systems/MbtiTypes.js';
import { axesFromBig5 } from '../systems/PersonalityAxes.js';

// OpeningScene：开场"认识你" — 起名 + 捏人 + 7 道情境测评(RIASEC+大五双通道) + 专业 MBTI 画像。
// 测评题库来自 data/assessment.json（专业规格：霍兰德 RIASEC + 大五人格，玩家全程不见术语）。
export class OpeningScene extends Phaser.Scene {
  constructor() { super('OpeningScene'); }

  init(data) {
    this._newGameSlot = (data && data.newGameSlot) || null;
    this._nameValue = '';
  }

  preload() {
    this.load.json('assessment', './data/assessment.json');
    for (const c of ['adam', 'ash', 'lucy', 'nancy']) {
      this.load.atlas(`so_${c}`, `./assets/skyoffice/character/${c}.png`, `./assets/skyoffice/character/${c}.json`);
    }
  }

  create() {
    AudioSystem.playBgm('title');
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.cameras.main.setZoom(2);
    this.cameras.main.centerOn(480, 270);
    this._drawSoftBg();
    this.charSkins = [
      { key: 'so_adam', cap: 'Adam', name: '干练寸头 · 男', gender: 'male', type: 'skyoffice', pv: 2.4, th: 1.6, idle: 'Adam_idle_anim_19.png' },
      { key: 'so_ash', cap: 'Ash', name: '金棕短发 · 男', gender: 'male', type: 'skyoffice', pv: 2.4, th: 1.6, idle: 'Ash_idle_anim_19.png' },
      { key: 'so_lucy', cap: 'Lucy', name: '棕发利落 · 女', gender: 'female', type: 'skyoffice', pv: 2.4, th: 1.6, idle: 'Lucy_idle_anim_19.png' },
      { key: 'so_nancy', cap: 'Nancy', name: '黑发知性 · 女', gender: 'female', type: 'skyoffice', pv: 2.4, th: 1.6, idle: 'Nancy_idle_anim_19.png' },
    ];
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
    this.events.once('shutdown', () => this._removeNameInput());
    this.events.once('destroy', () => this._removeNameInput());
    this._buildCustomize();
  }

  // 柔和氛围背景：暖色浮点（可爱底纹）
  _drawSoftBg() {
    for (let i = 0; i < 14; i++) {
      const c = this.add.circle(
        Phaser.Math.Between(0, 960), Phaser.Math.Between(0, 540),
        Phaser.Math.Between(2, 5), 0xf5c86b, Phaser.Math.FloatBetween(0.05, 0.16)
      ).setDepth(-5);
      this.tweens.add({
        targets: c, y: c.y - Phaser.Math.Between(20, 70), alpha: 0,
        duration: Phaser.Math.Between(3500, 7000), repeat: -1, delay: Phaser.Math.Between(0, 4000),
      });
    }
  }

  _clearUI() { if (this.ui) { this.ui.destroy(true); this.ui = null; } }

  // 可爱圆角按钮（本场景通用）
  _button(x, y, w, h, label, cb, color = THEME.panelSoft, fontSize = '15px') {
    const rad = Math.min(16, h / 2);
    const g = this.add.graphics();
    const draw = (hover) => {
      g.clear();
      g.fillStyle(hover ? 0x3a3a5e : color, 0.98); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, rad);
      g.lineStyle(2, THEME.gold, hover ? 1 : 0.75); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, rad);
    };
    draw(false);
    const txt = this.add.text(x, y, label, { fontSize, color: THEME.text, fontStyle: 'bold', wordWrap: { width: w - 30, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { draw(true); this.tweens.add({ targets: txt, scale: 1.04, duration: 110, ease: 'Back.out' }); });
    zone.on('pointerout', () => { draw(false); this.tweens.add({ targets: txt, scale: 1, duration: 110 }); });
    zone.on('pointerdown', cb);
    this.ui.add(g); this.ui.add(txt); this.ui.add(zone);
    return { g, txt, zone };
  }

  // ============ 名字输入（HTML 覆盖层，随画布缩放定位）============
  _makeNameInput() {
    if (this._nameInput) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 8;
    input.setAttribute('aria-label', '你的名字');
    input.placeholder = '给自己起个名字';
    input.value = this._nameValue || '';
    Object.assign(input.style, {
      position: 'fixed', textAlign: 'center', outline: 'none', boxSizing: 'border-box',
      border: '2px solid #d4a353', borderRadius: '12px', padding: '2px 10px',
      background: 'rgba(20,20,31,0.92)', color: '#ffe8c8', letterSpacing: '1px',
      fontFamily: '"Fusion Pixel 12","ZpixLocal","Fusion Pixel",monospace', zIndex: '50',
    });
    input.addEventListener('input', () => { this._nameValue = input.value; });
    document.body.appendChild(input);
    this._nameInput = input;
    this._positionNameInput();
    this._nameResize = () => this._positionNameInput();
    window.addEventListener('resize', this._nameResize);
    this.scale.on('resize', this._nameResize);
  }

  _positionNameInput() {
    const el = this._nameInput; if (!el) return;
    const cv = this.scale && this.scale.canvas; if (!cv) return;
    const r = cv.getBoundingClientRect();
    // 960×540 逻辑铺满画布：逻辑(480, 96) → 画布分数(0.5, 0.178)
    const fx = 0.5, fy = 96 / 540;
    const w = Math.max(180, r.width * 0.26), h = Math.max(30, r.height * 0.056);
    el.style.left = `${r.left + r.width * fx - w / 2}px`;
    el.style.top = `${r.top + r.height * fy - h / 2}px`;
    el.style.width = `${w}px`; el.style.height = `${h}px`;
    el.style.fontSize = `${Math.max(13, Math.floor(h * 0.48))}px`;
  }

  _removeNameInput() {
    if (this._nameResize) {
      window.removeEventListener('resize', this._nameResize);
      if (this.scale) this.scale.off('resize', this._nameResize);
      this._nameResize = null;
    }
    if (this._nameInput) { this._nameInput.remove(); this._nameInput = null; }
  }

  // ============ 阶段A：起名 + 捏人 ============
  _buildCustomize() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    this.ui.add(this.add.text(480, 30, '你是谁？', { fontSize: '32px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 62, '给自己起个名字，选一个即将走进职场的你', { fontSize: '13px', color: THEME.textMuted }).setOrigin(0.5));
    this._makeNameInput();

    const cx = 480, baseline = 262;
    this.ui.add(this.add.ellipse(cx, baseline + 4, 120, 30, 0x2a2a44, 0.9));
    this.ui.add(this.add.ellipse(cx, baseline, 92, 22, 0x3a3a5e, 0.9));
    const first = this.charSkins[0];
    this.previewSpr = this.add.sprite(cx, baseline + 8, first.key, first.idle).setOrigin(0.5, 1);
    this._showSkinOn(this.previewSpr, first);
    this.previewSpr.setScale(first.pv);
    this.ui.add(this.previewSpr);
    this.skinNameLabel = this.add.text(cx, baseline + 26, first.name, { fontSize: '15px', color: THEME.text, fontStyle: 'bold', letterSpacing: 1 }).setOrigin(0.5);
    this.ui.add(this.skinNameLabel);

    this.thumbFrames = [];
    const cols = 4, gx = 108, gy = 80, x0 = cx - (cols - 1) * gx / 2, y0 = 330;
    this.charSkins.forEach((s, i) => {
      const tx = x0 + (i % cols) * gx, ty = y0 + Math.floor(i / cols) * gy;
      const g = this.add.graphics();
      const drawThumb = (stroke) => { g.clear(); g.fillStyle(0x232338, 0.96); g.fillRoundedRect(tx - 37, ty - 38, 74, 76, 12); g.lineStyle(2, stroke, 1); g.strokeRoundedRect(tx - 37, ty - 38, 74, 76, 12); };
      drawThumb(i === 0 ? THEME.gold : 0x3a3a52);
      const spr = this.add.sprite(tx, ty + 30, s.key, s.idle).setScale(s.th).setOrigin(0.5, 1);
      this._showSkinOn(spr, s);
      const zone = this.add.zone(tx, ty, 74, 76).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { if (this.avatar.skinIdx !== i) drawThumb(0x6a6a8a); });
      zone.on('pointerout', () => drawThumb(this.avatar.skinIdx === i ? THEME.gold : 0x3a3a52));
      zone.on('pointerdown', () => this._pickSkin(i));
      this.ui.add(g); this.ui.add(spr); this.ui.add(zone);
      this.thumbFrames.push({ g, tx, ty, sel: (on) => drawThumb(on ? THEME.gold : 0x3a3a52) });
    });

    this.ui.add(this.add.text(346, 470, '色调', { fontSize: '14px', color: THEME.textMuted }).setOrigin(0.5));
    this.tintDots = [];
    this.tints.forEach((t, i) => {
      const dx = 400 + i * 44;
      const dot = this.add.circle(dx, 470, 13, t.tint ?? 0x8888a0)
        .setStrokeStyle(2, i === 0 ? THEME.gold : 0x3a3a52).setInteractive({ useHandCursor: true });
      dot.on('pointerdown', () => this._pickTint(i));
      this.ui.add(dot);
      this.tintDots.push(dot);
    });

    this._button(480, 512, 210, 40, '下一步 →', () => { this.qIdx = 0; this._showQuestion(); }, 0x2a4a3e);
  }

  _ensureWalkAnim(s) {
    const k = `open_walk_${s.key}`;
    if (this.anims.exists(k)) return k;
    const frames = this.anims.generateFrameNames(s.key, { prefix: `${s.cap}_run_`, suffix: '.png', start: 19, end: 24 });
    this.anims.create({ key: k, frames, frameRate: 10, repeat: -1 });
    return k;
  }

  _showSkinOn(spr, s) { spr.setTexture(s.key, s.idle); spr.play(this._ensureWalkAnim(s)); }

  _pickSkin(i) {
    this.avatar.skinIdx = i;
    const s = this.charSkins[i];
    this._showSkinOn(this.previewSpr, s);
    this.previewSpr.setScale(s.pv);
    if (this.skinNameLabel) this.skinNameLabel.setText(s.name);
    this._applyTint();
    this.thumbFrames.forEach((f, j) => f.sel(j === i));
  }

  _pickTint(i) {
    this.avatar.tintIdx = i;
    this._applyTint();
    this.tintDots.forEach((d, j) => d.setStrokeStyle(2, j === i ? THEME.gold : 0x3a3a52));
  }

  _applyTint() {
    const t = this.tints[this.avatar.tintIdx];
    if (t.tint) this.previewSpr.setTint(t.tint); else this.previewSpr.clearTint();
  }

  // ============ 阶段B：7 道情境测评（可爱卡片）============
  _showQuestion() {
    this._removeNameInput();
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const data = this.cache.json.get('assessment');
    const qs = data?.questions || [];
    if (this.qIdx >= qs.length) { this._finishQuiz(); return; }
    const q = qs[this.qIdx];

    this.ui.add(this.add.text(480, 34, `认识你 · ${this.qIdx + 1} / ${qs.length}`, { fontSize: '14px', color: THEME.textMuted }).setOrigin(0.5));
    // 圆角进度条
    const pg = this.add.graphics();
    pg.fillStyle(0x2a2a3e, 1); pg.fillRoundedRect(280, 54, 400, 8, 4);
    const pw = 400 * ((this.qIdx + 1) / qs.length);
    pg.fillStyle(THEME.gold, 1); pg.fillRoundedRect(280, 54, Math.max(8, pw), 8, 4);
    this.ui.add(pg);

    this.ui.add(this.add.text(480, 90, q.intro, { fontSize: '15px', color: '#c8b88a' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 128, q.text, { fontSize: '17px', color: THEME.text, wordWrap: { width: 720, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 162, '没有标准答案 · 凭直觉选 · 只影响推荐方向', { fontSize: '12px', color: THEME.textDim }).setOrigin(0.5));

    q.options.forEach((op, i) => {
      const cardH = 52;
      const cy = 208 + i * (cardH + 10);
      const choice = makeCuteChoice(this, {
        x: 480, y: cy, w: 660, h: cardH, label: op.label, index: i, scrollFactor: 1,
        tone: TONES[i % TONES.length], fontSize: 15, popDelay: i * 60,
        sound: () => AudioSystem.uiClick && AudioSystem.uiClick(),
        onClick: () => {
          for (const [k, v] of Object.entries(op.riasec || {})) this.riasec[k] += v;
          for (const [k, v] of Object.entries(op.big5 || {})) this.big5[k] += v;
          this.answers.push({ q: q.id, pick: i, label: op.label });
          this.qIdx++;
          this._showQuestion();
        },
      });
      this.ui.add(choice);
    });
  }

  // ============ 阶段C：算画像 + AI 小传 ============
  _finishQuiz() {
    this._clearUI();
    this.ui = this.add.container(0, 0);

    const hollandCode = Object.entries(this.riasec).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join('');
    const mbti = mbtiFromBig5(this.big5);
    const skin = this.charSkins[this.avatar.skinIdx];
    const tint = this.tints[this.avatar.tintIdx];
    const name = (this._nameValue || '').trim().slice(0, 8) || skin.cap;

    const profile = {
      name,
      avatar: { skinKey: skin.key, skinName: skin.name, gender: skin.gender, tint: tint.tint, tintName: tint.name },
      riasec: this.riasec, big5: this.big5,
      holland: hollandCode, mbti,
      // 4 轴基线：入职问卷一次派生,进办公室后由真实选择继续累加(逻辑链:不在剧情里重复问)
      axesBaseline: axesFromBig5(this.big5),
      answers: this.answers,
    };
    try { localStorage.setItem('wdwtb_profile', JSON.stringify(profile)); } catch (e) {}

    this.ui.add(this.add.text(480, 200, '正在读懂你…', { fontSize: '22px', color: THEME.gold }).setOrigin(0.5));
    const tip = this.add.text(480, 245, `AI 正在把「${name}」的 7 个选择，拼成一幅初见画像`, { fontSize: '13px', color: THEME.textMuted }).setOrigin(0.5);
    this.ui.add(tip);
    this.tweens.add({ targets: tip, alpha: 0.4, duration: 800, yoyo: true, repeat: -1 });

    this._generateBio(profile);
  }

  async _generateBio(profile) {
    const picks = profile.answers.map(a => a.label).join('；');
    const res = await AIClient.call([
      { role: 'system', content: '你是一款职场探索游戏的旁白。根据玩家在7道情境题里的选择，写一段50-70字的第二人称"人物小传"，语气温柔、具体、有画面感，像懂ta的朋友。禁止术语、禁止套话、只用中文。' },
      { role: 'user', content: `玩家的选择：${picks}。ta的性格倾向代码：${profile.mbti}（不要在文中出现），兴趣倾向：${profile.holland}（也不要出现）。请直接输出小传正文。` },
    ], { model: 'hy3', timeoutMs: 12000, fallbackFn: () => ({ text: '你嘴上说随缘，其实很怕辜负别人的期待。你习惯把事情先扛下来，再一个人慢慢消化。你对世界还有很多好奇——这一点，别弄丢了。' }) });
    this._showPortraitCard(profile, (res.text || '').trim(), res.source);
  }

  // ===== 专业 + 可爱的 MBTI 初见画像 =====
  _showPortraitCard(profile, bio, source) {
    this._clearUI();
    this.ui = this.add.container(0, 0);

    const advice = buildTryFirstAdvice(profile, 2);
    profile.tryFirst = advice.detail.map(d => ({ key: d.key, name: d.name, score: d.score, reason: d.reason }));
    profile.tryHeadline = advice.headline;
    try { localStorage.setItem('wdwtb_profile', JSON.stringify(profile)); } catch (e) {}

    const info = typeInfo(profile.mbti);
    const dims = mbtiDimReadings(profile.big5);

    // 圆角大卡
    this.ui.add(makeCutePanel(this, { x: 480, y: 272, w: 740, h: 500, radius: 22, glow: true }));
    this.ui.add(this.add.text(480, 46, '· 初见画像 ·', { fontSize: '20px', color: THEME.gold, fontStyle: 'bold' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 74, `「${profile.name}」`, { fontSize: '17px', color: '#ffe8c8' }).setOrigin(0.5));
    // MBTI + 别称
    this.ui.add(this.add.text(480, 106, `${profile.mbti} · ${info.nick}`, { fontSize: '26px', color: '#ffffff', fontStyle: 'bold', letterSpacing: 3 }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 132, info.blurb, { fontSize: '12px', color: THEME.textMuted, wordWrap: { width: 600 }, align: 'center' }).setOrigin(0.5));

    // 四维滑条（专业 MBTI 呈现）
    let dy = 166;
    for (const d of dims) this._dimSlider(480, dy, 200, d), dy += 24;

    // Holland 兴趣码
    this.ui.add(this.add.text(480, dy + 4, `兴趣码 ${profile.holland}（霍兰德）`, { fontSize: '12px', color: '#9ab4dc' }).setOrigin(0.5));
    dy += 26;

    // AI 小传
    const bioText = this.add.text(480, dy, bio, { fontSize: '13px', color: '#c8c8d8', wordWrap: { width: 600, useAdvancedWrap: true }, align: 'center', lineSpacing: 5 }).setOrigin(0.5, 0);
    this.ui.add(bioText); dy += bioText.height + 10;

    // 先试哪两条
    this.ui.add(this.add.text(480, dy, advice.headline, { fontSize: '14px', color: THEME.goldBright, fontStyle: 'bold' }).setOrigin(0.5, 0)); dy += 22;
    const recLines = advice.detail.slice(0, 2).map((d, i) => `${i === 0 ? '①' : '②'} ${d.name}（契合约 ${d.score}）· ${d.reason}`);
    const recText = this.add.text(480, dy, recLines.join('\n'), { fontSize: '12px', color: '#b8c0d0', wordWrap: { width: 620, useAdvancedWrap: true }, align: 'center', lineSpacing: 5 }).setOrigin(0.5, 0);
    this.ui.add(recText); dy += recText.height + 8;

    this.ui.add(this.add.text(480, dy, source === 'ai' ? '· 由腾讯混元为你撰写 · 灵感：MBTI / 霍兰德 / 大五 ·' : '· 来自你的选择 · 灵感：MBTI / 霍兰德 / 大五 ·', { fontSize: '10px', color: THEME.textDim }).setOrigin(0.5, 0));

    this._button(480, 494, 300, 44, `带着画像去试职业 →`, () => {
      this.scene.start('HubScene', { newGameSlot: this._newGameSlot });
    }, 0x2a4a3e, '16px');
  }

  // 一条 MBTI 维度滑条：左标 — 轨道(中点+彩点) — 右标
  _dimSlider(cx, y, w, d) {
    const strong = d.strength >= 40;
    const leftOn = d.value < 0;
    this.ui.add(this.add.text(cx - w / 2 - 10, y, d.left, { fontSize: '11px', color: leftOn ? '#ffe08a' : THEME.textDim, fontStyle: leftOn ? 'bold' : 'normal' }).setOrigin(1, 0.5));
    this.ui.add(this.add.text(cx + w / 2 + 10, y, d.right, { fontSize: '11px', color: !leftOn ? '#ffe08a' : THEME.textDim, fontStyle: !leftOn ? 'bold' : 'normal' }).setOrigin(0, 0.5));
    const g = this.add.graphics();
    g.fillStyle(0x2a2a3e, 1); g.fillRoundedRect(cx - w / 2, y - 3, w, 6, 3);
    g.fillStyle(0x55556e, 1); g.fillRect(cx - 1, y - 6, 2, 12); // 中点刻度
    this.ui.add(g);
    const dot = this.add.circle(cx + (d.value / 100) * (w / 2), y, strong ? 7 : 6, strong ? THEME.goldBright : THEME.gold);
    this.ui.add(dot);
  }
}
