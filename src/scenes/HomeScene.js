import Phaser from 'phaser';
import { AudioSystem } from '../systems/AudioSystem.js';
import { Juice } from '../systems/JuiceKit.js';
import { SceneRouter } from '../systems/SceneRouter.js';
import { FamilyMessages } from '../systems/FamilyMessages.js';
import { PhoneMessage } from '../systems/PhoneMessage.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { SceneBackdrop } from '../systems/SceneBackdrop.js';
import { buildNightMenu, applyActivity, finalizeNight, NIGHT_ACTION_POINTS } from '../systems/NightLife.js';
import { ensurePixelIcons, ICON_KEYS, makeIcon } from '../systems/PixelIcons.js';

// tag → 图标 key 映射(NightLife 活动定义里的 tag 字段驱动图标选择)
const TAG_ICON = {
  study: ICON_KEYS.book, family: ICON_KEYS.phone, game: ICON_KEYS.game,
  exercise: ICON_KEYS.run, cook: ICON_KEYS.bowl, moon: ICON_KEYS.moon,
  heart: ICON_KEYS.heart, gift: ICON_KEYS.coin, work: ICON_KEYS.chart,
};

// HomeScene：夜晚·回家——一天的收尾（经营决策）。
// 旧版是"无限点四个固定选项刷数值"；现改为【行动点预算】制:每晚只有 N 点,
// 活动花点数、与白天状态咬合(累了学不进、压力大解锁减压)、点用光就必须睡。
// 睡觉 → finalizeNight(算睡眠恢复 + 埋第二天通勤种子) → CommuteScene。
export class HomeScene extends Phaser.Scene {
  constructor() { super('HomeScene'); }

  init(data) {
    this.career = data?.career || 'programmer';
    this.act = data?.act || 1;
    this.day = data?.day || 1;
    this.slot = data?.slot || 1;
    this.stats = data?.stats || {
      health: 80, energy: 100, san: 80, stress: 20, skill: 10, performance: 50, money: 0, passion: 70,
    };
    this._keyHandlers = []; // 本场景绑定的键盘 handler，shutdown 时精确解绑防泄漏
    this._pointsLeft = NIGHT_ACTION_POINTS; // 今晚剩余行动点
    this._nightSeeds = [];                  // 今晚做过的事(埋给第二天)
    this._doneActivities = new Set();       // 已做过的活动 id(每晚每样最多一次)
    this._sleeping = false;
  }

  create() {
    const { width: W, height: H } = this.scale;
    ensurePixelIcons(this); // 像素图标纹理（替代 emoji，幂等）
    this.cameras.main.setBackgroundColor('#0f0f1a');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    AudioSystem.playBgm('mindscape'); // 夜晚用空灵的 BGM

    // 出租屋场景画面(程序化:暖褐房间/夜窗/台灯/桌床),菜单浮在上面——"回家"有画面感
    this.backdrop = new SceneBackdrop(this);
    this.backdrop.show('apartment_night');
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14, 0.5).setDepth(800); // 压暗让菜单可读

