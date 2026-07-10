import Phaser from 'phaser';
import { StateSystem } from '../systems/StateSystem.js';
import { StatusBarUI } from '../systems/StatusBarUI.js';
import { DialogueEngine } from '../systems/DialogueEngine.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { PhoneMessage } from '../systems/PhoneMessage.js';
import { FamilyMessages } from '../systems/FamilyMessages.js';
import { TouchControls } from '../systems/TouchControls.js';
import { Juice } from '../systems/JuiceKit.js';
import { SceneRouter } from '../systems/SceneRouter.js';
import { SceneBackdrop } from '../systems/SceneBackdrop.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { ChoiceLog } from '../systems/ChoiceLog.js';
import { ThoughtSystem } from '../systems/ThoughtSystem.js';
import { AIClient } from '../systems/AIClient.js';
import { DaySystem } from '../systems/DaySystem.js';
import { bottomGuideFromGoal } from '../systems/StoryProgress.js';

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

const MW = 1280, MH = 960; // SkyOffice 地图像素尺寸（40×30 tiles @ 32px）
const SCALE = 2;       // 角色缩放（LimeZu 16×32 → 32×64，与 32px 地图协调）
// 出生点 + NPC 站位（均为脚本验证过的可行走空地，非碰撞、非家具占用）：
const SPAWN = { x: 752, y: 600 };  // 中央走廊下段，靠入口
const NPC_POS = {
  senior: { x: 1008, y: 400 }, // 资深：右侧开放工位区（报到目标）
  peer:   { x: 752, y: 528 },  // 同事：中央走廊
  vet:    { x: 240, y: 656 },  // 前辈：左下会议区
};
// 背景群演（让办公室有"活人"氛围）：坐/站在开放区的路人同事，纯装饰不可交互。
const EXTRA_WORKERS = [
  { x: 848, y: 368, tex: 'amelia' },
  { x: 1136, y: 400, tex: 'bob' },
  { x: 976, y: 560, tex: 'alex' },
];

// idle 帧（LimeZu Row0，逐帧目检）：f0=右 f1=上 f2=左 f3=下
const IDLE = { right: 0, up: 1, left: 2, down: 3 };
// 走路帧组（LimeZu Row1，f24-47 每 6 帧一向）：右/上/左/下
const WALK = { right: [24, 29], up: [30, 35], left: [36, 41], down: [42, 47] };

// 皮肤注册表：统一支持两种素材源，创建角色时按 type 分派动画。
// - limezu：单张 spritesheet 用帧号（16×32），走 WALK / idle IDLE
// - skyoffice：atlas 用帧名（32×48，动作更精细，6 帧/向）
//   idle: r0-5/u6-11/l12-17/d18-23  run: r24-29/u30-35/l36-41/d42-47
const SKINS = {
  // LimeZu 4 款（现有，捏人已用）
  adam:   { type: 'limezu', scale: 2 },
  alex:   { type: 'limezu', scale: 2 },
  amelia: { type: 'limezu', scale: 2 },
  bob:    { type: 'limezu', scale: 2 },
  // SkyOffice 4 款（新，更精细）。tex=纹理key(so_前缀)，cap=帧名用的首字母大写名。
  so_adam:  { type: 'skyoffice', tex: 'so_adam',  cap: 'Adam',  scale: 1.4 },
  so_ash:   { type: 'skyoffice', tex: 'so_ash',   cap: 'Ash',   scale: 1.4 },
  so_lucy:  { type: 'skyoffice', tex: 'so_lucy',  cap: 'Lucy',  scale: 1.4 },
  so_nancy: { type: 'skyoffice', tex: 'so_nancy', cap: 'Nancy', scale: 1.4 },
};
// SkyOffice 走路(run)每向 6 帧：右1-6 上7-12 左13-18 下19-24（idle 同理，另一套帧名）
const SKY_DIR_START = { right: 1, up: 7, left: 13, down: 19 };

// 为某皮肤建四向走路+idle 动画（幂等，key 前缀带皮肤名）。
// 返回 { walkPrefix, tex, idleFrame(dir) }：idleFrame 是"停步显示帧"（limezu 返回帧号，skyoffice 返回帧名）。
function ensureSkinAnims(scene, skinKey) {
  const s = SKINS[skinKey];
  if (!s) return null;
  if (s.type === 'limezu') {
    for (const [dir, [a, b]] of Object.entries(WALK)) {
      const k = `walk_${skinKey}_${dir}`;
      if (!scene.anims.exists(k)) scene.anims.create({
        key: k, frames: scene.anims.generateFrameNumbers(skinKey, { start: a, end: b }), frameRate: 10, repeat: -1,
      });
    }
    return { walkPrefix: `walk_${skinKey}`, tex: skinKey, idleFrame: (d) => IDLE[d] ?? IDLE.down };
  }
  // skyoffice atlas：帧名 {Cap}_run_{n}.png / {Cap}_idle_anim_{n}.png
  for (const [dir, start] of Object.entries(SKY_DIR_START)) {
    const k = `walk_${skinKey}_${dir}`;
    if (!scene.anims.exists(k)) scene.anims.create({
      key: k,
      frames: scene.anims.generateFrameNames(s.tex, { prefix: `${s.cap}_run_`, suffix: '.png', start, end: start + 5 }),
      frameRate: 10, repeat: -1,
    });
  }
  return {
    walkPrefix: `walk_${skinKey}`, tex: s.tex,
    idleFrame: (d) => `${s.cap}_idle_anim_${SKY_DIR_START[d] ?? SKY_DIR_START.down}.png`,
  };
}

// 轻量职业：单文件全剧情（data/light_*.json），无分幕；深度职业走 {career}_act{n}.json
const LIGHT_CAREERS = ['designer', 'operation', 'teacher', 'doctor', 'civilservant', 'sales', 'lawyer'];

