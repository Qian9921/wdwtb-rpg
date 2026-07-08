import Phaser from 'phaser';
import { StateSystem } from '../systems/StateSystem.js';
import { StatusBarUI } from '../systems/StatusBarUI.js';
import { DialogueEngine } from '../systems/DialogueEngine.js';

// OfficeScene：剧情演出场景。从 data/ JSON 加载对话树，驱动整个游戏流程。
// 引擎共用，职业/剧情内容通过 fetch 动态加载，不写死。
export class OfficeScene extends Phaser.Scene {
  constructor() {
    super('OfficeScene');
  }

  init(data) {
    this.career = data?.career || 'programmer';
    this.act = data?.act || 1;
  }

  create() {
    const { width, height } = this.scale;

    // 地板背景
    this.add.rectangle(width / 2, height / 2, 900, 480, 0x2a2a3e);

    // 玩家
    const player = this.add.rectangle(width / 2, height / 2, 32, 32, 0x4ec9b0);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    this.player = player;
    this.physics.world.setBounds(0, 0, width, height);
    this.cursors = this.input.keyboard.createCursorKeys();

    // 核心系统（首次创建，后续 act 切换时复用）
    if (!this.stateSystem) this.stateSystem = new StateSystem();
    if (!this.statusUI) this.statusUI = new StatusBarUI(this, this.stateSystem);
    if (!this.dialogueEngine) {
      this.dialogueEngine = new DialogueEngine(this, this.stateSystem);
      this._setupDialogueEvents();
    }

    // 加载剧情 JSON
    const url = `./data/${this.career}_act${this.act}.json`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`加载剧情失败：HTTP ${res.status}`);
        return res.json();
      })
      .then(data => this._startGame(data))
      .catch(err => {
        console.error('[OfficeScene]', err.message);
        this.scene.start('EndingScene', {
          ending: this.career,
          stats: this.stateSystem.getAll(),
        });
      });
  }

  update() {
    const speed = 200;
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown) vx -= speed;
    if (this.cursors.right.isDown) vx += speed;
    if (this.cursors.up.isDown) vy -= speed;
    if (this.cursors.down.isDown) vy += speed;
    this.player.body.setVelocity(vx, vy);
  }

  // ---------- 启动剧情 ----------
  _startGame(data) {
    this.dialogueEngine._clearUI();
    this.dialogueEngine.start(data);
  }

  // ---------- 引擎事件 ----------
  _setupDialogueEvents() {
    const eng = this.dialogueEngine;
    const self = this;

    // 背景切换（暂时 console.log，以后接背景图）
    eng.on('bgChange', bg => {
      console.log('[OfficeScene] bgChange:', bg);
    });

    // 对话结束（未设 action 的结束节点）
    eng.on('dialogueEnd', () => {
      console.log('[OfficeScene] dialogue ended');
    });

    // 节点动作
    eng.on('action', (action, node) => {
      switch (action) {
        case 'plant_tree':
          self._showRitual('🌱 你给绿萝浇了水。它好像在灯光下轻轻颤了一下。');
          break;
        case 'write_letter':
          self._showRitual('✉️ 你写下了给一年后自己的信，封存在抽屉最深处。');
          break;
        case 'minigame:coding':
        case 'minigame:review':
        case 'minigame:affairs':
          self._showRitual('⌨️ [代码小游戏] — 稍后接入实战环节');
          break;
        case 'enter_mindscape':
          self._showRitual('🌌 [心象世界] — 稍后接入内心探索');
          break;
        case 'next_act':
          self._loadNextAct();
          break;
        case 'ending':
          self.scene.start('EndingScene', {
            ending: self.career,
            stats: self.stateSystem.getAll(),
          });
          break;
        default:
          console.log('[OfficeScene] unhandled action:', action);
      }
    });
  }

  // ---------- 仪式弹窗（种绿植/写信/小游戏占位）----------
  _showRitual(text) {
    const overlay = this.add.container(0, 0).setDepth(100);
    overlay.add(this.add.rectangle(480, 270, 960, 540, 0x000000, 0.5));
    const box = this.add.rectangle(480, 240, 500, 140, 0x1e1e2e, 0.95);
    overlay.add(box);
    overlay.add(this.add.text(480, 215, text, {
      fontSize: '20px', color: '#f0d080',
      wordWrap: { width: 440, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5));
    overlay.add(this.add.text(480, 275, '点击任意处继续', {
      fontSize: '13px', color: '#6a6a7a',
    }).setOrigin(0.5));

    const close = () => overlay.destroy(true);
    box.setInteractive();
    box.on('pointerdown', close);
    this.input.keyboard.once('keydown-ESC', close);
    this.input.keyboard.once('keydown-SPACE', close);
    // 下帧再绑场景级点击（避免当前帧的手势触发关闭）
    this.time.delayedCall(100, () => {
      overlay.add(this.add.rectangle(480, 270, 960, 540, 0x000000, 0.01)
        .setInteractive()
        .on('pointerdown', close));
    });
  }

  // ---------- 加载下一幕 ----------
  _loadNextAct() {
    this.dialogueEngine._clearUI();
    const next = this.act + 1;
    const url = `./data/${this.career}_act${next}.json`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        this.act = next;
        this._startGame(data);
      })
      .catch(() => {
        // 没有下一幕 → 结局
        this.scene.start('EndingScene', {
          ending: this.career,
          stats: this.stateSystem.getAll(),
        });
      });
  }
}
