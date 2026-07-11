// npcLineForAct 单测：台词随幕变化的选取规则
import { npcLineForAct } from '../src/systems/WorkLoopOffice.js';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.error('✗ ' + name)); if (cond) console.log('✓ ' + name); };
const rng0 = () => 0; // 固定取池子第一条

const npc = {
  line: '兜底台词',
  linesByAct: {
    '1': ['一幕A', '一幕B'],
    '3': ['三幕A'],
    '5': ['五幕A'],
  },
};

t('act1 取 1 幕池', npcLineForAct(npc, 1, rng0) === '一幕A');
t('act2 没写→沿用 1 幕', npcLineForAct(npc, 2, rng0) === '一幕A');
t('act3 切换到 3 幕池', npcLineForAct(npc, 3, rng0) === '三幕A');
t('act4 沿用 3 幕', npcLineForAct(npc, 4, rng0) === '三幕A');
t('act5 切换到 5 幕池', npcLineForAct(npc, 5, rng0) === '五幕A');
t('rng 取池内其他条', npcLineForAct(npc, 1, () => 0.9) === '一幕B');
t('无 linesByAct 回落 line', npcLineForAct({ line: 'X' }, 3, rng0) === 'X');
t('linesByAct 空对象回落 line', npcLineForAct({ line: 'X', linesByAct: {} }, 3, rng0) === 'X');
t('池为空数组回落 line', npcLineForAct({ line: 'X', linesByAct: { '1': [] } }, 3, rng0) === 'X');
t('act 非法按 1 处理', npcLineForAct(npc, undefined, rng0) === '一幕A');
t('无 line 无 linesByAct → null', npcLineForAct({}, 1, rng0) === null);
t('npc 为 null → null', npcLineForAct(null, 1, rng0) === null);
// 只有高幕台词时,低幕不越级取
t('act1 时不取 3 幕台词', npcLineForAct({ line: 'F', linesByAct: { '3': ['高幕'] } }, 1, rng0) === 'F');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
