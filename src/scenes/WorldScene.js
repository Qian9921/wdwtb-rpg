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
import { TimeSystem } from '../systems/TimeSystem.js';
import { NpcAgent } from '../systems/NpcAgent.js';
import { ProjectSystem } from '../systems/ProjectSystem.js';
import { ensurePixelIcons, ICON_KEYS, EMOJI_TO_ICON } from '../systems/PixelIcons.js';
import { Pathfinder } from '../systems/Pathfinder.js';
import {
  ACT_DAYS as SP_ACT_DAYS,
  LIGHT_CAREERS as SP_LIGHT_CAREERS,
  WORK_LOOP_CAREERS as SP_WORK_LOOP_CAREERS,
  DEFAULT_SUBROLE as SP_DEFAULT_SUBROLE,
  isWorkLoopCareer,
  applyProjectMilestone,
  tryAdvanceByMilestone,
  tryAdvanceByDays,
  enterWorkingAfterAct,
  shouldDeferLightEnding,
  enterWorkingFromLightEnding,
  canFinishLightWorkLoop,
  preferredLightEnding,
  mergeStoryState,
  createStoryState,
  chainHudStep,
  bottomGuideFromGoal,
  buildWorldSaveExtra,
  seniorMarkVisual,
  resolveCurrentGoal,
} from '../systems/StoryProgress.js';
import {
  npcLineForAct,
  seniorInteractAction,
  applySeniorAction,
  tryPickOfficeEvent,
  planEventChoiceEffects,
  buildDailyReportRows,
} from '../systems/WorkLoopOffice.js';
import {
  RelationshipSystem,
  pickRelationAwareLine,
  applyNpcChat,
  eventMeetsRelations,
  summarizeRelations,
} from '../systems/RelationshipSystem.js';
import { ItemSystem, planGift, dailySalary, stressOutputMultiplier, energyGate, skillTimeBonus } from '../systems/ItemSystem.js';

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
// 玩家的工位（真实家具坐标）：电脑 + 正下方椅子。这把椅子给玩家留空,不坐 NPC,
// 让"你的工作电脑"永远可用、对齐真实工位（根治"做任务的电脑放得莫名其妙"）。
const PLAYER_DESK = { computer: { x: 1008, y: 512 }, chair: { x: 1008, y: 544 } };
// 坐姿偏移（直接移植自 SkyOffice 源码 sittingShiftData）：dx,dy=相对椅子中心的位移,
// depth=相对椅子的深度位移(让人物正确"陷进"椅子:朝上时在椅背后、朝下时在椅面前)。
// SkyOffice 用中心锚点(0.5,0.5)。本项目 NPC 用脚底锚点,换算脚底Y=中心Y+半身高(24)。
const SIT_SHIFT = {
  up:    { dx: 0, dy: 3, depth: -10 },
  down:  { dx: 0, dy: 3, depth: 1 },
  left:  { dx: 0, dy: -8, depth: 10 },
  right: { dx: 0, dy: -8, depth: 10 },
};
const CHAR_HALF_H = 24; // 32×48 scale1 → 半身高，用于脚底锚点↔中心锚点换算
// NPC 头顶状态泡泡：随时段变化的"一句话状态"（工作中/摸鱼/上厕所/赶ddl…）——
// 让同事像真人一样"有当下的状态、有情绪",真实职场感。每条=一句短文 + emoji。
const MOODS_POOL = {
  morning_meeting: ['刚到工位 ☕', '开早会 📋', '列今日计划 ✍️', '还没睡醒 😪', '刷会新闻 📰', '回消息 💬', '打卡签到 ✅'],
  forenoon:        ['写代码 💻', '跑测试 🧪', '查文档 📖', '对需求 🗣️', '改bug 🐛', '喝口水 🥤', '有点卡壳 🤔', '摸鱼一下 🐟'],
  noon:            ['去吃饭 🍜', '午休片刻 😴', '刷手机 📱', '约饭 💬', '买杯咖啡 ☕', '楼下散步 🚶', '追个剧 📺'],
  afternoon:       ['赶进度 💻', '开评审会 📋', '发会呆 😶', '困成狗 🥱', '需求又变了 🔄', '摸鱼 🐟', '敲键盘 ⌨️', '接电话 📞'],
  overtime:        ['还在改bug 🐛', '赶deadline 😱', '等编译 ⏳', '想下班了 🏃', '再撑一会 😮‍💨', '点了外卖 🍔', '血压上来了 🤯', '和产品吵架 💢'],
  deep_night:      ['熬夜中 🌙', '困到不行 😵', '就差一点 😭', '等发版 🚀', '咖啡续命 ☕', '好想回家 🏠', '已经麻了 🫠', '在改最后一个 🐛'],
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
  // SkyOffice 4 款（精细、有坐姿帧）。tex=纹理key(so_前缀)，cap=帧名首字母大写名。
  // scale 统一 1.5：与办公室 32px tile 协调（约 1.5 tile 宽、2 tile 高），玩家/NPC 一致。
  so_adam:  { type: 'skyoffice', tex: 'so_adam',  cap: 'Adam',  scale: 1.0 },
  so_ash:   { type: 'skyoffice', tex: 'so_ash',   cap: 'Ash',   scale: 1.0 },
  so_lucy:  { type: 'skyoffice', tex: 'so_lucy',  cap: 'Lucy',  scale: 1.0 },
  so_nancy: { type: 'skyoffice', tex: 'so_nancy', cap: 'Nancy', scale: 1.0 },
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
    // limezu 无坐姿帧 → 坐姿回退到 idle 帧
    return {
      walkPrefix: `walk_${skinKey}`, tex: skinKey,
      idleFrame: (d) => IDLE[d] ?? IDLE.down,
      sitFrame: (d) => IDLE[d] ?? IDLE.down,
    };
  }
  // skyoffice atlas：帧名 {Cap}_run_{n}.png / {Cap}_idle_anim_{n}.png / {Cap}_sit_{dir}.png
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
    sitFrame: (d) => `${s.cap}_sit_${d || 'down'}.png`, // 坐姿帧（4 向）
  };
}

