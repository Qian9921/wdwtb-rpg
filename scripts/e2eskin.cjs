// 端到端：捏人选 SkyOffice 皮肤 → 存档 → 进 WorldScene → 确认主角贴图=所选皮肤。
const puppeteer = require('puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR: ' + String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(1800);

  // 1) 进捏人，选第 5 款(so_adam)，写入 profile（模拟测评完成的存档）
  const picked = await p.evaluate(async () => {
    window.__game.scene.start('OpeningScene');
    await new Promise(r => setTimeout(r, 1200));
    const s = window.__game.scene.getScene('OpeningScene');
    s._pickSkin(4); // so_adam
    const skin = s.charSkins[s.avatar.skinIdx];
    // 写一个完整 profile（含 avatar.skinKey），模拟走完测评
    const profile = { avatar: { skinKey: skin.key, skinName: skin.name, gender: skin.gender, tint: null, tintName: '原色' }, riasec: {}, big5: {}, holland: 'RIA', mbti: 'ENFJ', answers: [] };
    localStorage.setItem('wdwtb_profile', JSON.stringify(profile));
    return skin.key;
  });
  console.log('捏人选中皮肤:', picked);

  // 2) 进 WorldScene，读主角贴图 key
  const world = await p.evaluate(async () => {
    window.__game.scene.start('WorldScene', { career: 'programmer', act: 1 });
    await new Promise(r => setTimeout(r, 3000));
    const w = window.__game.scene.getScene('WorldScene');
    return {
      playerTex: w.player?.texture?.key,
      playerAnim: w.player?.anims?.currentAnim?.key,
      facing: w.facing,
      skinType: w.playerSkin ? (w.playerSkin.tex || 'n/a') : 'n/a',
    };
  });
  console.log('WorldScene 主角贴图:', world.playerTex, '| anim:', world.playerAnim, '| facing:', world.facing);
  const match = world.playerTex === picked;
  console.log('皮肤链路一致:', match ? '✓' : `✗ (期望 ${picked} 实得 ${world.playerTex})`);
  console.log('=== ERRORS (' + errs.length + ') ===');
  errs.slice(0, 5).forEach(e => console.log(e));
  await b.close();
  process.exit(match && errs.length === 0 ? 0 : 1);
})();
