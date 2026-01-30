function GameManager(grid, inputManager, actuator) {
  this.grid = grid;
  this.stop = true;
  this.smartness = 3;
  this.mindepth = 3;
  this.inputManager = inputManager;
  this.actuator = actuator;
  this.inputManager.setup();
  this.grid.addTile();
  this.grid.addTile();
  this.actuator.actuate(this.grid, { score: 0, won: false });
  this.inputManager.on(
    "move",
    function (data) {
      if (this.grid.canMove()) {
        var score = this.grid.moveAndUpdateTiles(data);
        if (score !== null)
          this.actuator.actuate(this.grid, {
            score: score,
            won: false,
            over: false,
          });
      } else {
        this.stop = true;
        this.actuator.setRunButton("Auto-run");
        this.actuator.actuate(this.grid, { score: 0, won: false, over: true });
      }
    }.bind(this)
  );
  this.inputManager.on(
    "run",
    function () {
      if (this.stop == true) {
        this.stop = false;
        this.autoPlay();
        this.actuator.setRunButton("Stop");
      } else {
        this.stop = true;
        this.actuator.setRunButton("Auto-run");
      }
    }.bind(this)
  );
  this.inputManager.on(
    "restart",
    function () {
      this.grid.clearGrid();
      this.grid.addTile();
      this.grid.addTile();
      this.actuator.score = 0;
      this.actuator.actuate(this.grid, { score: 0, won: false, over: false });
      this.actuator.clearMessage();
    }.bind(this)
  );
  //	this.ai = new AI(grid);
  this.workers = [];
  this.workers[0] = new Worker("js/wrkr.js");
  this.workers[1] = new Worker("js/wrkr.js");
  this.workers[2] = new Worker("js/wrkr.js");
  this.workers[3] = new Worker("js/wrkr.js");
  this.workers[0].onmessage = function (e) {
    var movements = ["UP", "DOWN", "LEFT", "RIGHT"];
    var moves = [0, 2, 3, 1];
    this.workerready[0] = true;
    this.workerresult[0] = e.data.res;
    if (this.allWorkersReady()) {
      var bestScore = 0;
      var bestmove = -1;
      for (var i = 0; i < 4; i++) {
        if (this.workerresult[i] > bestScore) {
          bestmove = i;
          bestScore = this.workerresult[i];
        }
      }
      if (e.data.funct.localeCompare("hint") == 0) {
        alert("Best Move: " + movements[bestmove]);
      } else {
        this.move(moves[bestmove]);
        this.autoPlay();
      }
    }
  }.bind(this);
  this.workers[1].onmessage = function (e) {
    var movements = ["UP", "DOWN", "LEFT", "RIGHT"];
    var moves = [0, 2, 3, 1];
    this.workerready[1] = true;
    this.workerresult[1] = e.data.res;
    if (this.allWorkersReady()) {
      var bestScore = 0;
      var bestmove = -1;
      for (var i = 0; i < 4; i++) {
        if (this.workerresult[i] > bestScore) {
          bestmove = i;
          bestScore = this.workerresult[i];
        }
      }
      if (e.data.funct.localeCompare("hint") == 0) {
        alert("Best Move: " + movements[bestmove]);
      } else {
        this.move(moves[bestmove]);
        this.autoPlay();
      }
    }
  }.bind(this);
  this.workers[2].onmessage = function (e) {
    var movements = ["UP", "DOWN", "LEFT", "RIGHT"];
    var moves = [0, 2, 3, 1];
    this.workerready[2] = true;
    this.workerresult[2] = e.data.res;
    if (this.allWorkersReady()) {
      var bestScore = 0;
      var bestmove = -1;
      for (var i = 0; i < 4; i++) {
        if (this.workerresult[i] > bestScore) {
          bestmove = i;
          bestScore = this.workerresult[i];
        }
      }
      if (e.data.funct.localeCompare("hint") == 0) {
        alert("Best Move: " + movements[bestmove]);
      } else {
        this.move(moves[bestmove]);
        this.autoPlay();
      }
    }
  }.bind(this);
  this.workers[3].onmessage = function (e) {
    var movements = ["UP", "DOWN", "LEFT", "RIGHT"];
    var moves = [0, 2, 3, 1];
    this.workerready[3] = true;
    this.workerresult[3] = e.data.res;
    if (this.allWorkersReady()) {
      var bestScore = 0;
      var bestmove = -1;
      for (var i = 0; i < 4; i++) {
        if (this.workerresult[i] > bestScore) {
          bestmove = i;
          bestScore = this.workerresult[i];
        }
      }
      if (e.data.funct.localeCompare("hint") == 0) {
        alert("Best Move: " + movements[bestmove]);
      } else {
        this.move(moves[bestmove]);
        this.autoPlay();
      }
    }
  }.bind(this);
  this.workerready = [];
  this.workerready[0] = true;
  this.workerready[1] = true;
  this.workerready[2] = true;
  this.workerready[3] = true;
  this.workerresult = [];
  this.workerresult[0] = -1;
  this.workerresult[1] = -1;
  this.workerresult[2] = -1;
  this.workerresult[3] = -1;
  this.inputManager.on(
    "hint",
    function () {
      //		var t = new Date;
      //		var movements = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
      //		alert(movements[this.ai.bestMove()] + '\nCalculated in: ' + (new Date-t) +' ms.'
      //				+ '\n' + this.ai.movesEvaled + ' moves eval\'d'
      //				+ '\n' + this.ai.heurScoreArrAccesses + ' heurScore array access\'s');
      this.setWorkersReady(false);
      this.workers[0].postMessage({
        mindepth: this.mindepth,
        smartness: this.smartness,
        funct: "hint",
        move: 0,
        col1: this.grid.cells[0],
        col2: this.grid.cells[1],
        col3: this.grid.cells[2],
        col4: this.grid.cells[3],
      });
      this.workers[1].postMessage({
        mindepth: this.mindepth,
        smartness: this.smartness,
        funct: "hint",
        move: 1,
        col1: this.grid.cells[0],
        col2: this.grid.cells[1],
        col3: this.grid.cells[2],
        col4: this.grid.cells[3],
      });
      this.workers[2].postMessage({
        mindepth: this.mindepth,
        smartness: this.smartness,
        funct: "hint",
        move: 2,
        col1: this.grid.cells[0],
        col2: this.grid.cells[1],
        col3: this.grid.cells[2],
        col4: this.grid.cells[3],
      });
      this.workers[3].postMessage({
        mindepth: this.mindepth,
        smartness: this.smartness,
        funct: "hint",
        move: 3,
        col1: this.grid.cells[0],
        col2: this.grid.cells[1],
        col3: this.grid.cells[2],
        col4: this.grid.cells[3],
      });
    }.bind(this)
  );
}

