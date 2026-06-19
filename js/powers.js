// God powers: definitions and apply logic.
const POWERS = [
  { id: 'inspect', icon: '👁', label: 'Inspect' },
  { id: 'raise', icon: '⛰', label: 'Raise Land' },
  { id: 'lower', icon: '🕳', label: 'Lower Land' },
  { id: 'water', icon: '💧', label: 'Flood' },
  { id: 'fire', icon: '🔥', label: 'Ignite' },
  { id: 'lightning', icon: '⚡', label: 'Lightning' },
  { id: 'meteor', icon: '☄️', label: 'Meteor' },
  { id: 'tornado', icon: '🌪', label: 'Tornado' },
  { id: 'earthquake', icon: '🌋', label: 'Quake' },
  { id: 'rain', icon: '🌧', label: 'Rain' },
  { id: 'grow', icon: '🌱', label: 'Grow' },
  { id: 'spawnHuman', icon: '🧍', label: 'Spawn Tribe' },
  { id: 'spawnWolf', icon: '🐺', label: 'Spawn Wolf' },
  { id: 'spawnDragon', icon: '🐉', label: 'Spawn Dragon' },
  { id: 'heal', icon: '💚', label: 'Heal' },
  { id: 'kill', icon: '💀', label: 'Smite' },
];

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

  switch (powerId) {
    case 'inspect': {
      let nearest = null, bestD = Infinity;
      for (const u of em.units) {
        const d = (u.x - wx) ** 2 + (u.y - wy) ** 2;
        if (d < bestD) { bestD = d; nearest = u; }
      }
      return nearest && bestD < 4 ? nearest : null;
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
