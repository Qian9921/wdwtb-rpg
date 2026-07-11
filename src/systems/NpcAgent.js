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
  goTrip(pathTo, pathBack, dwellMs = 2500) {
    if (this.busy) return false;
    const spr = this.w.spr;
    if (!spr || !pathTo || !pathTo.length || !pathBack || !pathBack.length) return false;
    this._pathBack = pathBack;
    this._dwellMs = dwellMs;
    this.state = 'walking';
    this._tweenPath(pathTo, () => this._arriveDest());
    return true;
  }

  // 拜访：走到目的地后停住等待（不自动返回），由外部调 returnHome() 再回工位。
  // 用于"NPC 跑到玩家面前送事件"——到了先说话，说完再回去。
  goVisit(pathTo, onArrive) {
    if (this.busy) return false;
    const spr = this.w.spr;
    if (!spr || !pathTo || !pathTo.length) return false;
    this.state = 'walking';
    this._tweenPath(pathTo, () => {
      this.state = 'visiting';
      spr.stop();
      const idle = this.w.anims?.idleFrame?.(this._lastDir);
      if (idle != null) spr.setFrame(idle);
      if (onArrive) onArrive();
    });
    return true;
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
      const wp = waypoints[i++];
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
    const idle = this.w.anims?.idleFrame?.(this._lastDir);
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

  reset() {
    if (this._tween) { this._tween.stop(); this._tween = null; }
    this._sitDown();
  }
}
