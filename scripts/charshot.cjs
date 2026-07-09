// 捏人升级验证:预览页截图 + 选 Amelia 后进 World 主角贴图是否生效
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1600, height: 900 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0,150)));
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle2' });
  await sleep(1200);
  await p.evaluate(() => { localStorage.clear(); window.__game.scene.start('OpeningScene'); });
  await sleep(2200);
  await p.screenshot({ path: '/tmp/customize.png' });
  // 点第三个缩略图(Amelia)再截
  await p.evaluate(() => { window.__game.scene.getScene('OpeningScene')._pickSkin(2); });
  await sleep(600);
  await p.evaluate(() => { window.__game.scene.getScene('OpeningScene')._pickTint(3); });
  await sleep(400);
  await p.screenshot({ path: '/tmp/customize_amelia.png' });
  // 手动写 profile 模拟完成捏人,进 World 验证主角贴图
  const r = await p.evaluate(async () => {
    localStorage.setItem('wdwtb_profile', JSON.stringify({ avatar: { skinKey: 'amelia', tint: 0xffd8e8 } }));
    window.__game.scene.stop('OpeningScene');
    window.__game.scene.start('WorldScene', { career:'programmer', act:1 });
    await new Promise(r2 => setTimeout(r2, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    return { tex: ws.player.texture.key, tinted: ws.player.isTinted };
  });
  console.log('world player:', JSON.stringify(r));
  await p.screenshot({ path: '/tmp/world_amelia.png' });
  console.log('ERRORS:', errors.length); errors.forEach(e=>console.log(e));
  await b.close();
})();
