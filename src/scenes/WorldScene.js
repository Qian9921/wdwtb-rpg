import Phaser from 'phaser';
import { StateSystem } from '../systems/StateSystem.js';
import { StatusBarUI } from '../systems/StatusBarUI.js';
import { DialogueEngine } from '../systems/DialogueEngine.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';

// WorldScene — LimeZu 现代办公室俯视角 RPG 探索 + NPC 交互 + 剧情合体
//
// 素材事实（通过 Python 逐像素分析确认）：
// - Adam/Alex/Amelia/Bob.png: 384x224, 24cols x 7rows, frame 16x32
//   Row0 = 闲置(4帧: down/left/right/up idle)
//   Row1 = 向下走(帧24-31)  Row2 = 向上走(帧48-55)
//   Row3 = 向左走(帧72-79)  Row4 = 向右走(帧96-103)
// - office_16.png: 256x848, 16x16 tiles；frame 85 = 蓝灰色办公地毯
// - singles16: 全部 32x48px；roombuilder_16.png: 256x224, 16x16 tiles

const MW = 960, MH = 640;
const WALL = 32;
const SCALE = 2;       // 角色缩放
const FSCALE = 2.5;      // 家具缩放 (32x48 → 64x96)

// idle 帧（Row0）：0=下 1=左 2=右 3=上
const IDLE = { down: 0, left: 1, right: 2, up: 3 };

