const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  p.on('pageerror', e => console.log('[PAGEERR]', String(e).slice(0,220)));
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const r = await p.evaluate(async () => {
    try {
      window.__game.scene.start('WorldScene', { career:'programmer', deep:true, act:2 });
      await new Promise(res => setTimeout(res, 2500));
      const ws = window.__game.scene.getScene('WorldScene');
      return 'started, ws=' + (!!ws) + ' state=' + (!!(ws&&ws.stateSystem)) + ' player=' + (!!(ws&&ws.player));
    } catch(e) { return 'THROW: ' + String(e).slice(0,180); }
  });
  console.log('RESULT:', r);
  await p.screenshot({ path: '/tmp/world_cold.png' });
  await b.close();
})();
