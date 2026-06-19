// Livestock, pets, and mount definitions.
const LIVESTOCK_SPECIES = {
  cow: { icon: '🐄', foodValue: 3, color: '#e8d9c0' },
  sheep: { icon: '🐑', foodValue: 2, color: '#f0f0e8' },
  chicken: { icon: '🐔', foodValue: 1, color: '#e0c068' },
};

const PET_SPECIES = {
  dog: { icon: '🐕', color: '#a0703a' },
  cat: { icon: '🐈', color: '#666' },
  dragon: { icon: '🐲', color: '#3fae5a' },
};

const MOUNT_SPECIES = {
  horse: { icon: '🐎', speedMul: 2.0, flies: false, color: '#6b4a2f' },
  dragon: { icon: '🐉', speedMul: 3.2, flies: true, color: '#a32cc4' },
};

class Livestock {
  constructor(x, y, kingdom, species = 'cow') {
    this.id = nextEntityId++;
    this.x = x; this.y = y;
    this.kingdom = kingdom;
    this.species = species;
    this.growth = 0;
    this.dead = false;
  }
}
