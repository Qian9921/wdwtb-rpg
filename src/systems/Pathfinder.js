// Pathfinder：网格 A* 寻路，让 NPC 真正绕开墙/家具走到目的地，而不是直线怼墙。
// 用法：new Pathfinder(walk, cols, rows, cell)，walk[cy][cx]=true 表示可走。
// find(sx,sy,gx,gy) 返回世界坐标的路点数组(已做视线简化)，无路返回 null。
export class Pathfinder {
  constructor(walk, cols, rows, cell) {
    this.walk = walk; this.cols = cols; this.rows = rows; this.cell = cell;
  }

  _inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  _walkable(cx, cy) { return this._inBounds(cx, cy) && this.walk[cy][cx]; }

  // 把世界坐标吸附到最近可走格的中心(世界坐标)。找不到返回 null。
  snapToWalkable(x, y) {
    const cx = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cell)));
    const cy = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cell)));
    const c = this._nearestWalkable(cx, cy);
    if (!c) return null;
    return { x: c.cx * this.cell + this.cell / 2, y: c.cy * this.cell + this.cell / 2 };
  }

  // 找离 (cx,cy) 最近的可走格（起点/终点可能压在家具上）
  _nearestWalkable(cx, cy) {
    if (this._walkable(cx, cy)) return { cx, cy };
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 只查外圈
        if (this._walkable(cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy };
      }
    }
    return null;
  }

  find(sx, sy, gx, gy) {
    const cell = this.cell;
    const toCell = (x, y) => ({
      cx: Math.max(0, Math.min(this.cols - 1, Math.floor(x / cell))),
      cy: Math.max(0, Math.min(this.rows - 1, Math.floor(y / cell))),
    });
    let s = toCell(sx, sy), g = toCell(gx, gy);
    s = this._nearestWalkable(s.cx, s.cy);
    g = this._nearestWalkable(g.cx, g.cy);
    if (!s || !g) return null;
    if (s.cx === g.cx && s.cy === g.cy) return [{ x: gx, y: gy }];

    const key = (cx, cy) => cy * this.cols + cx;
    const open = new Map(); // key -> node
    const closed = new Set();
    const h = (cx, cy) => Math.abs(cx - g.cx) + Math.abs(cy - g.cy);
    const start = { cx: s.cx, cy: s.cy, g: 0, f: h(s.cx, s.cy), parent: null };
    open.set(key(s.cx, s.cy), start);
    // 只用上下左右四向（不走对角线）——对角线会在桌角/墙角穿模。
    // 四向路径虽然绕一点，但 NPC 走的每一步都在可走格正中央，绝不踩家具。
    // 另外：路点用格子正中央往走廊内侧偏移 4px，让 NPC 走在路中间、远离桌边。
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    let guard = 0;
    while (open.size && guard++ < 20000) {
      // 取 f 最小
      let cur = null;
      for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
      if (cur.cx === g.cx && cur.cy === g.cy) return this._reconstruct(cur, gx, gy);
      open.delete(key(cur.cx, cur.cy));
      closed.add(key(cur.cx, cur.cy));
      for (const [dx, dy] of dirs) {
        const nx = cur.cx + dx, ny = cur.cy + dy;
        if (!this._walkable(nx, ny) || closed.has(key(nx, ny))) continue;
        if (dx !== 0 && dy !== 0) { // 不切墙角
          if (!this._walkable(cur.cx + dx, cur.cy) || !this._walkable(cur.cx, cur.cy + dy)) continue;
        }
        const step = (dx !== 0 && dy !== 0) ? 1.414 : 1;
        const ng = cur.g + step;
        const k = key(nx, ny);
        const ex = open.get(k);
        if (!ex || ng < ex.g) {
          const node = { cx: nx, cy: ny, g: ng, f: ng + h(nx, ny), parent: cur };
          open.set(k, node);
        }
      }
    }
    return null;
  }

  _reconstruct(node, gx, gy) {
    const cell = this.cell;
    const cells = [];
    let n = node;
    while (n) { cells.unshift({ cx: n.cx, cy: n.cy }); n = n.parent; }
    // 逐格路点(不做视线简化)：每段都是相邻可走格,短且清爽,物理移动不会切到桌角卡住。
    // 只去掉"三点共线"的中间点,减少无谓停顿。
    const pts = [];
    for (let i = 0; i < cells.length; i++) {
      const prev = cells[i - 1], cur = cells[i], nxt = cells[i + 1];
      if (prev && nxt) {
        const collinear = (cur.cx - prev.cx) === (nxt.cx - cur.cx) && (cur.cy - prev.cy) === (nxt.cy - cur.cy);
        if (collinear) continue; // 同方向直线上的中间点略过
      }
      pts.push({ x: cur.cx * cell + cell / 2, y: cur.cy * cell + cell / 2 });
    }
    // 终点：只有目标点本身可走时才用真实坐标；否则保持最后那个"可走格中心",
    // 避免把 NPC 送进墙里/甩出地图(厕所被抛出图外就是这个原因)。
    const gcx = Math.floor(gx / cell), gcy = Math.floor(gy / cell);
    if (pts.length && this._walkable(gcx, gcy)) pts[pts.length - 1] = { x: gx, y: gy };
    if (!pts.length) {
      const last = cells[cells.length - 1];
      return [{ x: last.cx * cell + cell / 2, y: last.cy * cell + cell / 2 }];
    }
    return pts;
  }
}
