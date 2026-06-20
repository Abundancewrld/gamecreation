// Canvas rendering: world tiles, entities, and FX overlays.
function shade(hex, amt) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

class Renderer {
  constructor(world, canvas, fxCanvas) {
    this.world = world;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d');
    this.tileSize = 10;
    this.camX = world.width / 2;
    this.camY = world.height / 2;
    this.zoom = 1.6;
    this.tileJitter = new ValueNoise(world.seed + 555);
    this.frame = 0;
    this.sprites = {};
    this.loadSprite('house', 'assets/buildings/house.png');
    this.resize();
  }

  loadSprite(name, src) {
    const img = new Image();
    img.src = src;
    this.sprites[name] = img;
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.fxCanvas.width = window.innerWidth;
    this.fxCanvas.height = window.innerHeight;
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

  tileBaseColor(i, x, y) {
    const e = this.world.elevation[i];
    const base = TILE_COLOR[this.world.tiles[i]];
    const jitter = (this.tileJitter.noise2D(x, y, 2, 0.5, 0.15) - 0.5) * 26;
    const elevShade = (e - 0.3) * 40;
    return shade(base, jitter + elevShade);
  }

  draw(entities, fx) {
    this.frame++;
    const ctx = this.ctx;
    const w = this.world;
    const ts = this.tileSize * this.zoom;

    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const [wx0, wy0] = this.screenToWorld(0, 0);
    const [wx1, wy1] = this.screenToWorld(this.canvas.width, this.canvas.height);
    const x0 = Math.max(0, Math.floor(wx0)), x1 = Math.min(w.width - 1, Math.ceil(wx1));
    const y0 = Math.max(0, Math.floor(wy0)), y1 = Math.min(w.height - 1, Math.ceil(wy1));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, y);
        const [sx, sy] = this.worldToScreen(x, y);
        const tile = w.tiles[i];
        let color = this.tileBaseColor(i, x, y);
        if (w.scorched[i] > 0) color = shade('#3a2a20', (Math.random() - 0.5) * 10);
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, ts + 1, ts + 1);

