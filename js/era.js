// Era definitions and per-kingdom progression (Stone Age -> Advanced Future).
const ERAS = [
  { id: 0, name: 'Stone Age', icon: '🪨', threshold: 0 },
  { id: 1, name: 'Bronze Age', icon: '🔨', threshold: 350 },
  { id: 2, name: 'Medieval', icon: '🏰', threshold: 1000 },
  { id: 3, name: 'Renaissance', icon: '🎨', threshold: 2400 },
  { id: 4, name: 'Industrial', icon: '🏭', threshold: 5000 },
  { id: 5, name: 'Modern', icon: '🏙️', threshold: 9500 },
  { id: 6, name: 'Future', icon: '🚀', threshold: 17000 },
  { id: 7, name: 'Advanced Future', icon: '🌌', threshold: 28000 },
];

// Buildings unlocked by era index (cumulative - includes all from earlier eras).
const ERA_UNLOCKS = {
  0: ['house', 'farm'],
  1: ['ranch', 'barracks'],
  2: ['school', 'church'],
  3: ['hospital'],
  4: ['police'],
  5: ['airport'],
  6: ['airport'],
  7: ['airport'],
};

function unlockedBuildings(eraId) {
  const set = new Set();
  for (let i = 0; i <= eraId; i++) {
    (ERA_UNLOCKS[i] || []).forEach(b => set.add(b));
  }
  return set;
}

function eraForTech(tech) {
  let cur = ERAS[0];
  for (const e of ERAS) {
    if (tech >= e.threshold) cur = e;
  }
  return cur;
}

function eraTint(eraId) {
  // subtle palette tint applied to a kingdom's buildings as it advances.
  const tints = ['#8a7355', '#a87f3f', '#7a6248', '#9d6b3f', '#5e5e63', '#3f6b8a', '#3f8aa8', '#7a3f8a'];
  return tints[eraId] || '#888';
}
