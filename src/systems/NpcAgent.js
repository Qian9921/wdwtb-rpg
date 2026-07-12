import Phaser from 'phaser';

// NpcAgent：给坐在工位上的同事一套"有目的的生活"——起身、沿【A* 寻路出的路点】走到明确目的地
// (厕所/茶水间/打印机/会议室…)、做事(停留)、再走回工位坐下。
//
// 走动=沿路点补间(tween)。路点由 A* 保证全程避开墙和家具,所以补间平滑滑过、绝不会卡在桌边;
// 走动时暂时关掉物理体(不参与碰撞,避免被家具楔住),坐下时再开回不动的实体(挡住玩家)。
//
// 状态：sitting → walking(去程) → dwelling(做事) → walking(回程) → sitting
export class NpcAgent {
  constructor(scene, worker, opts = {}) {
    this.scene = scene;
    this.w = worker;
    this.state = 'sitting';
    this.speed = opts.speed || 78; // px/s
    this.walkPrefix = `walk_${worker.skin}`;
    this._tween = null;
    this._lastDir = worker.chair?.dir || 'down';
  }

  get busy() { return this.state !== 'sitting'; }

  _dirOf(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }

  // 一次出行：pathTo/pathBack=去/回程路点数组, dwellMs=到目的地停留。任一为空则不出行。
  // faceDir: 到达后面向的方向('up'/'down'/'left'/'right'),让 NPC 做事时真的面对设施
  // (去接咖啡面向咖啡机、去打印面向打印机)。不传则沿用移动的最后方向。
  goTrip(pathTo, pathBack, dwellMs = 2500, faceDir = null) {
    if (this.busy) return false;
    const spr = this.w.spr;
    if (!spr || !pathTo || !pathTo.length || !pathBack || !pathBack.length) return false;
    this._pathBack = pathBack;
    this._dwellMs = dwellMs;
    this._faceDir = faceDir; // _arriveDest 到达后转向它
    this.state = 'walking';
    this._tweenPath(pathTo, () => this._arriveDest());
    return true;
  }

  // 拜访：走到目的地后停住等待（不自动返回），由外部调 returnHome() 再回工位。
  // 用于"NPC 跑到玩家面前送事件"——到了先说话，说完再回去。
  //
  // ⚠️ 关键(信使一直追玩家):到达后 state 变 'visiting'(busy)。玩家走开后需重走一段
  // 新路径继续追,此时若卡在 busy 直接 return,追踪链就断了——信使定在旧位置,事件
  // 只能靠 20s 超时兜底弹出。因此这里【允许从 visiting 态再次发起】(等同重定向),
  // 只拒绝"去程 walking 中/回程中"这类真正进行中的移动,避免打断补间。
  // facePos {x,y}: 到达后面向的目标(如玩家)。给了就转向它,而非沿用移动的最后方向。
  goVisit(pathTo, onArrive, facePos = null) {
    if (this.state !== 'sitting' && this.state !== 'visiting') return false;
    const spr = this.w.spr;
    if (!spr || !pathTo || !pathTo.length) return false;
    // 重定向前若有残留补间,先停掉,避免两条 tween 抢同一 sprite。
    if (this._tween) { this._tween.stop(); this._tween = null; }
    this.state = 'walking';
    this._tweenPath(pathTo, () => {
      this.state = 'visiting';
      spr.stop();
      if (facePos) this.faceTo(facePos.x, facePos.y); // 面向目标(信使面向玩家)
      else { const idle = this.w.anims?.idleFrame?.(this._lastDir); if (idle != null) spr.setFrame(idle); }
      if (onArrive) onArrive();
    });
    return true;
  }

  // 面向一个目标坐标(x,y):到达目的地后主动转向要面对的东西——信使面向玩家、
  // 去接咖啡的人面向咖啡机、去打印的人面向打印机。用户反馈:NPC 做那个动作时要
  // 真的面对那个地方,来找我就要面对我。修根因:此前到达只用 _lastDir(移动的最后方向),
  // 不是"面向目标"的方向。
  faceTo(tx, ty) {
    const spr = this.w.spr;
    if (!spr) return;
    const dir = this._dirOf(tx - spr.x, ty - spr.y);
    this._lastDir = dir;
    const idle = this.w.anims?.idleFrame?.(dir);
    if (idle != null) spr.setFrame(idle);
  }

  // 拜访结束：沿 pathBack 走回工位坐下。
  returnHome(pathBack) {
    if (this.state !== 'visiting') { this._sitDown(); return; }
    if (!pathBack || !pathBack.length) { this._sitDown(); return; }
    this.state = 'walking';
    this._tweenPath(pathBack, () => this._sitDown());
  }

