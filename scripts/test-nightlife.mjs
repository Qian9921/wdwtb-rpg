// NightLife 单元测试（纯 Node，无 Phaser 依赖）。运行：node scripts/test-nightlife.mjs
import {
  NIGHT_ACTIVITIES, SPECIAL_ACTIVITIES, NIGHT_ACTION_POINTS,
  buildNightMenu, applyActivity, finalizeNight,
} from '../src/systems/NightLife.js';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); } };

console.log('\n=== NightLife 单元测试 ===\n');

// ── NIGHT_ACTION_POINTS ──
ok('每晚行动点预算=2', NIGHT_ACTION_POINTS === 2);

// ── buildNightMenu：状态咬合 ──
{
  const full = { health: 80, energy: 80, san: 60, stress: 30, money: 50, skill: 40, performance: 40, passion: 50 };
  const menu = buildNightMenu(full);
  ok(`常驻活动全部出现(${NIGHT_ACTIVITIES.length}个)`, menu.activities.filter(a => NIGHT_ACTIVITIES.some(n => n.id === a.id)).length === NIGHT_ACTIVITIES.length);
  ok('满状态下无特殊活动解锁', menu.activities.length === NIGHT_ACTIVITIES.length, `实际 ${menu.activities.length}`);
  ok('满状态下 study 可用', menu.activities.find(a => a.id === 'study').available === true);
  ok('满状态下 exercise 可用', menu.activities.find(a => a.id === 'exercise').available === true);
  ok('pointsLeft 默认=预算', menu.pointsLeft === NIGHT_ACTION_POINTS);
  ok('pointsMax=预算', menu.pointsMax === NIGHT_ACTION_POINTS);
  ok('无危急状态时 forced=null', menu.forced === null);
}

{
  // 精力低（<25）→ study 变灰；exercise 阈值是 <20，energy=22 时仍可用
  const tired = { health: 80, energy: 22, stress: 30, money: 50 };
  const menu = buildNightMenu(tired);
  const study = menu.activities.find(a => a.id === 'study');
  ok('精力22<25 → study 不可用', study.available === false);
  ok('study 不可用给出理由', study.reason.length > 0, study.reason);
  const exercise = menu.activities.find(a => a.id === 'exercise');
  ok('精力22>=20 → exercise 仍可用', exercise.available === true);
}

{
  // 精力再低（<20）→ exercise/overtime 也变灰
  const exhausted = { health: 80, energy: 10, stress: 30, money: 50 };
  const menu = buildNightMenu(exhausted);
  ok('精力10<20 → exercise 不可用', menu.activities.find(a => a.id === 'exercise').available === false);
  ok('精力10<20 → overtime 不可用', menu.activities.find(a => a.id === 'overtime').available === false);
  ok('精力10<15 → forced 提示触发', menu.forced && menu.forced.length > 0, menu.forced);
}

{
  // 健康危急（<15）→ forced 提示
  const sick = { health: 12, energy: 80, stress: 30, money: 50 };
  const menu = buildNightMenu(sick);
  ok('健康12<15 → forced 提示触发', !!menu.forced);
}

{
  // 压力高（>=60）→ decompress 解锁
  const stressed = { health: 80, energy: 80, stress: 65, money: 50 };
  const menu = buildNightMenu(stressed);
  const decompress = menu.activities.find(a => a.id === 'decompress');
  ok('压力65>=60 → decompress 解锁出现', !!decompress);
  ok('decompress 默认可用', decompress.available === true);
  const notStressed = buildNightMenu({ health: 80, energy: 80, stress: 59, money: 50 });
  ok('压力59<60 → decompress 不出现', !notStressed.activities.some(a => a.id === 'decompress'));
}

{
  // 余钱充足（>=80）→ splurge 解锁
  const rich = { health: 80, energy: 80, stress: 30, money: 120 };
  const menu = buildNightMenu(rich);
  ok('余钱120>=80 → splurge 解锁出现', menu.activities.some(a => a.id === 'splurge'));
  const poor = buildNightMenu({ health: 80, energy: 80, stress: 30, money: 79 });
  ok('余钱79<80 → splurge 不出现', !poor.activities.some(a => a.id === 'splurge'));
}

{
  // 钱不够（<20）→ cook 变灰
  const broke = { health: 80, energy: 80, stress: 30, money: 10 };
  const menu = buildNightMenu(broke);
  ok('钱10<20 → cook 不可用', menu.activities.find(a => a.id === 'cook').available === false);
}

