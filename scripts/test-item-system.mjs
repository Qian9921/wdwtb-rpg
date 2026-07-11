// ItemSystem 单元测试：背包/使用/送礼/工资/门槛 纯逻辑全覆盖
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ItemSystem, BAG_CAP, planGift, dailySalary,
  stressOutputMultiplier, skillTimeBonus, energyGate,
} from '../src/systems/ItemSystem.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); }
};

console.log('\n=== ItemSystem ===\n');

// 真实目录数据
const catalogData = JSON.parse(readFileSync(join(ROOT, 'public/data/items.json'), 'utf8'));
const CAT = catalogData.items;
ok('items.json 有 ≥8 件物品', Object.keys(CAT).length >= 8);
ok('可乐有 use 效果', CAT.cola && CAT.cola.use && CAT.cola.use.energy > 0);
ok('期待记录 readonly', CAT.expectation_note && CAT.expectation_note.readonly === true);
// 每件可购物品有 price>0 + giftAffinity + desc
for (const [id, def] of Object.entries(CAT)) {
  if (def.source === 'special') continue;
  ok(`${id} 有 price/giftAffinity/desc`, def.price > 0 && def.giftAffinity > 0 && !!def.desc);
}

// —— 背包基础 ——
const inv = new ItemSystem(CAT);
ok('初始空包', inv.slotCount() === 0 && inv.list().length === 0);
ok('add 可乐', inv.add('cola').ok);
ok('has 可乐', inv.has('cola') && inv.count('cola') === 1);
ok('目录外物品拒绝', inv.add('nuclear_reactor').ok === false);
inv.add('cola');
ok('同种叠加 count=2', inv.count('cola') === 2 && inv.slotCount() === 1);

// 容量：塞满 8 种后拒绝新种类
const ids = Object.keys(CAT);
const inv2 = new ItemSystem(CAT);
for (const id of ids.slice(0, BAG_CAP)) inv2.add(id);
ok('塞满 8 种', inv2.slotCount() === Math.min(BAG_CAP, ids.length));
if (ids.length > BAG_CAP) {
  ok('第 9 种拒绝(full)', inv2.add(ids[BAG_CAP]).reason === 'full');
}
ok('已有种类仍可叠加', inv2.add(ids[0]).ok);

// —— 使用 ——
const useR = inv.use('cola');
ok('use 返回效果', useR.ok && useR.effects.energy === CAT.cola.use.energy);
ok('use 后计数-1', inv.count('cola') === 1);
ok('没有的物品不能用', inv.use('coffee').ok === false);
inv.add('expectation_note');
ok('readonly 不能用', inv.use('expectation_note').reason === 'not_usable');

// —— 送礼 planGift ——
const npc = { id: 'vet', favoriteItem: 'coffee' };
inv.add('coffee');
const g1 = planGift({ items: inv, npc, itemId: 'coffee' });
ok('送偏好物 ×2 好感', g1.ok && g1.favorite === true && g1.affinity === CAT.coffee.giftAffinity * 2);
const g2 = planGift({ items: inv, npc, itemId: 'cola' });
ok('送普通物基础好感', g2.ok && g2.favorite === false && g2.affinity === CAT.cola.giftAffinity);
ok('没有的物品不能送', planGift({ items: inv, npc, itemId: 'milk_tea' }).reason === 'no_item');
inv.markGifted('vet');
ok('每日限1件', planGift({ items: inv, npc, itemId: 'coffee' }).reason === 'daily_limit');
inv.resetDaily();
ok('新一天可再送', planGift({ items: inv, npc, itemId: 'coffee' }).ok);
ok('readonly 不能送', (() => { inv.add('expectation_note'); return planGift({ items: inv, npc: { id: 'x' }, itemId: 'expectation_note' }).reason === 'not_giftable'; })());

// giftable 列表排除 readonly
ok('giftable 排除期待记录', !inv.giftable().some(i => i.id === 'expectation_note'));

// —— 序列化 ——
const ser = inv.serialize();
const inv3 = new ItemSystem(CAT);
inv3.restore(ser);
ok('restore 背包一致', inv3.count('cola') === inv.count('cola') && inv3.count('coffee') === inv.count('coffee'));
inv3.restore(null);
ok('restore null 清空不炸', inv3.slotCount() === 0);
inv3.restore({ bag: { cola: -5, coffee: 2.7, ghost: 0 } });
ok('restore 过滤非法计数', !inv3.has('cola') && inv3.count('coffee') === 2 && !inv3.has('ghost'));

// —— 工资 dailySalary ——
ok('工资=底薪+绩效', dailySalary(30) === 80);
ok('绩效 0 拿底薪', dailySalary(0) === 50);
ok('负绩效不倒扣', dailySalary(-10) === 50);
ok('自定底薪', dailySalary(20, 100) === 120);
ok('NaN 安全', dailySalary(NaN) === 50);

// —— 压力折扣 ——
ok('stress<70 无折扣', stressOutputMultiplier(69).multiplier === 1);
ok('stress>=70 打八折', stressOutputMultiplier(70).multiplier === 0.8 && stressOutputMultiplier(70).stressed);
ok('stress NaN 安全', stressOutputMultiplier(undefined).multiplier === 1);

// —— 技能时限加成 ——
ok('skill 10 → +5s', skillTimeBonus(10) === 5);
ok('skill 0 → +0s', skillTimeBonus(0) === 0);
ok('skill 100 封顶 +20s', skillTimeBonus(100) === 20);
ok('负 skill 安全', skillTimeBonus(-5) === 0);

// —— 精力门槛 ——
ok('energy 50 可开工', energyGate(50).canWork && !energyGate(50).forceOff);
ok('energy 14 不能开工', energyGate(14).canWork === false);
ok('energy 0 强制下班', energyGate(0).forceOff === true);
ok('energy 15 边界可开工', energyGate(15).canWork === true);

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
