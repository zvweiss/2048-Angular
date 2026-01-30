function AI(grid, mon_weight, empty_weight, merge_weight) {
  this.grid = grid;
  this.mon_weight = mon_weight | 1;
  this.empty_weight = empty_weight | 10;
  this.merge_weight = merge_weight | 10;
  this.lost_penalty = 15000;
  this.maxdepth = 3;
  this.minprob = 1e-4;
  this.depth = 0;
  this.movesEvaled = 0;
  this.heurScoreArrAccesses = 0;
  this.heurScore = [];
  console.log("Initializing heurScore map...");
  var t = new Date();
  for (var i = 0; i < this.grid.combUint16; i++) {
    var merges;
    var empty = 0;
    var mon_up = 0;
    var mon_down = 0;
    var moved = this.grid.movementMap[i];
    var emptyaftermove = 0;
    // Count empty tiles
    var cnt = 0;
    var line = [];
    for (var j = 0xf; j <= 0xf000; j <<= 4) {
      if ((i & j) === 0) {
        empty += 1;
      }
      if (moved & (j === 0)) {
        emptyaftermove += 1;
      }
      line.push((i & j) >> cnt);
      cnt += 4;
    }
    merges = empty - emptyaftermove;
    for (var j = 1; j < 4; j++) {
      if (line[j] > line[j - 1]) {
        mon_down += Math.pow(line[j], 3) - Math.pow(line[j - 1], 3);
      } else {
        mon_up += Math.pow(line[j - 1], 3) - Math.pow(line[j], 3);
      }
    }
    this.heurScore[i] =
      empty * this.empty_weight +
      merges * this.merge_weight -
      Math.min(mon_up, mon_down) * this.mon_weight +
      this.lost_penalty / 4;
  }
  console.log(
    "Finished initializing heurScore map in " + (new Date() - t) + "ms."
  );
}
AI.prototype.bestMove = function () {
  var score = 0;
  this.movesEvaled = 0;
  //this.maxdepth = Math.max(this.complexity() - 3,2);
  var best;
  for (var i = 0; i < 4; i++) {
    this.depth = 0;
    this.heurScoreArrAccesses = 0;
    var newscore = this.score(i, this.grid, 1);
    console.log("Move: " + i + ": score: " + newscore);
    if (newscore > score) {
      score = newscore;
      best = i;
    }
  }
  console.log("Evaled: " + this.movesEvaled + " moves.");
  console.log(
    "Made: " + this.heurScoreArrAccesses + " heurScore array accesses."
  );
  return best;
};
AI.prototype.scoreHeur = function (cells) {
  var scoreHeur = 0;
  var transcells = this.grid.transpose(cells);
  for (var j = 0; j < 4; j++) {
    scoreHeur += this.heurScore[cells[j]];
    scoreHeur += this.heurScore[transcells[j]];
  }
  this.heurScoreArrAccesses += 8;
  return scoreHeur;
};

AI.prototype.score = function (direction, grid, prob) {
  var gridtemp = new Grid4(grid);
  var tempcells = gridtemp.copyCells();
  gridtemp.moveBasic(direction);
  this.movesEvaled++;
  if (gridtemp.compareCells(tempcells) === true) return 0;
  if (prob < this.minprob) return this.scoreHeur(grid.cells);
  var emptyposns = gridtemp.emptyCells();
  var emptyCnt = gridtemp.emptysizeMap[emptyposns];
  if (!(this.depth >= this.maxdepth)) {
    this.depth++;
    prob /= emptyCnt;
    var score = 0;
    var i = 0;
    for (var posn = 1; posn < 0x10000; posn <<= 1) {
      if (emptyposns & posn) {
        var cellidx = Math.floor(i / 4);
        // score if 2
        gridtemp.cells[cellidx] |= 1 << ((i ^ (cellidx * 4)) * 4);
        var mxscore = 0;
        for (var dir = 0; dir < 4; dir++) {
          var newscore = this.score(dir, gridtemp, prob * 0.9);
          if (newscore > mxscore) mxscore = newscore;
        }
        score += (0.9 * mxscore) / emptyCnt;
        // score if 4
        gridtemp.cells[cellidx] ^= 3 << ((i ^ (cellidx * 4)) * 4);
        mxscore = 0;
        for (var dir = 0; dir < 4; dir++) {
          var newscore = this.score(dir, gridtemp, prob * 0.1);
          if (newscore > mxscore) mxscore = newscore;
        }
        score += (0.1 * mxscore) / emptyCnt;
      }
      i++;
    }
    this.depth--;
    return score;
  } else {
    var score = 0;
    var i = 0;
    for (var posn = 1; posn < 0x10000; posn <<= 1) {
      if (emptyposns & posn) {
        var tempcells = gridtemp.copyCells();
        var tempcells2 = gridtemp.copyCells();
        var cellidx = Math.floor(i / 4);
        tempcells[cellidx] |= 1 << ((i ^ (cellidx * 4)) * 4);
        tempcells2[cellidx] |= 2 << ((i ^ (cellidx * 4)) * 4);
        score += (0.9 * this.scoreHeur(tempcells)) / emptyCnt;
        score += (0.1 * this.scoreHeur(tempcells2)) / emptyCnt;
      }
      i++;
    }
    return score;
  }
};

AI.prototype.complexity = function () {
  var diff = 0;
  for (var i = 0; i < 4; i++) {
    var shift = 0;
    for (var j = 0xf; j <= 0xf000; j <<= 4) {
      diff |= 1 << ((this.grid.cells[i] & j) >> shift);
      shift += 4;
    }
  }
  return this.countBits(diff) - 1;
};
AI.prototype.countBits = function (smi) {
  smi = smi - ((smi >> 1) & 0x55555555);
  smi = (smi & 0x33333333) + ((smi >> 2) & 0x33333333);
  return (((smi + (smi >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
};