{
  // pointsLeft 透传
  const menu = buildNightMenu({ health: 80, energy: 80, stress: 30, money: 50 }, 1);
  ok('自定义 pointsLeft 透传', menu.pointsLeft === 1);
}

// ── applyActivity：扣点 + 改状态 + 种子 + gate 拦截 ──
{
  const stats = { health: 50, energy: 50, san: 50, stress: 50, money: 50, skill: 20, performance: 20, passion: 20 };
  const study = NIGHT_ACTIVITIES.find(a => a.id === 'study');
  const r = applyActivity(stats, study, 2);
  ok('applyActivity 成功 ok=true', r.ok === true);
  ok('扣点 pointsLeft-1', r.pointsLeft === 1);
  ok('skill 按 effect 增加', r.stats.skill === 26, r.stats.skill);
  ok('energy 按 effect 减少', r.stats.energy === 38, r.stats.energy);
  ok('stress 按 effect 增加', r.stats.stress === 53, r.stats.stress);
  ok('返回种子=studied', r.seed === 'studied');
  ok('family 标记默认 false', r.family === false);
  ok('不改动传入的原 stats 对象', stats.skill === 20);
}

{
  // family 活动标记 family:true
  const stats = { health: 50, energy: 50, san: 50, stress: 50, money: 50 };
  const family = NIGHT_ACTIVITIES.find(a => a.id === 'family');
  const r = applyActivity(stats, family, 2);
  ok('family 活动 family=true', r.family === true);
  ok('family 埋种子=warm', r.seed === 'warm');
}

{
  // gate 拦截：精力不足做不了 study（防 UI 与逻辑不同步）
  const stats = { energy: 10 };
  const study = NIGHT_ACTIVITIES.find(a => a.id === 'study');
  const r = applyActivity(stats, study, 2);
  ok('gate 不满足 → ok=false', r.ok === false);
  ok('gate 拦截给出理由', r.reason && r.reason.length > 0, r.reason);
  ok('gate 拦截不扣点', r.pointsLeft === 2);
  ok('gate 拦截不改状态', r.stats.energy === 10);
}

{
  // 行动点不足
  const stats = { energy: 80 };
  const study = NIGHT_ACTIVITIES.find(a => a.id === 'study');
  const r = applyActivity(stats, study, 0);
  ok('行动点不足 → ok=false', r.ok === false);
  ok('行动点不足给出理由', r.reason === '今晚没精力再做别的了');
  ok('行动点不足不改状态', r.stats.energy === 80);
}

{
  // 无活动
  const r = applyActivity({ energy: 80 }, null, 2);
  ok('无活动 → ok=false', r.ok === false);
  ok('无活动理由正确', r.reason === '无活动');
}

{
  // money 不 clamp；其余状态 0~100 clamp
  const cook = NIGHT_ACTIVITIES.find(a => a.id === 'cook');
  const rLow = applyActivity({ money: 5, health: 95, san: 98, energy: 50 }, cook, 2);
  // gate 要求 money>=20，money=5 应被拦截
  ok('cook money=5<20 被 gate 拦截', rLow.ok === false);

  const rOk = applyActivity({ money: 25, health: 95, san: 98, energy: 50 }, cook, 2);
  ok('cook money=25>=20 成功', rOk.ok === true);
  ok('money 允许扣到低于原值且不 clamp 下限', rOk.stats.money === 5, rOk.stats.money);
  ok('health 按 effect 增加且不超过100', rOk.stats.health === 100, rOk.stats.health);
  ok('san 按 effect 增加且 clamp 到100', rOk.stats.san === 100, rOk.stats.san);
}

{
  // 状态跌破0 clamp
  const overtime = NIGHT_ACTIVITIES.find(a => a.id === 'overtime');
  const r = applyActivity({ energy: 25, health: 2, stress: 95 }, overtime, 2);
  ok('overtime 成功(energy=25>=20)', r.ok === true);
  ok('health 跌破0 clamp 到0', r.stats.health === 0, r.stats.health);
  ok('stress 超100 clamp 到100', r.stats.stress === 100, r.stats.stress);
}

