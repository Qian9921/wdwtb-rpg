// 移动修复验证：按住方向键连截 3 帧,核对走路动画帧号在正确区间 + 停步回 idle
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0,150)));
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await p.evaluate(() => { window.__game.scene.start('WorldScene', { career:'programmer', act:1 }); });
  await sleep(2500);

  const probe = async () => p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    return { frame: +ws.player.frame.name, anim: ws.player.anims.currentAnim?.key || null, playing: ws.player.anims.isPlaying, facing: ws.facing };
  });

  const res = {};
  for (const [key, code] of [['right','KeyD'],['left','KeyA'],['up','KeyW'],['down','KeyS']]) {
    await p.keyboard.down(code); await sleep(500);
    res[key] = await probe();
    await p.keyboard.up(code); await sleep(300);
    res[key+'_idle'] = await probe();
  }
  console.log(JSON.stringify(res, null, 1));
  console.log('ERRORS:', errors.length); errors.forEach(e=>console.log(e));
  await b.close();
})();
