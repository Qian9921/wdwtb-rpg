// office_npcs 职业寒暄库单测:每个职业都有背景同事寒暄,数据合法。
// 保证 _interactWorker 能按职业取到符合职业味道的台词(不再全职业说程序员话)。
import fs from 'fs';

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.error('✗ ' + name)); if (cond) console.log('✓ ' + name); };

const data = JSON.parse(fs.readFileSync(new URL('../public/data/office_npcs.json', import.meta.url)));

t('有 bantersByCareer 字段', data.bantersByCareer && typeof data.bantersByCareer === 'object');

// 10 个职业全覆盖
const CAREERS = ['programmer', 'product', 'admin', 'designer', 'operation', 'teacher', 'doctor', 'civilservant', 'sales', 'lawyer'];
const banters = data.bantersByCareer || {};
for (const c of CAREERS) {
  const pool = banters[c];
  t(`${c} 有寒暄库`, Array.isArray(pool) && pool.length >= 3);
  t(`${c} 寒暄都是非空字符串`, Array.isArray(pool) && pool.every(s => typeof s === 'string' && s.trim().length > 0));
}

// 职业味道不串:程序员的话里有"代码/bug/需求",不应出现在行政/医生库里
const progHasCode = (banters.programmer || []).some(s => /代码|bug|发版/.test(s));
t('程序员寒暄有编程味', progHasCode);
const adminNoCode = !(banters.admin || []).some(s => /代码|bug|发版|接口/.test(s));
t('行政寒暄不串编程味', adminNoCode);
const doctorHasMed = (banters.doctor || []).some(s => /门诊|病例|病历|值班|规培|交班/.test(s));
t('医生寒暄有医疗味', doctorHasMed);

// workers 背景群演仍在
t('workers 列表非空', Array.isArray(data.workers) && data.workers.length > 0);

console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ FAILED'} (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