GameManager.prototype.autoPlay = function () {
  if (this.stop) return;
  this.setWorkersReady(false);
  this.workers[0].postMessage({
    mindepth: this.mindepth,
    smartness: this.smartness,
    funct: "auto",
    move: 0,
    col1: this.grid.cells[0],
    col2: this.grid.cells[1],
    col3: this.grid.cells[2],
    col4: this.grid.cells[3],
  });
  this.workers[1].postMessage({
    mindepth: this.mindepth,
    smartness: this.smartness,
    funct: "auto",
    move: 1,
    col1: this.grid.cells[0],
    col2: this.grid.cells[1],
    col3: this.grid.cells[2],
    col4: this.grid.cells[3],
  });
  this.workers[2].postMessage({
    mindepth: this.mindepth,
    smartness: this.smartness,
    funct: "auto",
    move: 2,
    col1: this.grid.cells[0],
    col2: this.grid.cells[1],
    col3: this.grid.cells[2],
    col4: this.grid.cells[3],
  });
  this.workers[3].postMessage({
    mindepth: this.mindepth,
    smartness: this.smartness,
    funct: "auto",
    move: 3,
    col1: this.grid.cells[0],
    col2: this.grid.cells[1],
    col3: this.grid.cells[2],
    col4: this.grid.cells[3],
  });
};
GameManager.prototype.move = function (dir) {
  this.inputManager.emit("move", dir);
};
GameManager.prototype.setWorkersReady = function (bool) {
  this.workerready[0] = bool;
  this.workerready[1] = bool;
  this.workerready[2] = bool;
  this.workerready[3] = bool;
};
GameManager.prototype.allWorkersReady = function () {
  if (
    this.workerready[0] &&
    this.workerready[1] &&
    this.workerready[2] &&
    this.workerready[3]
  )
    return true;
  return false;
};