  _tweenPath(waypoints, onDone) {
    const spr = this.w.spr;
    let i = 0;
    const step = () => {
      if (!spr.scene) { this.state = 'sitting'; return; }
      if (i >= waypoints.length) { onDone(); return; }
      const raw = waypoints[i++];
      // 防御性:即使寻路给了坏 waypoint,也把目标钳在地图边界内,NPC 绝不跑出地图(用户反馈)
      const bounds = this.scene.physics && this.scene.physics.world && this.scene.physics.world.bounds;
      const wp = bounds
        ? { x: Phaser.Math.Clamp(raw.x, 8, bounds.width - 8), y: Phaser.Math.Clamp(raw.y, 8, bounds.height - 8) }
        : raw;
      const dx = wp.x - spr.x, dy = wp.y - spr.y;
      const dir = this._dirOf(dx, dy);
      this._lastDir = dir;
      if (this.scene.anims.exists(`${this.walkPrefix}_${dir}`)) spr.play(`${this.walkPrefix}_${dir}`, true);
      const dist = Math.hypot(dx, dy);
      if (dist < 1) { step(); return; }
      this._tween = this.scene.tweens.add({
        targets: spr, x: wp.x, y: wp.y, duration: (dist / this.speed) * 1000, ease: 'Linear',
        onUpdate: () => spr.setDepth(spr.y),
        onComplete: step,
      });
    };
    step();
  }

  _arriveDest() {
    const spr = this.w.spr;
    this.state = 'dwelling';
    spr.stop();
    // 面向设施(咖啡机/打印机/白板…)做事,而非沿用移动的最后方向
    const dir = this._faceDir || this._lastDir;
    this._lastDir = dir;
    const idle = this.w.anims?.idleFrame?.(dir);
    if (idle != null) spr.setFrame(idle);
    this.scene.time.delayedCall(this._dwellMs, () => {
      if (!spr.scene) { this.state = 'sitting'; return; }
      this.state = 'walking';
      this._tweenPath(this._pathBack, () => this._sitDown());
    });
  }

  // 坐回工位：停 + 坐姿帧 + 精确落座 + 开回不动的实体(挡住玩家)
  _sitDown() {
    const spr = this.w.spr;
    if (!spr || !spr.scene) { this.state = 'sitting'; return; }
    spr.stop();
    // 兼容 worker(seat/chair.dir) 和 npc(_seat/facing) 两种结构
    const seat = this.w.seat || this.w._seat;
    const sitDir = this.w.chair ? this.w.chair.dir : (this.w.facing || 'down');
    const sit = this.w.anims?.sitFrame?.(sitDir);
    if (sit != null) spr.setFrame(sit);
    if (seat) { spr.setPosition(seat.x, seat.y); spr.setDepth(seat.depth); }
    this.state = 'sitting';
  }

  // update：补间自带推进,这里只需保证走动时深度随 y(已在 onUpdate 处理),留空即可。
  update() {}

  // 玩家来交互:如果 NPC 正在走动,停下来面对玩家(暂停移动 tween,不改变状态机)。
  // 交互结束后调 resumeAfterInteract() 让它继续原来的事(走到目的地/回工位)。
  pauseForInteract(faceDir) {
    if (this._interactPaused) return;
    this._interactPaused = true;
    const spr = this.w.spr;
    if (this._tween && this._tween.isPlaying && this._tween.isPlaying()) {
      this._tween.pause();
    }
    if (spr) {
      spr.stop && spr.stop(); // 停走路动画
      // 面向玩家(可选):给个 idle 帧,像"停下听你说话"
      const dir = faceDir || this._lastDir || 'down';
      const idle = this.w.anims?.idleFrame?.(dir);
      if (idle != null) spr.setFrame(idle);
    }
  }

  // 交互结束:恢复移动,NPC 继续做他原来的事。
  resumeAfterInteract() {
    if (!this._interactPaused) return;
    this._interactPaused = false;
    if (this._tween && this._tween.isPaused && this._tween.isPaused()) {
      const spr = this.w.spr;
      // 恢复走路动画 + 继续 tween(从暂停处接着走到原目的地)
      if (spr && this.state === 'walking') {
        const anim = `${this.walkPrefix}_${this._lastDir || 'down'}`;
        if (this.scene.anims.exists(anim)) spr.play(anim, true);
      }
      this._tween.resume();
    }
  }

  reset() {
    this._interactPaused = false;
    if (this._tween) { this._tween.stop(); this._tween = null; }
    this._sitDown();
  }
}
