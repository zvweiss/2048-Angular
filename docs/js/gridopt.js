function Grid4(gr) {
  this.size = 4;
  this.UP = 0;
  this.RIGHT = 1;
  this.DOWN = 2;
  this.LEFT = 3;
  this.combUint16 = Math.pow(2, this.size * this.size);
  if (gr === undefined) {
    this.cells = new Uint16Array(this.size);
    this.tiles = [];
    this.emptysizeMap = new Uint16Array(this.combUint16);
    this.movementMap = new Uint16Array(this.combUint16);
    this.scoreMap = new Uint16Array(this.combUint16);
    console.log("Initializing emptysizeMap...");
    var t = new Date();
    for (var i = 0; i < this.combUint16; i++) {
      var sum = 0;
      for (var power = 0; power < this.size * this.size; power++) {
        if (Math.pow(2, power) & i) sum++;
      }
      this.emptysizeMap[i] = sum;
    }
    console.log(
      "Finished initializing emptysizeMap in " + (new Date() - t) + " ms..."
    );
    console.log("Initializing movementMap and scoreMap...");
    t = new Date();
    for (var i = 0; i < this.combUint16; i++) {
      var score = 0;
      var offset = 0;
      var uint16 = i;
      var curr = this.firstfull(i, offset);
      var last = 0;
      var lastoffset = -4;
      var merged = false;
      while (curr[0]) {
        if ((i & curr[0]) >> curr[1] == last >> lastoffset && !merged) {
          uint16 = uint16 & (curr[0] ^ 0xffff);
          uint16 = uint16 & (last ^ 0xffff);
          uint16 = uint16 | (((last >> lastoffset) + 1) << lastoffset);
          last = uint16 & curr[0];
          offset = curr[1] + 4;
          merged = true;
          score += Math.pow(2, (last >> lastoffset) + 1);
        } else if (curr[1] > lastoffset + 4) {
          last = (uint16 & curr[0]) >> (curr[1] - (lastoffset + 4));
          uint16 = uint16 | last;
          uint16 = uint16 & (curr[0] ^ 0xffff);
          offset = curr[1] + 4;
          lastoffset = lastoffset + 4;
          merged = false;
        } else {
          last = uint16 & curr[0];
          lastoffset = curr[1];
          offset = curr[1] + 4;
          merged = false;
        }
        curr = this.firstfull(i, offset);
      }
      this.movementMap[i] = uint16;
      this.scoreMap[i] = score;
      if (i % 1000 == 0) console.log(i + " iterations on 65536...");
    }
    console.log(
      "Finished initializing movementMap and scoreMap in " +
        (new Date() - t) +
        " ms..."
    );
  } else {
    this.cells = gr.copyCells();
    this.tiles = gr.tiles;
    this.emptysizeMap = gr.emptysizeMap;
    this.movementMap = gr.movementMap;
    this.scoreMap = gr.scoreMap;
  }
}

