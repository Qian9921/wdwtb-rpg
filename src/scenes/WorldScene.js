import Phaser from 'phaser';
import { StateSystem } from '../systems/StateSystem.js';
import { StatusBarUI } from '../systems/StatusBarUI.js';
import { DialogueEngine } from '../systems/DialogueEngine.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';

// WorldScene — LimeZu 现代办公室俯视角 RPG 探索 + NPC 交互 + 剧情合体
//
// 素材事实（2026-07 逐帧质心分析修正版）：
// - Adam/Alex/Amelia/Bob.png: 384x224, 24cols x 7rows, frame 16x32
//   Row0(f0-3) = idle: 0=右 1=上 2=左 3=下（质心与走路帧对齐）
//   Row1(f24-47) = 走路，按 6 帧一组分四向：
//     f24-29=右走  f30-35=上走  f36-41=左走  f42-47=下走
//   ⚠️ 旧映射用了 row3/row4（f72+/f96+）——那是"坐下/翻手机"动作帧，
//     质心在 x1.8↔x11.6 间来回跳，这就是"左右移动人物分裂"的根因。
// - office_16.png: 256x848, 16x16 tiles；frame 85 = 蓝灰色办公地毯
// - singles16: 全部 32x48px；roombuilder_16.png: 256x224, 16x16 tiles

const MW = 960, MH = 640;
const WALL = 32;
const SCALE = 2;       // 角色缩放
const FSCALE = 2.5;      // 家具缩放 (32x48 → 64x96)

// idle 帧（Row0，逐帧目检修正）：f0=右 f1=上 f2=左 f3=下
const IDLE = { right: 0, up: 1, left: 2, down: 3 };
// 走路帧组（Row1，f24-47 按 6 帧一组）：右/上/左/下
const WALK = { right: [24, 29], up: [30, 35], left: [36, 41], down: [42, 47] };

// 轻量职业：单文件全剧情（data/light_*.json），无分幕；深度职业走 {career}_act{n}.json
const LIGHT_CAREERS = ['designer', 'operation', 'teacher', 'doctor', 'civilservant', 'sales', 'lawyer'];

