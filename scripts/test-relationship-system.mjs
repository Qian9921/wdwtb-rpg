// RelationshipSystem 单元测试（E5 关系网）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RelationshipSystem,
  clampAffinity,
  affinityBand,
  normalizeAffinityPool,
  pickRelationAwareLine,
  applyNpcChat,
  eventMeetsRelations,
  filterEventsForRelations,
  summarizeRelations,
  DEFAULT_AFFINITY,
} from '../src/systems/RelationshipSystem.js';
import { eventEligibleForAct, npcDefsFromRoster } from '../src/systems/WorkLoopOffice.js';
import { buildEndingReportContext } from '../src/systems/CareerFit.js';
import { buildWorldSaveExtra } from '../src/systems/StoryProgress.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data');
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? ' → ' + d : ''}`); }
};

console.log('\n=== RelationshipSystem (E5) ===\n');

// clamp / band
ok('clamp 上限', clampAffinity(200) === 100);
ok('clamp 下限', clampAffinity(-5) === 0);
ok('clamp 非法→默认', clampAffinity('x') === DEFAULT_AFFINITY);
ok('band cold', affinityBand(20) === 'cold');
ok('band neutral', affinityBand(50) === 'neutral');
ok('band warm', affinityBand(70) === 'warm');

// class basics
const rel = new RelationshipSystem();
ok('默认好感 50', rel.getAffinity('peer') === 50);
ok('bump +10', rel.bump('peer', 10) === 60);
ok('bump 记忆', rel.getAffinity('peer') === 60);
ok('remember 新', rel.remember('peer', 'talked') === true);
ok('remember 重复', rel.remember('peer', 'talked') === false);
ok('knows talked', rel.knows('peer', 'talked'));
ok('knows 未知 false', !rel.knows('peer', 'nope'));
ok('bump 钳制', rel.bump('peer', 100) === 100);

// serialize / restore
const ser = rel.serialize();
ok('serialize 有 affinity', ser.affinity.peer === 100);
ok('serialize 有 memories', Array.isArray(ser.memories.peer) && ser.memories.peer.includes('talked'));
const rel2 = new RelationshipSystem();
rel2.restore(ser);
ok('restore 好感', rel2.getAffinity('peer') === 100);
ok('restore 记忆', rel2.knows('peer', 'talked'));
rel2.restore(null);
ok('restore null 清空为默认', rel2.getAffinity('peer') === 50);
rel2.restore({ affinity: { vet: 12 }, memories: { vet: ['talked', 1, 'x'] } });
ok('restore 过滤非字符串记忆', rel2.knows('vet', 'talked') && !rel2.knows('vet', '1'));
ok('restore 数字好感', rel2.getAffinity('vet') === 12);

// applyNpcChat
const r3 = new RelationshipSystem();
const chat1 = applyNpcChat(r3, 'peer', { questTalk: false });
ok('寒暄 +3', chat1.delta === 3 && chat1.affinity === 53);
ok('首次 firstTalk', chat1.firstTalk === true);
const chat2 = applyNpcChat(r3, 'peer', { questTalk: true });
ok('任务对接 +5', chat2.delta === 5 && chat2.affinity === 58);
ok('非首次', chat2.firstTalk === false);
ok('quest_talk 记忆', r3.knows('peer', 'quest_talk'));

// normalizeAffinityPool
ok('pool 数组', normalizeAffinityPool(['a', 'b'], 1)?.length === 2);
ok('pool 按幕', normalizeAffinityPool({ '1': ['a'], '3': ['c'] }, 2)?.[0] === 'a');
ok('pool 按幕取高', normalizeAffinityPool({ '1': ['a'], '3': ['c'] }, 3)?.[0] === 'c');
ok('pool 空', normalizeAffinityPool([], 1) === null);

// pickRelationAwareLine
const npc = {
  id: 'peer',
  line: '兜底',
  linesByAct: { '1': ['幕1寒暄'] },
  linesByAffinity: {
    cold: ['冷淡'],
    warm: { '1': ['热络A', '热络B'] },
  },
};
ok('warm 取热络', pickRelationAwareLine({ npc, act: 1, affinity: 80, rng: () => 0 }) === '热络A');
ok('cold 取冷淡', pickRelationAwareLine({ npc, act: 1, affinity: 10, rng: () => 0 }) === '冷淡');
const npcNoAff = { line: 'L', linesByAct: { '1': ['幕线'] } };
ok('无 affinity 回落幕', pickRelationAwareLine({ npc: npcNoAff, act: 1, affinity: 50, rng: () => 0 }) === '幕线');
ok('null npc', pickRelationAwareLine({ npc: null }) === null);

// event gates
const evWarm = { id: 'e1', minAffinity: { npc: 'vet', min: 60 } };
const evMem = { id: 'e2', requiresMemory: { npc: 'peer', tag: 'talked' } };
const evOpen = { id: 'e3' };
const rr = new RelationshipSystem();
ok('低好感挡 minAffinity', !eventMeetsRelations(evWarm, rr));
rr.bump('vet', 20); // 70
ok('够好感放行', eventMeetsRelations(evWarm, rr));
ok('无记忆挡 requiresMemory', !eventMeetsRelations(evMem, rr));
rr.remember('peer', 'talked');
ok('有记忆放行', eventMeetsRelations(evMem, rr));
ok('开放事件 always', eventMeetsRelations(evOpen, rr));
ok('null rel 仍可放开放事件', eventMeetsRelations(evOpen, null));

const mixed = [
  { id: 'a', minAct: 3 },
  { id: 'b', minAffinity: { npc: 'vet', min: 90 } },
  { id: 'c' },
];
const rr2 = new RelationshipSystem();
rr2.bump('vet', 5); // 55
const filt = filterEventsForRelations(mixed, 1, rr2, (e, act) => eventEligibleForAct(e, act));
ok('filter 去掉 minAct3 与高门槛', filt.length === 1 && filt[0].id === 'c');

// summarize
const rs = new RelationshipSystem();
rs.bump('peer', 30);
rs.remember('peer', 'talked');
rs.bump('vet', -20);
rs.remember('vet', 'talked');
const sum = summarizeRelations(rs, { peer: '江野', vet: '周哥' });
ok('summary 非空', sum.text.includes('办公室关系'));
ok('summary 含名', sum.text.includes('江野') || sum.top.some(t => t.name === '江野'));
ok('summary top≤3', sum.top.length <= 3);

// report context 吃关系
const ctx = buildEndingReportContext({
  career: 'programmer',
  stats: { stress: 40, health: 70, passion: 60, energy: 50 },
  relationSummary: sum.text,
});
ok('prompt 含关系', ctx.promptBlock.includes('办公室关系'));
ok('ctx.relationSummary', !!ctx.relationSummary);

// save extra 含 relations
const extra = buildWorldSaveExtra({ relations: rs.serialize(), story: { act: 1 } });
ok('save extra 有 relations', extra.relations && extra.relations.affinity);

// 真实数据：programmer roster + events
const roster = JSON.parse(readFileSync(join(DATA, 'roster_programmer.json'), 'utf8'));
const defs = npcDefsFromRoster(roster, 'programmer');
const peer = defs?.find((n) => n.id === 'peer');
const vet = defs?.find((n) => n.id === 'vet');
ok('roster peer 有 linesByAffinity', peer && peer.linesByAffinity);
ok('roster vet 有 linesByAffinity', vet && vet.linesByAffinity);
ok('warm 台词可选', pickRelationAwareLine({
  npc: peer, act: 1, affinity: 80, rng: () => 0,
})?.length > 4);

const events = JSON.parse(readFileSync(join(DATA, 'office_events_programmer.json'), 'utf8')).events;
const gated = events.filter((e) => e.minAffinity || e.requiresMemory);
ok('programmer ≥2 关系门控事件', gated.length >= 2, `got ${gated.length}`);
const zhou = events.find((e) => e.id === 'ev_rel_zhou_coffee');
ok('周哥咖啡事件门槛', zhou && zhou.minAffinity?.npc === 'vet');
const jiang = events.find((e) => e.id === 'ev_rel_jiang_lunch');
ok('江野午饭 requiresMemory', jiang && jiang.requiresMemory?.tag === 'talked');

// 静态：WorldScene 接线
const ws = readFileSync(join(DATA, '../../src/scenes/WorldScene.js'), 'utf8');
ok('WS 用 RelationshipSystem', ws.includes('RelationshipSystem'));
ok('WS 用 pickRelationAwareLine', ws.includes('pickRelationAwareLine'));
ok('WS 存 relations', ws.includes('relations:'));
ok('WS eventMeetsRelations', ws.includes('eventMeetsRelations'));
ok('WS _endingPayload 关系', ws.includes('relationSummary'));

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ ' + fail + ' FAILED'} (${pass} passed, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