Grid4.prototype.emptyCells = function () {
  var posns = 0;
  for (var i = 0; i < this.size; i++) {
    var bit4 = (this.cells[i] & 0xf000) == 0;
    var bit3 = (this.cells[i] & 0x0f00) == 0;
    var bit2 = (this.cells[i] & 0x00f0) == 0;
    var bit1 = (this.cells[i] & 0x000f) == 0;
    posns =
      posns | ((bit1 | (bit2 << 1) | (bit3 << 2) | (bit4 << 3)) << (i * 4));
  }
  return posns;
};
Grid4.prototype.addTile = function (posn, value) {
  if (posn === undefined) {
    var posns = this.emptyCells();
    var len = this.emptysizeMap[posns];
    if (len > 0) {
      var rand = Math.floor(Math.random() * len) + 1;
      var indic = 1;
      for (var k = 1; k <= 0xffff; k = (k << 1) + 1) {
        if (this.emptysizeMap[k & posns] == rand) {
          posn = indic;
          break;
        }
        indic = indic << 1;
      }
    } else {
      console.log("Cannot add tile, board is full.");
      return;
    }
  }
  if (value === undefined) {
    value = Math.random() < 0.9 ? 1 : 2;
  }
  var i = Math.ceil((Math.log(posn) / Math.log(2) + 1) / 4);
  var offs = Math.log(posn >> ((i - 1) * 4)) / Math.log(2);
  this.cells[i - 1] = this.cells[i - 1] | (value << (offs * 4));
  this.tiles.push(new Tile({ x: i - 1, y: offs }, Math.pow(2, value)));
};
Grid4.prototype.moveAndUpdateTiles = function (direction) {
  var score = null;
  if (this.canMove(direction)) {
    score = this.moveComplete(direction);
    this.addTile();
  }
  return score;
};
Grid4.prototype.moveComplete = function (direction) {
  this.clearTileHistory();
  var arr = this.toArray();
  var score = 0;
  var trav = [3, 2, 1, 0];
  var booli = false;
  if (direction == this.UP || direction == this.LEFT) {
    trav = [0, 1, 2, 3];
  }
  if (direction == this.UP || direction == this.DOWN) {
    booli = true;
  }
  if (booli) {
    for (var i = 0; i < this.size; i++) {
      var curr = 0,
        frstfull = null,
        lastfull = null,
        merged = false;
      var lastval = 1;
      while (curr < this.size) {
        frstfull = this.firstfullComplete(
          i,
          trav.slice(curr, trav.length),
          booli,
          arr
        );
        if (frstfull !== null) {
          if (arr[i][trav[curr + frstfull]] == lastval && !merged) {
            arr[i][trav[lastfull]] = lastval * 2;
            lastval = lastval * 2;
            var tile = new Tile({ x: i, y: trav[lastfull] }, lastval);
            var tileprev1 = this.removeTile(i, trav[lastfull]);
            var tileprev2 = this.removeTile(i, trav[curr + frstfull]);
            tileprev1.previousPosition = { x: tileprev1.x, y: tileprev1.y };
            tileprev2.previousPosition = { x: tileprev2.x, y: tileprev2.y };
            tileprev2.y = trav[lastfull];
            tile.mergedFrom = [tileprev1, tileprev2];
            this.tiles.push(tile);
            score += lastval;
            arr[i][trav[curr + frstfull]] = null;
            curr = lastfull + 1;
            merged = true;
          } else if (frstfull > 0) {
            arr[i][trav[curr]] = arr[i][trav[curr + frstfull]];
            arr[i][trav[curr + frstfull]] = null;
            var tile = new Tile({ x: i, y: trav[curr] }, arr[i][trav[curr]]);
            var tileprev = this.removeTile(i, trav[curr + frstfull]);
            tile.previousPosition = { x: tileprev.x, y: tileprev.y };
            this.tiles.push(tile);
            lastfull = curr;
            lastval = arr[i][trav[curr]];
            curr = curr + 1;
            merged = false;
          } else {
            var tile = this.getTile(i, trav[curr + frstfull]);
            tile.previousPosition = { x: tile.x, y: tile.y };
            lastfull = curr;
            lastval = arr[i][trav[curr]];
            curr = curr + 1;
            merged = false;
          }
        } else {
          break;
        }
      }
    }
  } else {
    for (var i = 0; i < this.size; i++) {
      var curr = 0,
        frstfull = null,
        lastfull = null,
        merged = false;
      var lastval = 1;
      while (curr < this.size) {
        frstfull = this.firstfullComplete(
          i,
          trav.slice(curr, trav.length),
          booli,
          arr
        );
        if (frstfull !== null) {
          if (arr[trav[curr + frstfull]][i] == lastval && !merged) {
            arr[trav[lastfull]][i] = lastval * 2;
            lastval = lastval * 2;
            var tile = new Tile({ x: trav[lastfull], y: i }, lastval);
            var tileprev1 = this.removeTile(trav[lastfull], i);
            var tileprev2 = this.removeTile(trav[curr + frstfull], i);
            tileprev1.previousPosition = { x: tileprev1.x, y: tileprev1.y };
            tileprev2.previousPosition = { x: tileprev2.x, y: tileprev2.y };
            tileprev2.x = trav[lastfull];
            tile.mergedFrom = [tileprev1, tileprev2];
            this.tiles.push(tile);
            score += lastval;
            arr[trav[curr + frstfull]][i] = null;
            curr = lastfull + 1;
            merged = true;
          } else if (frstfull > 0) {
            arr[trav[curr]][i] = arr[trav[curr + frstfull]][i];
            arr[trav[curr + frstfull]][i] = null;
            var tile = new Tile({ x: trav[curr], y: i }, arr[trav[curr]][i]);
            var tileprev = this.removeTile(trav[curr + frstfull], i);
            tile.previousPosition = { x: tileprev.x, y: tileprev.y };
            this.tiles.push(tile);
            lastfull = curr;
            lastval = arr[trav[curr]][i];
            curr = curr + 1;
            merged = false;
          } else {
            var tile = this.getTile(trav[curr + frstfull], i);
            tile.previousPosition = { x: tile.x, y: tile.y };
            lastfull = curr;
            lastval = arr[trav[curr]][i];
            curr = curr + 1;
            merged = false;
          }
        } else {
          break;
        }
      }
    }
  }
  this.cells = this.toCells(arr);
  return score;
};
Grid4.prototype.moveBasic = function (direction) {
  if (direction == this.UP) {
    for (var i = 0; i < this.size; i++) {
      this.cells[i] = this.movementMap[this.cells[i]];
    }
  } else if (direction == this.RIGHT) {
    var tempcells = this.transpose();
    for (var i = 0; i < this.size; i++) {
      tempcells[i] = this.movementMap[tempcells[i]];
    }
    this.cells = this.detranspose(tempcells);
  } else if (direction == this.DOWN) {
    for (var i = 0; i < this.size; i++) {
      this.cells[i] = this.reverse(
        this.movementMap[this.reverse(this.cells[i])]
      );
    }
  } else if (direction == this.LEFT) {
    var tempcells = this.detranspose();
    for (var i = 0; i < this.size; i++) {
      tempcells[i] = this.movementMap[tempcells[i]];
    }
    this.cells = this.transpose(tempcells);
  } else {
    console.log("Invalid direction: " + direction + ".");
  }
};
Grid4.prototype.reverse = function (uint16) {
  var newuint16 = 0;
  var offs = 12;
  for (var i = 0xf; i <= 0xf000; i = i << 4) {
    newuint16 = newuint16 | (((i & uint16) >> (12 - offs)) << offs);
    offs = offs - 4;
  }
  return newuint16;
};
Grid4.prototype.transpose = function (cells) {
  if (cells === undefined) {
    cells = this.cells;
  }
  var newcells = new Uint16Array(this.size);
  for (var i = 3; i >= 0; i--) {
    var j = 0;
    for (var mask = 0xf; mask <= 0xf000; mask = mask << 4) {
      var shift = j + (i - 3);
      if (shift >= 0) {
        newcells[j] = newcells[j] | ((cells[i] & mask) >> (shift * 4));
      } else {
        newcells[j] = newcells[j] | ((cells[i] & mask) << (-shift * 4));
      }
      j++;
    }
  }
  return newcells;
};
Grid4.prototype.detranspose = function (cells) {
  if (cells === undefined) {
    cells = this.cells;
  }
  var newcells = new Uint16Array(this.size);
  for (var i = 3; i >= 0; i--) {
    var j = 3;
    for (var mask = 0xf; mask <= 0xf000; mask = mask << 4) {
      var shift = j + (i - 3);
      if (shift >= 0) {
        newcells[j] = newcells[j] | ((cells[i] & mask) << (shift * 4));
      } else {
        newcells[j] = newcells[j] | ((cells[i] & mask) >> (-shift * 4));
      }
      j--;
    }
  }
  return newcells;
};
Grid4.prototype.toArray = function () {
  var arr = [];
  for (var i = 0; i < this.size; i++) {
    var temparr = [];
    var shift = 0;
    for (var mask = 0xf; mask <= 0xf000; mask = mask << 4) {
      var temp = Math.pow(2, (this.cells[i] & mask) >> shift);
      if (temp > 1) {
        temparr.push(temp);
      } else {
        temparr.push(null);
      }
      shift = shift + 4;
    }
    arr.push(temparr);
  }
  return arr;
};
Grid4.prototype.toCells = function (arr) {
  var cells = new Uint16Array(this.size);
  for (var i = 0; i < this.size; i++) {
    var uint16 = 0;
    var shift = 0;
    for (var j = 0; j < this.size; j++) {
      if (arr[i][j])
        uint16 = uint16 | ((Math.log(arr[i][j]) / Math.log(2)) << shift);
      shift = shift + 4;
    }
    cells[i] = uint16;
  }
  return cells;
};
Grid4.prototype.canMove = function (direction) {
  var canmove = false;
  var cellstate = this.copyCells();
  if (direction === undefined) {
    for (direction = 0; direction < this.size; direction++) {
      this.moveBasic(direction);
      if (this.compareCells(cellstate) == false) {
        canmove = true;
        break;
      }
    }
  } else {
    this.moveBasic(direction);
    if (this.compareCells(cellstate) == false) {
      canmove = true;
    }
  }
  if (canmove) this.cells = cellstate;
  return canmove;
};
Grid4.prototype.createNewTiles = function () {
  this.tiles = [];
  var posns = [];
  for (var i = 0; i < this.size; i++) {
    for (var j = 0; j < this.size; j++) {
      if (this.cells[i][j] !== null) posns.push({ x: i, y: j });
    }
  }
  for (var i = 0; i < posns.length; i++) {
    this.tiles.push(new Tile(posns[i], this.cells[posns[i].x][posns[i].y]));
  }
};
Grid4.prototype.firstfull = function (column, offset) {
  var j = 0;
  var offs = offset;
  for (var i = 0xf << offset; i <= 0xf000; i = i << 4) {
    if (i & column) {
      j = i;
      break;
    }
    offs = offs + 4;
  }
  return [j, offs];
};
Grid4.prototype.firstfullComplete = function (i, trav, booli, arr) {
  var j = null;
  if (booli) {
    j = 0;
    while (j < trav.length && arr[i][trav[j]] === null) {
      j++;
    }
  } else {
    j = 0;
    while (j < trav.length && arr[trav[j]][i] === null) {
      j++;
    }
  }
  return j <= trav.length - 1 ? j : null;
};
this.copyCells = function () {
  var copy = [];
  for (var i = 0; i < this.size; i++) {
    copy.push(this.cells[i].slice());
  }
  return copy;
};
Grid4.prototype.compareCells = function (compcells) {
  for (var i = 0; i < this.size; i++) {
    if (this.cells[i] !== compcells[i]) return false;
  }
  return true;
};
Grid4.prototype.clearTileHistory = function () {
  for (var i = 0; i < this.tiles.length; i++) {
    this.tiles[i].previousPosition = null;
    this.tiles[i].mergedFrom = null;
  }
};
Grid4.prototype.getTile = function (i, j) {
  for (var k = 0; k < this.tiles.length; k++) {
    if (this.tiles[k].x == i && this.tiles[k].y == j) {
      return this.tiles[k];
    }
  }
  return null;
};
Grid4.prototype.removeTile = function (i, j) {
  var removed = null;
  for (var k = 0; k < this.tiles.length; k++) {
    if (this.tiles[k].x == i && this.tiles[k].y == j) {
      removed = this.tiles[k];
      this.tiles.splice(k, 1);
    }
  }
  return removed;
};
Grid4.prototype.copyCells = function () {
  var copiedCells = new Uint16Array(this.size);
  for (var i = 0; i < this.size; i++) copiedCells[i] = this.cells[i];
  return copiedCells;
};
Grid4.prototype.copyTiles = function () {
  var copiedTiles = [];
  for (var i = 0; i < this.tiles.length; i++) {
    copiedTiles.push(
      new Tile({ x: this.tiles[i].x, y: this.tiles[i].y }, this.tiles[i].value)
    );
  }
};
Grid4.prototype.clearGrid = function () {
  this.cells = new Uint16Array(this.size);
  this.tiles = [];
};
