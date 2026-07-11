import Phaser from 'phaser';
import { AudioSystem } from './AudioSystem.js';
import { checkChoiceCondition } from './DialogueRules.js';
import { makeCuteChoice } from './UI.js';

// 选项框主题色轮流（可爱、好区分）
const CHOICE_TONES = [0x6fb2e8, 0x7bd88f, 0xe8a86f, 0xc79ae8, 0xe89ac0];

// DialogueEngine：对话树演出引擎。
// 读 data/schema.md 格式的对话 JSON：渲染对话框+选项，进入节点/选选项时应用 effects，
// 走到空 choices 节点时 emit 'dialogueEnd' 并清 UI。引擎共用，不写死剧情。
export class DialogueEngine extends Phaser.Events.EventEmitter {
  constructor(scene, stateSystem) {
    super();
    this.scene = scene;
    this.state = stateSystem;
    this.data = null;
    this.currentId = null;
    this.ui = null; // Container 持有当前对话所有 UI 元素
    this.currentAct = null;
    this.currentActName = null;
    this._keyHandlers = []; // 本节点绑定的键盘 handler，_clearUI 时精确解绑防泄漏
    this._typeTimer = null; // 打字机计时器
    this._typing = false;
  }

  // 绑定空格/回车推进键。不用 once：玩家用鼠标推进时 once 不消费会残留旧闭包，
  // 积累后一次按键触发多个旧节点逻辑——改为记录引用、_clearUI 精确 off。
  _bindAdvanceKeys(fn) {
    const kb = this.scene.input.keyboard;
    kb.on('keydown-SPACE', fn);
    kb.on('keydown-ENTER', fn);
    this._keyHandlers.push(fn);
  }

  _unbindKeys() {
    const kb = this.scene.input.keyboard;
    for (const h of this._keyHandlers) {
      kb.off('keydown-SPACE', h);
      kb.off('keydown-ENTER', h);
    }
    this._keyHandlers = [];
    if (this._escHandler) { kb.off('keydown-ESC', this._escHandler); this._escHandler = null; }
  }

  // 绑定 ESC = 退出当前对话（每节点重绑，_unbindKeys 清理）
  _bindEscExit() {
    const kb = this.scene.input.keyboard;
    if (this._escHandler) kb.off('keydown-ESC', this._escHandler);
    this._escHandler = () => this._forceExit();
    kb.on('keydown-ESC', this._escHandler);
  }

  // 打字机逐字显示 + 叽喳声。用 scene.time（场景 pause 时自动停），不用 setInterval。
  _startTypewriter(textObj, fullText, speaker) {
    if (this._typeTimer) { this._typeTimer.remove(); this._typeTimer = null; }
    if (!fullText) { this._typing = false; return; }
    this._typing = true;
    this._typeTarget = textObj;
    this._typeFull = fullText;
    let i = 0;
    // 文字速度：读设置 textSpeed(0慢/1中/2快)，快=瞬间显示
    let speed = 1;
    try { speed = JSON.parse(localStorage.getItem('wdwtb_settings') || '{}').textSpeed ?? 1; } catch (e) {}
    if (speed >= 2) {
      textObj.setText(fullText);
      this._typing = false;
      this._updateMoreHint();
      return;
    }
    this._typeTimer = this.scene.time.addEvent({
      delay: speed === 0 ? 52 : 34,
      repeat: fullText.length - 1,
      callback: () => {
        i++;
        textObj.setText(fullText.slice(0, i));
        const ch = fullText[i - 1];
        // 每 2 字一声 blip，标点/空白静音（更像说话的节奏）
        if (i % 2 === 0 && ch && !'，。！？…、：；·「」『』（）\n ,.!?()'.includes(ch)) {
          AudioSystem.blip(speaker);
        }
        if (i >= fullText.length) {
          this._typing = false; this._typeTimer = null;
          this._updateMoreHint();
        }
      },
    });
  }

  // 立即补完全文（打字中按推进键 = 跳字，第二次才是推进——RPG 惯例）
  _finishTyping() {
    if (this._typeTimer) { this._typeTimer.remove(); this._typeTimer = null; }
    if (this._typeTarget && this._typeFull != null) this._typeTarget.setText(this._typeFull);
    this._typing = false;
    this._updateMoreHint();
  }

  // 文本分页：用一个临时 Text 逐行测量，按 maxLines 切页。返回页数组（至少一页）。
  _paginate(fullText, style, wrapWidth, maxLines) {
    if (!fullText) return [''];
    const probe = this.scene.add.text(-9999, -9999, fullText, style).setVisible(false);
    const lines = probe.getWrappedText(fullText);
    probe.destroy();
    if (lines.length <= maxLines) return [fullText];
    const pages = [];
    for (let i = 0; i < lines.length; i += maxLines) {
      pages.push(lines.slice(i, i + maxLines).join('\n'));
    }
    return pages;
  }

