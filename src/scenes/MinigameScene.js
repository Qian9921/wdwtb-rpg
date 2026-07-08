import Phaser from 'phaser';

// MinigameScene：通用小游戏框架，先实现"写代码闯关"选择题。深色 IDE 风格。
const DEFAULT_QUESTIONS = [
  {
    code: 'scores = [85, 92, 78]\nfor i in range(0, 4):\n    print(scores[i])',
    question: '这段代码运行时会出什么问题？',
    options: [
      '列表越界——scores只有3个元素，循环访问了第4个',
      'print函数调用语法错误',
      '变量scores未定义',
    ],
    answer: 0,
    explain: 'scores 有 3 个元素（索引 0~2），但 range(0,4) 会访问 0,1,2,3 → 第 4 次循环索引 3 越界。应改为 range(len(scores))。',
  },
  {
    code: 'let score = "80";\nif (score == 80) {\n  console.log("合格");\n}',
    question: '为了更严谨地判断分数，应该怎样修改？',
    options: [
      '将 == 改为 ===',
      '将 "80" 改为数字 80',
      '在 if 前加类型检查 typeof',
    ],
    answer: 0,
    explain: '== 会做隐式类型转换（"80"==80 为 true），=== 则严格比较类型和值。严谨代码推荐用 ===，避免意外转换。',
  },
  {
    code: 'for i in range(1, 5):\n    print(i)\n# 想打印出 1 到 5',
    question: '这段代码为什么只打印到 4？',
    options: [
      'range(1,5) 是左闭右开，不包含 5',
      'print 没有正确缩进',
      'i 的初始值应该是 0',
    ],
    answer: 0,
    explain: 'Python 的 range(start,stop) 生成从 start 到 stop-1 的序列。range(1,5) → 1,2,3,4，不包含 5。要打印 1~5 应改为 range(1,6)。这是经典 off-by-one。',
  },
];

export class MinigameScene extends Phaser.Scene {
  constructor() {
    super('MinigameScene');
  }

  init(data) {
    this.type = data?.type || 'coding';
    this.questions = data?.questions || DEFAULT_QUESTIONS;
    this.onComplete = data?.onComplete || null;
    this.fromScene = data?.fromScene || 'HubScene';
    this.idx = 0;
    this.correct = 0;
    this.timeLeft = 30;
    this.answered = false;
    this.timerEvent = null;
    this.ui = null;
    this._advanceTimer = null;
    this._advanceHandler = null;
    this.progressText = null;
    this.timerText = null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0d1117');
    this._buildChrome();
    this._showQuestion();
  }

  // ---------- 固定 UI（进度 + 计时器）----------
  _buildChrome() {
    this.progressText = this.add.text(30, 22, '', {
      fontSize: '16px', color: '#8b949e',
    });
    this.timerText = this.add.text(930, 22, '', {
      fontSize: '16px', color: '#e6e6e6',
    }).setOrigin(1, 0);
  }

  _updateTimerDisplay() {
    const s = this.timeLeft;
    this.timerText.setText(`⏱ ${s}s`);
    if (s <= 10) this.timerText.setColor('#f85149');
    else this.timerText.setColor('#e6e6e6');
  }

  // ---------- 清理 ----------
  _clearUI() {
    if (this.ui) { this.ui.destroy(true); this.ui = null; }
    if (this._advanceTimer) { this._advanceTimer.remove(); this._advanceTimer = null; }
    if (this._advanceHandler) {
      this.input.off('pointerdown', this._advanceHandler);
      this._advanceHandler = null;
    }
  }

  _clearTimer() {
    if (this.timerEvent) { this.timerEvent.remove(); this.timerEvent = null; }
  }