export class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  init(data) {
    this.career = (data && data.career) || 'programmer';
    this.deep = data ? data.deep : true;
    this.act = (data && data.act) || 1;
    this.dialogueActive = false;
    this.activeNpc = null;
    // 进场即存档，保证"继续游戏"总能回到当前职业与幕次
    SaveSystem.save({ career: this.career, act: this.act });
  }

  preload() {
    // 玩家角色
    this.load.spritesheet('adam', './assets/limezu/characters/Adam.png', {
      frameWidth: 16, frameHeight: 32,
    });
    // NPC 角色（同规格）
    this.load.spritesheet('alex', './assets/limezu/characters/Alex.png', {
      frameWidth: 16, frameHeight: 32,
    });
    this.load.spritesheet('amelia', './assets/limezu/characters/Amelia.png', {
      frameWidth: 16, frameHeight: 32,
    });
    this.load.spritesheet('bob', './assets/limezu/characters/Bob.png', {
      frameWidth: 16, frameHeight: 32,
    });
    // office tileset — 地板用
    this.load.spritesheet('office', './assets/limezu/office_16.png', {
      frameWidth: 16, frameHeight: 16,
    });
    // roombuilder — 墙壁装饰用
    this.load.spritesheet('roombuilder', './assets/limezu/roombuilder_16.png', {
      frameWidth: 16, frameHeight: 16,
    });
    // 家具 — 全部 32x48
    const P = './assets/limezu/singles16/Modern_Office_Singles_';
    const L = (k, id) => this.load.image(k, `${P}${id}.png`);
    L('desk_wood', 211); L('desk_gray', 214); L('desk_L', 259);
    L('chair_a', 86); L('chair_b', 87); L('chair_c', 88);
    L('mon_a', 122); L('mon_b', 132); L('keyboard', 128);
    L('papers', 155); L('lamp', 157);
    L('cabinet_a', 185); L('cabinet_b', 186); L('cabinet_c', 187);
    L('plant_a', 83); L('plant_b', 84); L('plant_c', 85);
    L('printer', 137); L('water', 145);
    L('sofa_a', 181); L('sofa_b', 182); L('bigscreen', 156);
  }

  create() {
    AudioSystem.playBgm('office');
    this.obstacles = this.physics.add.staticGroup();

    this._buildFloor();
    this._buildWalls();
    this._placeFurniture();
    this._createPlayer();
    this._createNpcs();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, MW, MH);

    // 核心系统（状态 + 状态条 HUD + 对话引擎）
    this.stateSystem = new StateSystem();
    this.statusUI = new StatusBarUI(this, this.stateSystem);
    this.dialogueEngine = new DialogueEngine(this, this.stateSystem);
    this._setupDialogueEvents();

    // 交互键
    this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // 操作提示（钉屏）
    this.add.text(MW / 2, 8, 'WASD / 方向键 移动 · 走近 NPC 按 E 交谈 · ESC 菜单', {
      fontSize: '13px',
      fill: '#dfe3ff',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9999);

    // 引导语（钉屏，底部）——找老陈报到
    this.guideText = this.add.text(MW / 2, 500, '📋 新人报到:去找资深架构师「老陈」(工位上方有 ❗),走近按 E', {
      fontSize: '13px',
      fill: '#ffe08a',
      backgroundColor: '#00000099',
      padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(9999);

    // "按 E 交谈"浮标（钉屏，默认隐藏）
    this.ePrompt = this.add.text(MW / 2, 470, '［ E ］交谈', {
      fontSize: '18px',
      fill: '#ffffff',
      backgroundColor: '#2a6fd6ee',
      padding: { x: 14, y: 7 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(9999).setVisible(false);

    // 素材署名（钉屏，右下角小字）
    this.add.text(MW - 6, MH - 4, 'Art: LimeZu · Kenney', {
      fontSize: '10px', fill: '#7a7a8a',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(9999);

    // 调试自验证钩子:?autochen=1 → 传送到老陈并自动触发第一幕(仅用于截图验证)
    if (typeof window !== 'undefined' && window.location.search.includes('autochen=1')) {
      const chen = this.npcs.find(n => n.id === 'laochen');
      if (chen) {
        this.player.setPosition(chen.spr.x, chen.spr.y + 40);
        this.time.delayedCall(800, () => this._interact(chen));
      }
    }
  }

  // ==================== 地板 ====================
  _buildFloor() {
    this.add.tileSprite(0, 0, MW, MH, 'roombuilder', 136)
      .setOrigin(0)
      .setDepth(0);
  }

  // ==================== 墙壁 ====================
  _buildWalls() {
    const wallColor = 0x5a5a6e;
    const wallTop = 0x6a6a7e;
    const t = WALL;

    this.add.rectangle(0, 0, MW, t, wallColor).setOrigin(0).setDepth(10);
    this.add.rectangle(0, 0, t, MH, wallColor).setOrigin(0).setDepth(10);
    this.add.rectangle(MW - t, 0, t, MH, wallColor).setOrigin(0).setDepth(10);

    const doorW = 100;
    const halfL = (MW - doorW) / 2;
    this.add.rectangle(0, MH - t, halfL, t, wallColor).setOrigin(0, 0).setDepth(10);
    this.add.rectangle(MW - halfL, MH - t, halfL, t, wallColor).setOrigin(0, 0).setDepth(10);

    this.add.rectangle(0, t - 2, MW, 2, wallTop).setOrigin(0).setDepth(11);
    this.add.rectangle(t - 2, 0, 2, MH, wallTop).setOrigin(0).setDepth(11);
    this.add.rectangle(MW - t, 0, 2, MH, wallTop).setOrigin(0).setDepth(11);

    this._zone(MW / 2, t / 2, MW, t);
    this._zone(t / 2, MH / 2, t, MH);
    this._zone(MW - t / 2, MH / 2, t, MH);
    this._zone(halfL / 2, MH - t / 2, halfL, t);
    this._zone(MW - halfL / 2, MH - t / 2, halfL, t);
  }

  // ==================== 家具 ====================
  _placeFurniture() {
    const place = (key, x, y, s = FSCALE) => {
      const img = this.add.image(x, y, key)
        .setScale(s)
        .setOrigin(0.5, 0.75)
        .setDepth(y);
      const tex = this.textures.get(key);
      if (tex?.source[0]) {
        const fw = tex.source[0].width * s;
        const fh = tex.source[0].height * s;
        this._zone(x, y + fh * 0.12, fw * 0.55, fh * 0.22);
      }
      return img;
    };
    // 纯装饰(不加碰撞,叠在桌上的小物)
    const deco = (key, x, y, s = FSCALE) =>
      this.add.image(x, y, key).setScale(s).setOrigin(0.5, 0.75).setDepth(y + 2);

    // 一个完整工位 = 桌 + 显示器 + 键盘 + 椅子(椅子在桌前下方)
    const workstation = (x, y, deskKey, monKey) => {
      place(deskKey, x, y);                 // 桌
      deco(monKey, x, y - 20);              // 显示器(桌上)
      deco('keyboard', x, y - 2, FSCALE*0.9); // 键盘
      place(['chair_a','chair_b','chair_c'][(x+y)%3], x, y + 46); // 椅子
    };

    // === 工位阵列:4列 × 3行 ===
    this.deskCols = [175, 375, 575, 785];
    this.deskRows = [120, 290, 460];
    const cols = this.deskCols, rows = this.deskRows;
    const monKeys = ['mon_a','mon_b'];
    const deskKeys = ['desk_wood','desk_gray'];
    for (let ri = 0; ri < rows.length; ri++) {
      for (let ci = 0; ci < cols.length; ci++) {
        workstation(cols[ci], rows[ri], deskKeys[ci%2], monKeys[(ci+ri)%2]);
      }
    }
    // 工位间点缀:文件堆/台灯,让桌面丰富
    deco('papers', cols[0]+34, rows[0]-6, FSCALE*0.8);
    deco('lamp', cols[2]+34, rows[1]-6, FSCALE*0.8);
    deco('papers', cols[3]+34, rows[2]-6, FSCALE*0.8);

    // === 左墙:文件柜一排 ===
    place('cabinet_a', 60, 110);
    place('cabinet_b', 60, 240);
    place('cabinet_c', 60, 370);

    // === 绿植点缀(走道/角落) ===
    place('plant_a', 62, 560);
    place('plant_b', 275, 200);
    place('plant_c', 480, 375);
    place('plant_a', 680, 200);
    place('plant_b', MW-60, 130);
    place('plant_c', MW-60, 300);

    // === 右下:休息区(沙发+绿植) ===
    place('sofa_a', 770, 570);
    place('sofa_b', 850, 570);
    place('plant_a', 700, 575);

    // === 中下:数据大屏(靠墙,科技感) ===
    deco('bigscreen', 490, 585, FSCALE*1.1);

    // === 左下:设备角(打印机+饮水机) ===
    place('printer', 150, 575);
    place('water', 220, 575);
  }

  // ==================== 玩家 ====================
  _createPlayer() {
    this.anims.create({
      key: 'walk_down',
      frames: this.anims.generateFrameNumbers('adam', { start: 24, end: 29 }),
      frameRate: 8, repeat: -1,
    });
    this.anims.create({
      key: 'walk_up',
      frames: this.anims.generateFrameNumbers('adam', { start: 36, end: 41 }),
      frameRate: 8, repeat: -1,
    });
    this.anims.create({
      key: 'walk_left',
      frames: this.anims.generateFrameNumbers('adam', { start: 72, end: 77 }),
      frameRate: 8, repeat: -1,
    });
    this.anims.create({
      key: 'walk_right',
      frames: this.anims.generateFrameNumbers('adam', { start: 96, end: 101 }),
      frameRate: 8, repeat: -1,
    });

    this.player = this.physics.add.sprite(MW / 2, MH - 70, 'adam', 0);
    this.player.setScale(SCALE);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(12, 14);
    this.player.body.setOffset(2, 18);

    this.physics.world.setBounds(0, 0, MW, MH);
    this.physics.add.collider(this.player, this.obstacles);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.facing = 'down';
  }

  // ==================== NPC ====================
  _createNpcs() {
    // 工位坐标复用 _placeFurniture 的 cols/rows
    // NPC 站在工位椅子处（cy+55），朝向决定 idle 帧
    const C = this.deskCols, R = this.deskRows;

    // 老陈：资深架构师，中间显眼工位（col1,row1），朝下面向玩家
    // 江野：活泼新人，邻座（col2,row1）
    // 周哥：老油条，靠窗（右侧 col3,row0），朝上看窗外摸鱼
    const defs = [
      {
        id: 'laochen', name: '老陈', tex: 'bob',
        x: C[1], y: R[1] + 55, facing: 'down',
        label: '老陈 · 资深架构师', mark: '❗', markColor: '#ffdd33',
        act: 1, // 走近报到 → 播第一幕
      },
      {
        id: 'jiangye', name: '江野', tex: 'alex',
        x: C[2], y: R[1] + 55, facing: 'down',
        label: '江野 · 新同事', mark: '💬', markColor: '#7ec8ff',
        line: '江野挤挤眼:"新来的?老陈在那边,先去他那报个到——别怕,他凶归凶,心是热的。"',
      },
      {
        id: 'zhouge', name: '周哥', tex: 'amelia',
        x: C[3], y: R[0] + 55, facing: 'up',
        label: '周哥 · 老前辈', mark: '💬', markColor: '#7ec8ff',
        line: '周哥头也不抬,盯着窗外:"年轻人,悠着点。这行啊,活是干不完的。"',
      },
    ];

    this.npcs = [];
    for (const d of defs) {
      const spr = this.add.sprite(d.x, d.y, d.tex, IDLE[d.facing] ?? 0)
        .setScale(SCALE)
        .setOrigin(0.5, 1)
        .setDepth(d.y);

      // NPC 名牌（工位下方小字，随世界滚动）
      const nameTag = this.add.text(d.x, d.y + 6, d.name, {
        fontSize: '11px', color: '#ffffff',
        backgroundColor: '#00000088', padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 0).setDepth(d.y + 1);

      // 头顶交互浮标（随世界滚动，上下浮动）
      const markY = d.y - 74;
      const mark = this.add.text(d.x, markY, d.mark, {
        fontSize: '20px', color: d.markColor,
      }).setOrigin(0.5, 1).setDepth(9000);
      this.tweens.add({
        targets: mark,
        y: markY - 6,
        duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      // NPC 脚下碰撞（挡路，但可走近）
      this._zone(d.x, d.y - 8, 24, 16);

      this.npcs.push({ ...d, spr, mark, nameTag });
    }
  }

  update() {
    if (!this.player?.body) return;

    // ESC 唤起暂停菜单（对话进行中不触发，交给对话自己的 ESC）
    if (!this.dialogueActive && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.scene.pause();
      this.scene.launch('PauseScene', {
        origin: 'WorldScene',
        stateSystem: this.stateSystem,
        career: this.career,
        act: this.act,
      });
      return;
    }

    // 对话中冻结移动，跳过交互检测
    if (this.dialogueActive) {
      this.player.setVelocity(0, 0);
      if (this.player.anims.isPlaying) this.player.anims.pause();
      return;
    }

    const speed = 130;
    let vx = 0, vy = 0;
    let newFacing = null;

    if (this.cursors.left.isDown || this.wasd.A.isDown) { vx = -speed; newFacing = 'left'; }
    if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = speed; newFacing = 'right'; }
    if (this.cursors.up.isDown || this.wasd.W.isDown) { vy = -speed; newFacing = 'up'; }
    if (this.cursors.down.isDown || this.wasd.S.isDown) { vy = speed; newFacing = 'down'; }

    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }
    if (newFacing) this.facing = newFacing;

    this.player.setVelocity(vx, vy);
    this.player.setDepth(this.player.y);

    if (vx === 0 && vy === 0) {
      if (this.player.anims.isPlaying) this.player.anims.pause();
    } else {
      this.player.anims.play(`walk_${this.facing}`, true);
    }

    // ---- 交互:找最近可交互 NPC ----
    this._updateInteraction();
  }

  _updateInteraction() {
    const RANGE = 78;
    let nearest = null, nd = RANGE;
    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, npc.spr.x, npc.spr.y
      );
      if (d < nd) { nd = d; nearest = npc; }
    }

    this.activeNpc = nearest;
    if (nearest) {
      this.ePrompt.setText(`［ E ］与 ${nearest.name} 交谈`).setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this._interact(nearest);
      }
    } else {
      this.ePrompt.setVisible(false);
    }
  }

  _interact(npc) {
    if (this.dialogueActive) return;

    // 老陈 → 触发正式剧情第一幕
    if (npc.act) {
      this.dialogueActive = true;
      this.ePrompt.setVisible(false);
      this.guideText.setVisible(false);
      this.act = npc.act;
      const url = `./data/${this.career}_act${this.act}.json`;
      console.log('[WorldScene] 走近老陈,加载剧情:', url);
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`加载剧情失败:HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          this.dialogueEngine._clearUI();
          this.dialogueEngine.start(data);
        })
        .catch(err => {
          console.error('[WorldScene]', err.message);
          this.dialogueActive = false;
        });
      return;
    }

    // 其余 NPC → 一句轻量寒暄气泡
    if (npc.line) this._showLine(npc.name, npc.line);
  }

  // 轻量单句气泡（非正式剧情）——钉屏，点击/E/空格关闭
  _showLine(name, text) {
    this.dialogueActive = true;
    this.ePrompt.setVisible(false);
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10000);
    c.add(this.add.rectangle(width / 2, height - 90, 900, 120, 0x000000, 0.72));
    c.add(this.add.text(width / 2 - 440, height - 138, name, {
      fontSize: '14px', color: '#ffd24d',
    }));
    c.add(this.add.text(width / 2 - 440, height - 114, text, {
      fontSize: '17px', color: '#ffffff', wordWrap: { width: 880, useAdvancedWrap: true },
    }));
    c.add(this.add.text(width / 2 + 440, height - 44, '［点击/E 继续］', {
      fontSize: '12px', color: '#9aa0a6',
    }).setOrigin(1, 1));

    const close = () => {
      c.destroy(true);
      this.dialogueActive = false;
    };
    this.time.delayedCall(120, () => {
      const hit = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.01)
        .setScrollFactor(0).setDepth(9999).setInteractive();
      c.add(hit);
      hit.on('pointerdown', close);
      this.input.keyboard.once('keydown-E', close);
      this.input.keyboard.once('keydown-SPACE', close);
      this.input.keyboard.once('keydown-ESC', close);
    });
  }

  // ==================== 剧情引擎事件（移植自 OfficeScene）====================
  _setupDialogueEvents() {
    const eng = this.dialogueEngine;
    const self = this;

    eng.on('bgChange', bg => {
      console.log('[WorldScene] bgChange:', bg);
    });

    eng.on('dialogueEnd', () => {
      console.log('[WorldScene] dialogue ended');
      self.dialogueActive = false;
    });

    eng.on('action', (action, node) => {
      switch (action) {
        case 'plant_tree':
          self._showRitual('🌱 你给绿萝浇了水。它好像在灯光下轻轻颤了一下。');
          break;
        case 'write_letter':
          self._showRitual('✉️ 你写下了给一年后自己的信,封存在抽屉最深处。');
          break;
        case 'minigame:coding':
        case 'minigame:review':
        case 'minigame:affairs':
          self.scene.pause();
          self.scene.launch('MinigameScene', {
            type: action.split(':')[1],
            fromScene: null,
            onComplete: (result) => {
              // 按成绩反哺状态:全对 skill+5 passion+4;部分 skill+3;全错 stress+3 但 skill+1(试错也是学)
              const total = result?.total || 3, ok = result?.correct || 0;
              if (ok === total) { self.stateSystem.change('skill', 5); self.stateSystem.change('passion', 4); }
              else if (ok > 0) { self.stateSystem.change('skill', 3); self.stateSystem.change('energy', -3); }
              else { self.stateSystem.change('stress', 3); self.stateSystem.change('skill', 1); }
              self.scene.stop('MinigameScene');
              self.scene.resume();
            },
          });
          break;
        case 'enter_mindscape':
          self.scene.pause();
          self.scene.launch('MindscapeScene', {
            stateSystem: self.stateSystem,
            returnScene: 'WorldScene',
            monoScene: 'auto',
          });
          self.events.once('mindscapeReturn', () => {
            self.dialogueEngine._advanceAfterAction && self.dialogueEngine._advanceAfterAction();
          });
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
          console.log('[WorldScene] unhandled action:', action);
      }
    });
  }

  // ---------- 仪式弹窗（钉屏）----------
  _showRitual(text) {
    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(10001);
    overlay.add(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5));
    const box = this.add.rectangle(width / 2, height / 2 - 20, 500, 140, 0x1e1e2e, 0.95);
    overlay.add(box);
    overlay.add(this.add.text(width / 2, height / 2 - 45, text, {
      fontSize: '20px', color: '#f0d080',
      wordWrap: { width: 440, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5));
    overlay.add(this.add.text(width / 2, height / 2 + 15, '点击任意处继续', {
      fontSize: '13px', color: '#6a6a7a',
    }).setOrigin(0.5));

    const close = () => overlay.destroy(true);
    box.setInteractive();
    box.on('pointerdown', close);
    this.input.keyboard.once('keydown-ESC', close);
    this.input.keyboard.once('keydown-SPACE', close);
    this.time.delayedCall(100, () => {
      overlay.add(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.01)
        .setScrollFactor(0)
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
        SaveSystem.save({ career: this.career, act: this.act }); // 过幕即存，续档回到最新一幕
        this.dialogueEngine._clearUI();
        this.dialogueEngine.start(data);
      })
      .catch(() => {
        this.scene.start('EndingScene', {
          ending: this.career,
          stats: this.stateSystem.getAll(),
        });
      });
  }

  // ==================== 碰撞辅助 ====================
  _zone(cx, cy, w, h) {
    const z = this.add.zone(cx, cy, w, h);
    this.physics.add.existing(z, true);
    this.obstacles.add(z);
  }
}
