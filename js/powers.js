// God powers: definitions and apply logic.
const POWER_GROUPS = [
  {
    label: 'Terrain',
    powers: [
      { id: 'inspect', icon: '👁', label: 'Inspect' },
      { id: 'chat', icon: '💬', label: 'Chat' },
      { id: 'raise', icon: '⛰', label: 'Raise' },
      { id: 'lower', icon: '🕳', label: 'Lower' },
      { id: 'water', icon: '💧', label: 'Flood' },
      { id: 'grow', icon: '🌱', label: 'Grow' },
      { id: 'rain', icon: '🌧', label: 'Rain' },
    ],
  },
  {
    label: 'Disasters',
    powers: [
      { id: 'fire', icon: '🔥', label: 'Ignite' },
      { id: 'lightning', icon: '⚡', label: 'Lightning' },
      { id: 'meteor', icon: '☄️', label: 'Meteor' },
      { id: 'tornado', icon: '🌪', label: 'Tornado' },
      { id: 'earthquake', icon: '🌋', label: 'Quake' },
    ],
  },
  {
    label: 'Life',
    powers: [
      { id: 'spawnHuman', icon: '🧍', label: 'New Tribe' },
      { id: 'spawnWolf', icon: '🐺', label: 'Wolves' },
      { id: 'spawnDragon', icon: '🐉', label: 'Wild Dragon' },
      { id: 'spawnHorse', icon: '🐎', label: 'Mount Horse' },
      { id: 'mountDragon', icon: '🐲', label: 'Mount Dragon' },
      { id: 'petDog', icon: '🐕', label: 'Pet Dog' },
      { id: 'heal', icon: '💚', label: 'Heal' },
      { id: 'kill', icon: '💀', label: 'Smite' },
    ],
  },
  {
    label: 'Buildings',
    powers: [
      { id: 'buildFarm', icon: '🌾', label: 'Farm' },
      { id: 'buildRanch', icon: '🐄', label: 'Ranch' },
      { id: 'buildSchool', icon: '📚', label: 'School' },
      { id: 'buildChurch', icon: '⛪', label: 'Church' },
      { id: 'buildHospital', icon: '⚕️', label: 'Hospital' },
      { id: 'buildPolice', icon: '🚓', label: 'Police' },
      { id: 'buildBarracks', icon: '⚔️', label: 'Barracks' },
      { id: 'buildAirport', icon: '✈️', label: 'Airport' },
    ],
  },
];

const POWERS = POWER_GROUPS.flatMap(g => g.powers);