        // water shimmer animation
        if (tile === TILE.WATER || tile === TILE.DEEP_WATER) {
          const sh = Math.sin(this.frame * 0.05 + x * 0.6 + y * 0.4) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(255,255,255,${sh * 0.08})`;
          ctx.fillRect(sx, sy, ts + 1, ts + 1);
        }
        // forest canopy texture - only a sparse subset of tiles get a tree blob,
        // and position/size jitter so it doesn't read as a uniform dot grid.
        if (tile === TILE.FOREST && ts > 9) {
          const j2 = this.tileJitter.noise2D(x * 3.1, y * 3.1, 1, 0.5, 0.6);
          if (j2 > 0.45) {
            const ox = (this.tileJitter.noise2D(x * 7, y * 5, 1, 0.5, 1) - 0.5) * ts * 0.5;
            const oy = (this.tileJitter.noise2D(x * 5, y * 7, 1, 0.5, 1) - 0.5) * ts * 0.5;
            ctx.fillStyle = shade(TILE_COLOR[TILE.FOREST], -28);
            ctx.beginPath();
            ctx.arc(sx + ts * 0.5 + ox, sy + ts * 0.5 + oy, ts * (0.22 + j2 * 0.15), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // mountain snow caps
        if (tile === TILE.MOUNTAIN && ts > 4) {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.moveTo(sx + ts * 0.5, sy + ts * 0.05);
          ctx.lineTo(sx + ts * 0.75, sy + ts * 0.4);
          ctx.lineTo(sx + ts * 0.25, sy + ts * 0.4);
          ctx.fill();
        }

        if (w.fire[i] > 0) {
          const flick = Math.sin(this.frame * 0.3 + x + y) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(255,${100 + Math.floor(flick * 100)},0,0.6)`;
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
      const size = ts * (b.type === 'capital' ? 0.95 : 0.7);
      const tint = b.kingdom ? eraTint(b.kingdom.era) : '#777';
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + size * 0.3, size * 0.55, size * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      const sprite = (b.type === 'house' || b.type === 'capital') ? this.sprites.house : null;
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const dw = size * (b.type === 'capital' ? 2.4 : 1.9);
        const dh = dw * (sprite.naturalHeight / sprite.naturalWidth);
        ctx.drawImage(sprite, sx - dw / 2, sy - dh * 0.78, dw, dh);
        if (b.kingdom) {
          ctx.fillStyle = b.kingdom.color;
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = Math.max(1, size * 0.05);
          ctx.beginPath();
          ctx.moveTo(sx - size * 0.04, sy - size * 0.55);
          ctx.lineTo(sx - size * 0.04, sy - size * 0.95);
          ctx.lineTo(sx + size * 0.3, sy - size * 0.78);
          ctx.lineTo(sx - size * 0.04, sy - size * 0.62);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else {
        // walls
        ctx.fillStyle = b.kingdom ? b.kingdom.color : '#888';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = Math.max(1, size * 0.06);
        ctx.fillRect(sx - size * 0.4, sy - size * 0.1, size * 0.8, size * 0.5);
        ctx.strokeRect(sx - size * 0.4, sy - size * 0.1, size * 0.8, size * 0.5);
        // roof
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.moveTo(sx - size * 0.5, sy - size * 0.1);
        ctx.lineTo(sx, sy - size * 0.55);
        ctx.lineTo(sx + size * 0.5, sy - size * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      if (ts > 10) {
        ctx.font = `${Math.max(8, size * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText((BUILDING_TYPES[b.type] || {}).icon || '', sx, sy + size * 0.3);
      }
    }

    // units
    for (const u of entities.units) {
      if (u.dead) continue;
      if (u.x < x0 - 2 || u.x > x1 + 2 || u.y < y0 - 2 || u.y > y1 + 2) continue;
      const [sx, sy] = this.worldToScreen(u.x, u.y);

      if (u.species === 'airplane') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(u.dir);
        ctx.fillStyle = '#dde6ee';
        ctx.beginPath();
        ctx.moveTo(ts * 0.5, 0); ctx.lineTo(-ts * 0.3, ts * 0.18); ctx.lineTo(-ts * 0.3, -ts * 0.18);
        ctx.fill();
        ctx.restore();
        continue;
      }

      let bodyColor = '#ddd';
      let size = ts * 0.22;
      if (u.species === 'human') bodyColor = u.kingdom ? u.kingdom.color : '#fff';
      else if (u.species === 'wolf') { bodyColor = '#555'; size = ts * 0.2; }
      else if (u.species === 'dragon') { bodyColor = '#a32cc4'; size = ts * 0.45; }

      // mount drawn beneath rider
      if (u.mount) {
        const mc = MOUNT_SPECIES[u.mount].color;
        ctx.fillStyle = mc;
        ctx.beginPath();
        ctx.ellipse(sx, sy + size * 0.3, size * 1.3, size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + size * 0.9, size * 0.9, size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // body, with a dark outline so units read clearly against any terrain
      const r2 = Math.max(2.6, size);
      ctx.beginPath();
      ctx.fillStyle = bodyColor;
      ctx.arc(sx, sy, r2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, r2 * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();

      // role tint ring for humans
      if (u.species === 'human' && u.role && ROLE_COLOR[u.role]) {
        ctx.strokeStyle = ROLE_COLOR[u.role];
        ctx.lineWidth = Math.max(1.2, size * 0.25);
        ctx.beginPath();
        ctx.arc(sx, sy, r2 + ctx.lineWidth * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // crown for royals
      if (u.isRoyal && ts > 5) {
        ctx.font = `${Math.max(8, size * 1.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('👑', sx, sy - size * 1.1);
      }

      // pet icon orbiting nearby
      if (u.pet && ts > 5) {
        ctx.font = `${Math.max(7, size * 1.1)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(PET_SPECIES[u.pet].icon, sx + size * 1.4, sy + size * 0.6);
      }

      if (u.hp < u.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx - 6, sy - size - 7, 12, 3);
        ctx.fillStyle = '#3ddc3d';
        ctx.fillRect(sx - 6, sy - size - 7, 12 * Math.max(0, u.hp / u.maxHp), 3);
      }
    }

    // livestock
    for (const l of entities.livestock || []) {
      if (l.dead) continue;
      if (l.x < x0 - 2 || l.x > x1 + 2 || l.y < y0 - 2 || l.y > y1 + 2) continue;
      const [sx, sy] = this.worldToScreen(l.x, l.y);
      if (ts > 5) {
        ctx.font = `${Math.max(8, ts * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(LIVESTOCK_SPECIES[l.species].icon, sx, sy);
      } else {
        ctx.fillStyle = LIVESTOCK_SPECIES[l.species].color;
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
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
