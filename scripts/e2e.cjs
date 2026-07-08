const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERR: ' + String(e).slice(0,200)));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0,200)); });

  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(2000);

  // 直接驱动到 WorldScene（跳过开场，专测世界+菜单不报错）
  await p.evaluate(async () => {
    window.__game.scene.start('WorldScene', { career:'programmer', act:1 });
  });
  await sleep(3000);

  // 触发 ESC 菜单
  await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    ws.scene.pause();
    ws.scene.launch('PauseScene', { origin:'WorldScene', stateSystem: ws.stateSystem, career:'programmer', act:1 });
  });
  await sleep(1200);
  // 逐个面板
  for (const fn of ['_showStatus','_showItems','_showQuests','_showSettings','_showMain']) {
    await p.evaluate((f) => { try { window.__game.scene.getScene('PauseScene')[f](); } catch(e){} }, fn);
    await sleep(500);
  }

  console.log('=== ERRORS (' + errors.length + ') ===');
  errors.forEach(e => console.log(e));
  console.log('=== END ===');
  await b.close();
})();
