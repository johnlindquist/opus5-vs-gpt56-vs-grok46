/* Sand Alchemist engine — in-place CA with moved stamps, zigzag scans, heat buffer.
   Each particle is written at most once per movement pass. Heat is a separate
   documented pass that writes each cell once into tempNext. */
(function (root) {
  "use strict";

  var EMPTY = 0, SAND = 1, WATER = 2, STONE = 3, WOOD = 4, PLANT = 5,
      FIRE = 6, OIL = 7, ICE = 8, STEAM = 9, LAVA = 10, SALT = 11, ASH = 12;

  var NAMES = [
    "Empty", "Sand", "Water", "Stone", "Wood", "Plant",
    "Fire", "Oil", "Ice", "Steam", "Lava", "Salt", "Ash"
  ];

  var KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "L", "S", "A"];

  var COLORS = [
    [8, 10, 14],
    [228, 193, 122],
    [55, 138, 206],
    [108, 112, 122],
    [139, 90, 43],
    [61, 154, 84],
    [255, 107, 45],
    [62, 48, 22],
    [184, 232, 255],
    [198, 214, 224],
    [255, 68, 17],
    [242, 240, 234],
    [92, 86, 78]
  ];

  var DENSITY = [0, 6, 4, 99, 99, 99, 1, 3, 99, 1, 5, 6, 5];
  var STATIC = [0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0];
  var FLAMMABLE = [0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0];
  var AMBIENT = 118;
  var COLS = 400;
  var ROWS = 225;
  var CELL = 4;
  var COUNT = COLS * ROWS;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hash(x, y, t, seed) {
    var n = (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(t + 1, 1274126177)) | 0;
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return (n ^ n >>> 16) >>> 0;
  }

  function World(seed) {
    this.cols = COLS;
    this.rows = ROWS;
    this.cell = CELL;
    this.count = COUNT;
    this.seed = seed >>> 0;
    this.tick = 0;
    this.type = new Uint8Array(COUNT);
    this.temp = new Uint8Array(COUNT);
    this.aux = new Uint8Array(COUNT);
    this.salt = new Uint8Array(COUNT);
    this.moved = new Uint8Array(COUNT);
    this.reacted = new Uint8Array(COUNT);
    this.tempNext = new Uint8Array(COUNT);
    this.temp.fill(AMBIENT);
    this.tempNext.fill(AMBIENT);
    this.rng = mulberry32(this.seed || 1);
  }

  World.prototype.idx = function (x, y) {
    return y * COLS + x;
  };

  World.prototype.inBounds = function (x, y) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
  };

  World.prototype.clear = function () {
    this.type.fill(0);
    this.temp.fill(AMBIENT);
    this.aux.fill(0);
    this.salt.fill(0);
    this.moved.fill(0);
    this.reacted.fill(0);
    this.tick = 0;
  };

  World.prototype.setCell = function (x, y, type, opts) {
    if (!this.inBounds(x, y)) return;
    var i = this.idx(x, y);
    this.type[i] = type;
    this.aux[i] = opts && opts.aux != null ? opts.aux : defaultAux(type);
    this.salt[i] = opts && opts.salt != null ? opts.salt : 0;
    this.temp[i] = opts && opts.temp != null ? opts.temp : defaultTemp(type);
  };

  function defaultTemp(type) {
    if (type === FIRE) return 230;
    if (type === LAVA) return 245;
    if (type === STEAM) return 188;
    if (type === ICE) return 36;
    if (type === WATER) return 92;
    if (type === OIL) return 110;
    if (type === EMPTY) return AMBIENT;
    return AMBIENT;
  }

  function defaultAux(type) {
    if (type === FIRE) return 28;
    if (type === WOOD) return 40;
    if (type === PLANT) return 18;
    if (type === OIL) return 22;
    if (type === LAVA) return 8;
    return 0;
  }

  World.prototype.paint = function (x, y, type, radius) {
    var r = Math.max(0, radius | 0);
    var r2 = r * r;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        var px = x + dx;
        var py = y + dy;
        if (!this.inBounds(px, py)) continue;
        this.setCell(px, py, type, null);
      }
    }
  };

  World.prototype.line = function (x0, y0, x1, y1, type, radius) {
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    while (true) {
      this.paint(x0, y0, type, radius);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };

  World.prototype.activeCount = function () {
    var n = 0;
    var t = this.type;
    for (var i = 0; i < COUNT; i++) if (t[i]) n++;
    return n;
  };

  World.prototype.canOccupy = function (si, di) {
    var st = this.type[si];
    var dt = this.type[di];
    if (dt === EMPTY) return true;
    if (STATIC[dt]) return false;
    if (st === dt) return false;
    return DENSITY[st] > DENSITY[dt];
  };

  World.prototype.swap = function (si, di) {
    var tt = this.type[si]; this.type[si] = this.type[di]; this.type[di] = tt;
    tt = this.temp[si]; this.temp[si] = this.temp[di]; this.temp[di] = tt;
    tt = this.aux[si]; this.aux[si] = this.aux[di]; this.aux[di] = tt;
    tt = this.salt[si]; this.salt[si] = this.salt[di]; this.salt[di] = tt;
    this.moved[si] = 1;
    this.moved[di] = 1;
  };

  World.prototype.tryMove = function (x, y, nx, ny) {
    if (!this.inBounds(nx, ny)) return false;
    var si = this.idx(x, y);
    var di = this.idx(nx, ny);
    if (this.moved[di] || this.moved[si]) return false;
    if (!this.canOccupy(si, di)) return false;
    this.swap(si, di);
    return true;
  };

  World.prototype.powderMove = function (x, y) {
    if (this.tryMove(x, y, x, y + 1)) return true;
    var left = (hash(x, y, this.tick, this.seed) & 1) === 1;
    if (left) {
      if (this.tryMove(x, y, x - 1, y + 1)) return true;
      return this.tryMove(x, y, x + 1, y + 1);
    }
    if (this.tryMove(x, y, x + 1, y + 1)) return true;
    return this.tryMove(x, y, x - 1, y + 1);
  };

  World.prototype.liquidMove = function (x, y, slide) {
    if (this.tryMove(x, y, x, y + 1)) return true;
    var left = (hash(x, y, this.tick, this.seed) & 1) === 1;
    var a = left ? -1 : 1;
    var b = -a;
    if (this.tryMove(x, y, x + a, y + 1)) return true;
    if (this.tryMove(x, y, x + b, y + 1)) return true;
    if (this.tryMove(x, y, x + a, y)) return true;
    if (this.tryMove(x, y, x + b, y)) return true;
    if (slide >= 2) {
      var midA = this.inBounds(x + a, y) ? this.idx(x + a, y) : -1;
      if (midA >= 0 && this.type[midA] === EMPTY && this.tryMove(x, y, x + a * 2, y)) return true;
      var midB = this.inBounds(x + b, y) ? this.idx(x + b, y) : -1;
      if (midB >= 0 && this.type[midB] === EMPTY && this.tryMove(x, y, x + b * 2, y)) return true;
    }
    return false;
  };

  World.prototype.gasMove = function (x, y) {
    if (this.tryMove(x, y, x, y - 1)) return true;
    var left = (hash(x, y, this.tick + 3, this.seed) & 1) === 1;
    var a = left ? -1 : 1;
    if (this.tryMove(x, y, x + a, y - 1)) return true;
    if (this.tryMove(x, y, x - a, y - 1)) return true;
    if (this.tryMove(x, y, x + a, y)) return true;
    return this.tryMove(x, y, x - a, y);
  };

  World.prototype.stepMovement = function () {
    this.moved.fill(0);
    var type = this.type;
    var even = (this.tick & 1) === 0;

    for (var y = ROWS - 1; y >= 0; y--) {
      for (var n = 0; n < COLS; n++) {
        var x = even ? n : COLS - 1 - n;
        var i = y * COLS + x;
        if (this.moved[i]) continue;
        var t = type[i];
        if (t === EMPTY || t === FIRE || t === STEAM) continue;
        if (t === SAND || t === SALT || t === ASH) this.powderMove(x, y);
        else if (t === WATER) this.liquidMove(x, y, 4);
        else if (t === OIL) {
          if (y > 0 && type[i - COLS] === WATER) this.tryMove(x, y, x, y - 1);
          else this.liquidMove(x, y, 3);
        } else if (t === LAVA) {
          if ((this.tick % 3) === 0) this.liquidMove(x, y, 1);
        }
      }
    }

    even = !even;
    for (y = 0; y < ROWS; y++) {
      for (n = 0; n < COLS; n++) {
        x = even ? n : COLS - 1 - n;
        i = y * COLS + x;
        if (this.moved[i]) continue;
        t = type[i];
        if (t === STEAM) this.gasMove(x, y);
        else if (t === FIRE) {
          if ((hash(x, y, this.tick, this.seed) % 8) === 0) this.gasMove(x, y);
        }
      }
    }
  };

  var OFF = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

  World.prototype.neighbors = function (x, y, fn) {
    for (var k = 0; k < 16; k += 2) {
      var nx = x + OFF[k];
      var ny = y + OFF[k + 1];
      if (this.inBounds(nx, ny)) fn(nx, ny, this.idx(nx, ny));
    }
  };

  World.prototype.stepHeat = function () {
    var type = this.type;
    var temp = this.temp;
    var next = this.tempNext;
    for (var i = 0; i < COUNT; i++) {
      var t = type[i];
      var self = temp[i];
      if (t === FIRE) self = Math.max(self, 220);
      else if (t === LAVA) self = Math.max(self, 232);
      else if (t === ICE) self = Math.min(self, 42);
      else if (t === STEAM) self = Math.max(self, 170);
      var x = i % COLS;
      var y = (i / COLS) | 0;
      var sum = self * 4;
      var w = 4;
      if (x > 0) { sum += temp[i - 1]; w++; }
      if (x < COLS - 1) { sum += temp[i + 1]; w++; }
      if (y > 0) { sum += temp[i - COLS]; w++; }
      if (y < ROWS - 1) { sum += temp[i + COLS]; w++; }
      var mixed = (sum / w) | 0;
      if (t === EMPTY) mixed = mixed + ((AMBIENT - mixed) >> 3);
      else if (t === STONE) mixed = mixed + ((AMBIENT - mixed) >> 5);
      else if (t === WATER) mixed = mixed + ((96 - mixed) >> 4);
      next[i] = mixed < 0 ? 0 : mixed > 255 ? 255 : mixed;
    }
    this.temp = next;
    this.tempNext = temp;
  };

  World.prototype.ignite = function (ni, fuel) {
    if (this.reacted[ni]) return;
    var life = fuel === OIL ? 36 : fuel === WOOD ? 32 : 18;
    this.type[ni] = FIRE;
    this.aux[ni] = life;
    this.temp[ni] = 235;
    this.salt[ni] = 0;
    this.reacted[ni] = 1;
  };

  World.prototype.stepReactions = function () {
    this.reacted.fill(0);
    var type = this.type;
    var temp = this.temp;
    var aux = this.aux;
    var salt = this.salt;
    var self = this;

    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var i = y * COLS + x;
        if (this.reacted[i]) continue;
        var t = type[i];
        if (t === EMPTY) continue;

        if (t === FIRE) {
          if (aux[i] > 0) aux[i]--;
          this.neighbors(x, y, function (nx, ny, ni) {
            var nt = type[ni];
            if (FLAMMABLE[nt] && (hash(nx, ny, self.tick, self.seed) % 2) === 0) {
              self.ignite(ni, nt);
            }
            if (nt === ICE && temp[i] > 140) {
              type[ni] = WATER;
              temp[ni] = 80;
              aux[ni] = 0;
            }
          });
          if (aux[i] === 0) {
            type[i] = (hash(x, y, this.tick, this.seed) % 5) === 0 ? ASH : EMPTY;
            temp[i] = 150;
            aux[i] = 0;
            this.reacted[i] = 1;
          }
        } else if (t === LAVA) {
          this.neighbors(x, y, function (nx, ny, ni) {
            var nt = type[ni];
            if (nt === WATER || nt === ICE) {
              type[ni] = STEAM;
              temp[ni] = 200;
              aux[ni] = 12;
              salt[ni] = 0;
              self.reacted[ni] = 1;
              temp[i] = Math.max(160, temp[i] - 18);
            } else if (FLAMMABLE[nt]) {
              self.ignite(ni, nt);
            } else if (nt === SAND && temp[i] > 220 && (hash(nx, ny, self.tick, self.seed) % 40) === 0) {
              type[ni] = LAVA;
              temp[ni] = 230;
            }
          });
          if (temp[i] < 168) {
            type[i] = STONE;
            aux[i] = 0;
            this.reacted[i] = 1;
          }
        } else if (t === WATER) {
          if (temp[i] >= 172) {
            type[i] = STEAM;
            aux[i] = 10;
            this.reacted[i] = 1;
          } else if (temp[i] <= 48 && salt[i] < 40) {
            var iceNear = false;
            this.neighbors(x, y, function (nx, ny, ni) {
              if (type[ni] === ICE) iceNear = true;
            });
            if (iceNear || temp[i] <= 38) {
              type[i] = ICE;
              aux[i] = 0;
              this.reacted[i] = 1;
            }
          }
        } else if (t === ICE) {
          if (temp[i] >= 78) {
            type[i] = WATER;
            aux[i] = 0;
            this.reacted[i] = 1;
          } else {
            this.neighbors(x, y, function (nx, ny, ni) {
              if (type[ni] === WATER && temp[ni] < 70 && salt[ni] < 50 && (hash(nx, ny, self.tick, self.seed) % 8) === 0) {
                type[ni] = ICE;
                temp[ni] = Math.min(temp[ni], 50);
                self.reacted[ni] = 1;
              }
            });
          }
        } else if (t === STEAM) {
          if (y === 0 || temp[i] <= 132) {
            if (temp[i] <= 132 || y === 0) {
              if (y === 0 && temp[i] > 140 && (hash(x, y, this.tick, this.seed) % 6) !== 0) {
                /* vent off the top */
                type[i] = EMPTY;
                temp[i] = AMBIENT;
              } else if (temp[i] <= 132) {
                type[i] = WATER;
                aux[i] = 0;
                this.reacted[i] = 1;
              }
            }
          }
        } else if (t === SALT) {
          var dissolved = false;
          this.neighbors(x, y, function (nx, ny, ni) {
            if (dissolved) return;
            if (type[ni] === WATER && salt[ni] < 220) {
              salt[ni] = Math.min(255, salt[ni] + 70);
              type[i] = EMPTY;
              aux[i] = 0;
              salt[i] = 0;
              dissolved = true;
              self.reacted[i] = 1;
            }
          });
        } else if (t === PLANT) {
          var waterNear = false;
          var scorched = false;
          var ground = y + 1 < ROWS ? type[i + COLS] : STONE;
          this.neighbors(x, y, function (nx, ny, ni) {
            if (type[ni] === WATER) waterNear = true;
            if (type[ni] === FIRE || type[ni] === LAVA) scorched = true;
          });
          if (!scorched && waterNear && (ground === SAND || ground === STONE || ground === ASH || ground === WOOD || ground === PLANT)) {
            if ((hash(x, y, this.tick, this.seed) % 12) === 0) {
              var gx = x + ((hash(x, y, this.tick, this.seed) % 3) - 1);
              var gy = y - 1;
              if (this.inBounds(gx, gy)) {
                var gi = this.idx(gx, gy);
                if (type[gi] === EMPTY || type[gi] === STEAM) {
                  type[gi] = PLANT;
                  temp[gi] = AMBIENT;
                  aux[gi] = 12;
                  this.reacted[gi] = 1;
                }
              }
            }
          }
        } else if (t === OIL) {
          this.neighbors(x, y, function (nx, ny, ni) {
            if (type[ni] === FIRE && (hash(nx, ny, self.tick, self.seed) % 2) === 0) {
              self.ignite(i, OIL);
            }
          });
        }
      }
    }
  };

  World.prototype.step = function () {
    this.stepMovement();
    this.stepHeat();
    this.stepReactions();
    this.tick++;
  };

  function fillRect(world, x, y, w, h, type, opts) {
    for (var yy = y; yy < y + h; yy++) {
      for (var xx = x; xx < x + w; xx++) world.setCell(xx, yy, type, opts);
    }
  }

  function stampCircle(world, cx, cy, r, type, opts) {
    var r2 = r * r;
    for (var y = -r; y <= r; y++) {
      for (var x = -r; x <= r; x++) {
        if (x * x + y * y <= r2) world.setCell(cx + x, cy + y, type, opts);
      }
    }
  }

  var PRESETS = {
    volcano: {
      title: "Volcano",
      summary: "A basaltic cone feeds lava into a tide pool. Steam vents where magma meets water; the leeward slope holds a wood grove and a small oil seep, while the far ridge keeps a pocket of ice."
    },
    terrarium: {
      title: "Terrarium",
      summary: "A glass-box garden: wet sand, a freshwater lens, climbing plants, fallen wood, and a warm stone path. Growth, soak, and slow decay stay in motion without input."
    },
    "oil-fire": {
      title: "Oil Fire",
      summary: "A slick rides a water channel while a seed fire climbs the film. Flames consume oil aggressively, loft steam, and leave ash along the stone weir."
    },
    "frozen-lake": {
      title: "Frozen Lake",
      summary: "A cold basin of ice and water, salted at one shore so freeze is locally suppressed. A lava lamp and driftwood fire on the opposite bank melt a breathing lead of open water."
    }
  };

  function buildVolcano(world) {
    fillRect(world, 0, 200, COLS, 25, STONE, { temp: 110 });
    fillRect(world, 0, 188, 400, 18, SAND, null);
    fillRect(world, 40, 196, 140, 20, WATER, { temp: 88 });
    fillRect(world, 180, 198, 90, 16, WATER, { temp: 90 });
    for (var x = 210; x < 310; x++) {
      var peak = 70 + ((x - 260) * (x - 260) / 48) | 0;
      for (var y = peak; y < 205; y++) {
        var t = y > 175 && Math.abs(x - 260) < 8 ? LAVA : STONE;
        world.setCell(x, y, t, t === LAVA ? { temp: 250, aux: 10 } : { temp: 130 });
      }
    }
    fillRect(world, 252, 78, 16, 100, LAVA, { temp: 250, aux: 10 });
    stampCircle(world, 260, 72, 10, LAVA, { temp: 252 });
    fillRect(world, 168, 186, 90, 5, LAVA, { temp: 248 });
    fillRect(world, 140, 190, 40, 8, WATER, { temp: 86 });
    stampCircle(world, 258, 64, 6, STEAM, { temp: 200 });
    for (x = 48; x < 160; x += 3) {
      if ((hash(x, 180, 1, world.seed) % 3) === 0) {
        world.setCell(x, 187, PLANT, null);
        world.setCell(x, 186, PLANT, null);
      }
    }
    fillRect(world, 18, 170, 8, 28, WOOD, null);
    fillRect(world, 30, 176, 6, 20, WOOD, null);
    world.setCell(22, 169, FIRE, { aux: 40, temp: 240 });
    fillRect(world, 70, 192, 28, 4, OIL, null);
    stampCircle(world, 360, 150, 18, ICE, { temp: 32 });
    fillRect(world, 340, 168, 40, 8, SALT, null);
    fillRect(world, 300, 188, 80, 10, WATER, { temp: 70 });
  }

  function buildTerrarium(world) {
    fillRect(world, 0, 205, COLS, 20, STONE, null);
    fillRect(world, 0, 176, COLS, 30, SAND, null);
    fillRect(world, 90, 168, 220, 22, WATER, { temp: 90 });
    fillRect(world, 40, 150, 12, 40, WOOD, null);
    fillRect(world, 340, 148, 10, 42, WOOD, null);
    for (var x = 20; x < 380; x++) {
      if ((hash(x, 170, 4, world.seed) % 4) === 0) world.setCell(x, 175, PLANT, null);
      if ((hash(x, 166, 5, world.seed) % 7) === 0) world.setCell(x, 174, PLANT, null);
    }
    fillRect(world, 200, 120, 80, 6, STONE, { temp: 140 });
    stampCircle(world, 240, 118, 4, FIRE, { aux: 20, temp: 230 });
    fillRect(world, 10, 188, 24, 6, SALT, null);
    fillRect(world, 300, 160, 30, 8, ICE, { temp: 40 });
    fillRect(world, 50, 162, 20, 3, OIL, null);
  }

  function buildOilFire(world) {
    fillRect(world, 0, 210, COLS, 15, STONE, null);
    fillRect(world, 20, 188, 360, 24, WATER, { temp: 92 });
    fillRect(world, 40, 176, 280, 10, OIL, null);
    fillRect(world, 8, 150, 14, 60, STONE, null);
    fillRect(world, 378, 150, 14, 60, STONE, null);
    fillRect(world, 120, 140, 8, 40, WOOD, null);
    fillRect(world, 200, 130, 8, 50, WOOD, null);
    world.setCell(160, 175, FIRE, { aux: 50, temp: 250 });
    world.setCell(161, 174, FIRE, { aux: 40, temp: 248 });
    world.setCell(200, 129, FIRE, { aux: 36, temp: 240 });
    fillRect(world, 300, 200, 40, 8, SAND, null);
    fillRect(world, 330, 168, 16, 6, SALT, null);
  }

  function buildFrozenLake(world) {
    fillRect(world, 0, 200, COLS, 25, STONE, { temp: 70 });
    fillRect(world, 30, 150, 340, 55, ICE, { temp: 34 });
    fillRect(world, 120, 168, 90, 28, WATER, { temp: 50 });
    fillRect(world, 40, 186, 36, 10, SALT, null);
    for (var x = 40; x < 80; x++) {
      for (var y = 160; y < 186; y++) {
        if (world.type[world.idx(x, y)] === ICE) world.setCell(x, y, WATER, { temp: 55, salt: 90 });
      }
    }
    stampCircle(world, 320, 120, 16, STONE, { temp: 180 });
    fillRect(world, 314, 90, 12, 40, LAVA, { temp: 248 });
    fillRect(world, 60, 120, 7, 40, WOOD, null);
    world.setCell(60, 119, FIRE, { aux: 45, temp: 240 });
    fillRect(world, 200, 140, 40, 8, SAND, null);
    for (x = 180; x < 230; x += 2) world.setCell(x, 139, PLANT, null);
  }

  World.prototype.loadPreset = function (name) {
    this.clear();
    this.rng = mulberry32(this.seed || 1);
    if (name === "terrarium") buildTerrarium(this);
    else if (name === "oil-fire") buildOilFire(this);
    else if (name === "frozen-lake") buildFrozenLake(this);
    else buildVolcano(this);
  };

  function countType(w, id) {
    var n = 0;
    for (var j = 0; j < COUNT; j++) if (w.type[j] === id) n++;
    return n;
  }

  function lowestY(w, id) {
    var best = -1;
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) if (w.type[w.idx(x, y)] === id) best = y;
    }
    return best;
  }

  function selfTest() {
    var fails = [];
    var w = new World(0xA13C3);
    w.setCell(10, 10, SAND, null);
    for (var i = 0; i < 40; i++) w.step();
    if (w.type[w.idx(10, 10)] === SAND) fails.push("sand did not fall");
    if (lowestY(w, SAND) < 40) fails.push("sand did not continue falling");

    w.clear();
    w.setCell(20, 10, WATER, null);
    for (i = 0; i < 40; i++) w.step();
    if (lowestY(w, WATER) < 40) fails.push("water did not flow down");

    w.clear();
    w.setCell(8, 20, WOOD, null);
    w.setCell(8, 19, WOOD, null);
    w.setCell(9, 20, FIRE, { aux: 50, temp: 240 });
    w.setCell(9, 19, FIRE, { aux: 50, temp: 240 });
    var burned = false;
    for (i = 0; i < 40; i++) {
      w.step();
      if (w.type[w.idx(8, 20)] !== WOOD) burned = true;
    }
    if (!burned) fails.push("fire did not consume wood");

    w.clear();
    fillRect(w, 0, 80, 40, 1, STONE, null);
    fillRect(w, 10, 78, 12, 2, WATER, null);
    fillRect(w, 10, 76, 12, 2, OIL, null);
    for (i = 0; i < 20; i++) w.step();
    var oilAbove = false;
    for (var x = 0; x < 40; x++) {
      for (var y = 1; y < 80; y++) {
        if (w.type[w.idx(x, y)] === OIL && w.type[w.idx(x, y + 1)] === WATER) oilAbove = true;
      }
    }
    if (!oilAbove) fails.push("oil did not float on water");

    w.clear();
    w.setCell(12, 50, WATER, null);
    w.setCell(12, 51, LAVA, { temp: 250 });
    var steamed = false;
    for (i = 0; i < 8; i++) {
      w.step();
      if (countType(w, STEAM) > 0) steamed = true;
    }
    if (!steamed) fails.push("lava did not boil water");

    w.clear();
    w.setCell(5, 60, ICE, { temp: 30 });
    w.setCell(6, 60, FIRE, { aux: 40, temp: 250 });
    var melted = false;
    for (i = 0; i < 50; i++) {
      w.step();
      if (w.type[w.idx(5, 60)] !== ICE) melted = true;
    }
    if (!melted) fails.push("ice did not melt near heat");

    w.clear();
    w.setCell(30, 80, STEAM, { temp: 190 });
    for (i = 0; i < 25; i++) w.step();
    if (w.type[w.idx(30, 80)] === STEAM) fails.push("steam did not rise");

    w.clear();
    w.setCell(40, 90, SALT, null);
    w.setCell(41, 90, WATER, null);
    var dissolved = false;
    for (i = 0; i < 10; i++) {
      w.step();
      if (w.type[w.idx(40, 90)] === EMPTY) dissolved = true;
    }
    if (!dissolved) fails.push("salt did not dissolve");

    w.clear();
    fillRect(w, 46, 102, 10, 2, STONE, null);
    fillRect(w, 47, 101, 8, 1, SAND, null);
    w.setCell(48, 100, STONE, null);
    w.setCell(52, 100, STONE, null);
    w.setCell(49, 100, WATER, { temp: 90 });
    w.setCell(51, 100, WATER, { temp: 90 });
    w.setCell(50, 100, PLANT, null);
    var grew = false;
    var plants0 = countType(w, PLANT);
    for (i = 0; i < 120; i++) {
      w.step();
      if (countType(w, PLANT) > plants0) grew = true;
    }
    if (!grew) fails.push("plant did not grow");

    w.clear();
    w.loadPreset("volcano");
    var kinds = {};
    var j;
    for (j = 0; j < COUNT; j++) kinds[w.type[j]] = 1;
    [SAND, WATER, STONE, WOOD, PLANT, FIRE, OIL, ICE, LAVA, SALT].forEach(function (id) {
      if (!kinds[id]) fails.push("volcano missing material " + NAMES[id]);
    });
    for (i = 0; i < 12; i++) w.step();
    var steamOk = false;
    for (j = 0; j < COUNT; j++) if (w.type[j] === STEAM) steamOk = true;
    if (!steamOk) fails.push("volcano attract scene produced no steam");

    return { ok: fails.length === 0, fails: fails };
  }

  if (typeof process !== "undefined" && process.argv && process.argv[1] && /engine\.js$/.test(String(process.argv[1]))) {
    var result = selfTest();
    if (!result.ok) {
      console.error("self-test failed:\n" + result.fails.join("\n"));
      process.exit(1);
    }
    console.log("self-test passed (" + result.fails.length + " issues)");
  }

  root.SandAlchemist = {
    EMPTY: EMPTY, SAND: SAND, WATER: WATER, STONE: STONE, WOOD: WOOD, PLANT: PLANT,
    FIRE: FIRE, OIL: OIL, ICE: ICE, STEAM: STEAM, LAVA: LAVA, SALT: SALT, ASH: ASH,
    NAMES: NAMES, KEYS: KEYS, COLORS: COLORS, COLS: COLS, ROWS: ROWS, CELL: CELL,
    AMBIENT: AMBIENT, PRESETS: PRESETS, World: World, selfTest: selfTest, hash: hash
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.SandAlchemist;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