// 剧情/经营/工作日循环常量与纯逻辑 → systems/StoryProgress.js（可单测）
const LIGHT_CAREERS = SP_LIGHT_CAREERS;
const ACT_DAYS = SP_ACT_DAYS;
const WORK_LOOP_CAREERS = SP_WORK_LOOP_CAREERS;
const DEFAULT_SUBROLE = SP_DEFAULT_SUBROLE;

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
    this.subRole = (data && data.subRole) || null; // 细分职业(dev/test)，程序员任务链用
    this.deep = data ? data.deep : true;
    this.act = (data && data.act) || 1;
    this.dialogueActive = false;
    this.activeNpc = null;
    this._activeSlot = (data && (data.slot || data.newGameSlot)) || 1;
    // 多天循环：从 CommuteScene 传入的 day + stats 快照（有则用，无则从存档/默认）
    this._incomingDay = (data && data.day) || null;
    this._incomingStats = (data && data.stats) || null;
    // 剧情状态机（消除"一口气读完整幕"）：ready=待播本幕剧情 / working=经营期(剧情已播,过日子)
    this._story = createStoryState();
    this._savedStats = null;
    this._savedQuests = null;
    this._savedChoiceLog = null;
    this._savedThought = null;
    this._savedDay = null;
    this._savedSegment = null;
    this._savedProject = null;
    this._savedRelations = null;
    this._savedItems = null;
    try {
      const saved = SaveSystem.loadSlot(this._activeSlot);
      // 同职业+同细分才续档；换职业或换方向 → 清旧档、全新开始（避免串档）。
      // subRole 为空=从标题"继续"进来,用存档里的方向。
      const sameRun = saved && saved.career === this.career
        && (this.subRole == null || saved.subRole == null || saved.subRole === this.subRole);
      if (sameRun) {
        this._savedStats = saved.stats || null;   // 不再用 act 判据（BUG-9：换幕续档不丢血）
        this._savedQuests = saved.quests || null;
        this._savedChoiceLog = saved.choiceLog || null;
        this._savedThought = saved.thought || null;
        this._savedDay = saved.daySystem || null;
        this._savedSegment = Number.isInteger(saved.segment) ? saved.segment : null;
        this._savedProject = saved.project || null;
        this._savedRelations = saved.relations || null;
        this._savedItems = saved.items || null;
        if (this.subRole == null && saved.subRole) this.subRole = saved.subRole; // 续档恢复方向
        if (saved.story) this._story = mergeStoryState(saved.story);
      } else if (saved) {
        SaveSystem.clearSlot(this._activeSlot); // 换职业/换方向：清掉上一个进度
      }
    } catch (e) {}
    // story.act 是权威幕次
    this.act = this._story.act || this.act;
    // 进场即存档（合并写，保留未提供字段）
    this._saveProgressToSlot();
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
    // 办公室背景同事配置（12-15 人，让白天工位坐满像真实公司）
    this.load.json('office_npcs', './data/office_npcs.json');
    // 物品目录（背包/售货机/送礼）
    this.load.json('items_catalog', './data/items.json');
    // 工作日循环玩法：工单池 + 随机办公室事件 + 具名同事名册（目前程序员垂直切片）
    if (WORK_LOOP_CAREERS.has(this.career)) {
      this.load.json('work_orders', `./data/work_orders_${this.career}.json`);
      this.load.json('office_events', `./data/office_events_${this.career}.json`);
      this.load.json('roster', `./data/roster_${this.career}.json`);
    }
  }

  create() {
    AudioSystem.playBgm('office');
    ensurePixelIcons(this); // 像素浮标纹理(❗❓💬💤等)

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
    // 日内时段系统（早会→上午→…→深夜）：事件驱动，跨时段驱动灯光 + 在岗人数。
    this.timeSystem = new TimeSystem();
    if (Number.isInteger(this._savedSegment)) this.timeSystem.index = this._savedSegment;
    this.timeSystem.on('segmentChange', (seg) => this._onSegmentChange(seg));
    // 工作日循环玩法：项目进度/绩效/今日工单（程序员垂直切片）。
    this.workLoopEnabled = isWorkLoopCareer(this.career);
    if (this.workLoopEnabled) {
      const woData = this.cache.json.get('work_orders');
      this.projectSystem = new ProjectSystem({ pool: (woData && woData.orders) || [] });
      if (this._savedProject) this.projectSystem.restore(this._savedProject);
      this.projectSystem.on('milestone', (pct) => this._onProjectMilestone(pct));
      this.projectSystem.on('progress', () => this._updateProjectHud());
      this.projectSystem.startDay(Phaser.Math.RND); // 每天抽今日工单
      // 记录今日起点(日报结算用)
      this._dayStartProgress = this.projectSystem.progress;
      this._dayStartStats = { ...this.stateSystem.getAll() };
      this._reportShown = false;
    }
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
    // E5 关系网：好感/记忆（与存档同步）
    this.relations = new RelationshipSystem();
    if (this._savedRelations) this.relations.restore(this._savedRelations);
    // 物品背包（目录来自 items.json；存档恢复）
    const itemsData = this.cache.json.get('items_catalog');
    this.items = new ItemSystem((itemsData && itemsData.items) || {});
    if (this._savedItems) this.items.restore(this._savedItems);
    // 新的一天到达（通勤进来）：清每日送礼记录
    if (this._incomingDay && this.items) this.items.resetDaily();
    this._loadQuestData();
    // 任务完成时反馈（粒子+音效）+ 自动保存（任务链的每一环都是存档点）
    this.questSystem.on('completed', (id) => {
      Juice.celebrate(this, this.player.x, this.player.y - 30, 0xffd24d);
      // 完成一个任务 = 一天中的事件推进 → 时间进入下一时段（事件驱动的时钟）
      this._advanceTime();
      this._autoSave();
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
    trackUI(this.add.text(SW / 2, 14, 'WASD 移动 · Shift 冲刺 · E 交互 · T 倾听内心 · ESC 菜单', {
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
    // 让当前时段的灯光/人数立即就位（首帧进世界即呈现对应作息）
    this.timeSystem.kick();
    if (this.workLoopEnabled) this._startOfficeEvents(); // 随机办公室事件

    // "下班回家"按钮（屏幕右上角，天数下方）
    this.offWorkBtn = trackUI(this.add.text(SW - 20, 64, '🏠 下班回家', {
      fontSize: '20px', fill: '#dfe3ff', backgroundColor: '#3a3a5aee', padding: { x: 14, y: 8 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(9999).setInteractive({ useHandCursor: true }));
    this.offWorkBtn.on('pointerover', () => this.offWorkBtn.setBackgroundColor('#4a4a7aee'));
    this.offWorkBtn.on('pointerout', () => this.offWorkBtn.setBackgroundColor('#3a3a5aee'));
    this.offWorkBtn.on('pointerdown', () => this._goHome());

    // 项目进度 HUD（右上角，下班按钮下方）——工作日循环的核心可见产出
    if (this.workLoopEnabled) {
      const px = SW - 20, py = 128, pw = 236, ph = 22;
      this._projW = pw;
      trackUI(this.add.text(px, py - 4, '📊 项目进度', { fontSize: '15px', fill: '#bfeecf' })
        .setOrigin(1, 1).setScrollFactor(0).setDepth(9999));
      trackUI(this.add.rectangle(px, py, pw, ph, 0x1c1c2c, 0.92)
        .setOrigin(1, 0).setStrokeStyle(1, 0x4a6a52).setScrollFactor(0).setDepth(9999));
      this._projBarFill = trackUI(this.add.rectangle(px - pw, py, 0, ph, 0x5fbf7f, 1)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(9999));
      this._projText = trackUI(this.add.text(px - pw / 2, py + ph / 2, '', {
        fontSize: '14px', fill: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(10000));
      this._projDeadline = trackUI(this.add.text(px, py + ph + 4, '', {
        fontSize: '14px', fill: '#bfb0d0',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(9999));
      this._updateProjectHud();
    }

    // 功能栏 HUD（左下角）：手机等常驻功能放这里，不再摆在地上（更真实）
    this._phoneBtn = trackUI(this.add.text(24, SH - 66, '📱 手机', {
      fontSize: '20px', fill: '#dfe3ff', backgroundColor: '#2a2a44dd', padding: { x: 14, y: 9 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(9999).setInteractive({ useHandCursor: true }));
    this._phoneBtn.on('pointerover', () => this._phoneBtn.setBackgroundColor('#3a3a5edd'));
    this._phoneBtn.on('pointerout', () => this._phoneBtn.setBackgroundColor('#2a2a44dd'));
    this._phoneBtn.on('pointerdown', () => this._usePhone());

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

    // 常驻任务目标 HUD（左上·状态条下方）：双行显示任务标题+步骤
    this.objectiveHud = trackUI(this.add.text(24, 96, '', {
      fontSize: '16px', fill: '#ffe08a', backgroundColor: '#141422dd',
      padding: { x: 12, y: 7 }, wordWrap: { width: 430 },
      lineSpacing: 4, stroke: '#0a0a14', strokeThickness: 2,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(9998).setVisible(false));
    // 目标方向箭头（世界层·跟随玩家,指向当前目标）——离目标远时才显示
    this._goalArrow = this.add.image(0, 0, ICON_KEYS.arrow)
      .setDepth(9500).setVisible(false).setAlpha(0.9);

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
        this.scene.launch('PauseScene', this._pausePayload());
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
    // 4 步：评委 3 分钟路径（找人→工位→下班），可点跳过
    const steps = [
      { icon: '🎮', title: '欢迎来到你的第一天', text: '试一种职业生活——没有标准答案。\nWASD 移动 · E 交互 · ESC 任务日志。' },
      { icon: '💬', title: '找 ❗ 领任务', text: '走近头顶 ❗/❓ 的导师或同事，按 E。\n左上「▸ 下一步」+ 金色箭头会指路。' },
      { icon: '💻', title: '自己的椅子开工', text: '接到干活后：找自己的椅子［E］坐下办公\n→ 再 E「开始工作」做工单/小游戏（别坐别人位）。' },
      { icon: '🌙', title: '下班与对照', text: '右上角「下班回家」进下一天。\n左下 📱 可给家人打电话。试完可换职业对照喜不喜欢。' },
    ];
    let idx = 0;
    const iconT = this.add.text(W / 2, H / 2 - 130, '', { fontSize: '64px' }).setOrigin(0.5);
    const titleT = this.add.text(W / 2, H / 2 - 46, '', { fontSize: '32px', color: '#ffd24d', fontStyle: 'bold' }).setOrigin(0.5);
    const bodyT = this.add.text(W / 2, H / 2 + 28, '', { fontSize: '22px', color: '#e8e8f4', align: 'center', lineSpacing: 12, wordWrap: { width: 640 } }).setOrigin(0.5);
    const dotsT = this.add.text(W / 2, H / 2 + 120, '', { fontSize: '16px', color: '#5a5a7a' }).setOrigin(0.5);
    const hintT = this.add.text(W / 2, H / 2 + 160, '点击继续 →', { fontSize: '18px', color: '#8b8ba0' }).setOrigin(0.5);
    const skipT = this.add.text(W / 2 + 300, H / 2 - 175, '跳过', {
      fontSize: '16px', color: '#8a8a9e',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    c.add([iconT, titleT, bodyT, dotsT, hintT, skipT]);
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
      if (typeof this._syncGuideText === 'function') this._syncGuideText();
      else if (typeof this._updateObjectiveHud === 'function') this._updateObjectiveHud();
    };
    const advance = () => { idx++; if (idx >= steps.length) finish(); else render(); };
    render();
    this.time.delayedCall(100, () => {
      mask.on('pointerdown', advance);
      skipT.on('pointerover', () => skipT.setColor('#ffd24d'));
      skipT.on('pointerout', () => skipT.setColor('#8a8a9e'));
      skipT.on('pointerdown', (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); finish(); });
    });
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
    // 可遮挡物列表（高家具/墙：玩家走到其身后时半透明，露出人物——像素游戏惯用手法）
    this._occluders = [];
    // 碰撞按"贴地底座(footprint)"来做,不是整块贴图：俯视 2.5D 视角下,家具/墙有"高度",
    // 玩家能走到它前缘、甚至走到它身后(被遮挡),所以只把【底部贴地的一条】设为碰撞体。
    // bodyMode: 'full' 墙(挡整块) | 'base' 家具(只挡底座) | 'seat' 椅(极小,可走近坐)
    const addGroup = (layerName, sheetKey, tilesetName, collidable, bodyMode = 'base') => {
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
        if (img.displayHeight >= 30) this._occluders.push(img); // 高家具/墙框/门框→走到身后半透明
        if (collidable && img.body) {
          const dw = img.displayWidth, dh = img.displayHeight;
          let bw, bh;
          if (bodyMode === 'full') { bw = dw * 0.92; bh = Math.min(dh, 32); }       // 墙:近满宽,底部一块
          else if (bodyMode === 'seat') { bw = dw * 0.42; bh = Math.min(dh, 10); }  // 椅:极小底座,好走近好坐
          else { bw = dw * 0.68; bh = Math.min(dh * 0.34, 15); }                    // 家具:更窄更矮的贴地底座,桌间/桌边留得开,能靠近
          img.body.setSize(bw, bh);
          img.body.setOffset((dw - bw) / 2, dh - bh);
          img.body.updateFromGameObject();
        } else if (img.body) {
          // 装饰物：彻底移出物理世界(不挡人、也不被 overlapRect/路径检查误当障碍)
          this.physics.world.disable(img);
        }
      });
      if (collidable) this.solidGroups.push(group);
      return group;
    };

    // 碰撞层与 SkyOffice 源码一致：只有 *OnCollide / Basement / VendingMachine 挡人，
    // 墙由 Ground 瓦片碰撞负责；Objects/GenericObjects/Wall/Chair/Computer/Whiteboard 是**装饰**,不挡人
    // (根治"空地上到处是看不见的碰撞、走不进去"——之前把装饰层也做成了碰撞)。
    // collidable=false 的仍会被渲染 + 计入遮挡(走到身后半透明),只是不阻挡移动。
    const wallGroup = addGroup('Wall', 'tiles_wall', 'FloorAndGround', false);
    addGroup('Objects', 'so_office', 'Modern_Office_Black_Shadow', false);
    addGroup('ObjectsOnCollide', 'so_office', 'Modern_Office_Black_Shadow', true, 'base');
    addGroup('GenericObjects', 'so_generic', 'Generic', false);
    addGroup('GenericObjectsOnCollide', 'so_generic', 'Generic', true, 'base');
    addGroup('Basement', 'so_basement', 'Basement', true, 'base');
    // 椅子/电脑/白板=装饰不挡人(可走上去坐/用)；售货机挡人
    addGroup('Chair', 'so_chairs', 'chair', false);
    addGroup('Computer', 'so_computers', 'computer', false);
    addGroup('Whiteboard', 'so_whiteboards', 'whiteboard', false);
    addGroup('VendingMachine', 'so_vending', 'vendingmachine', true, 'base');

    // 把 1 格宽的门加宽成 2 格：俯视视角下门框占了下面那格,其实人能从那儿走过去。
    // 找到"1格水平门"(本格可走、上下被挡、左右通),把下面那格的墙(瓦片碰撞+墙物件)放开。
    this._widenDoors(map, ground, wallGroup);

    // 收集椅子元数据（坐标 + 朝向），供 NPC/群演坐上去（面向电脑，不再都朝玩家）
    this.chairs = [];
    const chairLayer = map.getObjectLayer('Chair');
    if (chairLayer) {
      chairLayer.objects.forEach((o) => {
        const cx = o.x + o.width * 0.5;
        const cy = o.y - o.height * 0.5;
        const dir = (o.properties || []).find(p => p.name === 'direction')?.value || 'down';
        this.chairs.push({ x: cx, y: cy, dir, taken: false });
      });
    }

    // 职业氛围光：极淡全屏色调（保留职业差异化的"行业气质"）
    const theme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
    if (theme.tint) {
      this.add.rectangle(0, 0, MW, MH, theme.tint, 0.05).setOrigin(0).setDepth(1);
    }

    this._buildNavGrid(map); // 导航网格(A* 寻路用)——此时家具已就位、角色还没建,只含墙+家具
  }

  // 建导航网格：每格可走 = 地板(非墙) 且 该处无实体家具挡住(NPC 脚下能站)。
  // 建好后从出生点洪水填充,剔除与主区不连通的孤立小块(否则寻路会失败)。
  _buildNavGrid(map) {
    const cell = 32, cols = map.width, rows = map.height;
    const walk = [];
    for (let cy = 0; cy < rows; cy++) {
      walk[cy] = [];
      for (let cx = 0; cx < cols; cx++) {
        const t = this.groundLayer.getTileAt(cx, cy);
        let ok = !!(t && !t.collides); // 地板
        if (ok) {
          // 探针略大于 NPC 脚(20×18 ≥ 身体18×16),确保"可走格"身体真能站进去,不会走到一半卡住
          const wx = cx * cell + cell / 2, wy = cy * cell + cell / 2;
          const hits = this.physics.overlapRect(wx - 10, wy - 4, 20, 18, false, true);
          for (const bd of hits) { if (bd.enable) { ok = false; break; } }
        }
        walk[cy][cx] = ok;
      }
    }
    // 剔除孤立块：只保留与出生点连通的可走格
    const sx = Math.floor(SPAWN.x / cell), sy = Math.floor(SPAWN.y / cell);
    const main = new Set(); const st = [];
    if (walk[sy] && walk[sy][sx]) { main.add(sy * cols + sx); st.push([sx, sy]); }
    while (st.length) {
      const [x, y] = st.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && walk[ny][nx] && !main.has(ny * cols + nx)) {
          main.add(ny * cols + nx); st.push([nx, ny]);
        }
      }
    }
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      if (walk[cy][cx] && !main.has(cy * cols + cx)) walk[cy][cx] = false; // 孤立块设为不可走
    }
    this._nav = { cell, cols, rows, walk };
    this._pathfinder = new Pathfinder(walk, cols, rows, cell);
  }

  // 求 (sx,sy)→(gx,gy) 的路点数组(绕开墙/家具)，无路返回 null
  _findPath(sx, sy, gx, gy) {
    return this._pathfinder ? this._pathfinder.find(sx, sy, gx, gy) : null;
  }

  // 把 1 格宽的水平门加宽成 2 格：门框(下面那格)在俯视里挡住了,其实能走。
  // 放开门下方那格的：① 地板层瓦片碰撞 ② 覆盖该格的墙物件碰撞。
  _widenDoors(map, ground, wallGroup) {
    const W = map.width, H = map.height, TS = map.tileWidth;
    const isFloor = (cx, cy) => { const t = ground.getTileAt(cx, cy); return t && !t.collides; };
    const isBlocked = (cx, cy) => { const t = ground.getTileAt(cx, cy); return !t || t.collides; };
    const openTiles = [];
    for (let cy = 1; cy < H - 1; cy++) {
      for (let cx = 1; cx < W - 1; cx++) {
        // 水平门：本格可走、上下被挡、左右可走 → 门下方那格(cy+1)放开
        if (isFloor(cx, cy) && isBlocked(cx, cy - 1) && isBlocked(cx, cy + 1)
            && isFloor(cx - 1, cy) && isFloor(cx + 1, cy)) {
          openTiles.push({ cx, cy: cy + 1 });
        }
      }
    }
    for (const { cx, cy } of openTiles) {
      // ① 放开地板层该格碰撞
      const t = ground.getTileAt(cx, cy);
      if (t) t.setCollision(false);
      // ② 放开覆盖该格的墙物件碰撞（如门框墙块 gid149）
      const wx = cx * TS + TS / 2, wy = cy * TS + TS / 2;
      if (wallGroup) {
        wallGroup.getChildren().forEach((img) => {
          if (img.body && Math.abs(img.x - wx) < TS * 0.6 && Math.abs(img.y - wy) < TS * 0.6) {
            img.body.enable = false;
          }
        });
      }
    }
    this._doorOpenCount = openTiles.length;
  }

  // ==================== 玩家 ====================
  _createPlayer() {
    // 主角皮肤 = 捏人选的形象（wdwtb_profile.avatar.skinKey）,默认 so_adam。
    // 统一 SkyOffice：老存档若存的是 LimeZu 皮肤,映射到同风格 SkyOffice,保证与 NPC 同尺寸。
    const LIMEZU_TO_SKY = { adam: 'so_adam', alex: 'so_ash', amelia: 'so_lucy', bob: 'so_nancy' };
    let skinKey = 'so_adam', skinTint = null;
    try {
      const prof = JSON.parse(localStorage.getItem('wdwtb_profile') || '{}');
      let k = prof?.avatar?.skinKey;
      if (k && LIMEZU_TO_SKY[k]) k = LIMEZU_TO_SKY[k];
      if (k && SKINS[k]) {
        skinKey = k;
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
    // 碰撞体=脚下实体（与 NPC 同规格 18×16,贴脚）,人物之间/与家具像真人一样保持距离。
    const bw = 18, bh = 16;
    this.player.body.setSize(bw, bh);
    this.player.body.setOffset((this.player.width - bw) / 2, this.player.height - bh - 2);
    this.player.body.pushable = false; // 玩家也不被 NPC 推走(碰撞只阻挡)

    this.physics.world.setBounds(0, 0, MW, MH);
    // 与地板墙碰撞层 + 各碰撞物件组碰撞（替代旧的 this.obstacles）
    if (this.groundLayer) this.physics.add.collider(this.player, this.groundLayer);
    if (this.solidGroups) this.solidGroups.forEach(g => this.physics.add.collider(this.player, g));

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT); // 按住冲刺
    this.facing = 'down';
  }

  // ==================== NPC ====================
  _createNpcs() {
    // 程序员：读具名同事名册(老陈/江野/周哥/小林/小赵/婷婷)——有名有角色、任务链能"去找谁"。
    // 其余职业：沿用职业主题的 senior/peer/vet 三槽。
    const roster = this.cache.json.get('roster');
    let defs;
    if (WORK_LOOP_CAREERS.has(this.career) && roster && roster.npcs) {
      defs = roster.npcs.map(n => ({
        id: n.id, name: n.name, role: n.role, skin: n.skin,
        x: n.x, y: n.y, tint: n.tint ? parseInt(n.tint, 16) : null,
        label: `${n.name} · ${n.role}`, mark: n.mark || '💬', markColor: n.markColor || '#7ec8ff',
        act: n.act, line: n.line, linesByAct: n.linesByAct || null,
        linesByAffinity: n.linesByAffinity || null,
        favoriteItem: n.favoriteItem || null,
      }));
    } else {
      const theme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
      const [seniorName, seniorTitle] = theme.npcs.senior;
      const [peerName, peerTitle] = theme.npcs.peer;
      const [vetName, vetTitle] = theme.npcs.vet;
      defs = [
        { id: 'senior', name: seniorName, skin: 'so_adam', x: NPC_POS.senior.x, y: NPC_POS.senior.y,
          label: `${seniorName} · ${seniorTitle}`, mark: '❗', markColor: '#ffdd33', act: 1 },
        { id: 'peer', name: peerName, skin: 'so_nancy', x: NPC_POS.peer.x, y: NPC_POS.peer.y,
          label: `${peerName} · ${peerTitle}`, mark: '💬', markColor: '#7ec8ff', line: theme.peerLine },
        { id: 'vet', name: vetName, skin: 'so_lucy', x: NPC_POS.vet.x, y: NPC_POS.vet.y,
          label: `${vetName} · ${vetTitle}`, mark: '💬', markColor: '#7ec8ff', line: theme.vetLine },
      ];
    }

    // 先把玩家工位的椅子占掉(标记 taken 但不坐人),留给玩家自己的工作电脑。
    this.playerDesk = PLAYER_DESK;
    for (const c of (this.chairs || [])) {
      if (Phaser.Math.Distance.Between(c.x, c.y, PLAYER_DESK.chair.x, PLAYER_DESK.chair.y) < 24) {
        c.taken = true; c.isPlayerDesk = true;
      }
    }

    // 取离 (x,y) 最近的空椅子并占用（让 NPC 坐工位、面向电脑而非朝玩家）。
    const takeNearestChair = (x, y) => {
      let best = null, bestD = Infinity;
      for (const c of (this.chairs || [])) {
        if (c.taken) continue;
        const dd = Phaser.Math.Distance.Between(x, y, c.x, c.y);
        if (dd < bestD) { bestD = dd; best = c; }
      }
      if (best) best.taken = true;
      return best;
    };

    // 放一个角色：sit=true 用坐姿帧（坐在椅子上、按椅子朝向），否则站立 idle 帧。
    const placeChar = (x, y, skinKey, facing = 'down', { sit = false, tint = null } = {}) => {
      const sk = ensureSkinAnims(this, skinKey) || ensureSkinAnims(this, 'adam');
      const cfg = SKINS[skinKey] || SKINS.adam;
      const frame = sit ? sk.sitFrame(facing) : sk.idleFrame(facing);
      const spr = this.add.sprite(x, y, sk.tex).setFrame(frame)
        .setScale(cfg.scale ?? SCALE).setOrigin(0.5, 1).setDepth(y);
      if (tint) spr.setTint(tint);
      return spr;
    };

    // 计算坐到某椅子上的脚底坐标+深度（脚底锚点=中心+半身高；深度按 SkyOffice 位移）
    const seatOf = (chair) => {
      const s = SIT_SHIFT[chair.dir] || SIT_SHIFT.down;
      return { x: chair.x + s.dx, y: chair.y + s.dy + CHAR_HALF_H, depth: chair.y + s.depth };
    };

    this.npcs = [];
    for (const d of defs) {
      // 主要 NPC 坐到最近的工位：位置=椅子、朝向=椅子朝向（面向电脑）
      const chair = takeNearestChair(d.x, d.y);
      if (chair) {
        const seat = seatOf(chair);
        d.x = seat.x; d.y = seat.y; d.facing = chair.dir; d._seat = seat;
      } else d.facing = 'down';
      const spr = placeChar(d.x, d.y, d.skin, d.facing, { sit: !!chair, tint: d.tint || null });
      if (chair) spr.setDepth(d._seat.depth); // 正确陷进椅子

      // NPC 名牌（脚下小字：名字 + 角色，让"谁是谁"一目了然）
      const tagText = d.role ? `${d.name}·${d.role}` : d.name;
      const nameTag = this.add.text(d.x, d.y + 8, tagText, {
        fontSize: '12px', color: '#ffffff',
        backgroundColor: '#00000099', padding: { x: 5, y: 2 },
      }).setOrigin(0.5, 0).setDepth(d.y + 1);

      // 头顶交互浮标（像素图标,上下浮动）
      const markY = d.y - 78;
      const mark = this.add.image(d.x, markY, EMOJI_TO_ICON[d.mark] || ICON_KEYS.chat)
        .setOrigin(0.5, 1).setDepth(9000)
        .setTint(Phaser.Display.Color.HexStringToColor(d.markColor).color);
      this.tweens.add({
        targets: mark, y: markY - 6,
        duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });

      this.npcs.push({ ...d, spr, mark, nameTag, markState: d.mark, defaultMark: d.mark, defaultMarkColor: d.markColor });
    }

    // 背景同事：从 office_npcs.json 读配置，坐满剩余工位（白天像真实公司满员）。
    // tint 把 4 个 atlas 扩成十几个视觉不同的人。纯装饰不可交互。
    this.workers = [];
    const cfgData = this.cache.json.get('office_npcs');
    const workerDefs = (cfgData && cfgData.workers) || [];
    // 优先坐满右侧开放工位区（x>780），会议室/茶水间(左侧)留大部分空着——
    // 真实公司平时人在工位上，会议室多数时候没人。
    const freeChairs = (this.chairs || []).filter(c => !c.taken)
      .sort((a, b) => b.x - a.x);
    workerDefs.forEach((w, i) => {
      const chair = freeChairs[i];
      if (!chair) return; // 椅子坐满就停
      chair.taken = true;
      const tint = w.tint ? parseInt(w.tint, 16) : null;
      const seat = seatOf(chair);
      const spr = placeChar(seat.x, seat.y, w.skin, chair.dir, { sit: true, tint });
      spr.setDepth(seat.depth); // 正确陷进椅子
      // 存动画访问器（sit/idle 帧），供 NpcAgent 起身/坐下切帧
      const anims = ensureSkinAnims(this, w.skin) || ensureSkinAnims(this, 'adam');
      const worker = { ...w, spr, chair, anims, seat };
      worker.agent = new NpcAgent(this, worker);
      this.workers.push(worker);
    });

    // 每个 NPC/同事一个"脚下静态挡块"(zone + 静态体)——这是可靠挡住玩家的方案。
    // 坐着的挡块固定；走动的(补间移动)每帧把挡块同步到脚下,所以走动的同事也挡人。
    this.npcColliders = this.physics.add.staticGroup();
    const addBody = (spr) => {
      const z = this.add.zone(spr.x, spr.y - 16, 22, 30); // 覆盖坐着的身体大部分,可靠挡人
      this.physics.add.existing(z, true);
      z.body.updateFromGameObject();
      this.npcColliders.add(z);
      return z;
    };
    this.npcs.forEach(n => { n._body = addBody(n.spr); });
    this.workers.forEach(w => { w._body = addBody(w.spr); });
    if (this.player) this.physics.add.collider(this.player, this.npcColliders);

    // 头顶心情泡泡：每个同事一个,随时段变化(真实职场情绪感)
    [...this.npcs, ...this.workers].forEach(e => { e._mood = this._makeMoodBubble(e.spr); });
    this._refreshAllMoods();
    if (this._moodTimer) this._moodTimer.remove();
    this._moodTimer = this.time.addEvent({
      delay: 18000, loop: true, callback: () => this._shuffleSomeMoods(),
    });

    this._startNpcLife();
  }

  // ==================== NPC 头顶状态泡泡（一句话状态）====================
  // 小气泡=深色圆角底 + 白字,显示同事当下在干嘛("写代码💻""要上厕所🚽""赶deadline😱")。
  _makeMoodBubble(spr) {
    const t = this.add.text(spr.x, spr.y - 52, '', {
      fontSize: '12px', color: '#f4f4ff', backgroundColor: '#242436e0',
      padding: { x: 7, y: 4 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(9000);
    if (this.uiCamera) this.uiCamera.ignore(t);
    return t;
  }

  _moodPool() {
    const seg = this.timeSystem ? this.timeSystem.current.id : 'forenoon';
    return MOODS_POOL[seg] || MOODS_POOL.forenoon;
  }

  _positionMood(e) {
    if (e._mood && e.spr) e._mood.setPosition(e.spr.x, e.spr.y - 52).setDepth(e.spr.y + 30);
  }

  _setMood(e) {
    if (!e || !e._mood || !e.spr) return;
    e._mood.setText(Phaser.Utils.Array.GetRandom(this._moodPool()));
    this._positionMood(e);
    e._mood.setVisible(e.spr.visible);
  }

  _refreshAllMoods() {
    // 出行中的同事保留其"目的"文字,不被时段刷新打断(根治"去厕所走一半突然变打卡")
    [...(this.npcs || []), ...(this.workers || [])]
      .filter(e => !(e.agent && e.agent.busy))
      .forEach(e => this._setMood(e));
  }

  // 每隔几秒随机给几个同事换一句状态（让泡泡"活"起来）。出行中的人保留其"目的"文字,不打断。
  _shuffleSomeMoods() {
    const all = [...(this.npcs || []), ...(this.workers || [])]
      .filter(e => e.spr && e.spr.visible && !(e.agent && e.agent.busy));
    if (!all.length) return;
    const n = Math.min(2, all.length);
    for (let i = 0; i < n; i++) this._setMood(Phaser.Utils.Array.GetRandom(all));
  }

  // 走到高家具/墙身后时，把它半透明化露出人物（像素游戏惯用遮挡处理）。
  // 判定：家具在玩家"前面"(y更大→绘制盖住玩家) 且横向重叠 且纵向在其高度内 → 淡化。
  _updateOcclusion() {
    if (!this._occluders || !this.player) return;
    const px = this.player.x, py = this.player.y;
    for (const o of this._occluders) {
      if (!o.active) continue;
      const dx = Math.abs(o.x - px);
      const dyc = o.y - py; // >0：家具在玩家下方(前面),会盖住玩家
      const behind = dx < (o.displayWidth / 2 + 6) && dyc > 4 && dyc < (o.displayHeight * 0.85);
      const target = behind ? 0.5 : 1;
      if (o.alpha !== target) o.setAlpha(target);
    }
  }

  // 每帧驱动走动中的同事（补间移动 + 挡块/状态泡泡跟随脚下）
  _updateWorkers(now) {
    if (!this.workers) return;
    for (const w of this.workers) {
      if (!w.agent || !w.spr) continue;
      const busy = w.agent.busy;
      if (w.agent.state === 'walking') {
        w.agent.update(now);
        if (w._mood) this._positionMood(w);
        this._syncBody(w); // 走动的同事挡块跟着脚下走(也挡玩家)
      }
      // 出行结束回到工位 → 挡块归位到座位 + 泡泡换回普通状态
      if (w._wasBusy && !busy) {
        this._syncBody(w);
        this._setMood(w); this._positionMood(w);
      }
      w._wasBusy = busy;
    }
  }

  // 把某同事的脚下挡块同步到其精灵当前位置
  _syncBody(w) {
    if (!w._body || !w._body.body || !w.spr) return;
    w._body.x = w.spr.x; w._body.y = w.spr.y - 16;
    w._body.body.updateFromGameObject();
  }

  // 办公室"生活"调度：每隔几秒挑一个在座同事,让他【带着明确目的】起身——去厕所/茶水间/
  // 打印/开会/找同事……用 A* 寻路真正走过去(绕开墙和家具)、做完事再走回工位坐下。
  _startNpcLife() {
    // 目的地 POI：一句"我去干嘛" + 目标点 + 停留时长。开局把每个点吸附到最近可走格,
    // 保证 NPC 真的能走到、不会走进墙被甩出图。吸附不到的直接丢弃。
    // 只用【地图里真实存在的地点】做目的地(没有厕所就不去厕所)——去了真的到,到了真的做。
    const raw = [
      { id: 'coffee',  label: '去茶水间 ☕',     x: 400, y: 300, dwell: 3600 }, // 左上休息区
      { id: 'water',   label: '去接杯水 🥤',     x: 430, y: 430, dwell: 2200 }, // 售货机
      { id: 'meeting', label: '去会议室 📋',     x: 400, y: 640, dwell: 6000 }, // 左下会议室
      { id: 'board',   label: '去看看白板 📊',   x: 560, y: 470, dwell: 2600 }, // 白板
      { id: 'printer', label: '去打印文件 🖨️',   x: 900, y: 810, dwell: 2400 }, // 打印机
      { id: 'stroll',  label: '起来走两步 🚶',   x: 704, y: 432, dwell: 2600 }, // 走廊
      { id: 'chat',    label: '找同事聊两句 💬', x: 1040, y: 680, dwell: 3000 }, // 工位群
    ];
    this._pois = [];
    for (const poi of raw) {
      const snap = this._pathfinder ? this._pathfinder.snapToWalkable(poi.x, poi.y) : { x: poi.x, y: poi.y };
      if (snap) this._pois.push({ ...poi, x: snap.x, y: snap.y });
    }
    if (this._npcLifeTimer) this._npcLifeTimer.remove();
    // 真实职场：大部分人一直在工位工作，偶尔有人起身（茶水/打印/伸展）。
    // tick 间隔 15 秒（不是 4 秒），且每次只有 ~30% 概率真的有人动，同时最多 1 人在走。
    this._npcLifeTimer = this.time.addEvent({
      delay: 15000, loop: true, callback: () => this._tickNpcLife(),
    });
  }

  _tickNpcLife() {
    if (this.dialogueActive || !this.workers?.length || !this._pois) return;
    const seg = this.timeSystem?.current;
    // 深夜/午休在岗少,走动更少
    if (seg && seg.population < 0.3 && Phaser.Math.RND.frac() > 0.3) return;
    // 同时最多 1 人在走（真实职场不会 3-4 人同时在办公室里窜）
    const moving = this.workers.filter(w => w.agent && w.agent.busy).length;
    if (moving >= 1) return;
    // 每次只有 30% 概率真的有人起身（大部分时间所有人安静坐着）
    if (Phaser.Math.RND.frac() > 0.3) return;
    const idle = this.workers.filter(w => w.spr?.visible && w.agent && !w.agent.busy);
    if (!idle.length) return;
    const w = Phaser.Utils.Array.GetRandom(idle);
    const seat = w.seat || { x: w.chair.x, y: w.chair.y };
    // 偏好近距离目的地（茶水/伸展/白板），减少穿越整个地图的长途行走
    const pois = Phaser.Utils.Array.Shuffle(this._pois.slice());
    for (const poi of pois) {
      const pathTo = this._findPath(seat.x, seat.y, poi.x, poi.y);
      if (!pathTo || pathTo.length < 1) continue;
      const pathBack = this._findPath(poi.x, poi.y, seat.x, seat.y);
      if (!pathBack || pathBack.length < 1) continue;
      // 让回程终点精确回到座位
      pathBack[pathBack.length - 1] = { x: seat.x, y: seat.y };
      if (w.agent.goTrip(pathTo, pathBack, poi.dwell)) {
        if (w._mood) { w._mood.setText(poi.label); this._positionMood(w); } // 泡泡显示"去干嘛"
      }
      return;
    }
  }

  // 头顶冒一个短暂的情绪气泡（上浮 + 淡出），零美术、纯氛围。
  _npcEmote(worker, char) {
    const spr = worker.spr;
    if (!spr || !spr.scene) return;
    const t = this.add.text(spr.x, spr.y - 48, char, { fontSize: '20px' })
      .setOrigin(0.5, 1).setDepth(9000);
    this.tweens.add({
      targets: t, y: t.y - 16, alpha: 0, duration: 1600, ease: 'Sine.out',
      onComplete: () => t.destroy(),
    });
  }

  update(time) {
    if (!this.player?.body) return;

    // 状态即演出：按主导状态染屏 + 音效 + 减速（让状态条"活"起来）
    this._updateMoodFx(time || 0);
    this._updateWorkers(this.time.now); // 驱动走动同事(物理移动+到达检测)
    this._updateOcclusion(); // 走到家具身后半透明露出人物
    this._updateObjectiveHud(); // 常驻目标 HUD + 方向箭头

    // HUD 随对话状态自动让路（半透明），单点同步不怕遗漏
    if (this.statusUI && this._lastDim !== this.dialogueActive) {
      this._lastDim = this.dialogueActive;
      this.statusUI.setDimmed(this.dialogueActive);
    }

    // ESC 唤起暂停菜单（对话进行中不触发，交给对话自己的 ESC）
    if (!this.dialogueActive && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.scene.pause();
      this.scene.launch('PauseScene', this._pausePayload());
      return;
    }

    // T=进入心象世界（倾听内心）：随时可以进入内心探索空间
    if (!this.dialogueActive && Phaser.Input.Keyboard.JustDown(this.tKey)) {
      this._enterMindscapeFree();
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

    // 坐着状态：移动键=起身；E=（在自己工位）开始工作 /（普通座位）起身
    if (this._sitting) {
      this.player.setVelocity(0, 0);
      const mv = this.cursors.left.isDown || this.cursors.right.isDown || this.cursors.up.isDown || this.cursors.down.isDown
        || this.wasd.A.isDown || this.wasd.D.isDown || this.wasd.W.isDown || this.wasd.S.isDown;
      const tAxis = this.touchControls ? this.touchControls.getAxis() : { x: 0, y: 0 };
      if (mv || Math.abs(tAxis.x) > 0.3 || Math.abs(tAxis.y) > 0.3) { this._standUp(); return; }
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        if (this._sitting.isPlayerDesk) this._openWorkBoard();
        else this._standUp();
      }
      return;
    }

    // 耗竭时移动变慢（状态演出：身体拖着走）
    // 按住 Shift 冲刺(耗竭时冲刺打折)
    const sprint = (this.shiftKey && this.shiftKey.isDown) ? 1.65 : 1;
    const speed = 130 * (this._moodSpeedMul || 1) * sprint;
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
      // 脚步声：按步频节流（冲刺时更密），极轻不吵
      const stepGap = sprint > 1 ? 220 : 320;
      if (!this._lastStepAt || time - this._lastStepAt > stepGap) {
        this._lastStepAt = time;
        AudioSystem.footstep();
      }
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
    // 空椅子可坐（NPC 占用的不算；玩家工位椅虽标记 taken 但留给玩家,可坐）
    for (const ch of (this.chairs || [])) {
      if (ch.taken && !ch.isPlayerDesk) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, ch.x, ch.y + 6);
      if (d < nd) { nd = d; nearest = ch; nearestType = 'chair'; }
    }

    this.activeNpc = nearestType === 'npc' ? nearest : null;
    this.activeObject = nearestType === 'object' ? nearest : null;
    // 高亮圈跟随当前可交互的真实家具/座位（NPC 不用高亮圈,有头顶浮标）
    if (this._objHighlight) {
      if (nearestType === 'object') {
        this._objHighlight.setPosition(nearest.x, nearest.y + 10).setVisible(true);
      } else if (nearestType === 'chair') {
        this._objHighlight.setPosition(nearest.x, nearest.y + 6).setVisible(true);
      } else {
        this._objHighlight.setVisible(false);
      }
    }
    if (nearest) {
      let label;
      if (nearestType === 'npc') label = `与 ${nearest.name} 交谈`;
      else if (nearestType === 'chair') label = nearest.isPlayerDesk ? '坐下办公' : '坐下';
      else label = nearest.prompt;
      this.ePrompt.setText(`［ E ］${label}`).setVisible(true);
      if (this.touchControls) this.touchControls.setInteractVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        if (nearestType === 'npc') this._interact(nearest);
        else if (nearestType === 'chair') this._sitOnChair(nearest);
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
    // 工位电脑：开工作日循环的核心——打开今日工单板（程序员切片）
    if (obj.id === 'computer' && this.workLoopEnabled) {
      this._openWorkBoard();
      return;
    }
    // 冷却检查（daily）
    if (obj.cooldown === 'daily' && this._cooldowns[obj.id]) {
      this._showThoughtBubble('（这个今天已经用过了。）', '#9a9ac0');
      return;
    }
    const action = obj.action || '';
    // buy_drink：打开商店面板（售货机/咖啡角），买到的物品进背包
    if (action === 'buy_drink') {
      this._openShopPanel(obj);
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
      this.scene.launch('PauseScene', this._pausePayload({ openPanel: 'quests' }));
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
    // 精力=状态栏 energy（统一双轨）：交互消耗 4，耗尽提示下班
    this.stateSystem.change('energy', -4);
    this._updateDayHud();
    const gate = energyGate(this.stateSystem.get('energy'));
    if (gate.forceOff && !this._exhaustedPrompted) {
      this._exhaustedPrompted = true;
      this._showThoughtBubble('（精力见底了……今天到极限了，该下班了。）', '#f0c060');
    }
  }

  // ==================== 商店面板（售货机/咖啡角）====================
  // 买到的物品进背包（ItemSystem），送礼/使用二选一——钱有了去处。
  _openShopPanel(obj) {
    if (this.dialogueActive) return;
    this.dialogueActive = true;
    this.ePrompt.setVisible(false);
    if (this.guideText) this.guideText.setVisible(false);
    const source = obj.id === 'vending' ? 'vending' : 'coffee';
    const title = obj.id === 'vending' ? '自动售货机' : '咖啡角';
    const goods = Object.entries(this.items.catalog)
      .filter(([, def]) => def.source === source)
      .map(([id, def]) => ({ id, ...def }));

    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10002);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    const close = () => {
      c.destroy(true);
      this.dialogueActive = false;
      if (this.guideText) this.guideText.setVisible(true);
      this._afterInteract(obj);
    };
    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
      .setScrollFactor(0).setInteractive();
    c.add(mask);
    const pw = 620, ph = 140 + goods.length * 84 + 40, px = width / 2, py = height / 2;
    c.add(this.add.rectangle(px, py, pw, ph, 0x14141f, 0.98).setStrokeStyle(2, 0xd4a353));
    c.add(this.add.text(px - pw / 2 + 28, py - ph / 2 + 30, `🛒 ${title}`, {
      fontSize: '26px', fill: '#ffd24d', fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    // 当前余额（右上角，购买后更新）
    const moneyLabel = this.add.text(px + pw / 2 - 56, py - ph / 2 + 30,
      `💰 ${this.stateSystem.get('money')}`, { fontSize: '20px', fill: '#f0c060', fontStyle: 'bold' })
      .setOrigin(1, 0.5);
    c.add(moneyLabel);

    goods.forEach((g, i) => {
      const gy = py - ph / 2 + 100 + i * 84;
      c.add(this.add.rectangle(px, gy, pw - 56, 72, 0x232338, 0.96).setStrokeStyle(1, 0x4a4a6a));
      c.add(this.add.text(px - pw / 2 + 52, gy - 14, `${g.icon} ${g.name}`, {
        fontSize: '19px', fill: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5));
      c.add(this.add.text(px - pw / 2 + 52, gy + 16, g.desc || '', {
        fontSize: '13px', fill: '#8a8a9e',
      }).setOrigin(0, 0.5));
      c.add(this.add.text(px + pw / 2 - 160, gy, `💰${g.price}`, {
        fontSize: '17px', fill: '#f0c060',
      }).setOrigin(1, 0.5));
      const buyBtn = this.add.rectangle(px + pw / 2 - 84, gy, 96, 44, 0x2a4a3e, 0.96)
        .setStrokeStyle(2, 0x5fbf7f).setInteractive({ useHandCursor: true });
      buyBtn.on('pointerover', () => buyBtn.setFillStyle(0x35604e));
      buyBtn.on('pointerout', () => buyBtn.setFillStyle(0x2a4a3e));
      buyBtn.on('pointerdown', () => {
        const money = this.stateSystem.get('money');
        if (money < g.price) {
          this._showThoughtBubble('（钱不太够……下次吧。）', '#e8735a');
          return;
        }
        const r = this.items.add(g.id);
        if (!r.ok) {
          if (r.reason === 'full') this._showThoughtBubble('（背包满了，先用掉一些吧。）', '#e8a05a');
          return;
        }
        this.stateSystem.change('money', -g.price);
        moneyLabel.setText(`💰 ${this.stateSystem.get('money')}`);
        AudioSystem.uiClick();
        Juice.floatText(this, this.scale.width / 2, this.scale.height / 2 - 160,
          `${g.icon} ${g.name} 已放进背包`, '#7eff9a');
      });
      c.add(buyBtn);
      c.add(this.add.text(px + pw / 2 - 84, gy, '购买', { fontSize: '17px', fill: '#eafff0', fontStyle: 'bold' }).setOrigin(0.5));
    });

    const closeBtn = this.add.text(px + pw / 2 - 16, py - ph / 2 + 12, '✕', { fontSize: '24px', fill: '#8a8a9e' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff9a9a'));
    closeBtn.on('pointerdown', close);
    c.add(closeBtn);
    this.time.delayedCall(120, () => mask.on('pointerdown', close));
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
      // 该 NPC 是某进行中任务的"下一个 talk 目标" → 说对接台词(talkLines)并推进
      let questLine = null;
      for (const q of this.questSystem.active()) {
        const next = q.ordered ? this.questSystem.nextObjective(q.id) : null;
        const isTarget = next
          ? (next.kind === 'talk' && next.target === npc.id)
          : (q.objectives || []).some(o => o.kind === 'talk' && o.target === npc.id
              && !this.questSystem._objDone(q.id, o.id));
        if (isTarget) {
          questLine = (q.talkLines && q.talkLines[npc.id]) || null;
          break;
        }
      }
      // 上报 talk 进度（该 NPC 是某进行中任务的 talk 目标）
      this.questSystem.progress('talk', npc.id);
      this._updateNpcMarks();
      if (questLine) {
        // 任务对接也涨好感（E5）
        this._noteNpcChat(npc, { questTalk: true });
        this._showLine(npc.name, questLine);
        return;
      }
    }

    // 其余 NPC → 小交互菜单：聊两句 / 送礼 / 算了
    this._openNpcMenu(npc);
  }

  // ==================== NPC 交互菜单（聊天/送礼）====================
  _openNpcMenu(npc) {
    if (this.dialogueActive) return;
    this.dialogueActive = true;
    this.ePrompt.setVisible(false);
    if (this.guideText) this.guideText.setVisible(false);
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10001);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    const kb = this.input.keyboard;
    const closeMenu = (keepFrozen = false) => {
      kb.off('keydown-ESC', onEsc);
      c.destroy(true);
      if (!keepFrozen) {
        this.dialogueActive = false;
        if (this.guideText) this.guideText.setVisible(true);
      }
    };
    const onEsc = () => closeMenu(false);

    const pw = 380, ph = 250, px = width / 2, py = height - ph / 2 - 80;
    c.add(this.add.rectangle(px, py, pw, ph, 0x14141f, 0.97).setStrokeStyle(2, 0x4a4a6a));
    c.add(this.add.text(px, py - ph / 2 + 28, `${npc.name} · ${npc.role || ''}`, {
      fontSize: '20px', fill: '#ffd24d', fontStyle: 'bold',
    }).setOrigin(0.5));

    const menuBtn = (i, label, cb) => {
      const by = py - ph / 2 + 74 + i * 56;
      const btn = this.add.rectangle(px, by, pw - 48, 46, 0x232338, 0.96)
        .setStrokeStyle(1, 0x4a4a6a).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setFillStyle(0x33334e));
      btn.on('pointerout', () => btn.setFillStyle(0x232338));
      btn.on('pointerdown', () => { AudioSystem.uiClick(); cb(); });
      c.add(btn);
      c.add(this.add.text(px, by, label, { fontSize: '17px', fill: '#e8e8f4' }).setOrigin(0.5));
    };
    menuBtn(0, '💬 聊两句', () => {
      closeMenu(true); // 保持冻结,由 _showLine 接管
      this.dialogueActive = false; // _showLine 会重新置 true
      this._noteNpcChat(npc, { questTalk: false });
      const aff = this.relations ? this.relations.getAffinity(npc.id) : 50;
      const line = pickRelationAwareLine({
        npc, act: this.act, affinity: aff, rng: () => Phaser.Math.RND.frac(),
      }) || npcLineForAct(npc, this.act);
      if (line) this._showNpcLineWithMemory(npc, line);
      else if (this.guideText) this.guideText.setVisible(true);
    });
    menuBtn(1, '🎁 送TA点什么', () => {
      closeMenu(true);
      this.dialogueActive = false;
      this._openGiftPanel(npc);
    });
    menuBtn(2, '✕ 算了', () => closeMenu(false));
    this.time.delayedCall(120, () => kb.on('keydown-ESC', onEsc));
  }

  // 送礼面板：列出背包里可送的物品，选一件送出（每 NPC 每天限 1 件）
  _openGiftPanel(npc) {
    const giftable = this.items ? this.items.giftable() : [];
    if (!giftable.length) {
      this._showThoughtBubble('（背包里没有能送的东西。去售货机买点吧。）', '#9a9ac0');
      if (this.guideText) this.guideText.setVisible(true);
      return;
    }
    if (!this.items.canGiftTo(npc.id)) {
      this._showThoughtBubble('（今天已经送过TA东西了。）', '#9a9ac0');
      if (this.guideText) this.guideText.setVisible(true);
      return;
    }
    this.dialogueActive = true;
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10002);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    const closePanel = (keepFrozen = false) => {
      c.destroy(true);
      if (!keepFrozen) {
        this.dialogueActive = false;
        if (this.guideText) this.guideText.setVisible(true);
      }
    };
    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7)
      .setScrollFactor(0).setInteractive();
    c.add(mask);
    const pw = 540, ph = 120 + giftable.length * 68 + 30, px = width / 2, py = height / 2;
    c.add(this.add.rectangle(px, py, pw, ph, 0x14141f, 0.98).setStrokeStyle(2, 0xd48ab5));
    c.add(this.add.text(px, py - ph / 2 + 30, `🎁 送给 ${npc.name}`, {
      fontSize: '24px', fill: '#ffb0d8', fontStyle: 'bold',
    }).setOrigin(0.5));

    giftable.forEach((it, i) => {
      const gy = py - ph / 2 + 90 + i * 68;
      const row = this.add.rectangle(px, gy, pw - 48, 58, 0x232338, 0.96)
        .setStrokeStyle(1, 0x4a4a6a).setInteractive({ useHandCursor: true });
      row.on('pointerover', () => row.setFillStyle(0x33334e));
      row.on('pointerout', () => row.setFillStyle(0x232338));
      row.on('pointerdown', () => {
        const plan = planGift({ items: this.items, npc, itemId: it.id });
        if (!plan.ok) { closePanel(false); return; }
        this.items.removeOne(it.id);
        this.items.markGifted(npc.id);
        this.relations.bump(npc.id, plan.affinity);
        this.relations.remember(npc.id, 'gifted');
        AudioSystem.success();
        Juice.floatText(this, this.player.x, this.player.y - 80, `好感 +${plan.affinity}`, '#7eff9a');
        closePanel(true);
        this.dialogueActive = false; // _showLine 重新接管冻结
        const thanks = plan.favorite
          ? `「${it.name}！你怎么知道我就好这口？谢了！」`
          : '「哟，谢啦。改天请你喝东西。」';
        this._showLine(npc.name, thanks);
      });
      c.add(row);
      c.add(this.add.text(px - pw / 2 + 46, gy, `${it.icon} ${it.name} ×${it.count}`, {
        fontSize: '18px', fill: '#ffffff',
      }).setOrigin(0, 0.5));
      c.add(this.add.text(px + pw / 2 - 46, gy, `好感+${it.giftAffinity}`, {
        fontSize: '14px', fill: '#ffb0d8',
      }).setOrigin(1, 0.5));
    });

    const closeBtn = this.add.text(px + pw / 2 - 16, py - ph / 2 + 12, '✕', { fontSize: '24px', fill: '#8a8a9e' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff9a9a'));
    closeBtn.on('pointerdown', () => closePanel(false));
    c.add(closeBtn);
    this.time.delayedCall(120, () => mask.on('pointerdown', () => closePanel(false)));
  }

  /**
   * 结算一次 NPC 聊天：好感 + 记忆；跨 warm 档时轻浮动字。
   * @param {{ id: string, name?: string }} npc
   * @param {{ questTalk?: boolean }} [opts]
   */
  _noteNpcChat(npc, opts = {}) {
    if (!this.relations || !npc?.id) return;
    const before = this.relations.getAffinity(npc.id);
    const r = applyNpcChat(this.relations, npc.id, opts);
    // 首次聊天或刚跨进 warm：轻手感，让关系可感知
    if (r.firstTalk || (before < 65 && r.affinity >= 65)) {
      const label = r.firstTalk
        ? `与${npc.name || '同事'}相识`
        : `与${npc.name || '同事'}更熟了`;
      Juice.floatText(
        this,
        this.player?.x || 400,
        (this.player?.y || 300) - 90,
        label,
        '#7ec8ff',
      );
    }
  }

  /** NPC id→名（暂停/结局摘要用） */
  _npcNameMap() {
    const names = {};
    for (const n of (this.npcs || [])) {
      if (n?.id) names[n.id] = n.name || n.id;
    }
    return names;
  }

  /** 关系一句话摘要（E5） */
  _relationSummaryText() {
    return summarizeRelations(this.relations, this._npcNameMap()).text || null;
  }

  /** 接取任务后的持久提示卡片（停留 4 秒）——让玩家明确"我刚接了什么任务" */
  _showQuestAcceptedCard(questId, fallbackTitle) {
    if (this._questCard) { try { this._questCard.destroy(); } catch (e) {} }
    const q = this.questSystem?.defs?.[questId];
    if (!q) return;
    const { width: W } = this.scale;
    const next = this.questSystem.nextObjective(questId);
    const npcName = (id) => (this.npcs || []).find(n => n.id === id)?.name || id;
    let stepHint = '';
    if (next) {
      if (next.kind === 'talk') stepHint = `👉 下一步：去找${npcName(next.target)}（走过去按 E）`;
      else if (next.kind === 'minigame') stepHint = '👉 下一步：回自己工位坐下 → 开始工作';
      else stepHint = `👉 下一步：${next.text}`;
    }
    const c = this.add.container(W / 2, 180).setScrollFactor(0).setDepth(12001).setAlpha(0);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    c.add(this.add.rectangle(W / 2, 0, 520, 120, 0x141422, 0.96).setStrokeStyle(2, 0xffd24d, 0.7).setOrigin(0.5));
    c.add(this.add.text(W / 2, -36, '📋 新任务接取', { fontSize: '16px', color: '#ffd24d', fontStyle: 'bold' }).setOrigin(0.5));
    c.add(this.add.text(W / 2, -8, q.title || fallbackTitle || '新任务', { fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#0a0a14', strokeThickness: 3 }).setOrigin(0.5));
    if (q.desc) c.add(this.add.text(W / 2, 18, q.desc, { fontSize: '14px', color: '#9a9ab0', wordWrap: { width: 460, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5));
    if (stepHint) c.add(this.add.text(W / 2, 40, stepHint, { fontSize: '15px', color: '#7eff9a', stroke: '#0a0a14', strokeThickness: 2 }).setOrigin(0.5));
    this._questCard = c;
    this.tweens.add({
      targets: c, alpha: 1, duration: 300,
      onComplete: () => {
        this.time.delayedCall(4000, () => {
          if (!this._questCard || this._questCard !== c) return;
          this.tweens.add({ targets: c, alpha: 0, y: 160, duration: 400,
            onComplete: () => { try { c.destroy(); } catch (e) {} if (this._questCard === c) this._questCard = null; } });
        });
      },
    });
  }

  /** 进 PauseScene 的公共载荷 */
  _pausePayload(extra = {}) {
    return {
      origin: 'WorldScene',
      stateSystem: this.stateSystem,
      career: this.career,
      act: this.act,
      questSystem: this.questSystem,
      choiceLog: this.choiceLog,
      relationSummary: this._relationSummaryText(),
      itemSystem: this.items,
      ...extra,
    };
  }

  /** 进结局场景的公共载荷（含关系摘要，供报告柱） */
  _endingPayload(ending) {
    return {
      ending: ending || this.career,
      career: this.career,
      subRole: this.subRole,
      stats: this.stateSystem.getAll(),
      choiceLog: this.choiceLog ? this.choiceLog.serialize() : null,
      projectProgress: this.projectSystem ? this.projectSystem.progress : null,
      relationSummary: this._relationSummaryText(),
      slot: this._activeSlot || 1,
    };
  }

  // ==================== 导师剧情状态机（连贯性核心）====================
  // 让"剧情"成为里程碑、"经营期"成为日常，二者交替推进——消除"一口气读完整幕"。
  // 轻量职业：走近一次播完整单文件到 ending（无经营期）。
  // 深度职业：ready→播本幕剧情→working(经营期，做任务过日子)→天数攒够→播下一幕。
  _interactSenior(npc) {
    // 任务层（交付/接取/进行中提示）→ 纯逻辑 seniorInteractAction + applySeniorAction
    // 剧情层（ready/working/ending）仍由本场景状态机负责。
    if (this.questSystem) {
      const action = seniorInteractAction({
        questSystem: this.questSystem,
        story: this._story,
        workLoopEnabled: this.workLoopEnabled,
        act: this.act,
      });
      if (action.kind === 'deliver') {
        const applied = applySeniorAction(this.questSystem, action);
        if (applied.ok) {
          Juice.celebrate(this, this.player.x, this.player.y - 30, 0xffd24d);
          Juice.floatText(this, this.player.x, this.player.y - 70, '✓ 交付', '#7eff7e');
          AudioSystem.questDone?.();
          this._showLine(npc.name, applied.line || action.line);
          if (applied.progressGain && this.projectSystem) {
            this.projectSystem.adjustProgress(applied.progressGain);
            this._updateProjectHud && this._updateProjectHud();
            Juice.floatText(
              this,
              this.player.x + 40,
              this.player.y - 50,
              `项目 +${applied.progressGain}%`,
              '#5fbf7f',
            );
          }
          this._updateNpcMarks();
          this._autoSave?.();
          return;
        }
      }
      if (action.kind === 'accept') {
        const applied = applySeniorAction(this.questSystem, action);
        if (applied.ok) {
          Juice.pop(this, npc.spr || this.player, 1.08);
          AudioSystem.uiClick?.();
          this._showLine(npc.name, applied.line || action.acceptLine);
          this._updateNpcMarks();
          // 持久"新任务接取"卡片：停 4 秒，让玩家明确知道接了什么
          this._showQuestAcceptedCard(action.questId || applied.questId, action.title || applied.line);
          return;
        }
      }
      if (action.kind === 'hint') {
        this._showLine(npc.name, action.line);
        return;
      }
    }

    // 轻量职业：默认单文件一次播完到 ending。
    // 若已纳入工作日循环(如设计师迷你完整版)：ready 播 light 剧情 → ending 动作改入经营期；
    // working 时做任务链/工单；项目 100% 再走近导师进结局。
    if (LIGHT_CAREERS.includes(this.career)) {
      if (this.workLoopEnabled) {
        if (this._story.phase === 'ready') {
          this._playStory(`./data/light_${this.career}.json`);
          return;
        }
        if (this._story.phase === 'working') {
          const p = this.projectSystem ? Math.round(this.projectSystem.progress) : 0;
          if (canFinishLightWorkLoop(this._story, p)) {
            const endId = preferredLightEnding(this._story, 'light');
            SceneRouter.goto(this, 'EndingScene', this._endingPayload(endId));
            return;
          }
          this._showLine(npc.name, `稿还在推进中——现在项目 ${p}%。\n把任务链和今日工单往前推，推满 100% 再来找我收尾。`);
          return;
        }
      }
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
      // 工作日循环职业(程序员)：由【项目里程碑】推进下一幕(取代"熬够N天")
      if (this.workLoopEnabled) {
        const adv = tryAdvanceByMilestone(this._story, this.act, this.career, this.deep !== false);
        this._story = adv.story;
        if (adv.advanced) {
          this.act = adv.act;
          this._persistStory();
          this._playStory(adv.playUrl);
        } else {
          const p = this.projectSystem ? Math.round(this.projectSystem.progress) : 0;
          this._showLine(npc.name, `这阶段的活儿还没到收尾。\n把项目往前推推——现在 ${p}%，推进到下一个节点，我们再聊下一步。`);
        }
        return;
      }
      // 其余深度职业：沿用天数攒够推进
      const dayAdv = tryAdvanceByDays(this._story, this.act, this.career);
      this._story = dayAdv.story;
      if (dayAdv.advanced) {
        this.act = dayAdv.act;
        this._persistStory();
        this._playStory(dayAdv.playUrl);
      } else {
        this._showLine(npc.name, `这阶段的活儿还没到收尾的时候。\n再忙上${dayAdv.daysLeft}天吧——做做手头的任务，累了就下班回家。等你缓过来，我们再聊下一步。`);
      }
      return;
    }
  }

  // 播一段剧情 JSON（提取自原 senior 逻辑）。播完由 dialogueEngine 的 action 驱动后续。
  _playStory(url) {
    this.dialogueActive = true;
    this._inStoryDialogue = true;   // 标记：这是剧情对话（用于断点存档）
    this._storyDoneThisPlay = false; // 本次是否演到幕末(next_act/ending)
    this.ePrompt.setVisible(false);
    if (this.guideText) this.guideText.setVisible(false);
    if (this.offWorkBtn) this.offWorkBtn.setVisible(false); // 剧情场景中隐藏办公室按钮
    fetch(url)
      .then(res => { if (!res.ok) throw new Error(`加载剧情失败:HTTP ${res.status}`); return res.json(); })
      .then(data => {
        this.dialogueEngine._clearUI();
        // 断点续演：若本幕上次中途退出,从断点节点接着演,不再从头重播
        const cp = this._story.checkpoint;
        const resumeId = (cp && cp.act === this.act) ? cp.node : null;
        this.dialogueEngine.start(data, resumeId);
      })
      .catch(err => {
        console.error('[WorldScene]', err.message);
        this.dialogueActive = false;
        this._inStoryDialogue = false;
      });
  }

  // 自动保存：完整写档 + 右上角"💾 已保存"提示（渐显渐隐）。
  // 关键节点调用：交付任务/里程碑/剧情推进/下班。
  _autoSave() {
    this._persistStory();
    if (!this._saveToast) {
      const { width: SW } = this.scale;
      this._saveToast = this.add.container(SW - 20, 120).setScrollFactor(0).setDepth(9999).setAlpha(0);
      const icon = this.add.image(-92, 0, ICON_KEYS.save).setTint(0x9fd89f).setOrigin(0.5);
      const txt = this.add.text(-78, 0, '已保存', { fontSize: '16px', fill: '#9fd89f' }).setOrigin(0, 0.5);
      this._saveToast.add([icon, txt]);
      if (typeof this.attachToUICamera === 'function') this.attachToUICamera(this._saveToast);
    }
    this.tweens.killTweensOf(this._saveToast);
    this.tweens.add({
      targets: this._saveToast, alpha: 1, duration: 250, yoyo: true, hold: 1200,
      onComplete: () => this._saveToast && this._saveToast.setAlpha(0),
    });
  }

  // 持久化剧情状态（story）到存档
  _persistStory() {
    this._saveProgressToSlot();
  }

  _saveProgressToSlot(extra) {
    const slot = this._activeSlot || 1;
    const payload = {
      career: this.career, act: this.act,
      stats: this.stateSystem ? this.stateSystem.getAll() : null,
      subRole: this.subRole,
      quests: this.questSystem ? this.questSystem.serialize() : null,
      choiceLog: this.choiceLog ? this.choiceLog.serialize() : null,
      thought: this.thoughtSystem ? this.thoughtSystem.serialize() : null,
      daySystem: this.daySystem ? this.daySystem.serialize() : null,
      segment: this.timeSystem ? this.timeSystem.index : null,
      project: this.projectSystem ? this.projectSystem.serialize() : null,
      story: this._story,
      relations: this.relations ? this.relations.serialize() : null,
      items: this.items ? this.items.serialize() : null,
      ...extra,
    };
    return SaveSystem.saveSlot(slot, payload);
  }

  // NPC 记忆台词：AI 按玩家选择历史生成个性化反应，让"世界记得你"。
  // 门槛：有足够选择记录 + 30% 概率触发（保持稀有）；否则/失败用固定寒暄。
  // line 参数=按当前幕挑好的台词(linesByAct)；缺省回落 npc.line。
  _showNpcLineWithMemory(npc, line) {
    const say = line || npc.line;
    const summary = this._choiceSummaryShort();
    const shouldTryAI = summary && this.choiceLog.length >= 3 && Math.random() < 0.3;
    if (!shouldTryAI) { this._showLine(npc.name, say); return; }
    // 先显示固定寒暄（即时反馈），AI 成功后覆盖成个性化版本
    this._showLine(npc.name, say);
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
      fontSize: '26px', color: '#f4f4f8', stroke: '#0a0a14', strokeThickness: 3, lineSpacing: 8,
      wordWrap: { width: wrapW, useAdvancedWrap: true },
    }).setOrigin(0, 0);
    const bodyH = bodyTxt.height;
    const boxH = PAD + nameH + bodyH + 14 + hintH + PAD;
    const by = height - 40 - boxH; // 框底距屏幕底 40

    c.add(this.add.rectangle(bx + bw / 2, by + boxH / 2, bw, boxH, 0x080812, 0.95).setStrokeStyle(2, 0xd4a353, 0.6));
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
    // 异步加载任务定义。
    // 工作日循环职业(程序员)：主线=任务链，按细分岗位(subRole)加载对应链(开发/测试)。
    // 其余职业：沿用 quests_{career}.json。
    const defaultSub = DEFAULT_SUBROLE[this.career] || 'dev';
    const url = this.workLoopEnabled
      ? `./data/taskchain_${this.career}_${this.subRole || defaultSub}.json`
      : `./data/quests_${this.career}.json`;
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

  // ==================== 剧情演出特效（fx 字段驱动）====================
  // 高潮戏的镜头语言:比 300 字描写更有效的是 3 秒的视听打击。
  _playStoryFx(fx) {
    const cam = this.cameras.main;
    switch (fx) {
      case 'collapse': // 晕倒:BGM 骤停→画面倾斜+抖动→黑屏(黑屏由后续节点 bg 接手)
        AudioSystem.dramaticCut();
        AudioSystem.heartbeat();
        this.time.delayedCall(500, () => AudioSystem.heartbeat());
        cam.shake(700, 0.004);
        this.tweens.add({ targets: cam, rotation: 0.05, zoom: cam.zoom * 1.06, duration: 900, ease: 'Sine.in' });
        this.time.delayedCall(950, () => {
          cam.setRotation(0); cam.setZoom(cam.zoom / 1.06);
          cam.flash(120, 0, 0, 0); // 黑闪收束
        });
        break;
      case 'shake': // 震屏(事故/冲击时刻)
        cam.shake(420, 0.006);
        AudioSystem.error();
        break;
      case 'flash_white': // 白闪(眩晕/惊醒)
        cam.flash(420, 255, 255, 255);
        break;
      case 'heartbeat': // 心跳(身体报警)
        AudioSystem.heartbeat();
        this.time.delayedCall(600, () => AudioSystem.heartbeat());
        break;
      case 'silence': // 声音抽走(空虚/失去时刻——江野的空工位)
        AudioSystem.dramaticCut();
        break;
      default:
        break;
    }
  }

  // ==================== 任务目标 HUD + 方向箭头 ====================
  // 计算"现在该干什么"：纯逻辑 resolveCurrentGoal（可单测）。
  _currentGoal() {
    const seniorName = (this.npcs || []).find(n => n.id === 'senior')?.name || '导师';
    return resolveCurrentGoal({
      questSystem: this.questSystem,
      story: this._story,
      act: this.act,
      seniorName,
      playerDesk: this.playerDesk,
      interactables: this._interactables || [],
      npcPos: (id) => {
        const n = (this.npcs || []).find(p => p.id === id);
        return n?.spr ? { x: n.spr.x, y: n.spr.y } : null;
      },
    });
  }

  // 每帧轻量更新（HUD 文本变化才 setText;箭头按目标方向环绕玩家）
  // guideText 与 objectiveHud 共用 _currentGoal，避免静态「新人报到」与真实下一步打架。
  _updateObjectiveHud() {
    const goal = this._currentGoal();
    // HUD 文本：双行——任务标题 + 当前步骤（比旧的裸 step 更有上下文）
    const hud = chainHudStep(this.questSystem, this.act);
    let label;
    if (hud.title) {
      label = `⛓ ${hud.title}\n${hud.step}`;
    } else if (goal) {
      label = `${goal.text}`;
    } else {
      label = '';
    }
    if (this._lastGoalLabel !== label) {
      this._lastGoalLabel = label;
      if (this.objectiveHud) {
        this.objectiveHud.setText(label).setVisible(!!label && !this.dialogueActive);
      }
      // 底部引导条：与 objective 同源
      if (this.guideText && !this.dialogueActive) {
        const gTheme = CAREER_THEMES[this.career] || CAREER_THEMES.programmer;
        const [gName] = gTheme.npcs.senior;
        const bottom = goal ? `📋 ${goal.text}` : `▸ 找头顶 ❗ 的人，或按 ESC 打开任务日志（导师：${gName}）`;
        if (this._lastGuideLabel !== bottom) {
          this._lastGuideLabel = bottom;
          this.guideText.setText(bottom);
        }
      }
    }
    if (this.objectiveHud && this.objectiveHud.visible === this.dialogueActive && label) {
      this.objectiveHud.setVisible(!this.dialogueActive); // 对话中隐藏
    }
    // 方向箭头：目标离玩家 >260px 才显示（近了看得见头顶浮标,箭头反而碍事）
    if (!this._goalArrow) return;
    if (!goal || goal.x == null || this.dialogueActive) { this._goalArrow.setVisible(false); return; }
    const dx = goal.x - this.player.x, dy = goal.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 260) { this._goalArrow.setVisible(false); return; }
    const ang = Math.atan2(dy, dx);
    this._goalArrow.setVisible(true)
      .setPosition(this.player.x + Math.cos(ang) * 52, this.player.y - 24 + Math.sin(ang) * 52)
      .setRotation(ang)
      .setTint(0xffd24d);
  }

  // 给某 NPC 的头顶浮标换图标+颜色（emoji 语义 → 像素图标纹理）
  _setNpcMark(npc, emoji, colorHex) {
    if (!npc.mark) return;
    npc.markState = emoji; // 语义状态(测试/调试可读)
    npc.mark.setTexture(EMOJI_TO_ICON[emoji] || ICON_KEYS.chat)
      .setTint(Phaser.Display.Color.HexStringToColor(colorHex).color);
  }

  // 刷新 NPC 头顶标记：导师按 StoryProgress.seniorMarkVisual，其余 NPC 按任务。
  _updateNpcMarks() {
    if (!this.npcs || !this.questSystem) return;
    const ctx = { act: this.act };
    for (const npc of this.npcs) {
      if (!npc.mark) continue;
      // 导师：剧情状态机 + 可交付优先（纯逻辑在 seniorMarkVisual）
      if (npc.id === 'senior') {
        const hasSeniorQuest = this.questSystem.available(ctx).some(q => q.giver === 'senior')
          || this.questSystem.active().some(q => q.giver === 'senior');
        const hasSeniorDeliver = this.questSystem.active().some(
          q => q.giver === 'senior' && this.questSystem.isReady(q.id),
        );
        const vis = seniorMarkVisual(this._story, {
          workLoopEnabled: this.workLoopEnabled,
          hasSeniorQuest,
          hasSeniorDeliver,
          act: this.act,
          career: this.career,
        });
        if (vis) this._setNpcMark(npc, vis.emoji, vis.color);
        continue;
      }
      // 其余 NPC：按任务；无任务标记时回落到名册默认(💬)，避免残留旧标记
      const mark = this.questSystem.npcMark(npc.id, ctx);
      if (mark === 'available') this._setNpcMark(npc, '❗', '#ffdd33');
      else if (mark === 'deliver') this._setNpcMark(npc, '❓', '#7eff7e');
      else if (mark === 'progress') this._setNpcMark(npc, '❗', '#7ec8ff');
      else this._setNpcMark(npc, npc.defaultMark || '💬', npc.defaultMarkColor || '#7ec8ff');
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
      const seg = this.timeSystem ? ` · ${this.timeSystem.hudText()}` : ` · ${this.daySystem.phaseName()}`;
      this.dayText.setText(`第 ${this.daySystem.day} 天${seg}`);
    }
  }

  // 进入新时段：切灯光 + 调在岗人数 + 刷新时钟 HUD（由 TimeSystem 的 segmentChange 驱动）。
  _onSegmentChange(seg) {
    if (!seg) return;
    this._applyAmbient(seg.ambient);
    this._setPopulation(seg.population);
    this._refreshAllMoods(); // 心情随时段变（上午精神→加班疲惫→深夜困顿）
    this._updateDayHud();
    // BGM 随时段换：深夜(人数≤0.25)转冷调慢板，白天回轻快 office
    AudioSystem.playBgm(seg.population <= 0.25 ? 'office_night' : 'office');
  }

  // 按比例决定在岗背景同事人数：白天坐满，午休/加班走一半，深夜只剩零星几个——
  // 营造"加班到深夜，办公室空荡只剩你"的真实感。走的人淡出，来的人淡入。
  _setPopulation(ratio) {
    if (!this.workers) return;
    const keep = Math.round(Phaser.Math.Clamp(ratio, 0, 1) * this.workers.length);
    this.workers.forEach((w, i) => {
      const show = i < keep;
      if (!w.spr) return;
      if (w._body && w._body.body) w._body.body.enable = show; // 隐藏的人不挡路
      if (w._mood) w._mood.setVisible(show); // 隐藏的人不显示状态泡泡
      if (show === w.spr.visible) return;
      if (!show && w.agent) w.agent.reset(); // 下班的人若正在走动，先归位再淡出
      this.tweens.add({
        targets: w.spr, alpha: show ? 1 : 0, duration: 500,
        onStart: () => { if (show) w.spr.setVisible(true); },
        onComplete: () => { if (!show) w.spr.setVisible(false); },
      });
    });
  }

  // 推进日内时间一格（完成任务 / 剧情节点时调用）。已到深夜则不再推进。
  _advanceTime() {
    if (this.timeSystem) this.timeSystem.advance();
  }

  // 功能栏·手机：给家里打个电话（回状态 + 内心独白），每天一次。
  _usePhone() {
    if (this.dialogueActive) return;
    if (this._cooldowns['phone']) {
      this._showThoughtBubble('（刚跟家里聊过了，晚点再打吧。）', '#9a9ac0');
      return;
    }
    this._cooldowns['phone'] = true;
    this.stateSystem.change('san', 10);
    this.stateSystem.change('passion', 4);
    this.stateSystem.change('stress', -6);
    if (this.questSystem) { this.questSystem.progress('interact', 'phone'); this._updateNpcMarks(); }
    this._triggerMonologue('auto');
  }

  // ==================== 工作日循环：项目 / 工单 / 工位电脑 ====================
  _updateProjectHud() {
    if (!this.projectSystem || !this._projBarFill) return;
    const p = this.projectSystem.progress;
    this._projBarFill.width = (this._projW || 236) * p / 100;
    this._projText.setText(`项目 ${Math.round(p)}% · 绩效 ${this.projectSystem.performance}`);
    if (this._projDeadline) {
      const day = this.daySystem ? this.daySystem.day : 1;
      const left = this.projectSystem.daysLeft(day);
      const behind = this.projectSystem.isBehind(day);
      this._projDeadline.setText(`⏳ 距交付 ${left} 天`).setColor(behind ? '#ff7a7a' : '#bfb0d0');
    }
  }

  // 项目跨过里程碑 → 解锁下一幕剧情：老陈召唤(❗)，玩家走近他推进剧情。
  // 取代旧的"熬够N天"：现在是"把项目推到节点→剧情自然解锁"。
  _onProjectMilestone(pct) {
    const r = applyProjectMilestone(this._story, pct, this.act, {
      lightCareer: LIGHT_CAREERS.includes(this.career),
    });
    this._story = r.story;
    // impact(scene, intensity) — 仅震屏+顿帧，勿把坐标当 intensity
    Juice.impact(this, 0.014);
    Juice.floatText(this, this.player?.x || 400, (this.player?.y || 300) - 80, `📊 ${pct}%`, '#ffd24d');
    if (!r.unlocked) {
      this._showThoughtBubble(`（项目推进到 ${pct}% —— 一个阶段完成了。）`, '#ffd24d');
      return;
    }
    this._autoSave(); // 里程碑=存档点
    this._updateNpcMarks(); // 老陈头顶亮 ❗
    Juice.celebrate(this, this.player?.x || 0, (this.player?.y || 0) - 30, 0xffd24d);
    this._showThoughtBubble(`（项目推进到 ${pct}%！导师想找你聊聊下一步——去找他（头顶 ❗）。）`, '#ffd24d');
  }

  // 启动程序员 Debug 小游戏，完成后回调 onComplete(result{correct,total,ratio})
  // 启动"干活"小游戏：两种玩法轮替(找bug行 / 流程排序)，防止单一玩法腻。
  // 细分岗位真差异：dev/test 各有自己的排序题库；找bug对测试岗是"缺陷排查"框架。
  _launchCoding(onComplete, difficulty = null) {
    this._workGameFlip = !this._workGameFlip;
    const gameKey = this._workGameFlip ? 'DebugGameScene' : 'SequenceGameScene';
    this.scene.pause();
    this.scene.launch(gameKey, {
      act: this.act, difficulty, fromScene: null,
      career: this.career,
      subRole: this.subRole,
      skillBonus: skillTimeBonus(this.stateSystem.get('skill')), // 技能→小游戏时限加成

      // 保留旧 flavor 字段兼容；场景内优先用 career+subRole 解析 10 职业文案/题库
      flavor: this.subRole === 'test' ? 'test' : (this.subRole === 'dev' ? 'dev' : undefined),
      onComplete: (result) => {
        this.scene.stop(gameKey);
        this.scene.resume();
        if (onComplete) onComplete(result || { correct: 0, total: 1, ratio: 0 });
      },
    });
  }

  // 打开【今日工单】面板：走到工位电脑按 E 触发。选一件活开工。
  // 坐到某把椅子上（面向椅子朝向）。可坐任意空椅;只有自己的工位椅能"开始工作"。
  _sitOnChair(chair) {
    if (!this.player || !chair) return;
    const dir = chair.dir || 'down';
    const s = SIT_SHIFT[dir] || SIT_SHIFT.down;
    this.player.setVelocity(0, 0);
    if (this.playerSkin.sitFrame) this.player.setFrame(this.playerSkin.sitFrame(dir));
    // 玩家是中心锚点(0.5,0.5),直接用 SkyOffice 的 sittingShiftData 定位中心+深度,
    // 让人物真正坐进椅子(根治"浮在座位上")。
    const cx = chair.x + s.dx, cy = chair.y + s.dy;
    this.player.setPosition(cx, cy);
    this.player.body.reset(cx, cy);
    this.player.anims.stop();
    this.player.setDepth(chair.y + s.depth);
    this.facing = dir;
    this._sitting = chair;
    if (this.ePrompt) {
      this.ePrompt.setText(chair.isPlayerDesk ? '［ E ］开始工作　·　移动=起身' : '（移动=起身）').setVisible(true);
    }
  }

  _standUp() {
    if (!this.player) return;
    this._sitting = null;
    this.player.anims.stop();
    this.player.setFrame(this.playerSkin.idleFrame(this.facing || 'down'));
    if (this.ePrompt) this.ePrompt.setVisible(false);
  }

  _openWorkBoard() {
    if (this.dialogueActive || this._workBoardUI) return;
    if (!this.projectSystem) return;
    this.dialogueActive = true; // 冻结移动（玩家此时已坐在工位上）
    if (this.guideText) this.guideText.setVisible(false);
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10000);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72)
      .setScrollFactor(0).setInteractive();
    c.add(mask);
    const pw = 760, ph = 620, px = width / 2, py = height / 2;
    c.add(this.add.rectangle(px, py, pw, ph, 0x14141f, 0.98).setStrokeStyle(2, 0xd4a353));
    c.add(this.add.text(px, py - ph / 2 + 30, '💻 我的工作台', { fontSize: '28px', fill: '#ffd24d', fontStyle: 'bold' }).setOrigin(0.5));
    const pj = Math.round(this.projectSystem.progress);

    // ════════ 主区域：当前任务链（大、醒目、唯一"我的任务"）════════
    const hud = chainHudStep(this.questSystem, this.act);
    const quest = hud.quest;
    const mainY = py - ph / 2 + 92;
    c.add(this.add.text(px - pw / 2 + 48, mainY - 8, '⛓ 当前任务', { fontSize: '14px', fill: '#8fc3ff', fontStyle: 'bold' }).setOrigin(0, 0.5));
    // 主任务卡
    c.add(this.add.rectangle(px, mainY + 42, pw - 80, 90, 0x1e2a3e, 0.98).setStrokeStyle(3, 0x4a7ab5));
    if (hud.title) {
      c.add(this.add.text(px - pw / 2 + 60, mainY + 20, hud.title, { fontSize: '22px', fill: '#ffffff', fontStyle: 'bold', stroke: '#0a0a14', strokeThickness: 3 }).setOrigin(0, 0.5));
      c.add(this.add.text(px - pw / 2 + 60, mainY + 52, hud.step, { fontSize: '16px', fill: '#ffd24d' }).setOrigin(0, 0.5));
    } else {
      c.add(this.add.text(px - pw / 2 + 60, mainY + 42, hud.step, { fontSize: '16px', fill: '#8fc3ff' }).setOrigin(0, 0.5));
    }
    c.add(this.add.text(px + pw / 2 - 56, mainY + 42, `项目 ${pj}%`, { fontSize: '16px', fill: '#f0c060', fontStyle: 'bold' }).setOrigin(1, 0.5));

    // 当前步骤的行动指引（大字、明确）
    const activeQuest = this.questSystem.active().find(q => q.giver === 'senior');
    const nextObj = activeQuest ? this.questSystem.nextObjective(activeQuest.id) : null;
    const npcName = (id) => (this.npcs || []).find(n => n.id === id)?.name || id;
    let actionHint = '';
    let canWork = false;
    if (nextObj) {
      if (nextObj.kind === 'talk') {
        actionHint = `👉 先去找 ${npcName(nextObj.target)} 对接（离开工位，走过去按 E）`;
      } else if (nextObj.kind === 'minigame') {
        actionHint = '👉 对接完成！现在开工——从下方"额外工单"选一个开工';
        canWork = true;
      }
    } else if (activeQuest && this.questSystem.isReady(activeQuest.id)) {
      actionHint = `✅ 任务完成！去找导师 ${npcName('senior')} 交付（头顶 ❓）`;
    } else if (!activeQuest && hud.title === null) {
      actionHint = '👉 去找导师领下一个任务（头顶 ❗）';
    }
    if (actionHint) {
      c.add(this.add.text(px, mainY + 112, actionHint, {
        fontSize: '17px', fill: canWork ? '#7eff9a' : '#ffe08a', stroke: '#0a0a14', strokeThickness: 2,
        wordWrap: { width: pw - 120, useAdvancedWrap: true }, align: 'center',
      }).setOrigin(0.5));
    }

    // ════════ 次要区域：额外工单（降级、明确标注"额外"）════════
    const secY = py - ph / 2 + 250;
    c.add(this.add.text(px - pw / 2 + 48, secY, '📋 今日额外工单（推进项目进度）', { fontSize: '14px', fill: '#6a6a7e' }).setOrigin(0, 0.5));
    // 精力门槛：energy < 15 全部工单锁定（喝东西恢复或下班）
    const eGate = energyGate(this.stateSystem.get('energy'));
    if (!eGate.canWork) {
      c.add(this.add.text(px, secY + 24, '（精力不足 15，喝点东西恢复，或下班休息）', { fontSize: '13px', fill: '#e8a05a' }).setOrigin(0.5));
    } else if (!canWork && nextObj && nextObj.kind === 'talk') {
      c.add(this.add.text(px, secY + 24, '（完成对接后解锁）', { fontSize: '13px', fill: '#4a4a5e' }).setOrigin(0.5));
    }
    // 压力过高：产出打折警示（引导去心象世界/用物品减压）
    if (stressOutputMultiplier(this.stateSystem.get('stress')).stressed) {
      c.add(this.add.text(px, mainY + 138, '⚠ 压力过高，工单产出 ×0.8 —— 按 T 去心象世界调整，或用背包里的东西放松', {
        fontSize: '13px', fill: '#ffd24d', wordWrap: { width: pw - 120, useAdvancedWrap: true }, align: 'center',
      }).setOrigin(0.5));
    }

    const orders = this.projectSystem.getOrders();
    const DIFF = { easy: { t: '简单', c: '#6fcf7f' }, mid: { t: '中等', c: '#f0c060' }, hard: { t: '困难', c: '#e8735a' } };
    orders.forEach((o, i) => {
      const oy = secY + 54 + i * 70;
      const done = o.done;
      const disabled = (!canWork || !eGate.canWork) && !done;
      const card = this.add.rectangle(px, oy, pw - 80, 60, done ? 0x182618 : (disabled ? 0x1a1a24 : 0x232338), 0.96)
        .setStrokeStyle(2, done ? 0x3a5a3a : (disabled ? 0x2a2a34 : 0x4a4a6a));
      if (!done && !disabled) {
        card.setInteractive({ useHandCursor: true })
          .on('pointerover', () => card.setFillStyle(0x33334e))
          .on('pointerout', () => card.setFillStyle(0x232338))
          .on('pointerdown', () => { this._closeWorkBoard(c); this._doWorkOrder(o); });
      }
      c.add(card);
      const d = DIFF[o.difficulty] || DIFF.mid;
      c.add(this.add.text(px - pw / 2 + 60, oy - 10, `${done ? '✅ ' : ''}${o.title}`, {
        fontSize: '17px', fill: done ? '#7a9a7a' : (disabled ? '#5a5a6a' : '#ffffff'), fontStyle: 'bold',
      }).setOrigin(0, 0.5));
      c.add(this.add.text(px - pw / 2 + 60, oy + 14, `${d.t} · +${o.progress}% · 绩效+${o.performance}`, {
        fontSize: '12px', fill: '#6a6a7e',
      }).setOrigin(0, 0.5));
      c.add(this.add.text(px + pw / 2 - 56, oy, done ? '已完成' : (disabled ? '🔒' : '▶ 开工'), {
        fontSize: '16px', fill: done ? '#6a8a6a' : (disabled ? '#4a4a5e' : d.c), fontStyle: 'bold',
      }).setOrigin(1, 0.5));
    });

    const closeBtn = this.add.text(px + pw / 2 - 18, py - ph / 2 + 14, '✕', { fontSize: '24px', fill: '#8a8a9e' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ff9a9a'));
    closeBtn.on('pointerdown', () => this._closeWorkBoard(c));
    c.add(closeBtn);
    mask.on('pointerdown', () => this._closeWorkBoard(c)); // 点空白关闭
    this._workBoardUI = c;
  }

  _closeWorkBoard(c) {
    if (c) c.destroy(true);
    this._workBoardUI = null;
    this.dialogueActive = false;
    this._standUp(); // 收工起身
    if (this.guideText) this.guideText.setVisible(true);
  }

  // 开工做某工单 → 小游戏 → 成绩 quality 决定推进/绩效,并按工单消耗身心。
  _doWorkOrder(order) {
    this._launchCoding((result) => {
      const quality = (result && result.ratio != null)
        ? result.ratio : ((result.correct || 0) / (result.total || 1));
      // 压力产出折扣：stress ≥ 70 → 产出 ×0.8（压力真的会咬人）
      const stressMul = stressOutputMultiplier(this.stateSystem.get('stress'));
      const effQuality = quality * stressMul.multiplier;
      if (stressMul.stressed) {
        Juice.floatText(this, this.player.x, this.player.y - 60, '压力过大，产出打折 ×0.8', '#e8a05a');
      }
      const r = this.projectSystem.completeOrder(order.id, effQuality);
      if (order.cost) for (const [k, v] of Object.entries(order.cost)) this.stateSystem.change(k, v);
      if (quality >= 0.99) this.stateSystem.change('passion', 3);       // 做得漂亮,有成就感
      else if (quality <= 0.34) this.stateSystem.change('stress', 3);   // 搞砸了,额外焦虑
      this._updateProjectHud();
      this.questSystem.progress('minigame', 'coding');
      this.questSystem.progress('minigame', 'work');     // 任务链的"回工位干活"目标
      this.questSystem.progress('interact', 'computer'); // 兼容老任务的"用电脑"目标
      this._updateNpcMarks();
      this._advanceTime(); // 完成一件活=事件推进→时段前进
      if (r) {
        Juice.celebrate(this, this.player.x, this.player.y - 30, 0x5fbf7f);
        this._showThoughtBubble(`✅「${order.title}」完成 · 项目 +${r.progressGain}% · 绩效 +${r.perfGain}`, '#5fbf7f');
      }
      if (this.projectSystem.allOrdersDone()) {
        this.time.delayedCall(1800, () => {
          if (!this.dialogueActive) this._showThoughtBubble('（今天的活都干完了,可以下班回家了。）', '#f0c060');
        });
      }
      // 工单身心消耗后精力见底 → 提示下班（与 _afterInteract 同一门槛）
      if (energyGate(this.stateSystem.get('energy')).forceOff && !this._exhaustedPrompted) {
        this._exhaustedPrompted = true;
        this._showThoughtBubble('（精力见底了……今天到极限了，该下班了。）', '#f0c060');
      }
    }, order.difficulty); // 按工单难度抽对应难度的关卡
  }

  // ==================== 随机办公室事件 ====================
  _startOfficeEvents() {
    const data = this.cache.json.get('office_events');
    this._officeEvents = (data && data.events) || [];
    this._eventSeen = new Set();
    if (!this._officeEvents.length) return;
    if (this._eventTimer) this._eventTimer.remove();
    // 低频但有仪式感：每 ~60 秒掷一次、35% 概率触发。
    // 触发时不再凭空弹窗——先派一个 NPC 走到玩家面前"送"事件。
    this._eventTimer = this.time.addEvent({
      delay: 60000, loop: true, callback: () => this._maybeTriggerEvent(),
    });
  }

  _maybeTriggerEvent() {
    if (this.dialogueActive || this._workBoardUI || this._eventUI || this._sitting) return;
    if (this._eventCourier) return; // 已有 NPC 在路上送事件
    if (!this._officeEvents || !this._officeEvents.length) return;
    // 概率 + 幕次 + 关系 + 去重：整段决策在 tryPickOfficeEvent（可单测）
    const r = tryPickOfficeEvent({
      events: this._officeEvents,
      seenIds: this._eventSeen,
      act: this.act,
      relations: this.relations,
      fireChance: 0.35,
      rng: () => Phaser.Math.RND.frac(),
      relationFilter: eventMeetsRelations,
    });
    this._eventSeen = r.seen;
    if (!r.fired || !r.event) return;
    // 有空闲 worker → 派 TA 走到玩家面前送事件（有预兆、有来源）；没有则直接弹（兜底）
    if (!this._dispatchEventCourier(r.event)) {
      this._showOfficeEvent(r.event);
    }
  }

  /**
   * 派一个空闲背景同事走到玩家面前"送"事件——事件有了来源和预兆，不再凭空蹦。
   * @returns {boolean} 是否成功派出（false=没有可用 NPC/路径，调用方直接弹窗兜底）
   */
  _dispatchEventCourier(ev) {
    const idle = (this.workers || []).filter(w => w.spr?.visible && w.agent && !w.agent.busy);
    if (!idle.length || !this.player) return false;
    const w = Phaser.Utils.Array.GetRandom(idle);
    const seat = w.seat || { x: w.chair.x, y: w.chair.y };
    // 目标点：玩家旁边（右侧 40px，snap 到可走格）
    const snap = this._pathfinder
      ? this._pathfinder.snapToWalkable(this.player.x + 40, this.player.y)
      : { x: this.player.x + 40, y: this.player.y };
    if (!snap) return false;
    const pathTo = this._findPath(seat.x, seat.y, snap.x, snap.y);
    if (!pathTo || !pathTo.length) return false;
    this._eventCourier = w;
    if (w._mood) { w._mood.setText('有事找你 ❗'); this._positionMood(w); }
    w.agent.goVisit(pathTo, () => {
      // 到了玩家面前 → 弹事件（事件"由这个人带来"）
      this._showOfficeEvent(ev, w);
    });
    // 超时保护：20 秒还没走到（路被堵等），直接弹窗并释放
    this.time.delayedCall(20000, () => {
      if (this._eventCourier === w && !this._eventUI) {
        this._releaseCourier();
        this._showOfficeEvent(ev);
      }
    });
    return true;
  }

  /** 事件送达后：courier 回工位 */
  _releaseCourier() {
    const w = this._eventCourier;
    this._eventCourier = null;
    if (!w || !w.agent) return;
    const seat = w.seat || { x: w.chair.x, y: w.chair.y };
    const pathBack = this._findPath(w.spr.x, w.spr.y, seat.x, seat.y);
    if (pathBack && pathBack.length) {
      pathBack[pathBack.length - 1] = { x: seat.x, y: seat.y };
      w.agent.returnHome(pathBack);
    } else {
      w.agent.reset();
    }
    if (w._mood) this._setMood(w);
  }

  _showOfficeEvent(ev, courier = null) {
    if (this._eventUI) return;
    this.dialogueActive = true;
    if (this.guideText) this.guideText.setVisible(false);
    AudioSystem.playSfx && AudioSystem.playSfx('notify');
    // 事件弹出：轻手感，让「办公室会出事」可感知
    Juice.flash(this, 0x2a2a4a, 100);
    Juice.floatText(
      this,
      this.scale.width / 2,
      this.scale.height / 2 - 220,
      ev.icon ? `${ev.icon} 办公室事件` : '⚡ 办公室事件',
      '#ffd24d',
    );
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10001);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78)
      .setScrollFactor(0).setInteractive();
    c.add(mask);
    const pw = 780, ph = 440, px = width / 2, py = height / 2;
    const accent = ev.urgent ? 0xe8735a : 0xd4a353;
    c.add(this.add.rectangle(px, py, pw, ph, 0x14141f, 0.98).setStrokeStyle(3, accent));
    // 送事件的同事名字（事件有来源，不再凭空蹦）
    if (courier && courier.name) {
      c.add(this.add.text(px - pw / 2 + 24, py - ph / 2 - 14, `💬 ${courier.name} 找你：`, {
        fontSize: '18px', fill: '#8fc3ff', fontStyle: 'bold',
        backgroundColor: '#14141fee', padding: { x: 10, y: 5 },
      }).setOrigin(0, 0.5));
    }
    c.add(this.add.text(px, py - ph / 2 + 34, `${ev.icon} ${ev.title}`, {
      fontSize: '30px', fill: ev.urgent ? '#ff9a7a' : '#ffd24d', fontStyle: 'bold',
    }).setOrigin(0.5));
    if (ev.urgent) {
      const badge = this.add.text(px + pw / 2 - 24, py - ph / 2 + 22, '紧急', {
        fontSize: '15px', fill: '#fff', backgroundColor: '#c0392b', padding: { x: 8, y: 3 },
      }).setOrigin(1, 0.5);
      c.add(badge);
      this.tweens.add({ targets: badge, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
    }
    c.add(this.add.text(px, py - ph / 2 + 96, ev.text, {
      fontSize: '19px', fill: '#dfe3ea', wordWrap: { width: pw - 90, useAdvancedWrap: true },
      align: 'center', lineSpacing: 8,
    }).setOrigin(0.5, 0));

    const choices = ev.choices || [];
    const startY = py + 10;
    choices.forEach((ch, i) => {
      const by = startY + i * 72;
      const btn = this.add.rectangle(px, by, pw - 90, 60, 0x232338, 0.96)
        .setStrokeStyle(2, 0x4a4a6a).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setFillStyle(0x33334e));
      btn.on('pointerout', () => btn.setFillStyle(0x232338));
      btn.on('pointerdown', () => this._resolveEvent(ev, ch, c));
      c.add(btn);
      c.add(this.add.text(px, by, ch.label, {
        fontSize: '18px', fill: '#ffffff', wordWrap: { width: pw - 130 }, align: 'center',
      }).setOrigin(0.5));
    });
    this._eventUI = c;
  }

  _resolveEvent(ev, choice, c) {
    // 副作用计划纯逻辑 planEventChoiceEffects；场景只负责 apply + UI
    const plan = planEventChoiceEffects(choice, ev);
    for (const [k, v] of Object.entries(plan.effects)) this.stateSystem.change(k, v);
    if (plan.projectDelta && this.projectSystem) {
      this.projectSystem.adjustProgress(plan.projectDelta);
      this._updateProjectHud();
    }
    if (plan.addOrder && this.projectSystem) this.projectSystem.addUrgentOrder();
    // 关闭事件框 → 送事件的同事回工位 → 显示结果小气泡
    if (c) c.destroy(true);
    this._eventUI = null;
    this.dialogueActive = false;
    this._releaseCourier(); // 送事件的同事说完就回工位
    if (this.guideText) this.guideText.setVisible(true);
    if (plan.result) this._showThoughtBubble(plan.result, plan.resultColor);
    if (plan.addOrder) {
      this.time.delayedCall(1600, () => {
        if (!this.dialogueActive) this._showThoughtBubble('（今日工单里多了一张紧急插单,去工位电脑处理。）', '#e8735a');
      });
    }
  }

  // 下班回家：转场到 HomeScene，带当前状态快照 + 天数
  _goHome() {
    if (this.dialogueActive || this._goingHome) return;
    // 工作日循环：先弹【今日工作日报】结算,点继续再真正下班回家
    if (this.workLoopEnabled && !this._reportShown) {
      this._showDailyReport();
      return;
    }
    this._doGoHome();
  }

  // 今日工作日报：下班时结算今天的产出/绩效/身心变化,让"一天"有反馈。
  _showDailyReport() {
    if (this._reportUI) return;
    this._reportShown = true;
    this.dialogueActive = true;
    Juice.flash(this, 0x1a1a2e, 180);
    Juice.floatText(this, this.scale.width / 2, this.scale.height / 2 - 200, '一天结束', '#ffd24d');
    if (this.guideText) this.guideText.setVisible(false);
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(10002);
    if (typeof this.attachToUICamera === 'function') this.attachToUICamera(c);
    c.add(this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.82).setScrollFactor(0).setInteractive());
    const pw = 620, ph = 500, px = width / 2, py = height / 2;
    c.add(this.add.rectangle(px, py, pw, ph, 0x14141f, 0.99).setStrokeStyle(2, 0xd4a353));
    c.add(this.add.text(px, py - ph / 2 + 34, '📋 今日工作日报', { fontSize: '30px', fill: '#ffd24d', fontStyle: 'bold' }).setOrigin(0.5));
    const day = this.daySystem ? this.daySystem.day : 1;
    c.add(this.add.text(px, py - ph / 2 + 72, `第 ${day} 天`, { fontSize: '16px', fill: '#9aa0b0' }).setOrigin(0.5));

    const progNow = this.projectSystem.progress;
    // 今日工资 = 底薪 + 今日绩效，进钱包（在 _doGoHome 存档前落账）
    const salary = dailySalary(this.projectSystem.todayPerformance);
    this.stateSystem.change('money', salary);
    const nowStats = this.stateSystem.getAll();
    const start = this._dayStartStats || nowStats;
    const report = buildDailyReportRows({
      day,
      progressNow: progNow,
      dayStartProgress: this._dayStartProgress || 0,
      todayPerformance: this.projectSystem.todayPerformance,
      daysLeft: this.projectSystem.daysLeft(day),
      isBehind: this.projectSystem.isBehind(day),
      statsNow: nowStats,
      statsStart: start,
      salary,
    });
    let ry = py - 150;
    for (const row of report.rows) {
      c.add(this.add.text(px - pw / 2 + 56, ry, row.label, { fontSize: '19px', fill: '#dfe3ea' }).setOrigin(0, 0.5));
      c.add(this.add.text(px + pw / 2 - 56, ry, row.value, { fontSize: '20px', fill: row.color, fontStyle: 'bold' }).setOrigin(1, 0.5));
      ry += 40;
    }

    const btn = this.add.rectangle(px, py + ph / 2 - 44, 260, 52, 0x2a4a3e, 0.96)
      .setStrokeStyle(2, 0x5fbf7f).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setFillStyle(0x35604e));
    btn.on('pointerout', () => btn.setFillStyle(0x2a4a3e));
    btn.on('pointerdown', () => { c.destroy(true); this._reportUI = null; this.dialogueActive = false; this._doGoHome(); });
    c.add(btn);
    c.add(this.add.text(px, py + ph / 2 - 44, '下班回家 🏠', { fontSize: '20px', fill: '#eafff0', fontStyle: 'bold' }).setOrigin(0.5));
    this._reportUI = c;
  }

  _doGoHome() {
    if (this._goingHome) return;
    this._goingHome = true;
    // 存档（含天数 + 剧情阶段，缺 story 会导致下班后剧情进度被抹、卡在第一幕重播）
    this._saveProgressToSlot({ segment: 0 });
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

  /** 自由进入心象世界（T 键 / 暂停菜单触发）——随时可以回内心探索 */
  _enterMindscapeFree() {
    if (this.dialogueActive) return;
    this.scene.pause();
    this.scene.launch('MindscapeScene', {
      stateSystem: this.stateSystem,
      returnScene: 'WorldScene',
      monoScene: 'auto',
      freeEntry: true, // 标记：自由进入（非剧情触发），返回时不需要推进对话节点
    });
    // 自由进入返回后：不需要重新渲染对话节点（没有进行中的对话）
    this.events.once('mindscapeReturn', () => {
      // 仅刷新 HUD；无对话需推进
      this._updateObjectiveHud?.();
      this._updateNpcMarks?.();
    });
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
    // 不再在地上摆浮空 emoji 图标（那样很假）。交互点=真实家具本身,
    // 走近时用一个柔和高亮圈 + [E] 提示指示"这里能交互",更真实。
    for (const def of defs) {
      const [x, y] = def.pos;
      this._interactables.push({ ...def, x, y });
    }
    // 高亮圈（世界坐标，跟随当前最近可交互物；平时隐藏）
    this._objHighlight = this.add.ellipse(0, 0, 44, 22, 0xffe08a, 0.0)
      .setStrokeStyle(2, 0xffe08a, 0.9).setDepth(2).setVisible(false);
    if (this.uiCamera) this.uiCamera.ignore(this._objHighlight);
  }

  // ==================== 剧情引擎事件（移植自 OfficeScene）====================
  _setupDialogueEvents() {
    const eng = this.dialogueEngine;
    const self = this;

    eng.on('bgChange', bg => {
      self._applyAmbient(bg);           // 办公室内的色调滤镜
      if (self.sceneBackdrop) self.sceneBackdrop.show(bg); // 非办公室场景盖对应场景画面
    });

    // 节点级演出特效（剧情数据 fx 字段驱动）——高潮戏的镜头语言
    eng.on('fx', (fx) => self._playStoryFx(fx));

    eng.on('dialogueEnd', () => {
      self.dialogueActive = false;
      if (self.guideText) self.guideText.setVisible(true); // 对话结束恢复引导语
      if (self.offWorkBtn) self.offWorkBtn.setVisible(true);
      // 剧情结束回办公室：移除场景背景 + 恢复办公室色调，露出办公室地图
      if (self.sceneBackdrop) self.sceneBackdrop.show('office');
      self._applyAmbient('office');
      // 断点存档：剧情中途退出→记住演到哪(下次接着演,不重播)；演到幕末→清断点。
      if (self._inStoryDialogue) {
        if (self._storyDoneThisPlay) self._story.checkpoint = null;
        else self._story.checkpoint = { act: self.act, node: eng.currentId };
        self._inStoryDialogue = false;
        self._persistStory();
      }
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
            // 统一重新渲染当前节点：有选项展示选择；无选项(结束节点)走它自己的
            // advance 收尾——直接 _endDialogue 会吞掉结束节点的 action(如 act5 的
            // 'ending')，玩家会被卡在世界里进不了结局。
            if (n) eng._showNode(eng.currentId);
            else eng._endDialogue();
          });
          break;
        case 'next_act':
          self._storyDoneThisPlay = true; // 演到幕末,清断点
          self._story.checkpoint = null;
          self._loadNextAct();
          break;
        case 'phone_message':
          // 剧情数据显式触发：按 node 上的 act 或关键词推一条家人消息
          self._showFamilyByAct(self.act, node && node.phoneKeyword);
          break;
        case 'ending':
          self._storyDoneThisPlay = true;
          self._story.checkpoint = null;
          // 轻量+工作日循环：light 剧情的 ending 先进入经营期(做迷你任务链)，
          // 项目 100% 后再由导师交互进真正结局——否则迷你完整版会被剧情直接送走。
          if (shouldDeferLightEnding(self.workLoopEnabled, self.career,
              self.projectSystem ? self.projectSystem.progress : 0)) {
            self._story = enterWorkingFromLightEnding(
              self._story, self.act, (node && node.ending) || 'light');
            self._persistStory();
            self._updateNpcMarks();
            self.dialogueActive = false;
            if (self.guideText) self.guideText.setVisible(true);
            if (self.offWorkBtn) self.offWorkBtn.setVisible(true);
            if (self.sceneBackdrop) self.sceneBackdrop.show('office');
            self.time.delayedCall(300, () => {
              self._showRitual('📅 开场故事结束。\n\n下一步：找导师（头顶 ❗）领任务\n→ 对接同事 → 工位开工 → 项目推到 100% 再找导师收尾。');
            });
            break;
          }
          // 转场淡出（替代硬切），让结局有仪式感。
          // ending 取剧情节点的 ending 字段(backbone/quit/health/switch/light 五结局)，
          // 缺省才退回 career——之前误传 career 导致结局标题显示"programmer"。
          SceneRouter.goto(self, 'EndingScene',
            self._endingPayload((node && node.ending) || self.career));
          break;
        default:
          console.log('[WorldScene] unhandled action:', action);
      }
    });
  }

  // ==================== 家人消息（PhoneMessage + FamilyMessages）====================
  // 定位：职业探索工具，不是煽情游戏。家人消息只在入职时来一条简单的短信，
  // 之后不再打扰——玩家的注意力应该在"体验职业、判断适不适合"上。
  _showFamilyByAct(act, keyword) {
    // 只有第 1 幕（入职）推一条简单的家人短信；其余幕不推
    if (act !== 1 && !keyword) return;
    if (this._familyMsgShown) return; // 一局只推一次
    this._familyMsgShown = true;
    this.familyMessages.load().then(() => {
      const picked = keyword
        ? this.familyMessages.pickByKeyword(keyword)
        : this.familyMessages.pickForAct(1);
      if (picked) this._showPhone(picked.bubbles, picked.context);
    });
  }

  // 状态触底回调：不再推家人煽情消息——改为轻量的内心提示（职业健康信号）。
  // 玩家该关注的是"这份工作对我的消耗"，而不是被亲情绑架。
  _onStateThreshold(info) {
    const key = info.key;
    if (this._phoneTriggeredFor.has(key)) return;
    this._phoneTriggeredFor.add(key);
    const HINTS = {
      health: '（身体在报警了。这是这份工作的真实成本——记下来，报告里会用到。）',
      san: '（心态快撑不住了。问问自己：是这份工作的问题，还是节奏的问题？）',
      passion: '（热情快烧完了。留意一下：你是不喜欢这份活，还是只是累了？）',
    };
    const hint = HINTS[key];
    if (hint) this._showThoughtBubble(hint, '#e8a05a');
    // 健康真出事：低于 20 → 强制提前下班（身体是本钱，这条会咬人）
    if (key === 'health' && this.stateSystem.get('health') < 20) {
      this.time.delayedCall(2500, () => {
        if (this._goingHome || this.dialogueActive) return;
        this._showThoughtBubble('（身体撑不住了。今天必须提前下班——这也是这份工作教你的一课。）', '#ff9a7a');
        this.time.delayedCall(2200, () => { if (!this._goingHome) this._goHome(); });
      });
    }
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
    const r = enterWorkingAfterAct(this._story, this.act);
    if (r.shouldEnd) {
      SceneRouter.goto(this, 'EndingScene', this._endingPayload(this.career));
      return;
    }
    // 进入本幕经营期
    this._story = r.story;
    this._persistStory();
    this._updateNpcMarks();
    // 本幕家人消息 + 引导提示"去过日子"
    this._showFamilyByAct(this.act);
    const need = ACT_DAYS[this.act] || 1;
    const seniorName = (this.npcs || []).find(n => n.id === 'senior')?.name || '导师';
    // workLoop：下一步是领链任务——直接弹仪式（不等 400ms），文字更明确
    const body = this.workLoopEnabled
      ? `📅 开场故事结束。\n\n${seniorName}有事找你——\n再走近他（头顶有 ❗），按 E 对话，\n他会给你第一个工作任务。\n\n之后：找同事对接 → 回工位开工 → 右上角下班。`
      : `📅 这一阶段的故事告一段落。\n接下来的${need}天，好好经营你的职场日常——\n做做任务、和同事聊聊、累了就下班回家。\n等你过完这几天，去找${seniorName}聊下一步。`;
    this._showRitual(body);
  }

}