  // 是否还有下一页
  _hasMorePages() {
    return this._pages && this._pageIdx < this._pages.length - 1;
  }

  // 按页文本算框高（当前页行数 → 高度，clamp 120~300）
  _pageBoxH(pageText, speakerH) {
    const probe = this.scene.add.text(-9999, -9999, '', this._bodyStyle || {}).setVisible(false);
    const rows = Math.max(1, probe.getWrappedText(pageText || ' ').length);
    probe.destroy();
    return Phaser.Math.Clamp(24 + (speakerH || 0) + rows * 34 + 34 + 18, 120, 300);
  }

  // 翻页时按当前页重算框高、重定位顶部对齐元素（框/幕名/speaker/正文）；底部元素 Y 恒定
  _resizeBoxForPage(pageText) {
    if (!this._box || !this._box.scene) return;
    const { height } = this.scene.scale;
    const boxBottom = height - 40;
    const boxH = this._pageBoxH(pageText, this._speakerH);
    const boxTop = boxBottom - boxH;
    this._box.setSize(this._boxW, boxH).setPosition(this._boxX + this._boxW / 2, boxTop + boxH / 2);
    if (this._actText) this._actText.setPosition(this._boxX + this._boxW - this._PAD, boxTop + 10);
    let ty = boxTop + 22;
    if (this._speakerText) { this._speakerText.setPosition(this._boxX + this._PAD, ty); ty += 36; }
    if (this._bodyText) this._bodyText.setPosition(this._boxX + this._PAD, ty);
  }

  // 翻到下一页并重启打字机（框高按新页重算）
  _nextPage(speaker) {
    this._pageIdx++;
    this._resizeBoxForPage(this._pages[this._pageIdx]);
    this._startTypewriter(this._bodyText, this._pages[this._pageIdx], speaker);
    this._updateMoreHint();
  }

  _updateMoreHint() {
    if (this._moreHint && this._moreHint.scene) {
      this._moreHint.setVisible(this._hasMorePages() && !this._typing);
    }
  }

  // 接收对话树 JSON 对象，从其 start 节点开始演出。
  // resumeId：断点续演——从上次退出的节点接着演，而不是从头重播（可空）。
  start(dialogueData, resumeId) {
    this.data = dialogueData;
    // 幕信息（可选）
    if (dialogueData.act != null) this.currentAct = dialogueData.act;
    if (dialogueData.actName != null) this.currentActName = dialogueData.actName;
    const startAt = (resumeId && dialogueData.nodes && dialogueData.nodes[resumeId])
      ? resumeId : dialogueData.start;
    this.currentId = startAt;
    this._showNode(startAt);
  }

  _showNode(nodeId) {
    this._clearUI();
    const node = this.data.nodes[nodeId];
    this.currentId = nodeId;

    // 坏节点兜底：剧情 JSON 里某个 next/start 指向不存在的节点时，node 为 undefined。
    // 这里若不设防，下面 node.effects 会抛 TypeError（在选项点击回调里，无 try/catch）
    // → 未捕获异常，玩家永久冻结只能刷新。兜底直接结束对话，不卡死。
    if (!node) {
      console.warn(`[DialogueEngine] 节点 "${nodeId}" 不存在，剧情数据有误，结束对话兜底`);
      this._endDialogue();
      return;
    }

    // 进入节点：应用该节点的 effects（调 StateSystem.change）
    this._applyEffects(node.effects);

    // 若节点指定背景，emit 事件让外部场景切换
    if (node.bg) this.emit('bgChange', node.bg);
    // 节点级演出特效(fx: 'collapse'|'shake'|'flash_white'|'heartbeat'|'silence')——高潮戏的镜头语言
    if (node.fx) this.emit('fx', node.fx, node);

    // 布局：框锚定屏幕底部（底边恒定），框高按【当前页】实际行数逐页自适应——
    // 短页矮框、长页高框，翻页重算。根治"框大文字少、下面一片空黑"的业余感。
    const { width, height } = this.scene.scale;
    const boxW = Math.min(1400, width - 120);
    const boxX = (width - boxW) / 2;
    const PAD = 32;
    const bodyStyle = {
      fontSize: '26px', color: '#f4f4f8', lineSpacing: 8,
      stroke: '#0a0a14', strokeThickness: 3,
      wordWrap: { width: boxW - PAD * 2, useAdvancedWrap: true },
    };
    const maxLines = node.speaker ? 3 : 4; // 每页行数上限，分页更均匀
    this._pages = this._paginate(node.text || '', bodyStyle, boxW - PAD * 2, maxLines);
    this._pageIdx = 0;
    const speakerH = (node.speaker && node.speaker.length > 0) ? 36 : 0;
    // 保存布局参数供翻页重算
    this._boxX = boxX; this._boxW = boxW; this._PAD = PAD; this._bodyStyle = bodyStyle; this._speakerH = speakerH;
    const boxBottom = height - 40;
    const boxH0 = this._pageBoxH(this._pages[0], speakerH);
    const boxY = boxBottom - boxH0;

    const container = this.scene.add.container(0, 0);
    this.ui = container;
    container.setScrollFactor(0).setDepth(10000); // 钉屏:对话UI固定在镜头上,不随世界滚动
    if (typeof this.scene.attachToUICamera === 'function') this.scene.attachToUICamera(container);

    // 全屏透明输入层：命中区=整个屏幕，点任何位置都能推进（根治"点击框错位"）。
    const catcher = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.001)
      .setScrollFactor(0).setInteractive();
    container.add(catcher);

