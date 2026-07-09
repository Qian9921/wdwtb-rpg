import Phaser from 'phaser';
import { AudioSystem } from './AudioSystem.js';

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
  }

  // 打字机逐字显示 + 叽喳声。用 scene.time（场景 pause 时自动停），不用 setInterval。
  _startTypewriter(textObj, fullText, speaker) {
    if (this._typeTimer) { this._typeTimer.remove(); this._typeTimer = null; }
    if (!fullText) { this._typing = false; return; }
    this._typing = true;
    this._typeTarget = textObj;
    this._typeFull = fullText;
    let i = 0;
    this._typeTimer = this.scene.time.addEvent({
      delay: 34,
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

  // 翻到下一页并重启打字机
  _nextPage(speaker) {
    this._pageIdx++;
    this._startTypewriter(this._bodyText, this._pages[this._pageIdx], speaker);
    this._updateMoreHint();
  }

  _updateMoreHint() {
    if (this._moreHint && this._moreHint.scene) {
      this._moreHint.setVisible(this._hasMorePages() && !this._typing);
    }
  }

  // 接收对话树 JSON 对象，从其 start 节点开始演出
  start(dialogueData) {
    this.data = dialogueData;
    this.currentId = dialogueData.start;
    // 幕信息（可选）
    if (dialogueData.act != null) this.currentAct = dialogueData.act;
    if (dialogueData.actName != null) this.currentActName = dialogueData.actName;
    this._showNode(this.currentId);
  }

  _showNode(nodeId) {
    this._clearUI();
    const node = this.data.nodes[nodeId];
    this.currentId = nodeId;

    // 进入节点：应用该节点的 effects（调 StateSystem.change）
    this._applyEffects(node.effects);

    // 若节点指定背景，emit 事件让外部场景切换
    if (node.bg) this.emit('bgChange', node.bg);

    const { width, height } = this.scene.scale;
    const boxW = 900;
    const boxH = 158; // 容纳 speaker 行 + 正文 4 行（长文本分页，不溢出）
    const boxX = (width - boxW) / 2;
    const boxY = height - boxH - 20; // 靠底，留 20px 边距

    const container = this.scene.add.container(0, 0);
    container.setScrollFactor(0).setDepth(9500); // 钉屏:对话UI固定在镜头上,不随世界滚动
    this.ui = container;
    container.setScrollFactor(0).setDepth(10000); // 摄像机滚动场景下钉死在屏幕

    // 对话框：半透明深色矩形，靠底居中
    const box = this.scene.add.rectangle(boxX + boxW / 2, boxY + boxH / 2, boxW, boxH, 0x000000, 0.6);
    container.add(box);

    // 幕名：对话框右上角小字（如有）
    if (this.currentActName) {
      const actText = this.scene.add.text(boxX + boxW - 18, boxY + 4, this.currentActName, {
        fontSize: '12px',
        color: '#9aa0a6',
      }).setOrigin(1, 0);
      container.add(actText);
    }

    // speaker：左上角小字（空串则不显示，只显旁白正文）
    let textY = boxY + 14;
    if (node.speaker && node.speaker.length > 0) {
      const speakerText = this.scene.add.text(boxX + 18, textY, node.speaker, {
        fontSize: '14px',
        color: '#ffd24d',
      });
      container.add(speakerText);
      textY += 22;
    }
    // 正文：打字机逐字显示 + 按说话人声线的叽喳声（像素 RPG 标配）
    // 长文本分页：框内最多显示 maxLines 行，超出的按页推进（页间点击/空格翻页，
    // 最后一页才显示选项/结束）——文字绝不溢出框。
    const bodyStyle = {
      fontSize: '17px',
      color: '#ffffff',
      lineSpacing: 5,
      wordWrap: { width: boxW - 36, useAdvancedWrap: true },
    };
    const maxLines = node.speaker ? 4 : 5; // 有说话人名时正文少一行
    this._pages = this._paginate(node.text || '', bodyStyle, boxW - 36, maxLines);
    this._pageIdx = 0;
    const bodyText = this.scene.add.text(boxX + 18, textY, '', bodyStyle);
    container.add(bodyText);
    // 翻页指示 ▼（还有下一页时显示）
    this._moreHint = this.scene.add.text(boxX + boxW - 20, boxY + boxH - 8, '▼', {
      fontSize: '14px', color: '#ffd24d',
    }).setOrigin(1, 1).setVisible(false);
    container.add(this._moreHint);
    this.scene.tweens.add({ targets: this._moreHint, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
    this._bodyText = bodyText;
    this._startTypewriter(bodyText, this._pages[0], node.speaker);

    const rawChoices = node.choices || [];
    const isEndNode = !node.choices || node.choices.length === 0;

    // 情况1：真正的结束节点（原始 choices 为空）
    if (isEndNode) {
      const endLabel = this.scene.add
        .text(boxX + boxW - 18, boxY + boxH - 12, '(结束)', {
          fontSize: '14px',
          color: '#9aa0a6',
        })
        .setOrigin(1, 1);
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
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', advance);
      // 统一交互：空格/回车也可推进
      this._bindAdvanceKeys(advance);
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
      const btnW = 380;
      const btnH = 36;
      const bx = (width - btnW) / 2;
      const by = boxY - 12 - btnH;
      const btn = this.scene.add
        .rectangle(bx + btnW / 2, by + btnH / 2, btnW, btnH, 0x2a2a3e)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add
        .text(bx + btnW / 2, by + btnH / 2, '继续', {
          fontSize: '15px',
          color: '#e6e6e6',
        })
        .setOrigin(0.5);

      btn.on('pointerover', () => btn.setFillStyle(0x3a3a4e));
      btn.on('pointerout', () => btn.setFillStyle(0x2a2a3e));
      btn.on('pointerdown', () => {
        if (node.action) this.emit('action', node.action, node);
        this._showNode(fallbackChoice.next);
      });

      container.add(btn);
      container.add(label);
      return;
    }

    // 情况3：正常渲染可见选项——按钮宽高随 label 自适应，长选项换行不溢出
    const gap = 8;
    const minW = 380, maxW = 860; // 最宽不超对话框
    // 先测量每个选项：宽度取 min(实际文本宽+边距, maxW)，超宽则换行加高
    const metas = visibleChoices.map((choice) => {
      const style = { fontSize: '15px', color: '#e6e6e6', align: 'center',
        wordWrap: { width: maxW - 40, useAdvancedWrap: true } };
      const probe = this.scene.add.text(-9999, -9999, choice.label, style).setVisible(false);
      const tw = probe.width, th = probe.height;
      probe.destroy();
      const w = Phaser.Math.Clamp(tw + 40, minW, maxW);
      const h = Math.max(36, th + 16);
      return { choice, style, w, h };
    });
    const totalH = metas.reduce((s, m) => s + m.h, 0) + (metas.length - 1) * gap;
    let by = boxY - 12 - totalH;

    metas.forEach(({ choice, style, w, h }) => {
      const cx = width / 2, cy = by + h / 2;
      const btn = this.scene.add
        .rectangle(cx, cy, w, h, 0x2a2a3e, 0.96)
        .setStrokeStyle(1, 0x4a4a66)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add.text(cx, cy, choice.label, style).setOrigin(0.5);

      btn.on('pointerover', () => btn.setFillStyle(0x3a3a4e));
      btn.on('pointerout', () => btn.setFillStyle(0x2a2a3e));
      btn.on('pointerdown', () => {
        AudioSystem.uiClick();
        this._applyEffects(choice.effects);
        if (node.action) this.emit('action', node.action, node);
        this._showNode(choice.next);
      });

      container.add(btn);
      container.add(label);
      by += h + gap;
    });

    // 有选项的节点：点对话框本体也能跳字/翻页（选项按钮不受影响）
    box.setInteractive();
    box.on('pointerdown', () => {
      if (this._typing) { this._finishTyping(); return; }
      if (this._hasMorePages()) this._nextPage(node.speaker);
    });

    // 统一交互：只有一个选项（如"(继续)"）时，空格/回车也可推进
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

  // 条件判断：检查 choice.condition 中所有状态键是否满足 min（≥）/ max（≤）
  _checkCondition(condition) {
    if (!condition) return true; // 无 condition → 总是显示
    for (const [key, rule] of Object.entries(condition)) {
      const value = this.state.get(key);
      if (rule.min != null && value < rule.min) return false;
      if (rule.max != null && value > rule.max) return false;
    }
    return true;
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
