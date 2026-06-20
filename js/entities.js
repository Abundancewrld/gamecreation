// Kingdoms, villagers, animals, buildings, and their simple AI behaviors.
const KINGDOM_COLORS = [
  '#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#9b5de5',
  '#ffca3a', '#06d6a0', '#ef476f', '#118ab2', '#8338ec',
];

const ROLES = ['farmer', 'rancher', 'student', 'priest', 'doctor', 'police', 'soldier', 'civilian'];
const ROLE_COLOR = {
  farmer: '#c9a24b', rancher: '#a3713f', student: '#5fa8e0', priest: '#e0d65f',
  doctor: '#e85f5f', police: '#3f6ec1', soldier: '#7a2f2f', civilian: '#cccccc',
  King: '#ffd700', Queen: '#ffd700',
};

let nextEntityId = 1;

// Free-will layer: each villager privately wants something, which colors
// both their autonomous movement and how they talk about themselves.
const DESIRES = [
  'seek_adventure', 'build_a_family', 'join_the_army', 'devote_to_faith',
  'get_rich', 'master_a_craft', 'protect_the_weak', 'see_the_world',
  'live_quietly', 'gain_glory',
];
const DESIRE_FLAVOR = {
  seek_adventure: 'dreams of wandering far beyond these lands',
  build_a_family: 'longs to start a family and watch children grow',
  join_the_army: 'hopes to prove their courage in the barracks',
  devote_to_faith: 'finds meaning in prayer at the church',
  get_rich: 'is always scheming about how to get rich',
  master_a_craft: 'wants to become the finest craftsperson in the realm',
  protect_the_weak: 'feels a duty to protect the weak and the young',
  see_the_world: 'itches to travel and see what lies past the hills',
  live_quietly: 'just wants a quiet, peaceful life',
  gain_glory: 'is hungry for glory and to be remembered',
};
const BACKSTORY_ORIGIN = [
  'Born during a harsh winter,', 'Raised by their grandparents,', 'The youngest of many siblings,',
  'Orphaned young,', 'Born under a strange omen,', 'Once a wandering traveler,',
  'Descended from a long line of healers,', 'Found as a child near the old ruins,',
];
const BACKSTORY_QUIRK = [
  'they hum old folk tunes while they work.', 'they collect odd little stones.',
  'they are terrified of deep water.', 'they always speak their mind.',
  'they have a soft spot for stray animals.', 'they rarely sleep, restless at night.',
  'they tell tall tales to anyone who listens.', 'they keep a tiny garden no matter where they live.',
];
function generateBackstory() {
  return `${pick(BACKSTORY_ORIGIN)} ${pick(BACKSTORY_QUIRK)}`;
}

class Kingdom {
  constructor(name, color) {
    this.id = nextEntityId++;
    this.name = name;
    this.color = color;
    this.units = new Set();
    this.buildings = new Set();
    this.atWarWith = new Set();
    this.tech = 0;
    this.era = 0;
    this.foodStock = 50;
    this.royal = null;
    this.royalTitle = Math.random() < 0.5 ? 'King' : 'Queen';
    this.announcements = [];
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
    this.species = species; // human, wolf, dragon, airplane...
    this.hp = Unit.baseHp(species);
    this.maxHp = this.hp;
    this.age = 0;
    this.food = 50;
    this.target = null;
    this.action = 'wander';
    this.cooldown = 0;
    this.dead = false;
    this.dir = Math.random() * Math.PI * 2;
    this.name = pick(COMMON_NAMES);
    this.role = species === 'human' ? pick(ROLES) : null;
    this.isRoyal = false;
    this.mount = null; // 'horse' | 'dragon' | null
    this.pet = null;   // 'dog' | 'cat' | 'dragon' | null
    this.memory = [];  // chat history: {who:'user'|'npc', text}
    this.personality = {
      friendliness: Math.random(),
      courage: Math.random(),
      wit: Math.random(),
      ambition: Math.random(),
      faith: Math.random(),
      curiosity: Math.random(),
    };
    this.mood = 0; // -1 (miserable) .. 1 (joyful), drifts from lived events
    this.backstory = species === 'human' ? generateBackstory() : null;
    this.desire = species === 'human' ? pick(DESIRES) : null;
    this.desireTimer = 100 + Math.random() * 200;
    this.commandState = null; // e.g. 'flee' | 'go_home' | 'stay' | 'attack'
    this.commandTimer = 0;
  }

