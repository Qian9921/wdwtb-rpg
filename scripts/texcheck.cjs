const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.goto('http://localhost:5173/', { waitUntil:'networkidle2' });
  await p.evaluate(() => window.__game.scene.start('WorldScene', { career:'programmer', act:1 }));
  await new Promise(r=>setTimeout(r,2500));
  const missing = await p.evaluate(() => {
    const ws = window.__game.scene.getScene('WorldScene');
    const keys = ['desk_wood','desk_gray','mon_a','mon_b','keyboard','laptop','lamp','papers','deskscreen',
      'chair_up','chair_down','chair_boss','chair_side','easel_a','easel_b','easel_c',
      'duoscreen_dark','duoscreen_white','rug','rug_small','sofa_L','sofa_1',
      'shelf_a','shelf_b','shelf_tall','cab_wood','bench','water','vending','fridge_dark',
      'copier','server','fax','cert_a','cert_b','office','roombuilder'];
    return keys.filter(k => !ws.textures.exists(k));
  });
  console.log('missing textures:', JSON.stringify(missing));
  await b.close();
})();
