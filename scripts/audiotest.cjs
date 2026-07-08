// 音频+打字机运行时验证（headless 听不到声，验证状态与行为）
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errors = [];
  p.on('pageerror', e => errors.push('PAGEERR: ' + String(e).slice(0,200)));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0,200)); });

  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // 模拟用户手势解锁音频
  await p.mouse.click(640, 300);
  await sleep(500);

  // 进世界 → 触发一段对话，检查打字机是否逐字
  const result = await p.evaluate(async () => {
    const out = {};
    window.__game.scene.start('WorldScene', { career: 'programmer', act: 1 });
    await new Promise(r => setTimeout(r, 2500));
    const ws = window.__game.scene.getScene('WorldScene');
    // 直接驱动对话引擎演一个测试节点
    ws.dialogueEngine.start({
      start: 'a',
      nodes: {
        a: { speaker: '老陈', text: '这是打字机测试文本，用来验证逐字显示与叽喳声不报错。', choices: [{ label: '(继续)', next: 'b' }] },
        b: { speaker: '', text: '完', choices: [] },
      },
    });
    await new Promise(r => setTimeout(r, 400));
    // 打字中途：文本应短于全文
    const partial = ws.dialogueEngine._typeTarget ? ws.dialogueEngine._typeTarget.text.length : -1;
    out.partialLen = partial;
    out.typing = ws.dialogueEngine._typing;
    await new Promise(r => setTimeout(r, 1800));
    const done = ws.dialogueEngine._typeTarget ? ws.dialogueEngine._typeTarget.text.length : -1;
    out.doneLen = done;
    out.typingAfter = ws.dialogueEngine._typing;
    return out;
  });
  console.log('typewriter:', JSON.stringify(result));

  console.log('=== ERRORS (' + errors.length + ') ===');
  errors.filter(e => !e.includes('favicon')).forEach(e => console.log(e));
  console.log('=== END ===');
  await b.close();
})();
