// 轻量职业接线验证：designer 单文件剧情加载 + 首节点演出
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0,180)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0,180)); });
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await sleep(1500);
  const r = await p.evaluate(async () => {
    window.__game.scene.start('WorldScene', { career: 'designer', deep: false, act: 1 });
    await new Promise(r2 => setTimeout(r2, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    ws._interact({ act: 1 }); // 模拟走近老陈按 E
    await new Promise(r2 => setTimeout(r2, 2000));
    const de = ws.dialogueEngine;
    return { started: !!de.ui, node: de.currentId, actName: de.currentActName };
  });
  console.log('light designer:', JSON.stringify(r));
  await p.screenshot({ path: '/tmp/light_designer.png' });
  console.log('ERRORS(' + errors.length + '):'); errors.forEach(e => console.log(e));
  await b.close();
})();
