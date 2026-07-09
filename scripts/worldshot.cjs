const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  p.on('pageerror', e => console.log('[err]', String(e).slice(0,150)));
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  const r = await p.evaluate(async () => {
    try {
      window.__game.scene.start('WorldScene', { career:'programmer', act:1 });
      await new Promise(res => setTimeout(res, 3000));
      return 'ok';
    } catch(e) { return 'THROW:' + String(e).slice(0,150); }
  });
  console.log('r:', r);
  await p.screenshot({ path: '/tmp/hd_world.png' });
  // 触发一次对话看文字清晰度
  await p.evaluate(async () => {
    try {
      const ws = window.__game.scene.getScene('WorldScene');
      if (ws && ws.dialogue && ws._startDialogueForNpc) {
        // best effort: press E near npc handled elsewhere
      }
    } catch(e){}
  });
  await sleep(500);
  await p.keyboard.press('KeyE');
  await sleep(1500);
  await p.screenshot({ path: '/tmp/hd_world_dialogue.png' });
  await b.close(); console.log('done');
})();
