import Phaser from 'phaser';
import { AIClient } from '../systems/AIClient.js';

// OpeningScene：开场"认识你" — 捏人 + 7 道情境测评(RIASEC+大五双通道) + AI 专属小传。
// 测评题库来自 data/assessment.json（专业规格：霍兰德 RIASEC + 大五人格，玩家全程不见术语）。
export class OpeningScene extends Phaser.Scene {
  constructor() { super('OpeningScene'); }

  preload() {
    this.load.json('assessment', './data/assessment.json');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.hairColors = [
      { name: '黑', color: 0x2b2b33 }, { name: '棕', color: 0x8B6914 },
      { name: '金', color: 0xDAA520 }, { name: '粉', color: 0xFF69B4 },
    ];
    this.skinColors = [
      { name: '浅', color: 0xF5D6C6 }, { name: '麦', color: 0xD4A574 }, { name: '深', color: 0x8D6E63 },
    ];
    this.shirtColors = [
      { name: '蓝', color: 0x4a6a8a }, { name: '紫', color: 0x6a4a6a },
      { name: '绿', color: 0x4a8a6a }, { name: '棕', color: 0x8a6a4a },
    ];
    this.avatar = { hairIdx: 0, skinIdx: 0, shirtIdx: 0 };
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

  // ============ 阶段A：捏人 ============
  _buildCustomize() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    this.ui.add(this.add.text(480, 44, '你是谁？', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5));
    this.ui.add(this.add.text(480, 80, '先捏一个「即将走进职场的你」', { fontSize: '14px', color: '#8b8ba0' }).setOrigin(0.5));

    const cx = 480, cy = 190;
    this.hairGfx = this.add.rectangle(cx, cy - 42, 46, 18, this.hairColors[0].color);
    this.headGfx = this.add.circle(cx, cy - 18, 21, this.skinColors[0].color);
    this.shirtGfx = this.add.rectangle(cx, cy + 14, 36, 44, this.shirtColors[0].color);
    this.ui.add([this.hairGfx, this.headGfx, this.shirtGfx]);

    const rows = [
      { y: 280, label: '发色', arr: this.hairColors, key: 'hairIdx', gfx: this.hairGfx },
      { y: 322, label: '肤色', arr: this.skinColors, key: 'skinIdx', gfx: this.headGfx },
      { y: 364, label: '上衣', arr: this.shirtColors, key: 'shirtIdx', gfx: this.shirtGfx },
    ];
    rows.forEach(r => {
      this.ui.add(this.add.text(340, r.y, r.label, { fontSize: '15px', color: '#aaaabc' }).setOrigin(0.5));
      const nameTxt = this.add.text(480, r.y, r.arr[0].name, { fontSize: '15px', color: '#ffffff' }).setOrigin(0.5);
      this.ui.add(nameTxt);
      [['◀', -1, 420], ['▶', 1, 540]].forEach(([ch, dir, x]) => {
        const b = this.add.text(x, r.y, ch, { fontSize: '17px', color: '#9aa0a6' })
          .setOrigin(0.5).setInteractive({ useHandCursor: true });
        b.on('pointerover', () => b.setColor('#ffd24d'));
        b.on('pointerout', () => b.setColor('#9aa0a6'));
        b.on('pointerdown', () => {
          const len = r.arr.length;
          this.avatar[r.key] = (this.avatar[r.key] + dir + len) % len;
          const opt = r.arr[this.avatar[r.key]];
          r.gfx.setFillStyle(opt.color);
          nameTxt.setText(opt.name);
        });
        this.ui.add(b);
      });
    });

    this._button(480, 452, 200, 42, '下一步 →', () => { this.qIdx = 0; this._showQuestion(); });
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
    this.ui.add(this.add.text(480, 165, '（没有标准答案，选最像你的）', { fontSize: '12px', color: '#5a5a6e' }).setOrigin(0.5));

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

    const profile = {
      avatar: {
        hair: this.hairColors[this.avatar.hairIdx].name,
        skin: this.skinColors[this.avatar.skinIdx].name,
        shirt: this.shirtColors[this.avatar.shirtIdx].name,
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
