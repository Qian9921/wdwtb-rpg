// 验证捏人页 8 款皮肤池：逐个点选，读预览 sprite 的贴图/动画/帧尺寸，截图。
const puppeteer = require('puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 140)); });
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' }); await sleep(1800);
  // 直接进 OpeningScene
  await p.evaluate(async () => { window.__game.scene.start('OpeningScene'); await new Promise(r => setTimeout(r, 1500)); });

  const readPreview = () => p.evaluate(() => {
    const s = window.__game.scene.getScene('OpeningScene');
    const spr = s.previewSpr;
    const tex = spr.texture.key;
    const frame = spr.frame?.name;
    return {
      idx: s.avatar.skinIdx,
      tex, frame,
      w: Math.round(spr.frame?.width), h: Math.round(spr.frame?.height),
      anim: spr.anims.currentAnim?.key, playing: spr.anims.isPlaying,
      label: s.skinNameLabel?.text,
      poolSize: s.charSkins.length,
    };
  });

  console.log('皮肤池大小:', (await readPreview()).poolSize);
  const results = [];
  for (let i = 0; i < 8; i++) {
    await p.evaluate((idx) => window.__game.scene.getScene('OpeningScene')._pickSkin(idx), i);
    await sleep(500);
    const r = await readPreview();
    const ok = r.tex && r.anim && r.playing;
    results.push({ i, ...r, ok });
    console.log(`皮肤#${i} ${r.label} → tex=${r.tex} frame=${r.frame} ${r.w}x${r.h} anim=${r.anim} playing=${r.playing} ${ok ? '✓' : '✗'}`);
    if (i === 4) await p.screenshot({ path: '/tmp/skin_so_adam.png' }); // 截一张 SkyOffice 皮肤
  }
  // 回到第 0 款截整页
  await p.evaluate(() => window.__game.scene.getScene('OpeningScene')._pickSkin(0));
  await sleep(400);
  await p.screenshot({ path: '/tmp/skinpool.png' });

  const allOk = results.every(r => r.ok);
  console.log('全部 8 款可渲染+动画:', allOk, '| ERRORS:', errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})();
