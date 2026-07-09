// 验证线上部署是最新版：访问线上 URL → 进捏人页 → 数皮肤池是否 8 款(A4 标志)。
const puppeteer = require('puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = process.argv[2];
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await sleep(3500);
  const r = await p.evaluate(async () => {
    if (!window.__game) return { err: 'no __game' };
    window.__game.scene.start('OpeningScene');
    await new Promise(r => setTimeout(r, 1800));
    const s = window.__game.scene.getScene('OpeningScene');
    if (!s || !s.charSkins) return { err: 'no OpeningScene' };
    // 抽验第 5 款(SkyOffice)可选中
    s._pickSkin(4);
    return {
      poolSize: s.charSkins.length,
      soKey: s.charSkins[4]?.key,
      previewTex: s.previewSpr?.texture?.key,
    };
  });
  console.log('线上皮肤池:', r.poolSize, '| 第5款:', r.soKey, '| 预览贴图:', r.previewTex, '| err:', r.err || 'none');
  console.log('是最新版(8款+SkyOffice):', r.poolSize === 8 && r.previewTex === 'so_adam' ? '✓' : '✗');
  console.log('页面错误数:', errs.length, errs.slice(0, 2).join(' | '));
  await p.screenshot({ path: '/tmp/live.png' });
  await b.close();
})();
