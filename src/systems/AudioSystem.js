// AudioSystem：纯 WebAudio 程序化音频——零素材文件。
// BGM：生成式和弦垫循环，按场景 mood 切换（title/office/mindscape/ending）。
// SFX：对话叽喳 blip（像素 RPG 打字机标配）、UI 点击。
// 音量：读 localStorage wdwtb_settings（bgm/sfx 0-100）；PauseScene 滑块实时 setVolume。
// 浏览器自动播放策略：AudioContext 需用户手势解锁——main.js 首次交互时调 unlock()，
// 解锁前 playBgm 只记录 pendingMood，解锁后自动开播。

let ctx = null;
let bgmGain = null;
let sfxGain = null;
let duckGain = null;   // 暂停菜单时整体压低 BGM
let currentMood = null;
let pendingMood = null;
let stepTimer = null;
let stepIndex = 0;

const BGM_BASE = 0.20; // bgm 滑块 100 时的实际总 gain（背景乐要轻）
const SFX_BASE = 0.45;

// 音名 → 频率（Hz）
const N = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25,
};

// 每种 mood：和弦进行 + 步长 + 波形 + 低通截止 + 是否加琶音
const MOODS = {
  // 标题/开场：温暖梦幻 Cmaj7-Am7-Fmaj7-G
  title: {
    step: 3.4, wave: 'sine', filter: 1100, arp: false,
    chords: [
      [N.C4, N.E4, N.G4, N.B4], [N.A3, N.C4, N.E4, N.G4],
      [N.F3, N.A3, N.C4, N.E4], [N.G3, N.B3, N.D4, N.G4],
    ],
  },
  // 办公室：轻快一点，带琶音点缀 Fmaj7-G-Em7-Am7
  office: {
    step: 2.6, wave: 'triangle', filter: 1500, arp: true,
    chords: [
      [N.F3, N.A3, N.C4, N.E4], [N.G3, N.B3, N.D4],
      [N.E3, N.G3, N.B3, N.D4], [N.A3, N.C4, N.E4, N.G4],
    ],
  },
  // 心象世界：空灵高音区、极慢
  mindscape: {
    step: 4.2, wave: 'sine', filter: 900, arp: false,
    chords: [
      [N.A3, N.E4, N.A4, N.C5], [N.F3, N.C4, N.F4, N.A4],
      [N.C4, N.G4, N.C5, N.E5], [N.G3, N.D4, N.G4, N.B4],
    ],
  },
  // 结局：温暖释然
  ending: {
    step: 3.6, wave: 'sine', filter: 1200, arp: false,
    chords: [
      [N.F3, N.A3, N.C4, N.E4], [N.C4, N.E4, N.G4],
      [N.A3, N.C4, N.E4], [N.G3, N.B3, N.D4, N.G4],
    ],
  },
};

function _readSettings() {
  let s = { bgm: 70, sfx: 80 };
  try { s = { ...s, ...JSON.parse(localStorage.getItem('wdwtb_settings') || '{}') }; } catch (e) {}
  return s;
}

// 播一个和弦垫：每个音一只振荡器，慢起慢收的包络
function _playChord(mood, freqs) {
  const now = ctx.currentTime;
  const dur = mood.step + 1.4; // 尾音跨到下一步，衔接不断
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = mood.filter;
    osc.type = mood.wave; osc.frequency.value = f;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16 / freqs.length, now + 0.9); // 按音数均摊避免叠爆
    g.gain.setValueAtTime(0.16 / freqs.length, now + dur - 1.4);
    g.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(lp); lp.connect(g); g.connect(bgmGain);
    osc.start(now); osc.stop(now + dur);
  }
  // 琶音点缀（office）：和弦音高八度的短音
  if (mood.arp) {
    freqs.slice(0, 4).forEach((f, i) => {
      const t = now + 0.3 + i * 0.55;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = f * 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(g); g.connect(bgmGain);
      osc.start(t); osc.stop(t + 0.55);
    });
  }
}

function _startLoop(moodKey) {
  const mood = MOODS[moodKey];
  if (!mood) return;
  stepIndex = 0;
  const tick = () => {
    _playChord(mood, mood.chords[stepIndex % mood.chords.length]);
    stepIndex++;
  };
  tick(); // 立刻出声
  stepTimer = setInterval(tick, mood.step * 1000);
}

export const AudioSystem = {
  // 首次用户手势时调用：建 AudioContext + 增益链，启动挂起的 BGM
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const s = _readSettings();
      duckGain = ctx.createGain(); duckGain.gain.value = 1;
      bgmGain = ctx.createGain(); bgmGain.gain.value = (s.bgm / 100) * BGM_BASE;
      sfxGain = ctx.createGain(); sfxGain.gain.value = (s.sfx / 100) * SFX_BASE;
      bgmGain.connect(duckGain); duckGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
      if (pendingMood) { const m = pendingMood; pendingMood = null; this.playBgm(m); }
    } catch (e) { /* 音频不可用时静默降级，不影响游戏 */ }
  },

  // 切 BGM mood；相同 mood 不重启（场景间无缝）
  playBgm(moodKey) {
    if (!ctx) { pendingMood = moodKey; return; }
    if (currentMood === moodKey) return;
    this.stopBgm();
    currentMood = moodKey;
    if (duckGain) duckGain.gain.value = 1; // 换场景自动解除 duck
    try { _startLoop(moodKey); } catch (e) {}
  },

  stopBgm() {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    currentMood = null;
  },

  // 暂停菜单压低/恢复 BGM
  duck(on) {
    if (!ctx || !duckGain) return;
    duckGain.gain.linearRampToValueAtTime(on ? 0.35 : 1, ctx.currentTime + 0.25);
  },

  // 对话叽喳 blip：短促三角波，按说话人名字定基准音高（每个角色声线不同）
  blip(speaker) {
    if (!ctx) return;
    try {
      let hash = 0;
      const s = speaker || '';
      for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) & 0xffff;
      const base = 420 + (hash % 5) * 55;          // 420~640Hz 五档声线
      const f = base + Math.random() * 40 - 20;    // 每字微抖，像素 RPG 味
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = f;
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.connect(g); g.connect(sfxGain);
      osc.start(now); osc.stop(now + 0.06);
    } catch (e) {}
  },

  // UI 点击音：柔和短 sine
  uiClick() {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.06);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(g); g.connect(sfxGain);
      osc.start(now); osc.stop(now + 0.09);
    } catch (e) {}
  },

  // PauseScene 滑块实时调音量（0-100）
  setVolume(key, val) {
    if (!ctx) return;
    if (key === 'bgm' && bgmGain) bgmGain.gain.value = (val / 100) * BGM_BASE;
    if (key === 'sfx' && sfxGain) sfxGain.gain.value = (val / 100) * SFX_BASE;
  },
};
