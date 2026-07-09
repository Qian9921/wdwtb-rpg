const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-gpu'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e).slice(0,150)));
  await p.goto('http://localhost:5173/', { waitUntil:'domcontentloaded' });
  await sleep(2000);
  await p.evaluate(async () => {
    window.__game.scene.start('WorldScene', { career:'programmer', act:1 });
    await new Promise(r => setTimeout(r, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    ws.dialogueActive = true;
    ws.dialogueEngine.start({ start:'a', nodes:{
      a:{ speaker:'老陈', text:'欢迎来到团队。这里的活不轻松,但我会带你。先坐下,我给你讲讲我们在做什么。', choices:[{label:'我准备好了',next:'b'},{label:'我有点紧张',next:'b'}] },
      b:{ speaker:'', text:'完', choices:[] }
    }});
  });
  await sleep(2500);
  await p.screenshot({ path: '/tmp/dlg_1920.png' });
  // 测试点击框最下缘能否跳字(点 y=1000 靠近底部)
  const state1 = await p.evaluate(() => { const ws=window.__game.scene.getScene('WorldScene'); return ws.dialogueEngine._typing; });
  await p.mouse.click(960, 1000); await sleep(500);
  const state2 = await p.evaluate(() => { const ws=window.__game.scene.getScene('WorldScene'); return ws.dialogueEngine._typing; });
  console.log('typing before click:', state1, 'after click bottom:', state2);
  // 测 ESC 退出
  await p.keyboard.press('Escape'); await sleep(800);
  const exited = await p.evaluate(() => { const ws=window.__game.scene.getScene('WorldScene'); return { dialogueActive: ws.dialogueActive, uiGone: !ws.dialogueEngine.ui }; });
  console.log('after ESC:', JSON.stringify(exited));
  console.log('ERRORS:', errors.length); errors.forEach(e=>console.log(e));
  await b.close();
})();
