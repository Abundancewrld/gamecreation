// Building definitions and city growth / era progression simulation.
const BUILDING_TYPES = {
  capital:   { icon: '🏛️', label: 'Capital' },
  house:     { icon: '🏠', label: 'House' },
  farm:      { icon: '🌾', label: 'Farm' },
  ranch:     { icon: '🐄', label: 'Ranch' },
  school:    { icon: '📚', label: 'School' },
  church:    { icon: '⛪', label: 'Church' },
  hospital:  { icon: '⚕️', label: 'Hospital' },
  police:    { icon: '🚓', label: 'Police' },
  barracks:  { icon: '⚔️', label: 'Barracks' },
  airport:   { icon: '✈️', label: 'Airport' },
};

const ROYAL_NAMES = [
  'Aldric', 'Seraphina', 'Tharos', 'Lyanna', 'Magnus', 'Isolde',
  'Cedric', 'Morwenna', 'Baldwin', 'Elaria', 'Ronan', 'Vesna',
];
const COMMON_NAMES = [
  'Tom', 'Mira', 'Jago', 'Lena', 'Petra', 'Drew', 'Wynn', 'Sasha',
  'Orin', 'Talia', 'Brann', 'Yara', 'Finn', 'Nadia', 'Hugo', 'Iris',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function findBuildSpot(world, cx, cy, radius = 10) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 2 + Math.random() * radius;
    const x = Math.round(cx + Math.cos(ang) * dist);
    const y = Math.round(cy + Math.sin(ang) * dist);
    if (world.isWalkable(x, y)) return [x, y];
  }
  return null;
}

// Crown (or re-crown) a kingdom's royal unit.
function crownRoyal(kingdom, em) {
  let candidate = null;
  for (const u of kingdom.units) {
    if (u.dead || u.species !== 'human') continue;
    if (!candidate || u.age > candidate.age) candidate = u;
  }
  if (!candidate) return;
  candidate.isRoyal = true;
  candidate.role = kingdom.royalTitle || 'King';
  candidate.name = pick(ROYAL_NAMES);
  kingdom.royal = candidate;
}

function cityTick(kingdom, world, em, speedMul) {
  if (kingdom.population === 0) return;

  // tech accumulation drives era advancement
  const schoolCount = [...kingdom.buildings].filter(b => b.type === 'school').length;
  const gain = (kingdom.population * 0.012 + schoolCount * 0.6 + (kingdom.era + 1) * 0.05) * speedMul;
  kingdom.tech += gain;
  const newEra = eraForTech(kingdom.tech);
  if (newEra.id !== kingdom.era) {
    kingdom.era = newEra.id;
    kingdom.announcements = kingdom.announcements || [];
    kingdom.announcements.push(`${kingdom.name} entered the ${newEra.name}!`);
  }

  // food production from farms/ranches
  const farms = [...kingdom.buildings].filter(b => b.type === 'farm').length;
  const ranches = [...kingdom.buildings].filter(b => b.type === 'ranch').length;
  kingdom.foodStock = (kingdom.foodStock || 0) + (farms * 0.6 + ranches * 0.9) * speedMul;
  if (kingdom.foodStock > 0) {
    const share = Math.min(kingdom.foodStock, kingdom.population * 0.05 * speedMul);
    kingdom.foodStock -= share;
    let i = 0;
    for (const u of kingdom.units) {
      if (i++ > 40) break; // cap per-tick distribution cost
      u.food = Math.min(100, u.food + share / Math.max(1, kingdom.population) * 20);
    }
  }

  // royal succession
  if (!kingdom.royal || kingdom.royal.dead) crownRoyal(kingdom, em);

  // occasional auto-construction of unlocked buildings near the capital
  if (Math.random() < 0.01 * speedMul && kingdom.population > 4) {
    const unlocked = unlockedBuildings(kingdom.era);
    const have = {};
    for (const b of kingdom.buildings) have[b.type] = (have[b.type] || 0) + 1;
    const wanted = [...unlocked].filter(t => t !== 'capital');
    // prioritize types the kingdom doesn't have yet, then scale with population
    wanted.sort((a, b) => (have[a] || 0) - (have[b] || 0));
    const type = wanted[0];
    if (type && (have[type] || 0) < Math.ceil(kingdom.population / 6)) {
      const capital = [...kingdom.buildings].find(b => b.type === 'capital');
      if (capital) {
        const spot = findBuildSpot(world, capital.x, capital.y, 14);
        if (spot) {
          const b = new Building(spot[0], spot[1], kingdom, type);
          kingdom.buildings.add(b);
          em.buildings.push(b);
          em.emit(`${(BUILDING_TYPES[type] || {}).icon || '🏗️'} ${kingdom.name} built a new ${(BUILDING_TYPES[type] || {}).label || type}.`);
          if (type === 'ranch') {
            for (let i = 0; i < 3; i++) {
              em.livestock.push(new Livestock(spot[0] + (Math.random() - 0.5) * 2, spot[1] + (Math.random() - 0.5) * 2, kingdom, pick(['cow', 'sheep', 'chicken'])));
            }
          }
        }
      }
    }
  }

  // spawn an airplane once an airport exists and none are flying yet (Modern+)
  if (kingdom.era >= 5 && [...kingdom.buildings].some(b => b.type === 'airport')) {
    const flying = em.units.filter(u => u.kingdom === kingdom && u.species === 'airplane').length;
    if (flying < 1 && Math.random() < 0.01 * speedMul) {
      const airport = [...kingdom.buildings].find(b => b.type === 'airport');
      em.spawnUnit(airport.x, airport.y, kingdom, 'airplane');
    }
  }
}