  // ---------- 显示题目 ----------
  _showQuestion() {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const c = this.ui;
    const q = this.questions[this.idx];
    this.answered = false;
    this.timeLeft = 30;

    this.progressText.setText(`第 ${this.idx + 1}/${this.questions.length} 题`);
    this._updateTimerDisplay();

    // 计时器
    this._clearTimer();
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: 29,
      callback: () => {
        this.timeLeft--;
        this._updateTimerDisplay();
        if (this.timeLeft <= 0) this._onTimeout();
      },
    });

    // 代码块背景
    const codeLines = q.code.split('\n').length;
    const blockH = Math.max(74, codeLines * 22 + 24);
    const blockY = 64;
    c.add(this.add.rectangle(480, blockY + blockH / 2, 880, blockH, 0x161b22));

    // 代码文字
    c.add(this.add.text(52, blockY + 12, q.code, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#c9d1d9',
      lineSpacing: 6,
    }));

    // 问题
    const qY = blockY + blockH + 14;
    c.add(this.add.text(50, qY, q.question, {
      fontSize: '16px', color: '#e6e6e6',
      wordWrap: { width: 860, useAdvancedWrap: true },
    }));

    // 选项按钮
    const btnStartY = qY + 42;
    q.options.forEach((opt, i) => {
      const by = btnStartY + i * 50;
      const btn = this.add.rectangle(480, by, 440, 42, 0x21262d)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(480, by, opt, {
        fontSize: '14px', color: '#c9d1d9',
        wordWrap: { width: 400, useAdvancedWrap: true },
      }).setOrigin(0.5);

      btn.on('pointerover', () => btn.setFillStyle(0x30363d));
      btn.on('pointerout', () => btn.setFillStyle(0x21262d));
      btn.on('pointerdown', () => this._onSelect(i));

      c.add(btn);
      c.add(txt);
    });
  }

  // ---------- 选择答案 ----------
  _onSelect(idx) {
    if (this.answered) return;
    this.answered = true;
    this._clearTimer();

    const q = this.questions[this.idx];
    const isCorrect = idx === q.answer;
    if (isCorrect) this.correct++;
    this._showFeedback(isCorrect, isCorrect ? null : q.explain);
  }

  _onTimeout() {
    if (this.answered) return;
    this.answered = true;
    const q = this.questions[this.idx];
    this._showFeedback(false, '⏰ 时间到！\n' + q.explain);
  }

  // ---------- 反馈页面 ----------
  _showFeedback(isCorrect, explain) {
    this._clearUI();
    this.ui = this.add.container(0, 0);
    const c = this.ui;

    const icon = isCorrect ? '✓' : '✗';
    const clr = isCorrect ? '#3fb950' : '#f85149';
    c.add(this.add.text(480, 130, icon, { fontSize: '56px', color: clr }).setOrigin(0.5));
    c.add(this.add.text(480, 200, isCorrect ? '回答正确！' : '回答错误', {
      fontSize: '24px', color: clr,
    }).setOrigin(0.5));

    if (explain) {
      c.add(this.add.text(480, 260, explain, {
        fontSize: '14px', color: '#8b949e',
        wordWrap: { width: 660, useAdvancedWrap: true },
        align: 'center',
      }).setOrigin(0.5, 0));
    }

    c.add(this.add.text(480, 400, '点击任意处继续', {
      fontSize: '13px', color: '#484f58',
    }).setOrigin(0.5));

    // 2 秒自动推进，或点击跳过
    const advance = () => {
      this._advanceTimer = null;
      this._advanceHandler = null;
      this.idx++;
      if (this.idx < this.questions.length) this._showQuestion();
      else this._showResult();
    };
    this._advanceTimer = this.time.delayedCall(2000, advance);
    const onClick = () => {
      if (this._advanceTimer) { this._advanceTimer.remove(); this._advanceTimer = null; }
      advance();
    };
    this._advanceHandler = onClick;
    this.input.on('pointerdown', onClick);
  }

  // ---------- 结果页 ----------
  _showResult() {
    this._clearUI();
    this._clearTimer();
    this.ui = this.add.container(0, 0);
    const c = this.ui;
    const total = this.questions.length;

    const ratio = this.correct / total;
    let msg;
    if (ratio === 1) msg = '漂亮，是块料！';
    else if (ratio === 0) msg = '别灰心，谁都是这么过来的';
    else msg = '还在学，继续加油';

    c.add(this.add.text(480, 110, `得分：${this.correct}/${total}`, {
      fontSize: '34px', color: '#ffffff',
    }).setOrigin(0.5));
    c.add(this.add.text(480, 180, msg, {
      fontSize: '20px', color: '#c9d1d9',
    }).setOrigin(0.5));

    // 返回按钮
    const btn = this.add.rectangle(480, 280, 200, 44, 0x238636)
      .setInteractive({ useHandCursor: true });
    const btnTxt = this.add.text(480, 280, '返回', {
      fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5);
    btn.on('pointerdown', () => {
      const result = { correct: this.correct, total, ratio: Math.round(ratio * 100) };
      if (this.onComplete) {
        this.onComplete(result);
      } else {
        console.log('[Minigame]', result);
      }
      if (this.fromScene) this.scene.start(this.fromScene);
    });
    c.add(btn);
    c.add(btnTxt);
  }
}
