// World grid: terrain, biomes, fire/water overlays.
const TILE = {
  DEEP_WATER: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  HILL: 5,
  MOUNTAIN: 6,
  SNOW: 7,
};

const TILE_COLOR = {
  [TILE.DEEP_WATER]: '#1b3a6b',
  [TILE.WATER]: '#2e6db3',
  [TILE.SAND]: '#d9c285',
  [TILE.GRASS]: '#5fa84f',
  [TILE.FOREST]: '#2f7a36',
  [TILE.HILL]: '#9a8a5c',
  [TILE.MOUNTAIN]: '#7c7468',
  [TILE.SNOW]: '#eef2f5',
};

class World {
  constructor(width, height, seed) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.tiles = new Uint8Array(width * height);
    this.elevation = new Float32Array(width * height);
    this.fire = new Uint8Array(width * height); // 0 none, >0 burning timer
    this.water = new Uint8Array(width * height); // flood overlay depth
    this.scorched = new Uint8Array(width * height);
    this.resource = new Uint8Array(width * height); // tree density / food
    this.day = 0;
    this.generate();
  }

  idx(x, y) { return y * this.width + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  generate() {
    const elevNoise = new ValueNoise(this.seed);
    const moistNoise = new ValueNoise(this.seed + 9999);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.idx(x, y);
        // island falloff toward edges
        const nx = x / this.width - 0.5, ny = y / this.height - 0.5;
        const dist = Math.sqrt(nx * nx + ny * ny) * 1.6;
        let e = elevNoise.noise2D(x, y, 5, 0.5, 0.04);
        e = e - dist * 0.55;
        const m = moistNoise.noise2D(x, y, 4, 0.5, 0.06);
        this.elevation[i] = e;

        let tile;
        if (e < 0.05) tile = TILE.DEEP_WATER;
        else if (e < 0.14) tile = TILE.WATER;
        else if (e < 0.18) tile = TILE.SAND;
        else if (e < 0.45) tile = m > 0.55 ? TILE.FOREST : TILE.GRASS;
        else if (e < 0.6) tile = TILE.HILL;
        else if (e < 0.75) tile = TILE.MOUNTAIN;
        else tile = TILE.SNOW;

        this.tiles[i] = tile;
        this.resource[i] = tile === TILE.FOREST ? 100 : (tile === TILE.GRASS ? 40 : 0);
      }
    }
  }

  isLand(x, y) {
    if (!this.inBounds(x, y)) return false;
    const t = this.tiles[this.idx(x, y)];
    return t !== TILE.DEEP_WATER && t !== TILE.WATER;
  }

  isWalkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    if (this.water[i] > 2) return false;
    const t = this.tiles[i];
    return t !== TILE.DEEP_WATER && t !== TILE.WATER && t !== TILE.MOUNTAIN;
  }

  igniteAt(x, y) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    if (this.tiles[i] === TILE.FOREST || this.tiles[i] === TILE.GRASS) {
      this.fire[i] = 40 + Math.random() * 20;
    }
  }

  floodAt(x, y, depth = 8) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.water[i] = Math.max(this.water[i], depth);
  }

  tick() {
    // fire spreads & burns
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.idx(x, y);
        if (this.fire[i] > 0) {
          this.fire[i]--;
          if (Math.random() < 0.15) {
            const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
            const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
            const nx = x + dx, ny = y + dy;
            if (this.inBounds(nx, ny)) {
              const ni = this.idx(nx, ny);
              if ((this.tiles[ni] === TILE.FOREST || this.tiles[ni] === TILE.GRASS) && this.fire[ni] === 0) {
                this.fire[ni] = 30 + Math.random() * 20;
              }
            }
          }
          if (this.fire[i] === 0) {
            this.tiles[i] = TILE.SAND;
            this.scorched[i] = 200;
          }
        }
        if (this.scorched[i] > 0) this.scorched[i]--;
        if (this.water[i] > 0) {
          // slowly recede
          if (Math.random() < 0.02) this.water[i]--;
          // spread to neighbors a bit
          if (this.water[i] > 3 && Math.random() < 0.05) {
            const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
            const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
            const nx = x + dx, ny = y + dy;
            if (this.inBounds(nx, ny)) {
              const ni = this.idx(nx, ny);
              if (this.tiles[ni] !== TILE.MOUNTAIN && this.water[ni] < this.water[i] - 1) {
                this.water[ni] = Math.max(this.water[ni], this.water[i] - 2);
              }
            }
          }
        }
        // forest regrowth on grass occasionally
        if (this.tiles[i] === TILE.GRASS && this.resource[i] < 40) {
          this.resource[i] += 0.02;
        }
      }
    }
  }
}