// 职业主题：每个职业不同的地板/墙色/氛围光 + NPC 名字与开场寒暄。
// 场景骨架(工位/会议角/茶水间)共享——像同一栋写字楼里不同公司的楼层,
// 但色彩、命名、氛围完全不同,一眼能认出"这是哪一行"。
const CAREER_THEMES = {
  programmer: {
    floor: 138, wall: 0x5a5a6e, tint: null,
    npcs: { senior: ['老陈', '资深架构师'], peer: ['江野', '新同事'], vet: ['周哥', '老前辈'] },
    peerLine: '江野挤挤眼:"新来的?老陈在那边,先去他那报个到——别怕,他凶归凶,心是热的。"',
    vetLine: '周哥端着咖啡,慢悠悠:"年轻人,悠着点。这行啊,活是干不完的。"',
  },
  product: {
    floor: 189, wall: 0x5e5a6a, tint: 0xfff4e8,
    npcs: { senior: ['林姐', '产品总监'], peer: ['小杜', '交互设计'], vet: ['大鹏', '资深产品'] },
    peerLine: '小杜抱着原型图:"新来的产品?林姐在等你——她语速快,你带个本子记。"',
    vetLine: '大鹏盯着数据看板:"需求会改的,别急着画原型。先想清楚为什么。"',
  },
  admin: {
    floor: 106, wall: 0x5a6062, tint: 0xf0f6f0,
    npcs: { senior: ['王主任', '办公室主任'], peer: ['小方', '同批入职'], vet: ['刘姐', '老科员'] },
    peerLine: '小方压低声音:"王主任人不坏,就是规矩多。记得先敲门。"',
    vetLine: '刘姐整理着文件:"稳是稳,但稳也有稳的熬法。你慢慢就懂了。"',
  },
  designer: {
    floor: 186, wall: 0x635a6e, tint: 0xfdeef4,
    npcs: { senior: ['Kay', '设计总监'], peer: ['阿棠', '插画师'], vet: ['老葛', '资深视觉'] },
    peerLine: '阿棠头也不抬地画着:"Kay 在那边。她看作品不看人,放轻松。"',
    vetLine: '老葛眯眼看着屏幕:"甲方说\'再改改\'的时候,先深呼吸。"',
  },
  operation: {
    floor: 125, wall: 0x5a5e6e, tint: 0xfff8e0,
    npcs: { senior: ['雅姐', '运营负责人'], peer: ['小鹿', '内容运营'], vet: ['强哥', '增长老兵'] },
    peerLine: '小鹿盯着后台数据:"雅姐在等你。今天数据不错,她心情应该好。"',
    vetLine: '强哥转着笔:"流量是假的,留存是真的。记住这句就够了。"',
  },
  teacher: {
    floor: 173, wall: 0x5e6258, tint: 0xf2f8ea,
    npcs: { senior: ['陈校长', '教学校长'], peer: ['小许', '同组新老师'], vet: ['吴老师', '老教师'] },
    peerLine: '小许抱着教案:"陈校长在办公室等你,第一次见面别紧张。"',
    vetLine: '吴老师批着作业:"讲台站久了就知道,教的是书,带的是人。"',
  },
  doctor: {
    floor: 94, wall: 0x586066, tint: 0xeef6f8,
    npcs: { senior: ['张主任', '科室主任'], peer: ['小蒋', '规培同期'], vet: ['护士长', '二十年资历'] },
    peerLine: '小蒋整理着病历:"张主任查房去了,马上回。白大褂穿好。"',
    vetLine: '护士长快步走过:"这里没有慢班。跟上节奏,照顾好自己。"',
  },
  civilservant: {
    floor: 154, wall: 0x5c5e60, tint: 0xf4f4ee,
    npcs: { senior: ['赵科长', '窗口科科长'], peer: ['小闵', '同批考入'], vet: ['老周', '临退老同志'] },
    peerLine: '小闵冲你点头:"赵科长在里面。材料备齐,他就好说话。"',
    vetLine: '老周喝着茶:"章要盖对,人要对得起章。就这么简单。"',
  },
  sales: {
    floor: 141, wall: 0x635e58, tint: 0xfff0e0,
    npcs: { senior: ['Vincent', '销售总监'], peer: ['小柯', '同期入职'], vet: ['彪哥', '销冠'] },
    peerLine: '小柯整理着客户名单:"Vincent 在等你。他只看结果,但人不坏。"',
    vetLine: '彪哥挂了电话:"单子是跑出来的,不是等出来的。走,带你见客户。"',
  },
  lawyer: {
    floor: 170, wall: 0x565660, tint: 0xf6f2ea,
    npcs: { senior: ['沈律师', '合伙人'], peer: ['小袁', '实习律师'], vet: ['何律', '资深诉讼'] },
    peerLine: '小袁抱着一摞卷宗:"沈律在会议室。案卷先看三遍再开口。"',
    vetLine: '何律合上卷宗:"法条是死的,当事人是活的。别忘了这点。"',
  },
};

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
    // 家具 — LimeZu singles。ID 经 10× 放大逐张终审（/tmp/zoom_check.png /tmp/zoom2.png）：
    // 337-339 是散钞票(≠绿植!) → 绿植真身在 office_16 瓦片图 r50；
    // 110=橙椅侧面 111=橙老板椅正面 112=橙椅背面；83/84=白桌面板 85=白小桌。
    const P = './assets/limezu/singles16/Modern_Office_Singles_';
    const L = (k, id) => this.load.image(k, `${P}${id}.png`);
    // 桌与桌面物
    L('desk_wood', 211); L('desk_gray', 214);
    L('mon_a', 122); L('mon_b', 132); L('keyboard', 128);
    L('laptop', 140); L('lamp', 141);
    L('papers', 155); L('deskscreen', 167);
    // 椅子（10× 终审）：270 灰高背朝右 / 197 灰圆背正面 / 111 橙老板椅正面 / 112 橙椅背面
    L('chair_up', 112); L('chair_down', 197); L('chair_boss', 111); L('chair_side', 110);
    // 会议区：画架白板(182-184 橙架白板) + 双屏演示架 + 米色地毯(220)
    L('easel_a', 182); L('easel_b', 183); L('easel_c', 184);
    L('duoscreen_dark', 275); L('duoscreen_white', 276);
    L('rug', 220); L('rug_small', 188);
    // 休息区沙发（灰网面 L 型 + 单人）
    L('sofa_L', 205); L('sofa_1', 204);
    // 储物：186/187 橙红书柜、195 高木柜、191 矮木柜、193 木长凳
    L('shelf_a', 186); L('shelf_b', 187); L('shelf_tall', 195);
    L('cab_wood', 191); L('bench', 193);
    // 茶水间/设备角（10× 终审：173 饮水机 175 售货机 176 暗柜 328 复印台 317 服务器堆）
    L('water', 173); L('vending', 175); L('fridge_dark', 176);
    L('copier', 328); L('server', 317); L('fax', 156);
    // 墙面装饰（证书）
    L('cert_a', 113); L('cert_b', 114);
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

    // 引导语（钉屏，底部）——按职业主题生成"找谁报到"
    const gTheme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    const [gName, gTitle] = gTheme.npcs.senior;
    this.guideText = this.add.text(MW / 2, 500, `📋 新人报到:去找${gTitle}「${gName}」(头顶有 ❗),走近按 E`, {
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

    // 调试自验证钩子:?autochen=1 → 传送到报到 NPC 并自动触发第一幕(仅用于截图验证)
    if (typeof window !== 'undefined' && window.location.search.includes('autochen=1')) {
      const chen = this.npcs.find(n => n.id === 'senior');
      if (chen) {
        this.player.setPosition(chen.spr.x, chen.spr.y + 40);
        this.time.delayedCall(800, () => this._interact(chen));
      }
    }
  }

  // ==================== 地板 ====================
  _buildFloor() {
    const theme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    this.add.tileSprite(0, 0, MW, MH, 'roombuilder', theme.floor)
      .setOrigin(0)
      .setDepth(0);
    // 职业氛围光：极淡的全屏色调,一进场就能感到"行业气质"不同
    if (theme.tint) {
      this.add.rectangle(0, 0, MW, MH, theme.tint, 0.06).setOrigin(0).setDepth(2);
    }
  }

  // ==================== 墙壁 ====================
  _buildWalls() {
    const theme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    const wallColor = theme.wall;
    const wallTop = wallColor + 0x101010;
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
    // 纯装饰(不加碰撞,叠在桌上的小物/墙面挂饰)
    const deco = (key, x, y, s = FSCALE, dy = null) =>
      this.add.image(x, y, key).setScale(s).setOrigin(0.5, 0.75).setDepth(dy ?? (y + 2));

    // office_16 瓦片图直贴（frame = row*16 + col）——官方参考图的绿植/黑椅在这里
    const T = 16 * FSCALE; // 一瓦显示尺寸 40px
    const tile = (x, y, frame, dy = null) =>
      this.add.image(x, y, 'office', frame).setScale(FSCALE).setOrigin(0.5, 0.5).setDepth(dy ?? y);
    // 两瓦竖叠盆栽：底瓦(盆)在 y，顶瓦(叶)在 y-T；碰撞在盆
    const plant2 = (x, y, topF, botF) => {
      tile(x, y - T, topF, y);      // 叶(与盆同深度,人从后面走会被正确遮挡)
      tile(x, y, botF, y);          // 盆
      this._zone(x, y + 6, 26, 14);
    };
    const PLANT = { big: [134, 150], fern: [166, 182], bamboo: [214, 230] };
    // 白置物架 2×2 瓦（13,7)-(14,8）
    const shelfWhite = (x, y) => {
      tile(x - T / 2, y - T, 215, y); tile(x + T / 2, y - T, 216, y);
      tile(x - T / 2, y, 231, y);     tile(x + T / 2, y, 232, y);
      this._zone(x, y + 8, 2 * T * 0.8, 16);
    };
    // 黑色办公椅（8,4)-(9,4) 两瓦竖叠：看到椅背 → 放桌南侧,人坐着面向桌子
    const chairBack = (x, y) => {
      tile(x, y - T, 132, y); tile(x, y, 148, y);
    };

    // 一个完整工位 = 桌 + 桌上显示器/键盘 + 桌前的椅子（照 LimeZu 官方示例的组合方式）
    // south 工位：黑椅背在桌南(玩家看到椅背) / north 工位：灰圆背椅正面在桌北
    const workstation = (x, y, deskKey, monKey, side = 'south') => {
      place(deskKey, x, y);                       // 桌
      deco(monKey, x - 8, y - 18);                // 显示器(桌面偏左)
      deco('keyboard', x + 14, y - 4, FSCALE * 0.8); // 键盘(桌面偏右)
      if (side === 'south') chairBack(x, y + 46);
      else place('chair_down', x, y - 54, FSCALE * 0.85);
    };

    // ============================================================
    // 布局蓝图（960×640，参考 LimeZu 官方 Office_Design 示例的分区语言）：
    //   ┌────────────────────────────┬───────────────┐
    //   │ 会议角(画架白板+双屏+地毯)   │ 茶水间(右上)   │
    //   ├────────────────────────────┤ 饮水/售货/冰箱 │
    //   │ 工位区 2 组×3 列 背靠背      ├───────────────┤
    //   │ (老陈第一排,江野第二组)      │ 书柜墙(右侧)   │
    //   ├────────────────────────────┴───────────────┤
    //   │ 入口(下门) · 复印/服务器角 · 沙发休息区       │
    //   └─────────────────────────────────────────────┘
    // ============================================================

    // === 左上:会议角 ===
    deco('rug', 210, 158, FSCALE * 1.6, 1);          // 地毯(垫底)
    place('easel_a', 130, 112, FSCALE * 0.95);       // 画架白板×2 贴上墙
    place('easel_b', 215, 112, FSCALE * 0.95);
    place('duoscreen_dark', 315, 116, FSCALE * 0.95);// 双屏演示架
    deco('cert_a', 400, 92, FSCALE * 0.75, 12);      // 墙面证书
    deco('cert_b', 452, 92, FSCALE * 0.75, 12);
    place('sofa_1', 130, 200, FSCALE * 0.95);        // 会议角坐凳
    place('bench', 215, 202, FSCALE * 0.95);         // 木长凳
    plant2(300, 205, ...PLANT.fern);                 // 绿植点缀

    // === 右上:茶水间 ===
    place('water', 780, 122, FSCALE * 0.95);
    place('vending', 852, 118, FSCALE * 1.0);
    place('fridge_dark', 918, 118, FSCALE * 1.0);
    plant2(730, 200, ...PLANT.big);

    // === 中部:工位区——2 组 × 3 列,背靠背 ===
    this.deskCols = [200, 420, 640];
    const gA = 285, gB = 345;   // 第一组两排 y
    const gC = 465, gD = 525;   // 第二组两排 y
    this.deskRows = [gA, gC, gD]; // NPC 站位引用(行0=gA,行1=gC)
    const deskKeys = ['desk_wood', 'desk_gray'];
    const monKeys = ['mon_a', 'mon_b'];
    this.deskCols.forEach((cx, ci) => {
      // 组1:上排椅在南(朝上坐,面向桌子) / 下排椅在北(朝下坐) → 背靠背
      workstation(cx, gA, deskKeys[ci % 2], monKeys[ci % 2], 'south');
      workstation(cx, gB + 8, deskKeys[(ci + 1) % 2], monKeys[(ci + 1) % 2], 'north');
      // 组2
      workstation(cx, gC, deskKeys[(ci + 1) % 2], monKeys[ci % 2], 'south');
      workstation(cx, gD + 8, deskKeys[ci % 2], monKeys[(ci + 1) % 2], 'north');
    });
    // 桌面点缀(散落感:文件/台灯/笔电/座机)
    deco('papers', this.deskCols[0] + 42, gA - 10, FSCALE * 0.75);
    deco('laptop', this.deskCols[1] + 40, gB - 4, FSCALE * 0.7);
    deco('lamp', this.deskCols[1] + 44, gC - 10, FSCALE * 0.7);
    deco('deskscreen', this.deskCols[2] + 42, gA - 8, FSCALE * 0.65);
    deco('papers', this.deskCols[2] + 42, gD - 4, FSCALE * 0.7);

    // === 右侧:白置物架墙(官方 13,7-14,8 的 2×2 货架) ===
    shelfWhite(MW - 70, 300);
    shelfWhite(MW - 70, 400);
    place('cab_wood', MW - 66, 490, FSCALE * 0.95);

    // === 左侧:绿植带(office_16 真·盆栽,两瓦竖叠) ===
    plant2(62, 280, ...PLANT.big);
    plant2(62, 390, ...PLANT.fern);
    plant2(62, 500, ...PLANT.bamboo);

    // === 底部:入口两侧 ===
    // 左下:设备角(复印机+服务器+传真)
    place('copier', 140, 590, FSCALE * 1.0);
    place('server', 225, 588, FSCALE * 0.95);
    place('fax', 295, 585, FSCALE * 0.8);
    // 右下:休息区(L 沙发 + 盆栽)
    place('sofa_L', 800, 590, FSCALE * 1.1);
    plant2(890, 585, ...PLANT.big);
  }

  // ==================== 玩家 ====================
  _createPlayer() {
    // 四向走路动画：全部来自 Row1 的稳定帧组（质心恒定，不再分裂）
    for (const [dir, [s, e]] of Object.entries(WALK)) {
      this.anims.create({
        key: `walk_${dir}`,
        frames: this.anims.generateFrameNumbers('adam', { start: s, end: e }),
        frameRate: 10, repeat: -1, // 10fps 配 130px/s 步频更贴地，消除"漂"感
      });
    }

    this.player = this.physics.add.sprite(MW / 2, MH - 70, 'adam', IDLE.down);
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

    // 站位与新布局对齐；名字/头衔/寒暄按职业主题注入——
    // 每个职业进来遇到的是"自己行业的人"。
    const theme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    const [seniorName, seniorTitle] = theme.npcs.senior;
    const [peerName, peerTitle] = theme.npcs.peer;
    const [vetName, vetTitle] = theme.npcs.vet;
    const defs = [
      {
        id: 'senior', name: seniorName, tex: 'bob',
        x: C[1], y: R[0] + 58, facing: 'down',
        label: `${seniorName} · ${seniorTitle}`, mark: '❗', markColor: '#ffdd33',
        act: 1, // 走近报到 → 播第一幕
      },
      {
        id: 'peer', name: peerName, tex: 'alex',
        x: C[0], y: R[1] + 58, facing: 'down',
        label: `${peerName} · ${peerTitle}`, mark: '💬', markColor: '#7ec8ff',
        line: theme.peerLine,
      },
      {
        id: 'vet', name: vetName, tex: 'amelia',
        x: 800, y: 195, facing: 'down',
        label: `${vetName} · ${vetTitle}`, mark: '💬', markColor: '#7ec8ff',
        line: theme.vetLine,
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

    // HUD 随对话状态自动让路（半透明），单点同步不怕遗漏
    if (this.statusUI && this._lastDim !== this.dialogueActive) {
      this._lastDim = this.dialogueActive;
      this.statusUI.setDimmed(this.dialogueActive);
    }

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
      if (this.player.anims.isPlaying) {
        this.player.anims.stop();
        this.player.setFrame(IDLE[this.facing] ?? IDLE.down);
      }
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
      // 停步：停动画并回到该朝向的 idle 帧（不再定格在走路中间帧）
      if (this.player.anims.isPlaying) {
        this.player.anims.stop();
        this.player.setFrame(IDLE[this.facing] ?? IDLE.down);
      }
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
      // 轻量职业单文件；深度职业按幕分文件
      const url = LIGHT_CAREERS.includes(this.career)
        ? `./data/light_${this.career}.json`
        : `./data/${this.career}_act${this.act}.json`;
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