function nearestKingdomTo(em, wx, wy, maxD = 25) {
  let best = null, bestD = maxD * maxD;
  for (const k of em.kingdoms) {
    for (const b of k.buildings) {
      if (b.type !== 'capital') continue;
      const d = (b.x - wx) ** 2 + (b.y - wy) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
  }
  return best;
}

function nearestHumanTo(em, wx, wy, maxD = 6) {
  let best = null, bestD = maxD * maxD;
  for (const u of em.units) {
    if (u.dead || u.species !== 'human') continue;
    const d = (u.x - wx) ** 2 + (u.y - wy) ** 2;
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function applyPower(game, powerId, wx, wy, brush) {
  const w = game.world;
  const em = game.entities;
  const r = brush;

  const forEachTile = (cb) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = Math.round(wx) + dx, y = Math.round(wy) + dy;
        if (w.inBounds(x, y)) cb(x, y, w.idx(x, y));
      }
    }
  };

  const buildAt = (type) => {
    const k = nearestKingdomTo(em, wx, wy);
    if (!k) return;
    const x = Math.round(wx), y = Math.round(wy);
    if (!w.isWalkable(x, y)) return;
    const b = new Building(x, y, k, type);
    k.buildings.add(b);
    em.buildings.push(b);
    if (type === 'ranch') {
      for (let i = 0; i < 3; i++) em.livestock.push(new Livestock(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, k, pick(['cow', 'sheep', 'chicken'])));
    }
  };

  switch (powerId) {
    case 'inspect': {
      let nearest = null, bestD = Infinity;
      for (const u of em.units) {
        const d = (u.x - wx) ** 2 + (u.y - wy) ** 2;
        if (d < bestD) { bestD = d; nearest = u; }
      }
      return nearest && bestD < 4 ? { kind: 'inspect', unit: nearest } : null;
    }
    case 'chat': {
      let nearest = null, bestD = Infinity;
      for (const u of em.units) {
        if (u.dead || u.species === 'airplane') continue;
        const d = (u.x - wx) ** 2 + (u.y - wy) ** 2;
        if (d < bestD) { bestD = d; nearest = u; }
      }
      return nearest && bestD < 4 ? { kind: 'chat', unit: nearest } : null;
    }
    case 'raise':
      forEachTile((x, y, i) => { w.elevation[i] = Math.min(1, w.elevation[i] + 0.05); recalcTile(w, x, y); });
      break;
    case 'lower':
      forEachTile((x, y, i) => { w.elevation[i] = Math.max(0, w.elevation[i] - 0.05); recalcTile(w, x, y); });
      break;
    case 'water':
      forEachTile((x, y, i) => w.floodAt(x, y, 10));
      break;
    case 'fire':
      forEachTile((x, y) => w.igniteAt(x, y));
      break;
    case 'lightning': {
      forEachTile((x, y) => w.igniteAt(x, y));
      for (const u of em.units) {
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d < r + 0.5) u.hp -= 200;
      }
      game.fx.push({ type: 'lightning', x: wx, y: wy, t: 12 });
      break;
    }
    case 'meteor': {
      forEachTile((x, y, i) => {
        w.elevation[i] = Math.max(0, w.elevation[i] - 0.1);
        recalcTile(w, x, y);
        w.scorched[i] = 200;
      });
      for (const u of em.units) {
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d < r + 1) u.hp -= 500;
      }
      game.fx.push({ type: 'meteor', x: wx, y: wy, t: 20 });
      break;
    }
    case 'tornado': {
      for (const u of em.units) {
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d < r + 2) {
          u.x += (Math.random() - 0.5) * 6;
          u.y += (Math.random() - 0.5) * 6;
          u.x = Math.max(0, Math.min(w.width - 1, u.x));
          u.y = Math.max(0, Math.min(w.height - 1, u.y));
        }
      }
      game.fx.push({ type: 'tornado', x: wx, y: wy, t: 30 });
      break;
    }
    case 'earthquake': {
      forEachTile((x, y, i) => {
        if (Math.random() < 0.3) { w.elevation[i] += (Math.random() - 0.5) * 0.15; recalcTile(w, x, y); }
      });
      for (const u of em.units) {
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d < r + 1) u.hp -= 15;
      }
      break;
    }
    case 'rain':
      forEachTile((x, y, i) => { if (w.tiles[i] === TILE.GRASS || w.tiles[i] === TILE.FOREST) w.resource[i] = Math.min(100, w.resource[i] + 20); });
      break;
    case 'grow':
      forEachTile((x, y, i) => { if (w.isLand(x, y)) { w.resource[i] = Math.min(100, w.resource[i] + 30); } });
      break;
    case 'spawnHuman':
      em.spawnKingdomAt(Math.round(wx), Math.round(wy));
      break;
    case 'spawnWolf':
      forEachTile((x, y) => { if (Math.random() < 0.3 && w.isWalkable(x, y)) em.spawnAnimal(x, y, 'wolf'); });
      break;
    case 'spawnDragon':
      em.spawnAnimal(Math.round(wx), Math.round(wy), 'dragon');
      break;
    case 'spawnHorse': {
      const human = nearestHumanTo(em, wx, wy);
      if (human) human.mount = 'horse';
      break;
    }
    case 'mountDragon': {
      const human = nearestHumanTo(em, wx, wy);
      if (human) human.mount = 'dragon';
      break;
    }
    case 'petDog': {
      const human = nearestHumanTo(em, wx, wy);
      if (human) human.pet = 'dog';
      break;
    }
    case 'heal':
      for (const u of em.units) {
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d < r + 0.5) u.hp = u.maxHp;
      }
      break;
    case 'kill':
      for (const u of em.units) {
        const d = Math.hypot(u.x - wx, u.y - wy);
        if (d < r + 0.5) u.hp = 0;
      }
      break;
    case 'buildFarm': buildAt('farm'); break;
    case 'buildRanch': buildAt('ranch'); break;
    case 'buildSchool': buildAt('school'); break;
    case 'buildChurch': buildAt('church'); break;
    case 'buildHospital': buildAt('hospital'); break;
    case 'buildPolice': buildAt('police'); break;
    case 'buildBarracks': buildAt('barracks'); break;
    case 'buildAirport': buildAt('airport'); break;
  }
  return null;
}

function recalcTile(w, x, y) {
  const i = w.idx(x, y);
  const e = w.elevation[i];
  let tile;
  if (e < 0.05) tile = TILE.DEEP_WATER;
  else if (e < 0.14) tile = TILE.WATER;
  else if (e < 0.18) tile = TILE.SAND;
  else if (e < 0.45) tile = (w.tiles[i] === TILE.FOREST) ? TILE.FOREST : TILE.GRASS;
  else if (e < 0.6) tile = TILE.HILL;
  else if (e < 0.75) tile = TILE.MOUNTAIN;
  else tile = TILE.SNOW;
  w.tiles[i] = tile;
}
