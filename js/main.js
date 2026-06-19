// Game bootstrap: input, UI wiring, and the main loop.
const WORLD_W = 160, WORLD_H = 120;

class Game {
  constructor() {
    this.world = new World(WORLD_W, WORLD_H, Date.now() % 100000);
    this.entities = new EntityManager(this.world);
    this.canvas = document.getElementById('world-canvas');
    this.fxCanvas = document.getElementById('fx-canvas');
    this.renderer = new Renderer(this.world, this.canvas, this.fxCanvas);
    this.fx = [];
    this.selectedPower = 'fire';
    this.brushSize = 3;
    this.paused = false;
    this.speed = 1;
    this.dayTimer = 0;
    this.lastTime = performance.now();

    this.seedKingdoms(3);
    this.bindUI();
    this.bindInput();
    requestAnimationFrame(this.loop.bind(this));
  }

  seedKingdoms(n) {
    let placed = 0, attempts = 0;
    while (placed < n && attempts < 500) {
      attempts++;
      const x = Math.floor(Math.random() * this.world.width);
      const y = Math.floor(Math.random() * this.world.height);
      if (this.world.isWalkable(x, y)) {
        this.entities.spawnKingdomAt(x, y);
        placed++;
      }
    }
  }

  bindUI() {
    const bar = document.getElementById('power-bar');
    for (const p of POWERS) {
      const btn = document.createElement('div');
      btn.className = 'power-btn' + (p.id === this.selectedPower ? ' selected' : '');
      btn.innerHTML = `${p.icon}<span class="label">${p.label}</span>`;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.power-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedPower = p.id;
      });
      bar.appendChild(btn);
    }

    document.getElementById('brush-size').addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value, 10);
      document.getElementById('brush-size-label').textContent = this.brushSize;
    });

    document.getElementById('btn-pause').addEventListener('click', (e) => {
      this.paused = !this.paused;
      e.target.textContent = this.paused ? '▶' : '⏸';
    });
    const speedBtns = { 1: 'btn-speed1', 2: 'btn-speed2', 4: 'btn-speed4' };
    for (const [mul, id] of Object.entries(speedBtns)) {
      document.getElementById(id).addEventListener('click', () => {
        this.speed = parseInt(mul, 10);
        Object.values(speedBtns).forEach(bid => document.getElementById(bid).classList.remove('active'));
        document.getElementById(id).classList.add('active');
      });
    }

    document.getElementById('btn-save').addEventListener('click', () => this.save());
    document.getElementById('btn-load').addEventListener('click', () => this.load());
    document.getElementById('btn-new').addEventListener('click', () => {
      if (confirm('Start a new world? Current progress will be lost unless saved.')) {
        location.reload();
      }
    });
  }

  bindInput() {
    const canvas = this.fxCanvas;
    let dragging = false, dragStart = null, camStart = null;
    let mouseDown = false;
    let lastApply = 0;

    canvas.style.pointerEvents = 'auto';

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.shiftKey) {
        dragging = true;
        dragStart = [e.clientX, e.clientY];
        camStart = [this.renderer.camX, this.renderer.camY];
      } else {
        mouseDown = true;
        this.applyAtScreen(e.clientX, e.clientY);
      }
    });
    window.addEventListener('mouseup', () => { dragging = false; mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousemove', (e) => {
      if (dragging) {
        const ts = this.renderer.tileSize * this.renderer.zoom;
        this.renderer.camX = camStart[0] - (e.clientX - dragStart[0]) / ts;
        this.renderer.camY = camStart[1] - (e.clientY - dragStart[1]) / ts;
      } else if (mouseDown) {
        const now = performance.now();
        if (now - lastApply > 80) {
          this.applyAtScreen(e.clientX, e.clientY);
          lastApply = now;
        }
      }
      this.updateTooltip(e.clientX, e.clientY);
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.renderer.zoom = Math.max(0.3, Math.min(4, this.renderer.zoom * factor));
    }, { passive: false });

    window.addEventListener('resize', () => this.renderer.resize());
  }

  applyAtScreen(sx, sy) {
    const [wx, wy] = this.renderer.screenToWorld(sx, sy);
    if (!this.world.inBounds(Math.round(wx), Math.round(wy))) return;
    const result = applyPower(this, this.selectedPower, wx, wy, this.brushSize);
    if (this.selectedPower === 'inspect' && result) {
      this.showInspect(result, sx, sy);
    }
  }

  showInspect(unit, sx, sy) {
    const tip = document.getElementById('tooltip');
    tip.style.display = 'block';
    tip.style.left = sx + 12 + 'px';
    tip.style.top = sy + 12 + 'px';
    tip.textContent = `${unit.species} | HP ${Math.round(unit.hp)}/${unit.maxHp} | Kingdom: ${unit.kingdom ? unit.kingdom.name : 'wild'}`;
    setTimeout(() => { tip.style.display = 'none'; }, 2000);
  }

  updateTooltip(sx, sy) {
    if (this.selectedPower !== 'inspect') {
      document.getElementById('tooltip').style.display = 'none';
    }
  }

  updateStats() {
    let pop = 0;
    for (const k of this.entities.kingdoms) pop += k.population;
    document.getElementById('stat-pop').textContent = `Pop: ${pop}`;
    document.getElementById('stat-kingdoms').textContent = `Kingdoms: ${this.entities.kingdoms.filter(k => k.population > 0).length}`;
    document.getElementById('stat-day').textContent = `Day: ${Math.floor(this.world.day)}`;
  }

  save() {
    const data = {
      seed: this.world.seed,
      tiles: Array.from(this.world.tiles),
      elevation: Array.from(this.world.elevation),
      day: this.world.day,
      kingdoms: this.entities.kingdoms.map(k => ({ name: k.name, color: k.color })),
      units: this.entities.units.filter(u => !u.dead).map(u => ({
        x: u.x, y: u.y, species: u.species, hp: u.hp, food: u.food,
        kingdomIdx: u.kingdom ? this.entities.kingdoms.indexOf(u.kingdom) : -1,
      })),
      buildings: this.entities.buildings.map(b => ({
        x: b.x, y: b.y, type: b.type,
        kingdomIdx: b.kingdom ? this.entities.kingdoms.indexOf(b.kingdom) : -1,
      })),
    };
    localStorage.setItem('worldbox_save', JSON.stringify(data));
    alert('World saved!');
  }

  load() {
    const raw = localStorage.getItem('worldbox_save');
    if (!raw) { alert('No save found.'); return; }
    const data = JSON.parse(raw);
    this.world.tiles = Uint8Array.from(data.tiles);
    this.world.elevation = Float32Array.from(data.elevation);
    this.world.day = data.day;
    this.entities.kingdoms = data.kingdoms.map(k => new Kingdom(k.name, k.color));
    this.entities.units = [];
    this.entities.buildings = [];
    for (const u of data.units) {
      const k = u.kingdomIdx >= 0 ? this.entities.kingdoms[u.kingdomIdx] : null;
      const unit = this.entities.spawnUnit(u.x, u.y, k, u.species);
      unit.hp = u.hp; unit.food = u.food;
    }
    for (const b of data.buildings) {
      const k = b.kingdomIdx >= 0 ? this.entities.kingdoms[b.kingdomIdx] : null;
      const building = new Building(b.x, b.y, k, b.type);
      this.entities.buildings.push(building);
      if (k) k.buildings.add(building);
    }
    alert('World loaded!');
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.paused) {
      const steps = this.speed;
      for (let s = 0; s < steps; s++) {
        this.world.tick();
        this.entities.tick(1);
      }
      this.dayTimer += dt * this.speed;
      if (this.dayTimer > 2) { this.dayTimer = 0; this.world.day++; }
    }

    this.fx = this.fx.filter(f => --f.t > 0);
    this.renderer.draw(this.entities, this.fx);
    this.updateStats();

    requestAnimationFrame(this.loop.bind(this));
  }
}

window.addEventListener('load', () => {
  window.game = new Game();
});