// 深度职业每幕需要"经营"几天（下班睡觉推进）才解锁下一幕剧情——让剧情有节奏、天数有意义。
// 入职(act1)当天播完就过1天；上手/消耗/至暗各2天；抉择(act5)当天。一段职业生涯约 8 天。
const ACT_DAYS = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 1 };

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
    // 多天循环：从 CommuteScene 传入的 day + stats 快照（有则用，无则从存档/默认）
    this._incomingDay = (data && data.day) || null;
    this._incomingStats = (data && data.stats) || null;
    // 剧情状态机（消除"一口气读完整幕"）：ready=待播本幕剧情 / working=经营期(剧情已播,过日子)
    this._story = { phase: 'ready', act: 1, daysInAct: 0 };
    this._savedStats = null;
    this._savedQuests = null;
    this._savedChoiceLog = null;
    this._savedThought = null;
    this._savedDay = null;
    try {
      const saved = SaveSystem.load();
      // 同职业续档 → 恢复全部进度；换职业 → 清旧档、全新开始（避免串档）
      const sameCareer = saved && saved.career === this.career;
      if (sameCareer) {
        this._savedStats = saved.stats || null;   // 不再用 act 判据（BUG-9：换幕续档不丢血）
        this._savedQuests = saved.quests || null;
        this._savedChoiceLog = saved.choiceLog || null;
        this._savedThought = saved.thought || null;
        this._savedDay = saved.daySystem || null;
        if (saved.story) this._story = { ...this._story, ...saved.story };
      } else if (saved) {
        SaveSystem.clear(); // 换职业：清掉上一个职业的进度
      }
    } catch (e) {}
    // story.act 是权威幕次
    this.act = this._story.act || this.act;
    // 进场即存档（合并写，保留未提供字段）
    SaveSystem.saveProgress({
      career: this.career, act: this.act, stats: this._savedStats,
      extra: { quests: this._savedQuests, choiceLog: this._savedChoiceLog, thought: this._savedThought, daySystem: this._savedDay, story: this._story },
    });
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
    // ===== SkyOffice 成品办公室地图（MIT 许可）+ 其 tileset（frame 均 32×32，物件除外）=====
    // 专业设计的多区办公室：开放工位/会议室/休息室/老板办公室，一次加载全套。
    const SO = './assets/skyoffice';
    this.load.tilemapTiledJSON('office_map', `${SO}/map/map.json`);
    this.load.spritesheet('tiles_wall', `${SO}/map/FloorAndGround.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('so_office', `${SO}/tileset/Modern_Office_Black_Shadow.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('so_generic', `${SO}/tileset/Generic.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('so_basement', `${SO}/tileset/Basement.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('so_chairs', `${SO}/items/chair.png`, { frameWidth: 32, frameHeight: 64 });
    this.load.spritesheet('so_computers', `${SO}/items/computer.png`, { frameWidth: 96, frameHeight: 64 });
    this.load.spritesheet('so_whiteboards', `${SO}/items/whiteboard.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('so_vending', `${SO}/items/vendingmachine.png`, { frameWidth: 48, frameHeight: 72 });
    // SkyOffice 4 角色 atlas（更精细动画，捏人可选）。
    // ⚠️ 纹理 key 加 so_ 前缀，避免与 LimeZu 的 'adam' spritesheet 冲突。
    for (const c of ['adam', 'ash', 'lucy', 'nancy']) {
      this.load.atlas(`so_${c}`, `${SO}/character/${c}.png`, `${SO}/character/${c}.json`);
    }
  }

  create() {
    AudioSystem.playBgm('office');

    // 安全清场：确保菜单类场景不残留叠加渲染（防标题文字漏进办公室）
    for (const k of ['TitleScene', 'OpeningScene', 'HubScene']) {
      if (this.scene.isActive(k) || this.scene.isVisible(k)) this.scene.stop(k);
    }

    this._buildMap();       // SkyOffice tilemap：地板 + 墙碰撞 + 物件层
    this._createPlayer();
    this._createNpcs();

    // 设计分辨率 1920×1080；camera zoom 1.6 让视口显示约 1200×675 世界单位，
    // 既看得清家具细节又有足够视野，渲染在真实像素上 = 锐利。
    this.cameras.main.setZoom(1.6);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, MW, MH);

    // 核心系统（状态 + 状态条 HUD + 对话引擎）
    this.stateSystem = new StateSystem();
    // 状态恢复优先级：通勤场景传入的快照 > 存档 > 默认（保证跨场景数值连续）
    if (this._incomingStats) this.stateSystem.restore(this._incomingStats);
    else if (this._savedStats) this.stateSystem.restore(this._savedStats);
    // 多天循环系统（day 从通勤场景传入或存档恢复）
    this.daySystem = new DaySystem();
    if (this._savedDay) this.daySystem.restore(this._savedDay);
    if (this._incomingDay) this.daySystem.day = this._incomingDay;
    this.daySystem.setPhase('work'); // 进办公室即 work 阶段
    this.daySystem.energyBudget = 100; // 每次进办公室=一天工作的开始，精力预算满
    this._exhaustedPrompted = false;
    this.statusUI = new StatusBarUI(this, this.stateSystem);
    this.dialogueEngine = new DialogueEngine(this, this.stateSystem);
    this._setupDialogueEvents();
    // 家人消息：数据层（异步加载）+ UI 层（仿微信弹窗）
    this.familyMessages = new FamilyMessages();
    this.phoneMessage = new PhoneMessage(this);
    // 预加载消息数据（不阻塞 create）
    this.familyMessages.load();
    // 状态触底监听：health/san/passion 跌破 20 时推送一条"至暗"家人消息
    this.stateSystem.on('threshold', (info) => this._onStateThreshold(info));
    this._phoneTriggeredFor = new Set(); // 去重：每个状态键只触发一次危机消息
    // 任务系统 + 选择记忆（结局 AI 画像的数据源）
    this.questSystem = new QuestSystem(this.stateSystem);
    this.choiceLog = new ChoiceLog();
    this._loadQuestData();
    // 任务完成时反馈（粒子+音效）
    this.questSystem.on('completed', (id) => {
      Juice.celebrate(this, this.player.x, this.player.y - 30, 0xffd24d);
    });
    // 内心独白系统（思维内阁）+ 可交互物件
    this.thoughtSystem = new ThoughtSystem();
    this._loadThoughtData();
    this._loadInteractables();
    this._interactables = [];       // 场景中的交互物件 sprite 列表
    this._cooldowns = {};           // 物件冷却记录 { id: true }（daily 冷却，跨天清）
    this._lastThoughtTime = 0;      // 上次思维气泡时间（节流）

    // 交互键
    this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.tKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T); // T=倾听内心（思维内阁）

    // ===== 双相机架构：main 相机 zoom 2 渲染世界，uiCamera 原生 1:1 渲染 HUD =====
    // 主相机放大世界会连带放大钉屏 UI，故 HUD 交给独立的满分辨率 UI 相机，二者互相 ignore。
    const SW = this.scale.width, SH = this.scale.height; // 1920×1080 屏幕坐标系
    this.uiObjects = [];
    const trackUI = (o) => { this.uiObjects.push(o); return o; };

    // 环境滤镜层（bgChange 真换景）+ 情绪染色层（状态演出）——钉屏、UI相机、低 depth 作氛围底。
    // 用颜色叠加程序化地表现"晨街/大堂/深夜"和"压力/耗竭/心流"，不需要新美术。
    this._ambientOverlay = trackUI(this.add.rectangle(SW / 2, SH / 2, SW, SH, 0xffffff, 0)
      .setScrollFactor(0).setDepth(500));
    this._moodTint = trackUI(this.add.rectangle(SW / 2, SH / 2, SW, SH, 0xffffff, 0)
      .setScrollFactor(0).setDepth(501));
    this._moodState = null;      // 当前情绪演出态（避免每帧重设 tween）
    this._lastHeartbeat = 0;     // 压力心跳音效节流
    // 程序化场景背景：剧情演到通勤/大堂/家/医院等非办公室场景时，盖对应场景画面
    this.sceneBackdrop = new SceneBackdrop(this);

    // 操作提示（屏幕顶部居中）
    trackUI(this.add.text(SW / 2, 14, 'WASD 移动 · E 交互 · T 倾听内心 · ESC 菜单', {
      fontSize: '22px',
      fill: '#dfe3ff',
      backgroundColor: '#000000aa',
      padding: { x: 14, y: 7 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9999));

    // 天数/时段 HUD（屏幕右上角）
    this.dayText = trackUI(this.add.text(SW - 20, 16, '', {
      fontSize: '22px', fill: '#ffe08a', backgroundColor: '#00000099', padding: { x: 14, y: 7 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(9999));
    this._updateDayHud();

    // "下班回家"按钮（屏幕右上角，天数下方）
    this.offWorkBtn = trackUI(this.add.text(SW - 20, 64, '🏠 下班回家', {
      fontSize: '20px', fill: '#dfe3ff', backgroundColor: '#3a3a5aee', padding: { x: 14, y: 8 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(9999).setInteractive({ useHandCursor: true }));
    this.offWorkBtn.on('pointerover', () => this.offWorkBtn.setBackgroundColor('#4a4a7aee'));
    this.offWorkBtn.on('pointerout', () => this.offWorkBtn.setBackgroundColor('#3a3a5aee'));
    this.offWorkBtn.on('pointerdown', () => this._goHome());

    // 引导语（屏幕底部）——按职业主题生成"找谁报到"
    const gTheme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    const [gName, gTitle] = gTheme.npcs.senior;
    this.guideText = trackUI(this.add.text(SW / 2, SH - 90, `📋 新人报到:去找${gTitle}「${gName}」(头顶有 ❗),走近按 E`, {
      fontSize: '22px',
      fill: '#ffe08a',
      backgroundColor: '#00000099',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(9999));

    // "按 E 交谈"浮标（屏幕中下，默认隐藏）
    this.ePrompt = trackUI(this.add.text(SW / 2, SH - 150, '［ E ］交谈', {
      fontSize: '28px',
      fill: '#ffffff',
      backgroundColor: '#2a6fd6ee',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(9999).setVisible(false));

    // 素材署名（屏幕右下角小字）
    trackUI(this.add.text(SW - 10, SH - 6, 'Art: LimeZu · Kenney', {
      fontSize: '14px', fill: '#7a7a8a',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(9999));

    // HUD（StatusBarUI 的 mini/panel 容器）也归 UI 相机
    if (this.statusUI) {
      if (this.statusUI.mini) trackUI(this.statusUI.mini);
      if (this.statusUI.panel) trackUI(this.statusUI.panel);
    }

    // 建 UI 相机：主相机忽略所有 UI；UI 相机忽略当前所有世界对象（快照）。
    this.uiCamera = this.cameras.add(0, 0, SW, SH);
    this.uiCamera.setScroll(0, 0);
    this.cameras.main.ignore(this.uiObjects);
    this._worldObjects = this.children.list.filter(o => !this.uiObjects.includes(o));
    this.uiCamera.ignore(this._worldObjects);

    // 移动端触屏控制（摇杆+按钮）：非触屏设备自动空跑，不影响键盘
    this.touchControls = new TouchControls(this);
    this.touchControls.onInteract(() => {
      if (this.dialogueActive) return;
      if (this.activeNpc) this._interact(this.activeNpc);
      else if (this.activeObject) this._interactObject(this.activeObject);
    });
    this.touchControls.onMenu(() => {
      if (!this.dialogueActive) {
        this.scene.pause();
        this.scene.launch('PauseScene', {
          origin: 'WorldScene',
          stateSystem: this.stateSystem,
          career: this.career,
          act: this.act,
          questSystem: this.questSystem,
          choiceLog: this.choiceLog,
        });
      }
    });

    // 调试自验证钩子:?autochen=1 → 传送到报到 NPC 并自动触发第一幕(仅用于截图验证)
    if (typeof window !== 'undefined' && window.location.search.includes('autochen=1')) {
      const chen = this.npcs.find(n => n.id === 'senior');
      if (chen) {
        this.player.setPosition(chen.spr.x, chen.spr.y + 40);
        this.time.delayedCall(800, () => this._interact(chen));
      }
    }

    // 首次游玩：新手引导 overlay（只在第一次进办公室显示，之后记 localStorage 不再弹）
    this._maybeShowOnboarding();
  }

  // 新手引导：首次进办公室弹一次操作教学，逐步揭示机制（onboarding）。
  _maybeShowOnboarding() {
    let seen = false;
    try { seen = localStorage.getItem('wdwtb_onboarded') === '1'; } catch (e) {}
    if (seen) return;
    const { width: W, height: H } = this.scale;
    // 冻结玩家 + 隐藏游戏 HUD，让引导独占画面（否则和 HUD/剧情糊在一起，第一眼很乱）
    this.dialogueActive = true;
    this._hudHiddenForOnboard = [this.ePrompt, this.guideText, this.offWorkBtn, this.dayText];
    if (this.statusUI) { if (this.statusUI.mini) this._hudHiddenForOnboard.push(this.statusUI.mini); if (this.statusUI.panel) this._hudHiddenForOnboard.push(this.statusUI.panel); }
    this._hudHiddenForOnboard.forEach(o => o && o.setVisible(false));

    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(11000);
    const mask = this.add.rectangle(W / 2, H / 2, W, H, 0x08080f, 0.94).setInteractive(); // 近乎不透，盖住一切
    c.add(mask);
    // 内容卡片（给文字一个容器，清晰不糊）
    c.add(this.add.rectangle(W / 2, H / 2, 760, 420, 0x16161f, 0.98).setStrokeStyle(2, 0x3a3a5a));
    const steps = [
      { icon: '🎮', title: '欢迎来到你的第一天', text: '这是一段关于「你想成为谁」的职场旅程。\n没有标准答案，只有你的选择。' },
      { icon: '🚶', title: '自由探索', text: 'WASD / 方向键 移动 · Shift 冲刺。\n手机上用左下角的虚拟摇杆。' },
      { icon: '💬', title: '与人互动', text: '走近头顶有 ❗/❓ 的同事，按 E 交谈、接任务、交付。\n底部黄条会提示「现在该干什么」。' },
      { icon: '💻', title: '工位上干活', text: '接到干活任务后，走近头顶 💻 的电脑浮标，按 E：\n可做 coding 小游戏 / 提交代码（推进任务）。\n售货机 🥤、白板 📋、咖啡 ☕ 也能按 E 交互。' },
      { icon: '🧠', title: '状态与内心', text: '左上角状态条：精力/压力会变；Tab 可展开。\n按 T 倾听内心；ESC 打开任务日志。' },
      { icon: '🌙', title: '经营你的每一天', text: '右上角「下班回家」可休息、见家人、进入下一天。\n建议先完成当前目标再下班——一天才有故事。' },
    ];
    let idx = 0;
    const iconT = this.add.text(W / 2, H / 2 - 130, '', { fontSize: '64px' }).setOrigin(0.5);
    const titleT = this.add.text(W / 2, H / 2 - 46, '', { fontSize: '32px', color: '#ffd24d', fontStyle: 'bold' }).setOrigin(0.5);
    const bodyT = this.add.text(W / 2, H / 2 + 28, '', { fontSize: '22px', color: '#e8e8f4', align: 'center', lineSpacing: 12, wordWrap: { width: 640 } }).setOrigin(0.5);
    const dotsT = this.add.text(W / 2, H / 2 + 120, '', { fontSize: '16px', color: '#5a5a7a' }).setOrigin(0.5);
    const hintT = this.add.text(W / 2, H / 2 + 160, '点击继续 →', { fontSize: '18px', color: '#8b8ba0' }).setOrigin(0.5);
    c.add([iconT, titleT, bodyT, dotsT, hintT]);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    const render = () => {
      const s = steps[idx];
      iconT.setText(s.icon); titleT.setText(s.title); bodyT.setText(s.text);
      dotsT.setText(steps.map((_, i) => i === idx ? '●' : '○').join(' '));
      hintT.setText(idx < steps.length - 1 ? '点击继续 →' : '开始 ✓');
      Juice.pop(this, iconT, 1);
    };
    const finish = () => {
      try { localStorage.setItem('wdwtb_onboarded', '1'); } catch (e) {}
      c.destroy(true);
      // 恢复 HUD + 解冻
      (this._hudHiddenForOnboard || []).forEach(o => o && o.setVisible(true));
      if (this.ePrompt) this.ePrompt.setVisible(false); // ePrompt 由交互逻辑控制，默认隐藏
      this.dialogueActive = false;
      this._syncGuideText(); // 引导结束后用真实下一步覆盖静态「新人报到」
    };
    const advance = () => { idx++; if (idx >= steps.length) finish(); else render(); };
    render();
    this.time.delayedCall(100, () => mask.on('pointerdown', advance));
  }

  // 把动态 UI（对话框/仪式弹窗/气泡）指派给 UI 相机：
  // main 相机忽略它（不受 zoom 影响）、uiCamera 渲染它（屏幕坐标、满分辨率、锐利）。
  // 传 Container 或对象数组均可。
  attachToUICamera(objOrArr) {
    if (!this.uiCamera) return;
    const arr = Array.isArray(objOrArr) ? objOrArr : [objOrArr];
    this.cameras.main.ignore(arr);
    // uiCamera 之前 ignore 了世界快照；新 UI 对象不在快照里，故 uiCamera 默认会渲染它——无需额外处理。
  }

  // ==================== SkyOffice 成品办公室地图（MIT）====================
  // 用 Phaser 原生 tilemap 加载专业设计的多区办公室：地板 tile 层 + 墙碰撞 +
  // 各物件层（桌椅/电脑/白板/售货机等）。逻辑移植自 SkyOffice Game.ts（同源素材）。
  _buildMap() {
    const map = this.make.tilemap({ key: 'office_map' });
    this.officeMap = map;

    // 地板层：FloorAndGround tileset，带 collides 属性的瓦片作墙壁碰撞
    const floorTs = map.addTilesetImage('FloorAndGround', 'tiles_wall');
    const ground = map.createLayer('Ground', floorTs).setDepth(0);
    ground.setCollisionByProperty({ collides: true });
    this.groundLayer = ground;

    // 物件层 → staticGroup，逐个按 gid 摆放（origin 左下 → 中心换算）。
    // collidable 的层加入碰撞组，供 _createPlayer 后与玩家碰撞。
    this.solidGroups = [];
    // collidable=true 的层加入碰撞组；bodyScale 收缩碰撞体（贴合家具实体、
    // 不"隔空挡路"，避免玩家被家具周围的空气挡住）。
    const addGroup = (layerName, sheetKey, tilesetName, collidable, bodyScale = 0.8) => {
      const ts = map.getTileset(tilesetName);
      if (!ts) return;
      const group = this.physics.add.staticGroup();
      const layer = map.getObjectLayer(layerName);
      if (!layer) return;
      layer.objects.forEach((o) => {
        const ax = o.x + o.width * 0.5;
        const ay = o.y - o.height * 0.5;
        const img = group.get(ax, ay, sheetKey, o.gid - ts.firstgid);
        if (!img) return;
        img.setDepth(ay);
        if (collidable && img.body) {
          // 碰撞体收缩到家具实体大小并对齐底部（脚下挡人，头顶不挡）
          const bw = img.displayWidth * bodyScale;
          const bh = img.displayHeight * bodyScale;
          img.body.setSize(bw, bh);
          img.body.setOffset((img.displayWidth - bw) / 2, img.displayHeight - bh);
          img.body.updateFromGameObject();
        }
      });
      if (collidable) this.solidGroups.push(group);
    };

    // 墙 + 各类家具物件。桌(Objects)、椅(Chair) 现在都挡人（修穿模），
    // 桌用较大碰撞体、椅用较小（椅子矮小只挡一点，不把办公室变迷宫）。
    addGroup('Wall', 'tiles_wall', 'FloorAndGround', true, 0.9);
    addGroup('Objects', 'so_office', 'Modern_Office_Black_Shadow', true, 0.82);
    addGroup('ObjectsOnCollide', 'so_office', 'Modern_Office_Black_Shadow', true, 0.82);
    addGroup('GenericObjects', 'so_generic', 'Generic', true, 0.8);
    addGroup('GenericObjectsOnCollide', 'so_generic', 'Generic', true, 0.8);
    addGroup('Basement', 'so_basement', 'Basement', true, 0.85);
    // 椅子/电脑/白板/售货机
    addGroup('Chair', 'so_chairs', 'chair', true, 0.55);
    addGroup('Computer', 'so_computers', 'computer', true, 0.8);
    addGroup('Whiteboard', 'so_whiteboards', 'whiteboard', true, 0.8);
    addGroup('VendingMachine', 'so_vending', 'vendingmachine', true, 0.85);

    // 职业氛围光：极淡全屏色调（保留职业差异化的"行业气质"）
    const theme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    if (theme.tint) {
      this.add.rectangle(0, 0, MW, MH, theme.tint, 0.05).setOrigin(0).setDepth(1);
    }
  }

  // ==================== 玩家 ====================
  _createPlayer() {
    // 主角皮肤 = 捏人选的形象（wdwtb_profile.avatar.skinKey）,默认 adam
    let skinKey = 'adam', skinTint = null;
    try {
      const prof = JSON.parse(localStorage.getItem('wdwtb_profile') || '{}');
      if (prof?.avatar?.skinKey && SKINS[prof.avatar.skinKey]) {
        skinKey = prof.avatar.skinKey;
        skinTint = prof.avatar.tint || null;
      }
    } catch (e) {}

    // 用皮肤注册表建动画（自动分派 limezu 帧号 / skyoffice 帧名）
    const skin = ensureSkinAnims(this, skinKey) || ensureSkinAnims(this, 'adam');
    this.playerSkin = skin;
    this.walkPrefix = skin.walkPrefix;
    const s = SKINS[skinKey] || SKINS.adam;

    this.player = this.physics.add.sprite(SPAWN.x, SPAWN.y, skin.tex).setFrame(skin.idleFrame('down'));
    if (skinTint) this.player.setTint(skinTint);
    this.player.setScale(s.scale ?? SCALE);
    this.player.setCollideWorldBounds(true);
    // 碰撞体=脚底一小块（两种素材尺寸不同，按显示高度比例取底部）
    const fw = this.player.displayWidth, fh = this.player.displayHeight;
    this.player.body.setSize(fw * 0.4 / this.player.scaleX, fh * 0.25 / this.player.scaleY);
    this.player.body.setOffset(fw * 0.3 / this.player.scaleX, fh * 0.7 / this.player.scaleY);

    this.physics.world.setBounds(0, 0, MW, MH);
    // 与地板墙碰撞层 + 各碰撞物件组碰撞（替代旧的 this.obstacles）
    if (this.groundLayer) this.physics.add.collider(this.player, this.groundLayer);
    if (this.solidGroups) this.solidGroups.forEach(g => this.physics.add.collider(this.player, g));

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.facing = 'down';
  }

  // ==================== NPC ====================
  _createNpcs() {
    // 站位用 NPC_POS（SkyOffice 地图的可行走空地）；名字/头衔/寒暄按职业主题注入。
    const theme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    const [seniorName, seniorTitle] = theme.npcs.senior;
    const [peerName, peerTitle] = theme.npcs.peer;
    const [vetName, vetTitle] = theme.npcs.vet;
    // NPC 用不同皮肤增加多样（senior 用精细 SkyOffice，其余混搭）
    const defs = [
      {
        id: 'senior', name: seniorName, skin: 'so_adam',
        x: NPC_POS.senior.x, y: NPC_POS.senior.y, facing: 'down',
        label: `${seniorName} · ${seniorTitle}`, mark: '❗', markColor: '#ffdd33',
        act: 1, // 走近报到 → 播第一幕
      },
      {
        id: 'peer', name: peerName, skin: 'so_nancy',
        x: NPC_POS.peer.x, y: NPC_POS.peer.y, facing: 'down',
        label: `${peerName} · ${peerTitle}`, mark: '💬', markColor: '#7ec8ff',
        line: theme.peerLine,
      },
      {
        id: 'vet', name: vetName, skin: 'so_lucy',
        x: NPC_POS.vet.x, y: NPC_POS.vet.y, facing: 'down',
        label: `${vetName} · ${vetTitle}`, mark: '💬', markColor: '#7ec8ff',
        line: theme.vetLine,
      },
    ];

    // 用任意皮肤在 (x,y) 放一个静态角色（朝向 idle 帧），返回 sprite
    const placeChar = (x, y, skinKey, facing = 'down') => {
      const sk = ensureSkinAnims(this, skinKey) || ensureSkinAnims(this, 'adam');
      const cfg = SKINS[skinKey] || SKINS.adam;
      return this.add.sprite(x, y, sk.tex).setFrame(sk.idleFrame(facing))
        .setScale(cfg.scale ?? SCALE).setOrigin(0.5, 1).setDepth(y);
    };

    this.npcs = [];
    for (const d of defs) {
      const spr = placeChar(d.x, d.y, d.skin, d.facing);

      // NPC 名牌（脚下小字，1920 尺度）
      const nameTag = this.add.text(d.x, d.y + 8, d.name, {
        fontSize: '13px', color: '#ffffff',
        backgroundColor: '#00000088', padding: { x: 5, y: 2 },
      }).setOrigin(0.5, 0).setDepth(d.y + 1);

      // 头顶交互浮标（上下浮动）
      const markY = d.y - 78;
      const mark = this.add.text(d.x, markY, d.mark, {
        fontSize: '24px', color: d.markColor,
      }).setOrigin(0.5, 1).setDepth(9000);
      this.tweens.add({
        targets: mark, y: markY - 6,
        duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      this.npcs.push({ ...d, spr, mark, nameTag });
    }

    // 背景群演：坐/站在开放区的路人，让办公室"有活人"（纯装饰，混搭皮肤增加多样）
    const workerSkins = ['amelia', 'bob', 'so_ash'];
    EXTRA_WORKERS.forEach((w, i) => placeChar(w.x, w.y, workerSkins[i % workerSkins.length]));
  }

  update(time) {
    if (!this.player?.body) return;

    // 状态即演出：按主导状态染屏 + 音效 + 减速（让状态条"活"起来）
    this._updateMoodFx(time || 0);

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
        questSystem: this.questSystem,
        choiceLog: this.choiceLog,
      });
      return;
    }

    // T=倾听内心：主动触发一次内心独白（思维内阁）
    if (!this.dialogueActive && Phaser.Input.Keyboard.JustDown(this.tKey)) {
      this._triggerMonologue('auto');
      return;
    }

    // 对话中冻结移动，跳过交互检测
    if (this.dialogueActive) {
      this.player.setVelocity(0, 0);
      if (this.player.anims.isPlaying) {
        this.player.anims.stop();
        this.player.setFrame(this.playerSkin.idleFrame(this.facing));
      }
      return;
    }

    // 耗竭时移动变慢（状态演出：身体拖着走）
    const speed = 130 * (this._moodSpeedMul || 1);
    const L = this.cursors.left.isDown || this.wasd.A.isDown;
    const R = this.cursors.right.isDown || this.wasd.D.isDown;
    const U = this.cursors.up.isDown || this.wasd.W.isDown;
    const D = this.cursors.down.isDown || this.wasd.S.isDown;
    // 触屏摇杆：有输入时优先（手机走摇杆，桌面走键盘，二者不冲突）
    const touch = this.touchControls ? this.touchControls.getAxis() : { x: 0, y: 0 };
    const useTouch = Math.abs(touch.x) > 0.15 || Math.abs(touch.y) > 0.15;

    let vx, vy;
    if (useTouch) {
      vx = touch.x * speed;
      vy = touch.y * speed;
      // 摇杆是模拟量，斜向已天然归一化；朝向按主轴吸附到 4 向
      if (Math.abs(touch.x) > Math.abs(touch.y)) this.facing = touch.x > 0 ? 'right' : 'left';
      else if (touch.y !== 0) this.facing = touch.y > 0 ? 'down' : 'up';
    } else {
      vx = (R ? speed : 0) - (L ? speed : 0);
      vy = (D ? speed : 0) - (U ? speed : 0);

      // 八向位移，但动画朝向干净吸附到 4 向之一（LimeZu 无斜向帧，斜走不失真）：
      // 刚按下的方向键优先决定朝向；斜走时以"最新按下的轴"为准，否则保留上一朝向。
      const justDir =
        Phaser.Input.Keyboard.JustDown(this.wasd.A) || Phaser.Input.Keyboard.JustDown(this.cursors.left) ? 'left' :
        Phaser.Input.Keyboard.JustDown(this.wasd.D) || Phaser.Input.Keyboard.JustDown(this.cursors.right) ? 'right' :
        Phaser.Input.Keyboard.JustDown(this.wasd.W) || Phaser.Input.Keyboard.JustDown(this.cursors.up) ? 'up' :
        Phaser.Input.Keyboard.JustDown(this.wasd.S) || Phaser.Input.Keyboard.JustDown(this.cursors.down) ? 'down' : null;
      if (justDir) {
        this.facing = justDir;
      } else if (vx !== 0 || vy !== 0) {
        // 无新按键（持续走）：若当前朝向已无对应输入，回退到仍在按的某个方向
        const stillValid = { left: L, right: R, up: U, down: D }[this.facing];
        if (!stillValid) this.facing = L ? 'left' : R ? 'right' : U ? 'up' : 'down';
      }
    }

    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }
    this.player.setVelocity(vx, vy);
    this.player.setDepth(this.player.y);

    if (vx === 0 && vy === 0) {
      // 停步：停动画并回到该朝向的 idle 帧（不再定格在走路中间帧）
      if (this.player.anims.isPlaying) {
        this.player.anims.stop();
        this.player.setFrame(this.playerSkin.idleFrame(this.facing));
      }
    } else {
      this.player.anims.play(`${this.walkPrefix}_${this.facing}`, true);
    }

    // ---- 交互:找最近可交互 NPC ----
    this._updateInteraction();
  }

  _updateInteraction() {
    const RANGE = 78;
    // 统一交互框架：NPC 和交互物件用同一套 RANGE + [E] 逻辑，取最近的那个。
    let nearest = null, nd = RANGE, nearestType = null;
    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.spr.x, npc.spr.y);
      if (d < nd) { nd = d; nearest = npc; nearestType = 'npc'; }
    }
    for (const obj of (this._interactables || [])) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, obj.x, obj.y);
      if (d < nd) { nd = d; nearest = obj; nearestType = 'object'; }
    }

    this.activeNpc = nearestType === 'npc' ? nearest : null;
    this.activeObject = nearestType === 'object' ? nearest : null;
    if (nearest) {
      const label = nearestType === 'npc' ? `与 ${nearest.name} 交谈` : nearest.prompt;
      this.ePrompt.setText(`［ E ］${label}`).setVisible(true);
      if (this.touchControls) this.touchControls.setInteractVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        if (nearestType === 'npc') this._interact(nearest);
        else this._interactObject(nearest);
      }
    } else {
      this.ePrompt.setVisible(false);
      if (this.touchControls) this.touchControls.setInteractVisible(false);
    }
  }

  // 交互物件触发：执行 def.action。冷却物件每天限一次。
  _interactObject(obj) {
    if (this.dialogueActive) return;
    // 冷却检查（daily）
    if (obj.cooldown === 'daily' && this._cooldowns[obj.id]) {
      this._showThoughtBubble('（这个今天已经用过了。）', '#9a9ac0');
      return;
    }
    const action = obj.action || '';
    // buy_drink：即时状态交易（花 money 换 energy/san）
    if (action === 'buy_drink') {
      const cost = obj.cost || {};
      const money = this.stateSystem.get('money');
      const needMoney = Math.abs(cost.money || 0);
      if (money < needMoney) {
        this._showThoughtBubble('（钱不太够……下次吧。）', '#e8735a');
        return;
      }
      for (const [k, v] of Object.entries(cost)) this.stateSystem.change(k, v);
      for (const [k, v] of Object.entries(obj.effect || {})) this.stateSystem.change(k, v);
      Juice.celebrate(this, this.player.x, this.player.y - 30, 0x6aaa6a);
      this._showLine('', `${obj.icon} 喝下去，精神了一点。`);
      this._afterInteract(obj);
      return;
    }
    // water_plant：复用仪式弹窗 + 状态
    if (action === 'water_plant') {
      for (const [k, v] of Object.entries(obj.effect || {})) this.stateSystem.change(k, v);
      this._showRitual('🌱 你给绿萝浇了水。它好像在灯光下轻轻颤了一下。');
      Juice.burst(this, this.player.x, this.player.y - 20, 0x6aaa6a, 10);
      this._afterInteract(obj);
      return;
    }
    // quest_board：打开任务板（暂停+暂停菜单任务页）
    if (action === 'quest_board') {
      this.scene.pause();
      this.scene.launch('PauseScene', {
        origin: 'WorldScene', stateSystem: this.stateSystem,
        career: this.career, act: this.act,
        questSystem: this.questSystem, choiceLog: this.choiceLog,
        openPanel: 'quests',
      });
      return;
    }
    // monologue:*：触发内心独白（如 phone 打电话回家，附带状态回升）
    if (action.startsWith('monologue')) {
      const key = action.split(':')[1] || 'auto';
      if (obj.effect) for (const [k, v] of Object.entries(obj.effect)) this.stateSystem.change(k, v);
      this._triggerMonologue(key);
      this._afterInteract(obj);
      return;
    }
    // minigame:*：走对话引擎的 action 路由（复用现有逻辑）
    if (action.startsWith('minigame')) {
      this.dialogueEngine.emit('action', action, {});
      this._afterInteract(obj);
      return;
    }
  }

  // 每次成功交互后：设冷却 + 上报 interact 任务进度 + 消耗每日精力预算。
  // 这是"任务=今日工作 + 精力驱动"的接线核心：交互物件完成推进任务，做多了会累该下班。
  _afterInteract(obj) {
    if (obj.cooldown === 'daily') this._cooldowns[obj.id] = true;
    // 上报任务进度（interact 目标——修复"progress('interact') 从未调用"的断裂）
    if (this.questSystem) {
      this.questSystem.progress('interact', obj.id);
      this._updateNpcMarks();
    }
    // 消耗每日精力预算，耗尽提示下班
    if (this.daySystem) {
      const left = this.daySystem.spendEnergy(12);
      this._updateDayHud();
      if (left <= 0 && !this._exhaustedPrompted) {
        this._exhaustedPrompted = true;
        this._showThoughtBubble('（今天有点累了……该下班回家了。）', '#f0c060');
      }
    }
  }

  _interact(npc) {
    if (this.dialogueActive) return;

    // 导师(senior) → 剧情状态机（剧情=里程碑，经营期=日常，交替推进）
    if (npc.id === 'senior' || npc.act) {
      this._interactSenior(npc);
      return;
    }

    // 任务交互：该 NPC 有可交付任务 → 完成；有可接任务 → 接取并寒暄
    if (this.questSystem) {
      const ctx = { act: this.act };
      const mark = this.questSystem.npcMark(npc.id, ctx);
      if (mark === 'deliver') {
        // 交付所有该 NPC 身上已就绪的任务
        for (const q of this.questSystem.active()) {
          if (q.giver === npc.id && this.questSystem.isReady(q.id)) {
            this.questSystem.complete(q.id);
            this._showLine(npc.name, `「${q.title}」完成！${q.reward ? '状态提升。' : ''}`);
            this._updateNpcMarks();
            return;
          }
        }
      }
      if (mark === 'available') {
        // 接取该 NPC 身上第一个可接任务
        for (const q of this.questSystem.available(ctx)) {
          if (q.giver === npc.id) {
            this.questSystem.accept(q.id);
            this._showLine(npc.name, `新任务：「${q.title}」\n${q.desc}`);
            this._updateNpcMarks();
            return;
          }
        }
      }
      // 上报 talk 进度（该 NPC 是某进行中任务的 talk 目标）
      this.questSystem.progress('talk', npc.id);
      this._updateNpcMarks();
    }

    // 其余 NPC → 寒暄。有选择历史时，NPC 可能说一句"记得你做过什么"的个性化台词（AI 生成）。
    if (npc.line) this._showNpcLineWithMemory(npc);
  }

  // ==================== 导师剧情状态机（连贯性核心）====================
  // 让"剧情"成为里程碑、"经营期"成为日常，二者交替推进——消除"一口气读完整幕"。
  // 轻量职业：走近一次播完整单文件到 ending（无经营期）。
  // 深度职业：ready→播本幕剧情→working(经营期，做任务过日子)→天数攒够→播下一幕。
  _interactSenior(npc) {
    // 导师身上有可交付任务 → 优先交付（senior 是多数任务 giver）
    if (this.questSystem) {
      for (const q of this.questSystem.active()) {
        if (q.giver === 'senior' && this.questSystem.isReady(q.id)) {
          this.questSystem.complete(q.id);
          this._showLine(npc.name, `「${q.title}」完成！干得漂亮。`);
          this._updateNpcMarks();
          return;
        }
      }
    }

    // 轻量职业：单文件一次播完
    if (LIGHT_CAREERS.includes(this.career)) {
      this._playStory(`./data/light_${this.career}.json`);
      return;
    }

    // 深度职业状态机
    if (this._story.phase === 'ready') {
      // 播本幕剧情
      this._story.act = this.act;
      this._playStory(`./data/${this.career}_act${this.act}.json`);
      return;
    }
    // working 经营期：检查能否推进下一幕
    if (this._story.phase === 'working') {
      const need = ACT_DAYS[this.act] || 1;
      if (this._story.daysInAct >= need) {
        // 攒够天数 → 推进下一幕：act+1，回到 ready，立即播下一幕剧情
        this.act += 1;
        this._story.act = this.act;
        this._story.phase = 'ready';
        this._story.daysInAct = 0;
        this._persistStory();
        this._playStory(`./data/${this.career}_act${this.act}.json`);
      } else {
        // 未到时候 → 提示还需过几天（引导玩家去做任务、下班睡觉）
        const left = need - this._story.daysInAct;
        this._showLine(npc.name, `这阶段的活儿还没到收尾的时候。\n再忙上${left}天吧——做做手头的任务，累了就下班回家。等你缓过来，我们再聊下一步。`);
      }
      return;
    }
  }

  // 播一段剧情 JSON（提取自原 senior 逻辑）。播完由 dialogueEngine 的 action 驱动后续。
  _playStory(url) {
    this.dialogueActive = true;
    this.ePrompt.setVisible(false);
    if (this.guideText) this.guideText.setVisible(false);
    if (this.offWorkBtn) this.offWorkBtn.setVisible(false); // 剧情场景中隐藏办公室按钮
    fetch(url)
      .then(res => { if (!res.ok) throw new Error(`加载剧情失败:HTTP ${res.status}`); return res.json(); })
      .then(data => {
        this.dialogueEngine._clearUI();
        this.dialogueEngine.start(data);
      })
      .catch(err => {
        console.error('[WorldScene]', err.message);
        this.dialogueActive = false;
      });
  }

  // 持久化剧情状态（story）到存档
  _persistStory() {
    const saved = SaveSystem.load() || {};
    SaveSystem.saveProgress({
      career: this.career, act: this.act, stats: this.stateSystem.getAll(),
      extra: {
        quests: this.questSystem.serialize(),
        choiceLog: this.choiceLog.serialize(),
        thought: this.thoughtSystem ? this.thoughtSystem.serialize() : null,
        daySystem: this.daySystem ? this.daySystem.serialize() : null,
        story: this._story,
      },
    });
  }

  // NPC 记忆台词：AI 按玩家选择历史生成个性化反应，让"世界记得你"。
  // 门槛：有足够选择记录 + 30% 概率触发（保持稀有）；否则/失败用固定寒暄。
  _showNpcLineWithMemory(npc) {
    const summary = this._choiceSummaryShort();
    const shouldTryAI = summary && this.choiceLog.length >= 3 && Math.random() < 0.3;
    if (!shouldTryAI) { this._showLine(npc.name, npc.line); return; }
    // 先显示固定寒暄（即时反馈），AI 成功后覆盖成个性化版本
    this._showLine(npc.name, npc.line);
    const sys = `你是职场 RPG 里的 NPC「${npc.name}」，一个${npc.label || '同事'}。`
      + `根据玩家最近的行为，说一句自然的、像老同事随口一提的话，体现"我注意到你最近的状态"。`
      + `1 句，口语化，中文，不说教、不评判，带点关心。`;
    const user = `玩家最近的行为：${summary}。以「${npc.name}」的口吻说一句话。`;
    AIClient.call(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { model: 'hy3', timeoutMs: 7000, fallbackFn: () => ({ text: '' }) }
    ).then(res => {
      const t = (res.text || '').trim();
      if (t && res.source === 'ai' && t.length < 50 && this._lineActive) {
        // AI 成功且当前寒暄气泡还在 → 覆盖成个性化台词
        this._updateLineText(`${t}`);
      }
    }).catch(() => {});
  }

  // 轻量单句气泡（非正式剧情）——钉屏 UI 相机，1920 尺度，点击/E/空格关闭
  // 框高按正文实测高度自适应（先量后定），根治多行文字溢出遮字
  _showLine(name, text) {
    this.dialogueActive = true;
    this.ePrompt.setVisible(false);
    if (this.guideText) this.guideText.setVisible(false);
    const { width, height } = this.scale;
    const bw = Math.min(1400, width - 120);
    const bx = (width - bw) / 2;
    const PAD = 28;
    const wrapW = bw - PAD * 2;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10000);
    // 全屏输入层（点任何位置关闭，永不错位）
    const hit = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.001)
      .setScrollFactor(0).setInteractive();
    c.add(hit);

    // 先量正文高度 → 据此定框高
    const nameH = name ? 34 : 0;
    const hintH = 26;
    const bodyTxt = this.add.text(0, 0, text, {
      fontSize: '26px', color: '#ffffff', lineSpacing: 8,
      wordWrap: { width: wrapW, useAdvancedWrap: true },
    }).setOrigin(0, 0);
    const bodyH = bodyTxt.height;
    const boxH = PAD + nameH + bodyH + 14 + hintH + PAD;
    const by = height - 40 - boxH; // 框底距屏幕底 40

    c.add(this.add.rectangle(bx + bw / 2, by + boxH / 2, bw, boxH, 0x0a0a14, 0.92).setStrokeStyle(2, 0xd4a353, 0.5));
    let ty = by + PAD;
    if (name) {
      c.add(this.add.text(bx + PAD, ty, name, {
        fontSize: '22px', color: '#ffd24d', fontStyle: 'bold',
      }).setOrigin(0, 0));
      ty += nameH;
    }
    bodyTxt.setPosition(bx + PAD, ty);
    c.add(bodyTxt);
    this._lineBodyText = bodyTxt; // 供 AI 记忆台词覆盖
    this._lineActive = true;
    c.add(this.add.text(bx + bw - PAD, by + boxH - PAD + 4, '［点击 / E 继续］', {
      fontSize: '18px', color: '#9aa0a6',
    }).setOrigin(1, 1));
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);

    // 关闭时显式解绑全部键（once 只移除被触发的那个，剩下的会泄漏，
    // 之后进正式剧情按空格会误触发旧 close、把剧情"踢出戏"——BUG-6）
    const kb = this.input.keyboard;
    const close = () => {
      kb.off('keydown-E', close);
      kb.off('keydown-SPACE', close);
      kb.off('keydown-ESC', close);
      c.destroy(true);
      this.dialogueActive = false;
      this._lineActive = false;
      this._lineBodyText = null;
      if (this.guideText) this.guideText.setVisible(true);
    };
    this.time.delayedCall(120, () => {
      hit.on('pointerdown', close);
      kb.on('keydown-E', close);
      kb.on('keydown-SPACE', close);
      kb.on('keydown-ESC', close);
    });
  }

  // 覆盖当前寒暄气泡的正文（AI 记忆台词生成成功时调用）
  _updateLineText(text) {
    if (this._lineActive && this._lineBodyText && this._lineBodyText.scene) {
      this._lineBodyText.setText(text);
    }
  }

  // ==================== 任务数据加载 ====================
  // 按 career 加载 quests_{career}.json。失败静默降级（任务系统空跑，不阻塞游戏）。
  // 续档时先 restore 再 load（restore 不依赖定义，load 后进度自动接上）。
  _loadQuestData() {
    // 从 init 缓存的存档字段恢复任务进度 + 选择记忆（跨幕累积）
    if (this._savedQuests && this.questSystem) this.questSystem.restore(this._savedQuests);
    if (this._savedChoiceLog && this.choiceLog) this.choiceLog.restore(this._savedChoiceLog);
    // 异步加载任务定义
    const url = `./data/quests_${this.career}.json`;
    fetch(url)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        if (this.questSystem) {
          this.questSystem.load(data);
          this._updateNpcMarks();
        }
      })
      .catch(err => {
        // 轻量职业可能无任务文件，静默处理
        if (!String(err).includes('404')) console.warn('[WorldScene] 任务数据加载失败:', err.message);
      });
  }

  // 刷新 NPC 头顶标记：导师按剧情阶段（❗待剧情/可推进，💤经营中），其余 NPC 按任务。
  _updateNpcMarks() {
    if (!this.npcs || !this.questSystem) return;
    const ctx = { act: this.act };
    for (const npc of this.npcs) {
      if (!npc.mark) continue;
      // 导师：剧情状态机标记（深度职业）
      if (npc.id === 'senior' && !LIGHT_CAREERS.includes(this.career)) {
        if (this._story.phase === 'ready') {
          npc.mark.setText('❗').setColor('#ffdd33'); // 待播本幕剧情
        } else if (this._story.phase === 'working') {
          const need = ACT_DAYS[this.act] || 1;
          if (this._story.daysInAct >= need) npc.mark.setText('❗').setColor('#ffdd33'); // 可推进下一幕
          else npc.mark.setText('💤').setColor('#8a8a9e'); // 经营中，还没到时候
        }
        // 导师身上有可交付任务时优先显示 ❓
        for (const q of this.questSystem.active()) {
          if (q.giver === 'senior' && this.questSystem.isReady(q.id)) { npc.mark.setText('❓').setColor('#7eff7e'); break; }
        }
        continue;
      }
      // 其余 NPC：按任务
      const mark = this.questSystem.npcMark(npc.id, ctx);
      if (mark === 'available') npc.mark.setText('❗').setColor('#ffdd33');
      else if (mark === 'deliver') npc.mark.setText('❓').setColor('#7eff7e');
      else if (mark === 'progress') npc.mark.setText('…').setColor('#7ec8ff');
    }
    this._syncGuideText();
  }

  // 底部引导条：跟剧情/任务真实下一步对齐（纯逻辑在 bottomGuideFromGoal）。
  // 小改动：不引入 objectiveHud 架构，只在标记刷新时同步文案。
  _syncGuideText() {
    if (!this.guideText || this.dialogueActive) return;
    const gTheme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    const [gName, gTitle] = gTheme.npcs.senior;
    let goal = null;
    if (this._story && this._story.phase === 'ready') {
      goal = { text: `去找${gTitle}「${gName}」(剧情)` };
    } else if (this.questSystem) {
      const ctx = { act: this.act };
      for (const q of this.questSystem.active()) {
        if (this.questSystem.isReady(q.id)) {
          goal = { text: `交付「${q.title}」` };
          break;
        }
      }
      if (!goal) {
        for (const q of this.questSystem.available(ctx)) {
          goal = { text: `领任务:「${q.title}」` };
          break;
        }
      }
      if (!goal && typeof this.questSystem.nextObjective === 'function') {
        for (const q of this.questSystem.active()) {
          const next = this.questSystem.nextObjective(q.id);
          if (next && next.text) { goal = { text: next.text }; break; }
        }
      }
    }
    const bottom = bottomGuideFromGoal(goal, gName);
    if (this._lastGuideLabel !== bottom) {
      this._lastGuideLabel = bottom;
      this.guideText.setText(bottom);
    }
  }

  // ==================== 环境换景（bgChange 真生效）====================
  // 用颜色滤镜叠加程序化表现不同环境氛围——晨街/大堂/白天/深夜加班，配合现有办公室地图。
  _applyAmbient(bg) {
    const MOODS = {
      street_morning:  { color: 0xffdca8, alpha: 0.14 }, // 晨光暖黄
      office_lobby:    { color: 0x9ab4dc, alpha: 0.12 }, // 冷调大堂
      office_day:      { color: 0xffffff, alpha: 0.00 }, // 白天中性
      office_corridor: { color: 0x4a5a7e, alpha: 0.18 }, // 走廊偏暗
      office_night:    { color: 0x1e2e52, alpha: 0.30 }, // 深夜
      office_996:      { color: 0x18183e, alpha: 0.36 }, // 996 至暗
      office_evening:  { color: 0x6a5a7e, alpha: 0.16 }, // 黄昏
    };
    const m = MOODS[bg] || { color: 0xffffff, alpha: 0.05 };
    if (!this._ambientOverlay) return;
    this._ambientOverlay.setFillStyle(m.color);
    this.tweens.add({ targets: this._ambientOverlay, alpha: m.alpha, duration: 800, ease: 'Sine.inOut' });
  }

  // ==================== 状态即演出（情绪视觉化）====================
  // 按主导状态给屏幕染色 + 音效/减速，让 8 个状态条"活"起来（不只是数字）。
  // 优先级：耗竭 > 高压 > 心流 > 平静。在 update 里每帧轻量调用。
  _updateMoodFx(time) {
    if (!this._moodTint || !this.stateSystem) return;
    const s = this.stateSystem.getAll();
    let mood, color, alpha, speedMul = 1;
    if (s.health <= 30 || s.energy <= 22) {
      mood = 'drained'; color = 0x6a5a3a; alpha = 0.22; speedMul = 0.72; // 耗竭：灰褐+减速
    } else if (s.stress >= 70) {
      mood = 'stress'; color = 0x8a1a1a; alpha = 0.16;                    // 高压：泛红
    } else if (s.passion >= 70 && s.stress < 45) {
      mood = 'flow'; color = 0xffd070; alpha = 0.10;                      // 心流：暖金
    } else {
      mood = 'calm'; color = 0xffffff; alpha = 0;
    }
    this._moodSpeedMul = speedMul;
    if (this._moodState !== mood) {
      this._moodState = mood;
      this._moodTint.setFillStyle(color);
      this.tweens.add({ targets: this._moodTint, alpha, duration: 900, ease: 'Sine.inOut' });
    }
    // 高压：心跳音效（每 ~1.4s 一次，节流）
    if (mood === 'stress' && time - this._lastHeartbeat > 1400) {
      this._lastHeartbeat = time;
      AudioSystem._tone(70, 55, 'sine', 0.16, 0.10);
    }
  }

  // 关键抉择的即时演出：让每个有意义的选择"有重量"，而不只是"选完点下一句"。
  // 按 tag 分类给屏幕反馈——负面选择低沉红闪、正面选择暖色轻响、人生抉择更强演出。
  _reactToChoice(choice) {
    if (!choice) return;
    const tag = choice.tag;
    const eff = choice.effects || {};
    // 人生抉择（act5 结局分叉）→ 强演出：闪 + 粒子 + 音
    const bigChoices = ['stay_backbone', 'quit', 'health_warning', 'switch', 'keep_faith'];
    if (bigChoices.includes(tag)) {
      Juice.flash(this, 0xffffff, 200);
      Juice.burst(this, this.scale.width / 2, this.scale.height / 2, 0xf0d080, 18);
      AudioSystem.levelUp();
      return;
    }
    // 负面选择（伤身/报喜不报忧/糊弄）→ 低沉红闪
    const negative = ['overwork', 'report_good_news', 'slack_off', 'numb'];
    if (negative.includes(tag) || (eff.stress > 0 && (eff.health < 0 || eff.passion < 0))) {
      Juice.flash(this, 0x8a1a1a, 150);
      AudioSystem._tone(160, 110, 'sawtooth', 0.18, 0.10);
      return;
    }
    // 正面选择（照顾自己/守初心/坦诚/协作/共情）→ 暖色轻响
    const positive = ['self_care', 'keep_faith', 'honest_with_family', 'collaborate', 'empathy', 'ask_help', 'steady'];
    if (positive.includes(tag) || eff.san > 0 || eff.passion > 0) {
      Juice.flash(this, 0xffe0a0, 120);
      AudioSystem.success();
      return;
    }
  }

  // ==================== 内心独白（思维内阁）====================
  // 加载 monologues.json 台词池 + 恢复存档的思维状态
  // ==================== 多天循环 ====================
  // 更新天数/时段 HUD
  _updateDayHud() {
    if (this.dayText && this.daySystem) {
      this.dayText.setText(`第 ${this.daySystem.day} 天 · ${this.daySystem.phaseName()}`);
    }
  }

  // 下班回家：转场到 HomeScene，带当前状态快照 + 天数
  _goHome() {
    if (this.dialogueActive || this._goingHome) return;
    this._goingHome = true;
    // 存档（含天数 + 剧情阶段，缺 story 会导致下班后剧情进度被抹、卡在第一幕重播）
    SaveSystem.saveProgress({
      career: this.career, act: this.act, stats: this.stateSystem.getAll(),
      extra: {
        quests: this.questSystem.serialize(),
        choiceLog: this.choiceLog.serialize(),
        thought: this.thoughtSystem ? this.thoughtSystem.serialize() : null,
        daySystem: this.daySystem.serialize(),
        story: this._story,
      },
    });
    SceneRouter.goto(this, 'HomeScene', {
      career: this.career, act: this.act,
      day: this.daySystem.day, stats: this.stateSystem.getAll(),
    });
  }

  _loadThoughtData() {
    if (this._savedThought && this.thoughtSystem) this.thoughtSystem.restore(this._savedThought);
    fetch('./data/monologues.json')
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => { if (this.thoughtSystem) this.thoughtSystem.load(data); })
      .catch(() => { /* 独白不可用不阻塞游戏 */ });
  }

  // 触发一次内心独白：模板即时呈现，可选 AI 生成个性化版本覆盖。
  // sceneKey='auto' 时按当前状态自动选人格；否则指定 scene 键。
  _triggerMonologue(sceneKey) {
    if (!this.thoughtSystem || !this.thoughtSystem.isReady()) return;
    const stats = this.stateSystem.getAll();
    const thought = this.thoughtSystem.think(stats);
    if (!thought) {
      // 无人格触发（状态平淡）：给一句中性提示，不空窗
      this._showThoughtBubble('（此刻，脑子里很安静。）', '#9a9ac0');
      return;
    }
    // 先用模板台词即时呈现
    this._showThoughtBubble(`${thought.voice.name}：${thought.text}`, thought.voice.color);
    // 可选 AI 生成个性化独白（结合选择历史），成功则再补一条
    const summary = this._choiceSummaryShort();
    const { sys, user } = this.thoughtSystem.buildAIPrompt(thought.voice, stats, summary);
    AIClient.call(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { model: 'hy3', timeoutMs: 8000, fallbackFn: () => ({ text: '' }) }
    ).then(res => {
      const aiText = (res.text || '').trim();
      if (aiText && res.source === 'ai' && aiText.length < 60) {
        // AI 生成成功且简短 → 覆盖显示（更懂你的版本）
        this._showThoughtBubble(`${thought.voice.name}：${aiText}`, thought.voice.color);
      }
    }).catch(() => {});
  }

  // 选择历史简述（喂 AI 独白用）
  _choiceSummaryShort() {
    if (!this.choiceLog || this.choiceLog.length === 0) return '';
    const counts = this.choiceLog.tagCounts();
    const top = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
    return top ? `反复${top[0]}${top[1]}次` : '';
  }

  // 思维气泡：屏幕上方中央浮现一句内心独白，钉屏 UI 相机，自动淡出
  _showThoughtBubble(text, color) {
    const { width } = this.scale;
    const y = 120;
    const bubble = this.add.container(0, 0).setScrollFactor(0).setDepth(9700);
    const txt = this.add.text(width / 2, y, text, {
      fontSize: '24px', color: color || '#dfe3ff', fontStyle: 'italic',
      backgroundColor: '#0a0a14dd', padding: { x: 20, y: 12 },
      wordWrap: { width: 900, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5, 0);
    bubble.add(txt);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(bubble);
    bubble.setAlpha(0);
    // 淡入 → 停留 → 淡出
    this.tweens.add({ targets: bubble, alpha: 1, duration: 400, ease: 'Cubic.out' });
    this.time.delayedCall(4200, () => {
      this.tweens.add({
        targets: bubble, alpha: 0, duration: 600,
        onComplete: () => bubble.destroy(true),
      });
    });
  }

  // ==================== 可交互物件 ====================
  // 加载 interactables_{career}.json，在地图上渲染带图标的交互点
  _loadInteractables() {
    fetch(`./data/interactables_${this.career}.json`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => { this._buildInteractables(data.interactables || []); })
      .catch(() => { /* 无交互物件文件不阻塞游戏 */ });
  }

  // 渲染交互物件（图标浮标在世界坐标，随镜头滚动）
  _buildInteractables(defs) {
    this._interactableDefs = defs;
    for (const def of defs) {
      const [x, y] = def.pos;
      // 图标浮标（世界坐标，主相机渲染）
      const icon = this.add.text(x, y - 20, def.icon, { fontSize: '26px' })
        .setOrigin(0.5, 1).setDepth(y);
      this.tweens.add({
        targets: icon, y: icon.y - 5,
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
      // UI 相机不渲染世界物件图标（归主相机）
      if (this.uiCamera) this.uiCamera.ignore(icon);
      this._interactables.push({ ...def, x, y, icon });
    }
  }

  // ==================== 剧情引擎事件（移植自 OfficeScene）====================
  _setupDialogueEvents() {
    const eng = this.dialogueEngine;
    const self = this;

    eng.on('bgChange', bg => {
      self._applyAmbient(bg);           // 办公室内的色调滤镜
      if (self.sceneBackdrop) self.sceneBackdrop.show(bg); // 非办公室场景盖对应场景画面
    });

    eng.on('dialogueEnd', () => {
      self.dialogueActive = false;
      if (self.guideText) self.guideText.setVisible(true); // 对话结束恢复引导语
      self._syncGuideText();
      if (self.offWorkBtn) self.offWorkBtn.setVisible(true);
      // 剧情结束回办公室：移除场景背景 + 恢复办公室色调，露出办公室地图
      if (self.sceneBackdrop) self.sceneBackdrop.show('office');
      self._applyAmbient('office');
    });

    // 选择记忆：玩家每次选选项都记录（choiceLog 是结局 AI 画像的数据源）
    eng.on('choice', ({ nodeId, choice, act }) => {
      if (self.choiceLog) {
        self.choiceLog.record({
          act, nodeId,
          choiceLabel: choice.label,
          tag: choice.tag || null, // 剧情数据可给 choice 加 tag 标注行为类型
        });
      }
      // 关键抉择即时演出：让"选择有重量"——按 tag/effects 给屏幕反馈
      self._reactToChoice(choice);
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
        case 'minigame:affairs': {
          const mgType = action.split(':')[1];
          // 程序员的 coding 用「Debug 找茬」动作玩法（点出bug行）；其余职业用选择题
          const useDebug = (mgType === 'coding' && self.career === 'programmer');
          const gameScene = useDebug ? 'DebugGameScene' : 'MinigameScene';
          const onComplete = (result) => {
            // 按成绩反哺状态:全对 skill+5 passion+4;部分 skill+3;全错 stress+3 但 skill+1(试错也是学)
            const total = result?.total || 3, ok = result?.correct || 0;
            if (ok === total) { self.stateSystem.change('skill', 5); self.stateSystem.change('passion', 4); }
            else if (ok > 0) { self.stateSystem.change('skill', 3); self.stateSystem.change('energy', -3); }
            else { self.stateSystem.change('stress', 3); self.stateSystem.change('skill', 1); }
            self.questSystem.progress('minigame', mgType); // 上报任务进度
            self._updateNpcMarks();
            self.scene.stop(gameScene);
            self.scene.resume();
          };
          self.scene.pause();
          if (useDebug) {
            self.scene.launch('DebugGameScene', { act: self.act, fromScene: null, onComplete });
          } else {
            self.scene.launch('MinigameScene', { type: mgType, career: self.career, fromScene: null, onComplete });
          }
          break;
        }
        case 'enter_mindscape':
          self.scene.pause();
          self.scene.launch('MindscapeScene', {
            stateSystem: self.stateSystem,
            returnScene: 'WorldScene',
            monoScene: 'auto',
          });
          // 修复 no-op bug：原 _advanceAfterAction 在 DialogueEngine 不存在。
          // mindscape 返回后正确推进：若该节点有 choices 让玩家选，否则结束对话。
          self.events.once('mindscapeReturn', () => {
            const eng = self.dialogueEngine;
            if (!eng || !eng.currentId) return;
            const n = eng.data && eng.data.nodes[eng.currentId];
            if (n && n.choices && n.choices.length) {
              // 有选项：重新渲染当前节点（展示选择）
              eng._showNode(eng.currentId);
            } else {
              // 无选项：结束本段对话
              eng._endDialogue();
            }
          });
          break;
        case 'next_act':
          self._loadNextAct();
          break;
        case 'phone_message':
          // 剧情数据显式触发：按 node 上的 act 或关键词推一条家人消息
          self._showFamilyByAct(self.act, node && node.phoneKeyword);
          break;
        case 'ending':
          // 转场淡出（替代硬切），让结局有仪式感
          SceneRouter.goto(self, 'EndingScene', {
            ending: self.career,
            career: self.career,
            stats: self.stateSystem.getAll(),
            choiceLog: self.choiceLog.serialize(),
          });
          break;
        default:
          console.log('[WorldScene] unhandled action:', action);
      }
    });
  }

  // ==================== 家人消息（PhoneMessage + FamilyMessages）====================
  // 三种触发入口，共享同一个 _showPhone 渲染方法：
  //   1. _showFamilyByAct(act)      —— 幕次推进时推一条（每幕1条，去重）
  //   2. _onStateThreshold(info)     —— health/san/passion 触底时推一条至暗消息
  //   3. action 'phone_message'      —— 剧情数据显式触发（上面已接线）
  _showFamilyByAct(act, keyword) {
    this.familyMessages.load().then(() => {
      const picked = keyword
        ? this.familyMessages.pickByKeyword(keyword)
        : this.familyMessages.pickForAct(act);
      if (picked) this._showPhone(picked.bubbles, picked.context);
    });
  }

  // 状态触底回调：health/san/passion 跌破 20。
  // 每个状态键只触发一次（用 _phoneTriggeredFor 去重），避免数值来回跳反复弹窗。
  _onStateThreshold(info) {
    const key = info.key;
    if (this._phoneTriggeredFor.has(key)) return;
    this._phoneTriggeredFor.add(key);
    // 弹窗前先确保家人在移动状态被冻结期间显示
    this.familyMessages.load().then(() => {
      const picked = this.familyMessages.pickForThreshold();
      if (picked) {
        this._showPhone(picked.bubbles, picked.context);
      } else {
        // 没匹配到专属消息时，用一句通用安慰兜底（不空窗）
        this._showPhone(
          [{ sender: '妈妈', text: '囡囡，别太拼了。身体是自己的，妈就你好好的。' }],
          '兜底·状态触底'
        );
      }
    });
  }

  // 统一渲染：用 PhoneMessage 弹窗显示，期间冻结玩家移动
  _showPhone(bubbles, contextLabel) {
    if (!bubbles || !bubbles.length) return;
    if (this.phoneMessage.isShowing()) return; // 已有消息在显示，不叠加
    console.log('[WorldScene] 家人消息:', contextLabel || '(无情境标注)');
    this.dialogueActive = true;   // 冻结移动 + 让 HUD 让路
    this.phoneMessage.show(bubbles, () => {
      this.dialogueActive = false;
      if (this.guideText) this.guideText.setVisible(true);
    });
  }

  // ---------- 仪式弹窗（钉屏）----------
  // 框高按文本实测高度自适应（先量后定），长文案不再顶穿框
  _showRitual(text) {
    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(10001);
    // 全屏遮罩兼点击层（点任何处关闭）
    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setInteractive();
    overlay.add(mask);

    const boxW = 820, wrapW = 720, PAD = 44, hintH = 40;
    // 先量正文高度
    const bodyTxt = this.add.text(0, 0, text, {
      fontSize: '30px', color: '#f0d080',
      wordWrap: { width: wrapW, useAdvancedWrap: true }, align: 'center', lineSpacing: 8,
    }).setOrigin(0.5, 0);
    const bodyH = bodyTxt.height;
    const boxH = PAD + bodyH + 20 + hintH + PAD;
    const boxTop = height / 2 - boxH / 2;

    overlay.add(this.add.rectangle(width / 2, height / 2, boxW, boxH, 0x1e1e2e, 0.97).setStrokeStyle(2, 0xd4a353, 0.6));
    bodyTxt.setPosition(width / 2, boxTop + PAD);
    overlay.add(bodyTxt);
    overlay.add(this.add.text(width / 2, boxTop + boxH - PAD + 6, '点击任意处继续', {
      fontSize: '20px', color: '#8a8a9e',
    }).setOrigin(0.5, 1));
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(overlay);

    const kb = this.input.keyboard;
    const close = () => {
      kb.off('keydown-ESC', close);
      kb.off('keydown-SPACE', close);
      overlay.destroy(true);
    };
    this.time.delayedCall(100, () => {
      mask.on('pointerdown', close);
      kb.on('keydown-ESC', close);
      kb.on('keydown-SPACE', close);
    });
  }

  // ---------- 加载下一幕 ----------
  // 剧情内 next_act 触发：不再立即播下一幕，而是进入「经营期」。
  // 玩家看完本幕剧情 → 回办公室过日子（做任务/交互/下班睡觉推进天数）→ 攒够天数走近导师推进下一幕。
  // 这样剧情被天数切段、天数有了意义、任务是日常——三个时钟拧成一根绳。
  _loadNextAct() {
    this.dialogueEngine._clearUI();
    this.dialogueActive = false;
    // 若下一幕不存在（act5 后）→ 直接进结局
    const next = this.act + 1;
    if (next > 5) {
      SceneRouter.goto(this, 'EndingScene', {
        ending: this.career, career: this.career,
        stats: this.stateSystem.getAll(), choiceLog: this.choiceLog.serialize(),
      });
      return;
    }
    // 进入本幕经营期
    this._story.phase = 'working';
    this._story.act = this.act;
    this._story.daysInAct = 0;
    this._persistStory();
    this._updateNpcMarks();
    // 本幕家人消息 + 引导提示"去过日子"
    this._showFamilyByAct(this.act);
    const need = ACT_DAYS[this.act] || 1;
    const gTheme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    const [seniorName] = gTheme.npcs.senior;
    this.time.delayedCall(400, () => {
      this._showRitual(
        `📅 报到故事告一段落。\n✅ 下一步：找${seniorName}（头顶 ❗）领任务 / 做手头的活\n→ 和同事聊聊 → 累了就右上角「下班回家」。\n（本阶段约 ${need} 天经营，攒够天数再找导师推进剧情。）`,
      );
    });
  }

}