    this.add.text(W / 2, 70, `第 ${this.day} 天 · 夜晚`, {
      fontSize: '26px', color: '#8b8ba0',
    }).setOrigin(0.5).setDepth(900);
    const titleText = this.add.text(W / 2, 118, '回到出租屋', {
      fontSize: '40px', color: '#dfe3ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(900);
    makeIcon(this, W / 2 - titleText.width / 2 - 30, 118, ICON_KEYS.home, 0xdfe3ff, 40).setDepth(900);

    // 家人消息系统
    this.familyMessages = new FamilyMessages();
    this.phoneMessage = new PhoneMessage(this);
    this.familyMessages.load();

    this._showSelfImprove();
    this.events.once('shutdown', () => this._unbindKeys()); // 场景切换时解绑键盘，防泄漏
  }

  _unbindKeys() {
    const kb = this.input.keyboard;
    for (const { key, handler } of this._keyHandlers) kb.off(`keydown-${key}`, handler);
    this._keyHandlers = [];
  }

  // 夜晚经营决策：行动点预算 + 状态咬合的活动菜单。
  _showSelfImprove() {
    const { width: W } = this.scale;
    if (this.ui) this.ui.destroy(true);
    this._unbindKeys(); // 每次重绘先清旧键盘监听,防重复绑定
    this.ui = this.add.container(0, 0).setDepth(900);

    const menu = buildNightMenu(this.stats, this._pointsLeft);

    // 标题 + 行动点指示("今晚还能做 N 件事")
    this.ui.add(this.add.text(W / 2, 195, '这个夜晚，你想怎么过？', {
      fontSize: '27px', color: '#e8e8f4',
    }).setOrigin(0.5));
    const dots = '● '.repeat(menu.pointsLeft) + '○ '.repeat(menu.pointsMax - menu.pointsLeft);
    this.ui.add(this.add.text(W / 2, 228, `今晚精力 ${dots.trim()}  （每件事花 1 点，用完就该睡了）`, {
      fontSize: '15px', color: menu.pointsLeft > 0 ? '#ffd68a' : '#8b8ba0',
    }).setOrigin(0.5));
    // 状态危急强推
    if (menu.forced) {
      this.ui.add(this.add.text(W / 2, 252, menu.forced, {
        fontSize: '14px', color: '#ff9a7a', fontStyle: 'italic',
      }).setOrigin(0.5));
    }

    const outOfPoints = menu.pointsLeft <= 0;
    // 只展示"未做过 且 (有点数或已灰)"的活动;做过的移除,让菜单随夜晚推进而收敛
    const shown = menu.activities.filter(a => !this._doneActivities.has(a.id));
    let by = 288;
    const NUMS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    let idx = 0;
    const rowH = 52;
    shown.forEach((act) => {
      const canDo = act.available && !outOfPoints;
      const n = idx + 1;
      const fill = canDo ? 0x2a2a4a : 0x1c1c28;
      const border = canDo ? 0x4a4a66 : 0x2a2a38;
      const textColor = canDo ? '#e6e6e6' : '#5a5a6a';
      // 主文案 + 右侧代价说明(不可用时显示灰因)
      const effLabel = this._effectSummary(act);
      const line = act.available
        ? `${n}. ${act.label}　${effLabel}`
        : `　${act.label}　（${act.reason}）`;
      // 按活动 tag 选像素图标(替代旧 emoji),与文字一起作为整体在按钮内居中
      const iconKey = TAG_ICON[act.tag] || null;
      const iconSize = 20, iconGap = 8;
      // 字号 17(比原 18 略小),给长文案(如"接私单"带5个属性变化)更多余量,防溢出
      const txt = this.add.text(0, by, line, { fontSize: '17px', color: textColor }).setOrigin(0, 0.5);
      const contentW = txt.width + (iconKey ? iconSize + iconGap : 0);
      // ⚠️ 按钮宽度【自适应内容】:内容宽 + 左右各 28 内边距,下限 660。修 bug(私单等长文案
      // 撑出固定 660 按钮框):内容长时按钮跟着变宽,文字/图标永远在框内。
      const btnW = Math.max(660, Math.ceil(contentW) + 56);
      const btn = this.add.rectangle(W / 2, by, btnW, rowH - 6, fill).setStrokeStyle(2, border);
      const startX = W / 2 - contentW / 2;
      let icon = null;
      if (iconKey) {
        icon = makeIcon(this, startX + iconSize / 2, by, iconKey, canDo ? 0xffd68a : 0x5a5a6a, iconSize);
        txt.setX(startX + iconSize + iconGap);
      } else {
        txt.setX(startX);
      }
      if (canDo) {
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setFillStyle(0x3a3a5a));
        btn.on('pointerout', () => btn.setFillStyle(0x2a2a4a));
        const activate = () => { if (!this.phoneMessage.isShowing()) { AudioSystem.uiClick(); this._doActivity(act); } };
        btn.on('pointerdown', activate);
        // 数字键
        const key = NUMS[idx];
        const handler = () => { if (!this.phoneMessage.isShowing()) { AudioSystem.uiClick(); this._doActivity(act); } };
        this.input.keyboard.on(`keydown-${key}`, handler);
        this._keyHandlers.push({ key, handler });
        idx++;
      }
      this.ui.add(btn); this.ui.add(txt);
      if (icon) this.ui.add(icon);
      by += rowH;
    });

    // 睡觉按钮（进下一天）——点数用光时高亮催促
    const sleepY = by + 14;
    const sleepFill = outOfPoints ? 0x4a3a2a : 0x3a2a4a;
    const sleepBtn = this.add.rectangle(W / 2, sleepY, 420, 54, sleepFill).setStrokeStyle(2.5, 0xd4a353)
      .setInteractive({ useHandCursor: true });
    const sleepLabel = outOfPoints ? '今晚就到这，睡吧 · 空格/回车' : '直接睡觉，迎接新的一天 · 空格/回车';
    const sleepIconSize = 22, sleepIconGap = 8;
    const sleepTxt = this.add.text(0, sleepY, sleepLabel, { fontSize: '20px', color: '#ffd68a' }).setOrigin(0, 0.5);
    const sleepContentW = sleepTxt.width + sleepIconSize + sleepIconGap;
    const sleepStartX = W / 2 - sleepContentW / 2;
    const sleepIcon = makeIcon(this, sleepStartX + sleepIconSize / 2, sleepY, ICON_KEYS.moon, 0xffd68a, sleepIconSize);
    sleepTxt.setX(sleepStartX + sleepIconSize + sleepIconGap);
    sleepBtn.on('pointerover', () => sleepBtn.setFillStyle(0x5a4a3a));
    sleepBtn.on('pointerout', () => sleepBtn.setFillStyle(sleepFill));
    sleepBtn.on('pointerdown', () => { if (!this.phoneMessage.isShowing()) { AudioSystem.uiClick(); this._sleep(); } });
    this.ui.add(sleepBtn); this.ui.add(sleepTxt); this.ui.add(sleepIcon);

    const sleepHandler = () => { if (!this.phoneMessage.isShowing()) { AudioSystem.uiClick(); this._sleep(); } };
    this.input.keyboard.on('keydown-SPACE', sleepHandler);
    this.input.keyboard.on('keydown-ENTER', sleepHandler);
    this._keyHandlers.push({ key: 'SPACE', handler: sleepHandler });
    this._keyHandlers.push({ key: 'ENTER', handler: sleepHandler });
  }