    // 对话框：半透明深色底板 + 金色描边（高度会随页重算）
    this._box = this.scene.add.rectangle(boxX + boxW / 2, boxY + boxH0 / 2, boxW, boxH0, 0x080812, 0.94)
      .setStrokeStyle(2, 0xd4a353, 0.7);
    container.add(this._box);

    // 幕名：对话框右上角小字（如有）——顶部对齐，随框高重定位
    this._actText = null;
    if (this.currentActName) {
      this._actText = this.scene.add.text(boxX + boxW - PAD, boxY + 10, this.currentActName, {
        fontSize: '18px', color: '#9aa0a6',
      }).setOrigin(1, 0);
      container.add(this._actText);
    }

    // 右上角「✕ 退出」按钮——底部对齐，Y 恒定（框底不动）
    const exitBtn = this.scene.add.text(boxX + boxW - PAD, boxBottom - 12, '✕ 退出对话', {
      fontSize: '17px', color: '#8a8a9e',
    }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    exitBtn.on('pointerover', () => exitBtn.setColor('#ff9a9a'));
    exitBtn.on('pointerout', () => exitBtn.setColor('#8a8a9e'));
    exitBtn.on('pointerdown', () => this._forceExit());
    container.add(exitBtn);

    // speaker：左上角名牌（空串则不显示）——顶部对齐，随框高重定位
    this._speakerText = null;
    let textY = boxY + 22;
    if (speakerH) {
      this._speakerText = this.scene.add.text(boxX + PAD, textY, node.speaker, {
        fontSize: '22px', color: '#ffd24d', fontStyle: 'bold',
      });
      container.add(this._speakerText);
      textY += 36;
    }
    this._bodyText = this.scene.add.text(boxX + PAD, textY, '', bodyStyle);
    container.add(this._bodyText);
    // 翻页指示 ▼——底部对齐，Y 恒定
    this._moreHint = this.scene.add.text(boxX + boxW / 2, boxBottom - 14, '▼ 点击继续', {
      fontSize: '18px', color: '#ffd24d',
    }).setOrigin(0.5, 1).setVisible(false);
    container.add(this._moreHint);
    this.scene.tweens.add({ targets: this._moreHint, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
    this._startTypewriter(this._bodyText, this._pages[0], node.speaker);
    this._catcher = catcher;
    this._bindEscExit(); // ESC 随时退出当前对话

    const rawChoices = node.choices || [];
    const isEndNode = !node.choices || node.choices.length === 0;

    // 情况1：真正的结束节点（原始 choices 为空）
    if (isEndNode) {
      const endLabel = this.scene.add
        .text(boxX + PAD, boxBottom - 14, '(结束)', {
          fontSize: '17px', color: '#9aa0a6',
        })
        .setOrigin(0, 1);
      container.add(endLabel);

      const advance = () => {
        if (this._typing) { this._finishTyping(); return; } // 打字中先跳字
        if (this._hasMorePages()) { this._nextPage(node.speaker); return; } // 还有页先翻页
        if (this._advanced) return;
        this._advanced = true;
        if (node.action) this.emit('action', node.action, node);
        this._endDialogue();
      };
      this._advanced = false;
      catcher.on('pointerdown', advance);      // 点屏幕任意处推进（永不错位）
      this._bindAdvanceKeys(advance);           // 空格/回车推进
      return;
    }

    // 按条件过滤：不满足 condition 的选项不渲染
    const visibleChoices = rawChoices.filter(c => this._checkCondition(c.condition));

    // 情况2：有原始选项但全部被条件过滤——兜底"继续"按钮，防剧情卡死
    if (visibleChoices.length === 0) {
      console.warn(
        `[DialogueEngine] 节点 "${nodeId}" 的 ${rawChoices.length} 个选项全部被条件过滤，使用兜底继续`
      );
      const fallbackChoice = rawChoices.find(c => !c.condition) || rawChoices[0];
      const btnW = 560, btnH = 56;
      const cx = width / 2, cy = boxY - 20 - btnH / 2;
      // 兜底也要应用 effects + 记录 choice（否则状态丢失、结局画像失真）
      const doFallback = () => {
        this._applyEffects(fallbackChoice.effects);
        this.emit('choice', { nodeId, choice: fallbackChoice, act: this.currentAct });
        if (node.action) this.emit('action', node.action, node);
        this._showNode(fallbackChoice.next);
      };
      const btn = makeCuteChoice(this.scene, {
        x: cx, y: cy, w: btnW, h: btnH, label: '继续', tone: 0x7bd88f,
        onClick: () => { AudioSystem.uiClick(); doFallback(); },
      });
      container.add(btn);
      this._bindAdvanceKeys(() => {
        if (this._typing) { this._finishTyping(); return; }
        if (this._hasMorePages()) { this._nextPage(node.speaker); return; }
        doFallback();
      });
      return;
    }

    // 情况3：正常渲染可见选项——按钮宽高随 label 自适应（1920 尺度），长选项换行不溢出
    this._advanced = false; // 多选节点也要重置，否则 ESC/✕退出会失效（BUG-7）
    const gap = 12;
    const minW = 560, maxW = boxW; // 最宽 = 对话框宽
    const metas = visibleChoices.map((choice) => {
      const style = { fontSize: '22px', color: '#e6e6e6', align: 'center',
        wordWrap: { width: maxW - 60, useAdvancedWrap: true } };
      const probe = this.scene.add.text(-9999, -9999, choice.label, style).setVisible(false);
      const tw = probe.width, th = probe.height;
      probe.destroy();
      const w = Phaser.Math.Clamp(tw + 60, minW, maxW);
      const h = Math.max(52, th + 24);
      return { choice, style, w, h };
    });
    const totalH = metas.reduce((s, m) => s + m.h, 0) + (metas.length - 1) * gap;
    let by = boxY - 18 - totalH;

    metas.forEach(({ choice, w, h }, i) => {
      const cx = width / 2, cy = by + h / 2;
      const btn = makeCuteChoice(this.scene, {
        x: cx, y: cy, w, h, label: choice.label, index: i,
        tone: CHOICE_TONES[i % CHOICE_TONES.length], fontSize: 22, popDelay: i * 70,
        sound: () => AudioSystem.uiClick(),
        onClick: () => {
          this._applyEffects(choice.effects);
          // 记录选择：emit 'choice' 事件，外部场景写入 ChoiceLog（选择记忆/结局画像数据源）
          this.emit('choice', { nodeId, choice, act: this.currentAct });
          if (node.action) this.emit('action', node.action, node);
          this._showNode(choice.next);
        },
      });
      container.add(btn);
      by += h + gap;
    });

    // 点屏幕任意处（catcher）跳字/翻页——选项按钮在其上层，点选项不受影响
    catcher.on('pointerdown', () => {
      if (this._typing) { this._finishTyping(); return; }
      if (this._hasMorePages()) this._nextPage(node.speaker);
    });

    // 只有一个选项（如"(继续)"）时，空格/回车也可推进
    if (visibleChoices.length === 1) {
      const only = visibleChoices[0];
      const go = () => {
        if (this._typing) { this._finishTyping(); return; } // 打字中先跳字
        if (this._hasMorePages()) { this._nextPage(node.speaker); return; } // 还有页先翻页
        if (this._advanced) return;
        this._advanced = true;
        this._applyEffects(only.effects);
        if (node.action) this.emit('action', node.action, node);
        this._showNode(only.next);
      };
      this._advanced = false;
      this._bindAdvanceKeys(go);
    }
  }

  // 强制退出当前对话（✕ 按钮 / ESC）：立即结束并通知场景解冻
  _forceExit() {
    if (this._advanced) return;
    this._advanced = true;
    this._endDialogue();
  }

  // 条件判断：委托纯函数（单测见 test-dialogue-rules.mjs）
  _checkCondition(condition) {
    return checkChoiceCondition(condition, (key) => this.state.get(key));
  }

  _applyEffects(effects) {
    if (!effects) return;
    for (const [key, delta] of Object.entries(effects)) {
      this.state.change(key, delta);
    }
  }

  _endDialogue() {
    this._clearUI();
    this.emit('dialogueEnd');
  }

  _clearUI() {
    this._unbindKeys(); // 解绑本节点键盘 handler，防旧闭包累积
    if (this._typeTimer) { this._typeTimer.remove(); this._typeTimer = null; }
    this._typing = false;
    if (this.ui) {
      this.ui.destroy(true); // 连子元素一起销毁
      this.ui = null;
    }
  }
}