  static baseHp(species) {
    if (species === 'wolf') return 30;
    if (species === 'dragon') return 300;
    if (species === 'airplane') return 60;
    return 20;
  }
}

class EntityManager {
  constructor(world) {
    this.world = world;
    this.kingdoms = [];
    this.units = [];
    this.buildings = [];
    this.livestock = [];
    this.colorIdx = 0;
    this.onEvent = null; // set by main.js to surface a live activity ticker
  }

  emit(text) { if (this.onEvent) this.onEvent(text); }

  spawnKingdomAt(x, y, speciesCount = 6) {
    const color = KINGDOM_COLORS[this.colorIdx % KINGDOM_COLORS.length];
    this.colorIdx++;
    const kingdom = new Kingdom('Kingdom ' + this.kingdoms.length, color);
    this.kingdoms.push(kingdom);
    const b = new Building(x, y, kingdom, 'capital');
    kingdom.buildings.add(b);
    this.buildings.push(b);
    const f = new Building(Math.round(x) + 2, Math.round(y) + 1, kingdom, 'farm');
    kingdom.buildings.add(f);
    this.buildings.push(f);
    for (let i = 0; i < speciesCount; i++) {
      this.spawnUnit(x + (Math.random() * 6 - 3), y + (Math.random() * 6 - 3), kingdom, 'human');
    }
    crownRoyal(kingdom, this);
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

    for (const k of this.kingdoms) cityTick(k, w, this, speedMul);

    for (const u of this.units) {
      if (u.dead) continue;
      u.age += speedMul;
      u.cooldown -= speedMul;

      if (u.species === 'airplane') {
        // airplanes just patrol fast in straight-ish lines, ignoring terrain.
        if (Math.random() < 0.03) u.dir += (Math.random() - 0.5) * 1.0;
        u.x += Math.cos(u.dir) * 0.5 * speedMul;
        u.y += Math.sin(u.dir) * 0.5 * speedMul;
        if (u.x < 0 || u.x > w.width) u.dir = Math.PI - u.dir;
        if (u.y < 0 || u.y > w.height) u.dir = -u.dir;
        continue;
      }

      // player commands are requests, not control - they fade and free will resumes
      if (u.commandState) {
        u.commandTimer -= speedMul;
        if (u.commandTimer <= 0) u.commandState = null;
      }
      if (u.commandState === 'stay') continue;
      if (u.commandState === 'go_home' && u.kingdom) {
        const cap = [...u.kingdom.buildings].find(b => b.type === 'capital');
        if (cap) {
          const dx = cap.x - u.x, dy = cap.y - u.y;
          const d = Math.hypot(dx, dy);
          if (d < 1) { u.commandState = null; }
          else { u.x += (dx / d) * 0.1 * speedMul; u.y += (dy / d) * 0.1 * speedMul; continue; }
        }
      }

      // starvation tick
      u.food -= 0.02 * speedMul;
      if (u.food <= 0) u.hp -= 0.3 * speedMul;
      if (u.hp <= 0) { this.removeUnit(u); continue; }

      const speedBase = u.mount ? (MOUNT_SPECIES[u.mount].speedMul) : (u.species === 'wolf' ? 1.7 : 1);
      const flies = u.mount === 'dragon';

      const enemy = this.findNearestEnemy(u, u.species === 'wolf' ? 6 : 5);
      const aggressive = u.commandState === 'attack';
      if (enemy && (u.species === 'wolf' || aggressive || (u.kingdom && enemy.kingdom && u.kingdom.atWarWith.has(enemy.kingdom)))) {
        const dx = enemy.x - u.x, dy = enemy.y - u.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.2) {
          if (u.cooldown <= 0) {
            enemy.hp -= (u.species === 'wolf' ? 8 : (u.mount ? 12 : 5));
            u.cooldown = 10;
            if (enemy.hp <= 0) this.removeUnit(enemy);
          }
        } else {
          u.x += (dx / d) * 0.15 * speedBase * speedMul;
          u.y += (dy / d) * 0.15 * speedBase * speedMul;
        }
        continue;
      }

      if (u.commandState === 'flee') {
        u.x += Math.cos(u.dir) * 0.2 * speedMul;
        u.y += Math.sin(u.dir) * 0.2 * speedMul;
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

      // free will: each villager privately pursues their own desire, which
      // biases where they wander rather than purely random motion.
      if (u.species === 'human') {
        u.desireTimer -= speedMul;
        if (u.desireTimer <= 0) {
          u.desire = pick(DESIRES);
          u.desireTimer = 150 + Math.random() * 250;
        }
        const goalType = { join_the_army: 'barracks', devote_to_faith: 'church', get_rich: 'capital', master_a_craft: 'farm' }[u.desire];
        if (goalType && u.kingdom && Math.random() < 0.02) {
          const goal = [...u.kingdom.buildings].find(b => b.type === goalType);
          if (goal) {
            const dx = goal.x - u.x, dy = goal.y - u.y;
            u.dir = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.6;
            if (Math.hypot(dx, dy) < 2 && u.role !== 'soldier' && u.desire === 'join_the_army') u.role = 'soldier';
          }
        }
        if (u.desire === 'build_a_family' && u.food > 60 && Math.random() < 0.003 * speedMul && u.kingdom && u.kingdom.units.size < 250) {
          u.food -= 30;
          const child = this.spawnUnit(u.x + (Math.random() - 0.5) * 2, u.y + (Math.random() - 0.5) * 2, u.kingdom, 'human');
          this.emit(`👶 ${child.name} was born in ${u.kingdom.name}.`);
        }

        // mood drifts with how life is actually treating them
        let moodPull = 0;
        if (u.food < 30) moodPull -= 0.02;
        if (u.hp < u.maxHp * 0.4) moodPull -= 0.02;
        if (u.kingdom && u.kingdom.atWarWith.size > 0) moodPull -= 0.01;
        if (u.food > 80 && u.hp === u.maxHp) moodPull += 0.015;
        u.mood = Math.max(-1, Math.min(1, u.mood + moodPull * speedMul + (Math.random() - 0.5) * 0.01));
      }

      // wandering movement
      if (Math.random() < 0.05) u.dir += (Math.random() - 0.5) * 1.2;
      const speed = (u.species === 'wolf' ? 0.12 : 0.07) * speedBase * speedMul;
      const nx = u.x + Math.cos(u.dir) * speed;
      const ny = u.y + Math.sin(u.dir) * speed;
      if (flies || w.isWalkable(Math.round(nx), Math.round(ny))) {
        u.x = nx; u.y = ny;
      } else {
        u.dir += Math.PI / 2 + Math.random();
      }

      // fire damage
      const ti = w.idx(Math.round(u.x), Math.round(u.y));
      if (w.inBounds(Math.round(u.x), Math.round(u.y)) && w.fire[ti] > 0 && !flies) {
        u.hp -= 2 * speedMul;
        if (u.hp <= 0) { this.removeUnit(u); continue; }
      }

      // reproduction near capital
      if (u.species === 'human' && u.kingdom && u.food > 80 && Math.random() < 0.0015 * speedMul && u.kingdom.units.size < 250) {
        u.food -= 30;
        const child = this.spawnUnit(u.x + (Math.random() - 0.5) * 2, u.y + (Math.random() - 0.5) * 2, u.kingdom, 'human');
        this.emit(`👶 ${child.name} was born in ${u.kingdom.name}.`);
      }
    }

    // livestock growth -> occasionally converts to kingdom food stock
    for (const l of this.livestock) {
      if (l.dead) continue;
      l.growth += 0.02 * speedMul;
      if (l.growth > 10) {
        l.growth = 0;
        if (l.kingdom) l.kingdom.foodStock = (l.kingdom.foodStock || 0) + LIVESTOCK_SPECIES[l.species].foodValue;
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
        this.emit(`⚔️ ${a.name} declared war on ${b.name}!`);
      }
    }
  }
}
