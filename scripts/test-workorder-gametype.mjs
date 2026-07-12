// 工单 gameType 映射单测:每个工单都标了对应小游戏类型,让工作内容和玩法咬合
// (不再无脑轮换换皮——修bug→找茬、评审→审查、开发→序列、测试→用例)。
import fs from 'fs';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.error('✗ ' + name)); if (cond) console.log('✓ ' + name); };

const VALID_TYPES = ['debug', 'review', 'sequence', 'testcase'];

const d = JSON.parse(fs.readFileSync(new URL('../public/data/work_orders_programmer.json', import.meta.url)));
const orders = d.orders || [];

t('程序员有工单', orders.length > 0);
t('每个工单都有 gameType', orders.every(o => o.gameType));
t('gameType 都是合法值', orders.every(o => VALID_TYPES.includes(o.gameType)));

// 内容和类型咬合抽查:含"bug/报错/崩溃/泄漏/并发/卡顿"的应是 debug
const debugOrders = orders.filter(o => /bug|报错|崩溃|泄漏|并发|卡顿|500|空指针/.test(o.title));
t('修错误类工单映射到 debug', debugOrders.length > 0 && debugOrders.every(o => o.gameType === 'debug'));
// 评审/重构 → review
const reviewOrders = orders.filter(o => /评审|重构/.test(o.title));
t('评审/重构类工单映射到 review', reviewOrders.length > 0 && reviewOrders.every(o => o.gameType === 'review'));
// 测试 → testcase
const testOrders = orders.filter(o => /测试|单元/.test(o.title));
t('测试类工单映射到 testcase', testOrders.length === 0 || testOrders.every(o => o.gameType === 'testcase'));

// _launchCoding 的 gameType 映射覆盖所有合法类型(读 WorldScene 源码)
const ws = fs.readFileSync(new URL('../src/scenes/WorldScene.js', import.meta.url), 'utf8');
t('WorldScene 有 _gameSceneForType 映射', ws.includes('_gameSceneForType'));
// 玩法多样化:每种工单用名副其实的玩法(不再全塞敲码节奏,修用户"一直敲空格太单调"反馈)
t('映射覆盖 debug→DebugGameScene(找bug行)', ws.includes("debug: 'DebugGameScene'"));
t('映射覆盖 sequence→SequenceGameScene(排顺序)', ws.includes("sequence: 'SequenceGameScene'"));
t('映射覆盖 review→CodeReviewScene', ws.includes("review: 'CodeReviewScene'"));
t('映射覆盖 testcase→TestCaseScene', ws.includes("testcase: 'TestCaseScene'"));
t('_doWorkOrder 传入 order.gameType', ws.includes('order.gameType'));

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ FAILED'} (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
