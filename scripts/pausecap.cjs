const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  p.on('pageerror', e => console.log('[err]', String(e).slice(0,150)));
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const r = await p.evaluate(async () => {
    try {
      window.__game.scene.start('WorldScene', { career:'programmer', deep:true, act:2 });
      await new Promise(res => setTimeout(res, 2800));
      const ws = window.__game.scene.getScene('WorldScene');
      ws.scene.pause();
      ws.scene.launch('PauseScene', { origin:'WorldScene', stateSystem: ws.stateSystem, career:'programmer', act:2 });
      await new Promise(res => setTimeout(res, 1000));
      return 'ok';
    } catch(e) { return 'THROW:' + String(e).slice(0,150); }
  });
  console.log('r:', r);
  await p.screenshot({ path: '/tmp/pause_main.png' });
  await p.evaluate(() => { try { window.__game.scene.getScene('PauseScene')._showStatus(); } catch(e){} });
  await sleep(700); await p.screenshot({ path: '/tmp/pause_status.png' });
  await p.evaluate(() => { try { window.__game.scene.getScene('PauseScene')._showItems(); } catch(e){} });
  await sleep(700); await p.screenshot({ path: '/tmp/pause_items.png' });
  await b.close(); console.log('done');
})();
