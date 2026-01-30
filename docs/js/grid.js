function Grid(size) {
  this.size = size;
  this.cells = [];
  this.tiles = [];
  for (var i = 0; i < this.size; i++) {
    this.cells[i] = new Array(this.size);
    for (var j = 0; j < this.size; j++) {
      this.cells[i][j] = null;
    }
  }
}

Grid.prototype.emptyCells = function () {
  var posns = [];
  for (var i = 0; i < this.size; i++) {
    for (var j = 0; j < this.size; j++) {
      if (this.cells[i][j] === null) posns.push({ x: i, y: j });
    }
  }
  return posns;
};
Grid.prototype.addTile = function (posn, value) {
  if (posn === undefined) {
    var posns = this.emptyCells();
    if (posns.length > 0) {
      posn = posns[Math.floor(Math.random() * posns.length)];
    }
  }
  if (value === undefined) {
    // Add random tile
    value = Math.random() < 0.9 ? 2 : 4;
  }
  if (posn && !this.cells[posn.x][posn.y]) {
    this.cells[posn.x][posn.y] = value;
  } else {
    console.log("Error: cannot add tile.");
  }
};
Grid.prototype.addTileComplete = function (posn, value) {
  if (posn === undefined) {
    var posns = this.emptyCells();
    if (posns.length > 0) {
      posn = posns[Math.floor(Math.random() * posns.length)];
    }
  }
  if (value === undefined) {
    // Add random tile
    value = Math.random() < 0.9 ? 2 : 4;
  }
  if (posn && !this.cells[posn.x][posn.y]) {
    this.cells[posn.x][posn.y] = value;
    this.tiles.push(new Tile(posn, value));
  } else {
    console.log("Error: cannot add tile.");
  }
};
Grid.prototype.moveAndUpdateTiles = function (direction) {
  var score = null;
  if (this.canMove(direction)) {
    score = this.moveComplete(direction);
    this.addTileComplete();
  }
  return score;
};
Grid.prototype.moveComplete = function (direction) {
  this.clearTileHistory();
  var score = 0;
  var trav = [3, 2, 1, 0];
  var booli = false;
  if (direction == 0 || direction == 3) {
    trav = [0, 1, 2, 3];
  }
  if (direction == 0 || direction == 2) {
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
        frstfull = this.firstfull(i, trav.slice(curr, trav.length), booli);
        if (frstfull !== null) {
          if (this.cells[i][trav[curr + frstfull]] == lastval && !merged) {
            this.cells[i][trav[lastfull]] = lastval * 2;
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
            this.cells[i][trav[curr + frstfull]] = null;
            curr = lastfull + 1;
            merged = true;
          } else if (frstfull > 0) {
            this.cells[i][trav[curr]] = this.cells[i][trav[curr + frstfull]];
            this.cells[i][trav[curr + frstfull]] = null;
            var tile = new Tile(
              { x: i, y: trav[curr] },
              this.cells[i][trav[curr]]
            );
            var tileprev = this.removeTile(i, trav[curr + frstfull]);
            tile.previousPosition = { x: tileprev.x, y: tileprev.y };
            this.tiles.push(tile);
            lastfull = curr;
            lastval = this.cells[i][trav[curr]];
            curr = curr + 1;
            merged = false;
          } else {
            var tile = this.getTile(i, trav[curr + frstfull]);
            tile.previousPosition = { x: tile.x, y: tile.y };
            lastfull = curr;
            lastval = this.cells[i][trav[curr]];
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
        frstfull = this.firstfull(i, trav.slice(curr, trav.length), booli);
        if (frstfull !== null) {
          if (this.cells[trav[curr + frstfull]][i] == lastval && !merged) {
            this.cells[trav[lastfull]][i] = lastval * 2;
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
            this.cells[trav[curr + frstfull]][i] = null;
            curr = lastfull + 1;
            merged = true;
          } else if (frstfull > 0) {
            this.cells[trav[curr]][i] = this.cells[trav[curr + frstfull]][i];
            this.cells[trav[curr + frstfull]][i] = null;
            var tile = new Tile(
              { x: trav[curr], y: i },
              this.cells[trav[curr]][i]
            );
            var tileprev = this.removeTile(trav[curr + frstfull], i);
            tile.previousPosition = { x: tileprev.x, y: tileprev.y };
            this.tiles.push(tile);
            lastfull = curr;
            lastval = this.cells[trav[curr]][i];
            curr = curr + 1;
            merged = false;
          } else {
            var tile = this.getTile(trav[curr + frstfull], i);
            tile.previousPosition = { x: tile.x, y: tile.y };
            lastfull = curr;
            lastval = this.cells[trav[curr]][i];
            curr = curr + 1;
            merged = false;
          }
        } else {
          break;
        }
      }
    }
  }
  return score;
};
Grid.prototype.moveBasic = function (direction) {
  var trav = [3, 2, 1, 0];
  var booli = false;
  if (direction == 0 || direction == 3) {
    trav = [0, 1, 2, 3];
  }
  if (direction == 0 || direction == 2) {
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
        frstfull = this.firstfull(i, trav.slice(curr, trav.length), booli);
        if (frstfull !== null) {
          if (this.cells[i][trav[curr + frstfull]] == lastval && !merged) {
            this.cells[i][trav[lastfull]] = lastval * 2;
            lastval = lastval * 2;
            this.cells[i][trav[curr + frstfull]] = null;
            curr = lastfull + 1;
            merged = true;
          } else if (frstfull > 0) {
            this.cells[i][trav[curr]] = this.cells[i][trav[curr + frstfull]];
            this.cells[i][trav[curr + frstfull]] = null;
            lastfull = curr;
            lastval = this.cells[i][trav[curr]];
            curr = curr + 1;
            merged = false;
          } else {
            lastfull = curr;
            lastval = this.cells[i][trav[curr]];
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
        frstfull = this.firstfull(i, trav.slice(curr, trav.length), booli);
        if (frstfull !== null) {
          if (this.cells[trav[curr + frstfull]][i] == lastval && !merged) {
            this.cells[trav[lastfull]][i] = lastval * 2;
            lastval = lastval * 2;
            this.cells[trav[curr + frstfull]][i] = null;
            curr = lastfull + 1;
            merged = true;
          } else if (frstfull > 0) {
            this.cells[trav[curr]][i] = this.cells[trav[curr + frstfull]][i];
            this.cells[trav[curr + frstfull]][i] = null;
            lastfull = curr;
            lastval = this.cells[trav[curr]][i];
            curr = curr + 1;
            merged = false;
          } else {
            lastfull = curr;
            lastval = this.cells[trav[curr]][i];
            curr = curr + 1;
            merged = false;
          }
        } else {
          break;
        }
      }
    }
  }
};
Grid.prototype.canMove = function (direction) {
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
Grid.prototype.createNewTiles = function () {
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
Grid.prototype.firstfull = function (i, trav, booli) {
  var j = null;
  if (booli) {
    j = 0;
    while (j < trav.length && this.cells[i][trav[j]] === null) {
      j++;
    }
  } else {
    j = 0;
    while (j < trav.length && this.cells[trav[j]][i] === null) {
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
Grid.prototype.compareCells = function (compcells) {
  for (var i = 0; i < this.size; i++) {
    for (var j = 0; j < this.size; j++) {
      if (this.cells[i][j] !== compcells[i][j]) return false;
    }
  }
  return true;
};
Grid.prototype.clearTileHistory = function () {
  for (var i = 0; i < this.tiles.length; i++) {
    this.tiles[i].previousPosition = null;
    this.tiles[i].mergedFrom = null;
  }
};
Grid.prototype.getTile = function (i, j) {
  for (var k = 0; k < this.tiles.length; k++) {
    if (this.tiles[k].x == i && this.tiles[k].y == j) {
      return this.tiles[k];
    }
  }
  return null;
};
Grid.prototype.removeTile = function (i, j) {
  var removed = null;
  for (var k = 0; k < this.tiles.length; k++) {
    if (this.tiles[k].x == i && this.tiles[k].y == j) {
      removed = this.tiles[k];
      this.tiles.splice(k, 1);
    }
  }
  return removed;
};
Grid.prototype.copyCells = function () {
  var copiedCells = [];
  for (var i = 0; i < this.size; i++) copiedCells[i] = this.cells[i].slice();
  return copiedCells;
};
