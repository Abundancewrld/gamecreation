// Canvas rendering: world tiles, entities, and FX overlays.
class Renderer {
  constructor(world, canvas, fxCanvas) {
    this.world = world;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d');
    this.tileSize = 8;
    this.camX = world.width / 2;
    this.camY = world.height / 2;
    this.zoom = 1;
    this.resize();
  }

  resize() {
    const dpr = 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.fxCanvas.width = window.innerWidth * dpr;
    this.fxCanvas.height = window.innerHeight * dpr;
  }

  screenToWorld(sx, sy) {
    const ts = this.tileSize * this.zoom;
    const wx = this.camX + (sx - this.canvas.width / 2) / ts;
    const wy = this.camY + (sy - this.canvas.height / 2) / ts;
    return [wx, wy];
  }

  worldToScreen(wx, wy) {
    const ts = this.tileSize * this.zoom;
    const sx = this.canvas.width / 2 + (wx - this.camX) * ts;
    const sy = this.canvas.height / 2 + (wy - this.camY) * ts;
    return [sx, sy];
  }

  draw(entities, fx) {
    const ctx = this.ctx;
    const w = this.world;
    const ts = this.tileSize * this.zoom;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const [wx0, wy0] = this.screenToWorld(0, 0);
    const [wx1, wy1] = this.screenToWorld(this.canvas.width, this.canvas.height);
    const x0 = Math.max(0, Math.floor(wx0)), x1 = Math.min(w.width - 1, Math.ceil(wx1));
    const y0 = Math.max(0, Math.floor(wy0)), y1 = Math.min(w.height - 1, Math.ceil(wy1));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, y);
        const [sx, sy] = this.worldToScreen(x, y);
        let color = TILE_COLOR[w.tiles[i]];
        if (w.scorched[i] > 0) color = '#3a2a20';
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, ts + 1, ts + 1);

        if (w.fire[i] > 0) {
          ctx.fillStyle = `rgba(255,${100 + Math.floor(Math.random()*80)},0,0.65)`;
          ctx.fillRect(sx, sy, ts + 1, ts + 1);
        }
        if (w.water[i] > 0) {
          ctx.fillStyle = `rgba(40,90,180,${Math.min(0.85, 0.3 + w.water[i] / 15)})`;
          ctx.fillRect(sx, sy, ts + 1, ts + 1);
        }
      }
    }

    // buildings
    for (const b of entities.buildings) {
      if (b.x < x0 - 2 || b.x > x1 + 2 || b.y < y0 - 2 || b.y > y1 + 2) continue;
      const [sx, sy] = this.worldToScreen(b.x, b.y);
      ctx.fillStyle = b.kingdom ? b.kingdom.color : '#888';
      ctx.fillRect(sx - ts * 0.3, sy - ts * 0.3, ts * 0.6, ts * 0.6);
      ctx.strokeStyle = '#222';
      ctx.strokeRect(sx - ts * 0.3, sy - ts * 0.3, ts * 0.6, ts * 0.6);
    }

    // units
    for (const u of entities.units) {
      if (u.dead) continue;
      if (u.x < x0 - 2 || u.x > x1 + 2 || u.y < y0 - 2 || u.y > y1 + 2) continue;
      const [sx, sy] = this.worldToScreen(u.x, u.y);
      let color = '#ddd';
      let size = ts * 0.25;
      if (u.species === 'human') color = u.kingdom ? u.kingdom.color : '#fff';
      else if (u.species === 'wolf') { color = '#555'; size = ts * 0.22; }
      else if (u.species === 'dragon') { color = '#a32cc4'; size = ts * 0.5; }
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(sx, sy, Math.max(1.5, size), 0, Math.PI * 2);
      ctx.fill();
      if (u.hp < u.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx - 6, sy - size - 7, 12, 3);
        ctx.fillStyle = '#3ddc3d';
        ctx.fillRect(sx - 6, sy - size - 7, 12 * Math.max(0, u.hp / u.maxHp), 3);
      }
    }

    // fx layer
    this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
    const fctx = this.fxCtx;
    for (const f of fx) {
      const [sx, sy] = this.worldToScreen(f.x, f.y);
      if (f.type === 'lightning') {
        fctx.strokeStyle = '#fff89a';
        fctx.lineWidth = 3;
        fctx.beginPath();
        fctx.moveTo(sx, 0);
        fctx.lineTo(sx, sy);
        fctx.stroke();
      } else if (f.type === 'meteor') {
        fctx.fillStyle = `rgba(255,120,30,${f.t / 20})`;
        fctx.beginPath();
        fctx.arc(sx, sy, 40 * (1 - f.t / 20), 0, Math.PI * 2);
        fctx.fill();
      } else if (f.type === 'tornado') {
        fctx.strokeStyle = `rgba(200,200,255,${f.t / 30})`;
        fctx.lineWidth = 4;
        fctx.beginPath();
        fctx.arc(sx, sy, 30 - f.t, 0, Math.PI * 2);
        fctx.stroke();
      }
    }
  }
}
