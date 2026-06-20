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
    this.activeChatUnit = null;
    this.seenAnnouncements = 0;
    this.entities.onEvent = (text) => this.logEvent(text);

    this.seedKingdoms(3);
    this.bindUI();
    this.bindInput();
    this.bindChat();
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
    for (const group of POWER_GROUPS) {
      const groupEl = document.createElement('div');
      groupEl.className = 'power-group';
      const label = document.createElement('div');
      label.className = 'group-label';
      label.textContent = group.label;
      const buttons = document.createElement('div');
      buttons.className = 'group-buttons';
      for (const p of group.powers) {
        const btn = document.createElement('div');
        btn.className = 'power-btn' + (p.id === this.selectedPower ? ' selected' : '');
        btn.innerHTML = `${p.icon}<span class="label">${p.label}</span>`;
        btn.addEventListener('click', () => {
          document.querySelectorAll('.power-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.selectedPower = p.id;
        });
        buttons.appendChild(btn);
      }
      groupEl.appendChild(label);
      groupEl.appendChild(buttons);
      bar.appendChild(groupEl);
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
    let downPos = null;
    let movedSinceDown = false;

    // Powers that "paint" should keep applying while you drag. Powers that
    // target a single entity (chat, inspect, mounts, kill, building
    // placement...) should only fire once per click - continuously
    // re-targeting during a drag is what made clicking feel unreliable.
    const CONTINUOUS_POWERS = new Set([
      'raise', 'lower', 'water', 'fire', 'grow', 'rain', 'earthquake', 'spawnWolf',
    ]);

    canvas.style.pointerEvents = 'auto';

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.shiftKey) {
        dragging = true;
        dragStart = [e.clientX, e.clientY];
        camStart = [this.renderer.camX, this.renderer.camY];
      } else {
        mouseDown = true;
        downPos = [e.clientX, e.clientY];
        movedSinceDown = false;
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
        if (downPos && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 4) {
          movedSinceDown = true;
        }
        if (CONTINUOUS_POWERS.has(this.selectedPower) || !movedSinceDown) {
          const now = performance.now();
          if (now - lastApply > 80) {
            this.applyAtScreen(e.clientX, e.clientY);
            lastApply = now;
          }
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

  bindChat() {
    document.getElementById('chat-close').addEventListener('click', () => this.closeChat());
    const send = () => {
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text || !this.activeChatUnit) return;
      input.value = '';
      this.sendChat(text);
    };
    document.getElementById('chat-send').addEventListener('click', send);
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  }

  openChat(unit) {
    this.activeChatUnit = unit;
    const panel = document.getElementById('chat-panel');
    panel.classList.add('open');
    document.getElementById('chat-title').textContent =
      `${unit.name} (${unit.isRoyal ? unit.role : (unit.role || unit.species)})`;
    const sub = document.getElementById('chat-subtitle');
    if (sub) sub.textContent = unit.backstory || '';
    this.renderChatLog();
  }

  closeChat() {
    this.activeChatUnit = null;
    document.getElementById('chat-panel').classList.remove('open');
  }

  renderChatLog() {
    const log = document.getElementById('chat-log');
    log.innerHTML = '';
    const unit = this.activeChatUnit;
    if (!unit) return;
    for (const m of unit.memory) {
      const div = document.createElement('div');
      div.className = 'chat-msg ' + (m.who === 'user' ? 'user' : 'npc');
      div.textContent = m.text;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
  }

  async sendChat(text) {
    const unit = this.activeChatUnit;
    if (!unit || unit.dead) { this.closeChat(); return; }
    this.renderChatLog();
    const div = document.createElement('div');
    div.className = 'chat-msg user';
    div.textContent = text;
    document.getElementById('chat-log').appendChild(div);
    await getNpcReply(unit, unit.kingdom, text);
    this.renderChatLog();
  }

  applyAtScreen(sx, sy) {
    const [wx, wy] = this.renderer.screenToWorld(sx, sy);
    if (!this.world.inBounds(Math.round(wx), Math.round(wy))) return;
    const result = applyPower(this, this.selectedPower, wx, wy, this.brushSize);
    if (result && result.kind === 'inspect') {
      this.showInspect(result.unit, sx, sy);
    } else if (result && result.kind === 'chat') {
      this.openChat(result.unit);
    }
  }

  logEvent(text) {
    const list = document.getElementById('event-ticker');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'ticker-msg';
    div.textContent = text;
    list.prepend(div);
    setTimeout(() => div.remove(), 8000);
    while (list.children.length > 6) list.removeChild(list.lastChild);
  }

  showInspect(unit, sx, sy) {
    const tip = document.getElementById('tooltip');
    tip.style.display = 'block';
    tip.style.left = sx + 12 + 'px';
    tip.style.top = sy + 12 + 'px';
    tip.textContent = `${unit.name} | ${unit.species}${unit.role ? ' (' + unit.role + ')' : ''} | HP ${Math.round(unit.hp)}/${unit.maxHp} | ${unit.kingdom ? unit.kingdom.name : 'wild'}`;
    setTimeout(() => { tip.style.display = 'none'; }, 2500);
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

    const panel = document.getElementById('kingdom-panel');
    panel.innerHTML = '';
    for (const k of this.entities.kingdoms) {
      if (k.population === 0) continue;
      const era = ERAS[k.era];
      const card = document.createElement('div');
      card.className = 'kingdom-card';
      card.style.borderLeftColor = k.color;
      card.innerHTML = `
        <div class="kc-title"><span>${k.name}</span><span>${era.icon} ${era.name}</span></div>
        <div class="kc-row">Pop ${k.population} | Food ${Math.round(k.foodStock || 0)}</div>
        <div class="kc-row">${k.royalTitle}: ${k.royal && !k.royal.dead ? k.royal.name : '—'}</div>
      `;
      panel.appendChild(card);
    }

    const list = document.getElementById('announcements');
    for (const k of this.entities.kingdoms) {
      if (!k.announcements) continue;
      while (k.announcements.length) {
        const text = k.announcements.shift();
        const div = document.createElement('div');
        div.className = 'announcement';
        div.textContent = text;
        list.appendChild(div);
        setTimeout(() => div.remove(), 6000);
      }
    }
  }

  save() {
    const data = {
      seed: this.world.seed,
      tiles: Array.from(this.world.tiles),
      elevation: Array.from(this.world.elevation),
      day: this.world.day,
      kingdoms: this.entities.kingdoms.map(k => ({ name: k.name, color: k.color, era: k.era, tech: k.tech, foodStock: k.foodStock })),
      units: this.entities.units.filter(u => !u.dead).map(u => ({
        x: u.x, y: u.y, species: u.species, hp: u.hp, food: u.food, name: u.name, role: u.role,
        isRoyal: u.isRoyal, mount: u.mount, pet: u.pet, memory: u.memory,
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
    this.entities.kingdoms = data.kingdoms.map(k => {
      const kd = new Kingdom(k.name, k.color);
      kd.era = k.era; kd.tech = k.tech; kd.foodStock = k.foodStock;
      return kd;
    });
    this.entities.units = [];
    this.entities.buildings = [];
    for (const u of data.units) {
      const k = u.kingdomIdx >= 0 ? this.entities.kingdoms[u.kingdomIdx] : null;
      const unit = this.entities.spawnUnit(u.x, u.y, k, u.species);
      unit.hp = u.hp; unit.food = u.food; unit.name = u.name; unit.role = u.role;
      unit.isRoyal = u.isRoyal; unit.mount = u.mount; unit.pet = u.pet; unit.memory = u.memory || [];
      if (unit.isRoyal && k) k.royal = unit;
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

    if (this.activeChatUnit && this.activeChatUnit.dead) this.closeChat();

    requestAnimationFrame(this.loop.bind(this));
  }
}

window.addEventListener('load', () => {
  window.game = new Game();
});
