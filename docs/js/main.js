var gm;
window.requestAnimationFrame(function () {
  gm = new GameManager(new Grid4(), new KInputManager(), new HTMLActuator());
});
document.getElementById("smartness").addEventListener(
  "input",
  function () {
    gm.smartness = parseInt(document.getElementById("smartness").innerHTML);
  },
  false
);
document.getElementById("mindepth").addEventListener(
  "input",
  function () {
    gm.mindepth = parseInt(document.getElementById("mindepth").innerHTML);
  },
  false
);
document
  .getElementsByClassName("score-container")[0]
  .addEventListener("click", function () {
    if (document.getElementById("mindepth").style.display == "inline") {
      document.getElementById("mindepth").style.display = "none";
      document.getElementById("smartness").style.display = "none";
    } else {
      document.getElementById("mindepth").style.display = "inline";
      document.getElementById("smartness").style.display = "inline";
    }
  });
document.getElementById("hint-button").addEventListener("click", function () {
  if (document.getElementById("hint-button").innerHTML == "Smart") {
    document.getElementById("hint-button").innerHTML = "Dumb";
    gm.smartness = 10;
  } else {
    document.getElementById("hint-button").innerHTML = "Smart";
    gm.smartness = 3;
  }
});