{
  // 特殊活动可通过 applyActivity 正常应用（不局限于常驻列表）
  const stats = { stress: 65, san: 50, passion: 20 };
  const decompress = SPECIAL_ACTIVITIES.find(a => a.id === 'decompress');
  const r = applyActivity(stats, decompress, 2);
  ok('decompress 应用成功', r.ok === true);
  ok('decompress 埋种子=healed', r.seed === 'healed');
  ok('decompress 降压力', r.stats.stress === 47, r.stats.stress);
}

// ── finalizeNight：睡眠恢复 + 种子传递 ──
{
  // 未熬夜 → energy 回满 100
  const r = finalizeNight({ energy: 40, stress: 30 }, ['studied', 'warm']);
  ok('未熬夜 energy 回满100', r.stats.energy === 100);
  ok('压力过夜回落4', r.stats.stress === 26, r.stats.stress);
}

{
  // 熬夜(burnout) → energy 只回到 70 上限
  const r = finalizeNight({ energy: 40, stress: 30 }, ['burnout']);
  ok('熬夜 energy 回到 min(70, +30)=70', r.stats.energy === 70, r.stats.energy);
}

{
  // 熬夜但基础 energy 本就很低 → +30 而非直接拉到70
  const r = finalizeNight({ energy: 10, stress: 30 }, ['burnout']);
  ok('熬夜 energy=10+30=40（未达70上限）', r.stats.energy === 40, r.stats.energy);
}

{
  // 压力回落不低于0
  const r = finalizeNight({ energy: 40, stress: 2 }, []);
  ok('压力回落 clamp 到0', r.stats.stress === 0, r.stats.stress);
}

{
  // commuteSeeds 只保留会影响通勤的种子，过滤未知种子
  const r = finalizeNight({ energy: 40, stress: 30 }, ['studied', 'unknown_seed', 'warm']);
  ok('commuteSeeds 过滤未知种子', !r.commuteSeeds.includes('unknown_seed'));
  ok('commuteSeeds 保留已知种子', r.commuteSeeds.includes('studied') && r.commuteSeeds.includes('warm'));
  ok('commuteSeeds 长度=2', r.commuteSeeds.length === 2, JSON.stringify(r.commuteSeeds));
}

{
  // 全部9种已知种子都能透传
  const all = ['warm', 'burnout', 'studied', 'relaxed', 'fit', 'healed', 'nourished', 'rested', 'treated'];
  const r = finalizeNight({ energy: 40, stress: 30 }, all);
  ok('9种已知种子全部透传', all.every(s => r.commuteSeeds.includes(s)));
}

{
  // 无种子 → commuteSeeds 空数组，不熬夜
  const r = finalizeNight({ energy: 40, stress: 30 });
  ok('默认无 seeds 参数不抛错', Array.isArray(r.commuteSeeds) && r.commuteSeeds.length === 0);
  ok('无 burnout → energy 回满100', r.stats.energy === 100);
}

{
  // 不改动传入的原 stats 对象
  const stats = { energy: 40, stress: 30 };
  finalizeNight(stats, ['burnout']);
  ok('finalizeNight 不改动原 stats', stats.energy === 40 && stats.stress === 30);
}

// 💰 金钱出口活动:gig换钱(拿命换) / remit寄钱 / course报课(大额→成长)
{
  const gig = NIGHT_ACTIVITIES.find(a => a.id === 'gig');
  ok('gig私单存在且换钱(money+,health/passion-)', gig && gig.effect.money > 0 && gig.effect.health < 0 && gig.effect.passion < 0);
  ok('gig精力不足被gate拦', gig.gate({ energy: 20 }).ok === false);
  const remit = NIGHT_ACTIVITIES.find(a => a.id === 'remit');
  ok('remit寄钱存在(money-,san+,family)', remit && remit.effect.money < 0 && remit.effect.san > 0 && remit.family === true);
  ok('remit钱不够被gate拦', remit.gate({ money: 100 }).ok === false && remit.gate({ money: 250 }).ok === true);
  const course = SPECIAL_ACTIVITIES.find(a => a.id === 'course');
  ok('course报课存在(大额-400换skill)', course && course.effect.money === -400 && course.effect.skill > 0);
  ok('course需攒够400才解锁', course.unlock({ money: 300 }) === false && course.unlock({ money: 400 }) === true);
  // 报课在富裕状态下才出现在菜单
  const richMenu = buildNightMenu({ money: 500, energy: 80, health: 80, san: 60, stress: 30, skill: 40, performance: 40, passion: 50 });
  ok('富裕(money500)时course进菜单', richMenu.activities.some(a => a.id === 'course'));
}

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
