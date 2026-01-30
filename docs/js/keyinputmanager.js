function KInputManager() {
  this.eventmap = {};
  this.map = {
    38: 0, // Up
    39: 1, // Right
    40: 2, // Down
    37: 3, // Left
    75: 0, // vim keybindings
    76: 1,
    74: 2,
    72: 3,
  };
}
KInputManager.prototype.setup = function () {
  var self = this;
  document.addEventListener(
    "keydown",
    function (event) {
      var move = this.map[event.keyCode];
      if (move !== undefined) {
        event.preventDefault();
        this.emit("move", move);
      }
    }.bind(this)
  );
  var runButton = document.getElementById("run-button");
  runButton.addEventListener("click", function (e) {
    e.preventDefault();
    self.emit("run");
  });
  var retry = document.getElementsByClassName("retry-button")[0];
  retry.addEventListener("click", function (e) {
    e.preventDefault();
    self.emit("restart");
  });
};
KInputManager.prototype.emit = function (ev, data) {
  var funct = this.eventmap[ev];
  funct(data);
};
KInputManager.prototype.on = function (ev, funct) {
  this.eventmap[ev] = funct;
};
