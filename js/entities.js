// Kingdoms, villagers, animals, buildings, and their simple AI behaviors.
const KINGDOM_COLORS = [
  '#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#9b5de5',
  '#ffca3a', '#06d6a0', '#ef476f', '#118ab2', '#8338ec',
];

let nextEntityId = 1;

class Kingdom {
  constructor(name, color) {
    this.id = nextEntityId++;
    this.name = name;
    this.color = color;
    this.units = new Set();
    this.buildings = new Set();
    this.atWarWith = new Set();
    this.tech = 0;
  }
  get population() { return this.units.size; }
}

class Building {
  constructor(x, y, kingdom, type = 'house') {
    this.id = nextEntityId++;
    this.x = x; this.y = y;
    this.kingdom = kingdom;
    this.type = type;
    this.hp = 100;
  }
}

class Unit {
  constructor(x, y, kingdom, species = 'human') {
    this.id = nextEntityId++;
    this.x = x; this.y = y;
    this.kingdom = kingdom;
    this.species = species; // human, wolf, dragon...
    this.hp = species === 'wolf' ? 30 : (species === 'dragon' ? 300 : 20);
    this.maxHp = this.hp;
    this.age = 0;
    this.food = 50;
    this.target = null;
    this.action = 'wander';
    this.cooldown = 0;
    this.dead = false;
    this.dir = Math.random() * Math.PI * 2;
  }
}

class EntityManager {
  constructor(world) {
    this.world = world;
    this.kingdoms = [];
    this.units = [];
    this.buildings = [];
    this.colorIdx = 0;
  }

  spawnKingdomAt(x, y, speciesCount = 6) {
    const color = KINGDOM_COLORS[this.colorIdx % KINGDOM_COLORS.length];
    this.colorIdx++;
    const kingdom = new Kingdom('Kingdom ' + this.kingdoms.length, color);
    this.kingdoms.push(kingdom);
    const b = new Building(x, y, kingdom, 'capital');
    kingdom.buildings.add(b);
    this.buildings.push(b);
    for (let i = 0; i < speciesCount; i++) {
      this.spawnUnit(x + (Math.random() * 6 - 3), y + (Math.random() * 6 - 3), kingdom, 'human');
    }
    return kingdom;
  }

  spawnUnit(x, y, kingdom, species = 'human') {
    x = Math.max(0, Math.min(this.world.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(this.world.height - 1, Math.round(y)));
    const u = new Unit(x, y, kingdom, species);
    this.units.push(u);
    if (kingdom) kingdom.units.add(u);
    return u;
  }

  spawnAnimal(x, y, species = 'wolf') {
    return this.spawnUnit(x, y, null, species);
  }

  removeUnit(u) {
    u.dead = true;
    if (u.kingdom) u.kingdom.units.delete(u);
  }

  findNearestEnemy(u, radius = 8) {
    let best = null, bestD = radius * radius;
    for (const o of this.units) {
      if (o.dead || o === u) continue;
      if (u.species === 'human' && o.species === 'human' && u.kingdom === o.kingdom) continue;
      if (u.species !== 'human' && o.species !== 'human') continue; // animals don't fight each other here
      if (u.species === 'human' && o.species === 'human' && !u.kingdom.atWarWith.has(o.kingdom)) continue;
      const dx = o.x - u.x, dy = o.y - u.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  tick(speedMul) {
    const w = this.world;
    for (const u of this.units) {
      if (u.dead) continue;
      u.age += speedMul;
      u.cooldown -= speedMul;

      // starvation tick
      u.food -= 0.02 * speedMul;
      if (u.food <= 0) {
        u.hp -= 0.3 * speedMul;
      }
      if (u.hp <= 0) { this.removeUnit(u); continue; }

      // wolves hunt humans, humans fight at war kingdoms, otherwise wander/forage
      const enemy = this.findNearestEnemy(u, u.species === 'wolf' ? 6 : 5);
      if (enemy && (u.species === 'wolf' || (u.kingdom && enemy.kingdom && u.kingdom.atWarWith.has(enemy.kingdom)))) {
        const dx = enemy.x - u.x, dy = enemy.y - u.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.2) {
          if (u.cooldown <= 0) {
            enemy.hp -= (u.species === 'wolf' ? 8 : 5);
            u.cooldown = 10;
            if (enemy.hp <= 0) this.removeUnit(enemy);
          }
        } else {
          u.x += (dx / d) * 0.15 * speedMul;
          u.y += (dy / d) * 0.15 * speedMul;
        }
        continue;
      }

      // foraging for food (humans eat grass/forest resources)
      if (u.species === 'human' && u.food < 70) {
        const i = w.idx(Math.round(u.x), Math.round(u.y));
        if (w.inBounds(Math.round(u.x), Math.round(u.y)) && w.resource[i] > 1) {
          w.resource[i] -= 1 * speedMul;
          u.food = Math.min(100, u.food + 2 * speedMul);
          continue;
        }
      }

      // wandering movement
      if (Math.random() < 0.05) u.dir += (Math.random() - 0.5) * 1.2;
      const speed = (u.species === 'wolf' ? 0.12 : 0.07) * speedMul;
      const nx = u.x + Math.cos(u.dir) * speed;
      const ny = u.y + Math.sin(u.dir) * speed;
      if (w.isWalkable(Math.round(nx), Math.round(ny))) {
        u.x = nx; u.y = ny;
      } else {
        u.dir += Math.PI / 2 + Math.random();
      }

      // fire damage
      const ti = w.idx(Math.round(u.x), Math.round(u.y));
      if (w.inBounds(Math.round(u.x), Math.round(u.y)) && w.fire[ti] > 0) {
        u.hp -= 2 * speedMul;
        if (u.hp <= 0) { this.removeUnit(u); continue; }
      }

      // reproduction near capital
      if (u.species === 'human' && u.kingdom && u.food > 80 && Math.random() < 0.0015 * speedMul && u.kingdom.units.size < 200) {
        u.food -= 30;
        this.spawnUnit(u.x + (Math.random() - 0.5) * 2, u.y + (Math.random() - 0.5) * 2, u.kingdom, 'human');
      }
    }

    // cleanup dead units periodically
    if (Math.random() < 0.05) {
      this.units = this.units.filter(u => !u.dead);
    }

    // random war declarations between neighboring kingdoms
    if (Math.random() < 0.002 * speedMul && this.kingdoms.length > 1) {
      const a = this.kingdoms[Math.floor(Math.random() * this.kingdoms.length)];
      const b = this.kingdoms[Math.floor(Math.random() * this.kingdoms.length)];
      if (a !== b && !a.atWarWith.has(b)) {
        a.atWarWith.add(b);
        b.atWarWith.add(a);
      }
    }
  }
}
