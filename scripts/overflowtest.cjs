// 文字溢出修复验证:驱动最长节点(a4_final_question 355字) + 超长选项(light_doctor)
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0,150)));
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await sleep(1500);
  // 场景1:最长正文节点(programmer_act4 a4_final_question)
  await p.evaluate(async () => {
    window.__game.scene.start('WorldScene', { career:'programmer', act:4 });
    await new Promise(r => setTimeout(r, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    const data = await (await fetch('./data/programmer_act4.json')).json();
    ws.dialogueActive = true;
    ws.dialogueEngine.data = data;
    ws.dialogueEngine._showNode('a4_final_question');
  });
  await sleep(600);
  // 跳字看第一页满页状态
  await p.keyboard.press('Space'); await sleep(400);
  await p.screenshot({ path: '/tmp/overflow_page1.png' });
  // 翻页
  await p.keyboard.press('Space'); await sleep(300);
  await p.keyboard.press('Space'); await sleep(400);
  await p.screenshot({ path: '/tmp/overflow_page2.png' });

  // 场景2:超长选项(light_doctor patient_family 38字选项)
  await p.evaluate(async () => {
    const ws = window.__game.scene.getScene('WorldScene');
    const data = await (await fetch('./data/light_doctor.json')).json();
    ws.dialogueEngine._clearUI();
    ws.dialogueEngine.data = data;
    ws.dialogueEngine._showNode('patient_family');
  });
  await sleep(500);
  await p.keyboard.press('Space'); await sleep(400); // 跳字
  await p.keyboard.press('Space'); await sleep(400); // 可能翻页
  await p.screenshot({ path: '/tmp/overflow_choices.png' });

  console.log('ERRORS:', errors.length); errors.forEach(e=>console.log(e));
  await b.close();
})();