  // 把活动的 effect 转成一句人话代价(如 "技能+6 · 精力-12")
  _effectSummary(act) {
    const NAME = { health: '健康', energy: '精力', san: '心态', stress: '压力', skill: '技能', performance: '绩效', money: '钱', passion: '热情' };
    const parts = Object.entries(act.effect || {}).map(([k, v]) => {
      const unit = k === 'money' ? '' : '';
      return `${NAME[k] || k}${v > 0 ? '+' : ''}${v}${unit}`;
    });
    return `（${parts.join(' · ')}）`;
  }

  _doActivity(act) {
    const res = applyActivity(this.stats, act, this._pointsLeft);
    if (!res.ok) { this._flashHint(res.reason || '现在做不了这个'); return; }
    this.stats = res.stats;
    this._pointsLeft = res.pointsLeft;
    this._doneActivities.add(act.id);
    if (res.seed) this._nightSeeds.push(res.seed);
    Juice.floatText(this, this.scale.width / 2, 200, '✓', '#6aaa6a');
    // 陪家人：弹真实家人消息
    if (res.family) {
      this.familyMessages.load().then(() => {
        const picked = this.familyMessages.pickForAct(this.act);
        if (picked) this.phoneMessage.show(picked.bubbles);
      });
    } else {
      this._flashHint(this._activityFlavor(act));
    }
    // 重绘菜单(点数变化、活动移除、灰化更新)
    this._showSelfImprove();
  }

  // 活动后的一句氛围反馈(比"这个夜晚没白过"更贴合具体活动)
  _activityFlavor(act) {
    const F = {
      study: '看进去了一点，明天也许用得上。',
      relax: '脑子放空的这一会儿，挺好。',
      exercise: '出了身汗，身体轻快了些。',
      overtime: '活是赶了点，但人也更累了。',
      cook: '自己做的饭，吃着踏实。',
      rest: '什么都不想，就这样躺着。',
      decompress: '和自己待了会儿，心里松了口气。',
      splurge: '花了点钱，但值。',
    };
    return F[act.id] || '嗯，这个夜晚没有白过。';
  }

  _flashHint(msg) {
    const { width: W, height: H } = this.scale;
    const t = this.add.text(W / 2, H - 80, msg, {
      fontSize: '20px', color: '#ffd68a', backgroundColor: '#1e1e30', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(9999).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 250, yoyo: true, hold: 1400, onComplete: () => t.destroy() });
  }

  // 睡觉 → 进下一天。关键：推进剧情经营期计数 story.daysInAct（攒够天数才能解锁下一幕剧情）。
  // 这是"天数驱动剧情"的接线——没有它，经营期永远推进不了、剧情卡死。
  _sleep() {
    if (this._sleeping) return;
    this._sleeping = true;
    // slot 兜底：正常转场 init 会设好 this.slot；防御性再兜一次 1，避免 init 未跑时
    // loadSlot(undefined) 读不到存档、story 退化成 ready 而漏掉 daysInAct 累加。
    const slot = this.slot || 1;
    // 睡觉收尾：finalizeNight 算睡眠恢复(熬夜回得少) + 埋给第二天通勤的种子。
    const fin = finalizeNight(this.stats, this._nightSeeds);
    this.stats = fin.stats;
    const commuteSeeds = fin.commuteSeeds;
    // 把当日状态 + 经营期天数 + 通勤种子写回存档
    try {
      const saved = SaveSystem.loadSlot(slot) || {};
      const story = saved.story || { phase: 'ready', act: this.act, daysInAct: 0 };
      if (story.phase === 'working') story.daysInAct = (story.daysInAct || 0) + 1; // 经营期才累加
      // 合并累积通勤种子(连锁事件用):保留旧的 followup 种子 + 今晚新埋的
      const prevSeeds = Array.isArray(saved.commuteSeeds) ? saved.commuteSeeds : [];
      const mergedSeeds = [...prevSeeds, ...commuteSeeds].slice(-12); // 留最近12个,防无限膨胀
      SaveSystem.saveSlot(slot, {
        career: this.career, act: this.act, stats: this.stats,
        subRole: saved.subRole,
        quests: saved.quests,
        choiceLog: saved.choiceLog,
        thought: saved.thought,
        daySystem: saved.daySystem,
        project: saved.project,
        story,
        commuteSeeds: mergedSeeds,
        commuteRecent: Array.isArray(saved.commuteRecent) ? saved.commuteRecent : [],
      });
    } catch (e) {}
    this.cameras.main.fadeOut(800, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      let subRole = null;
      try { subRole = (SaveSystem.loadSlot(slot) || {}).subRole || null; } catch (e) {}
      this.scene.start('CommuteScene', {
        career: this.career, act: this.act, day: this.day + 1,
        stats: this.stats, subRole, slot,
      });
    });
  }
}
