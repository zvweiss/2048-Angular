/* eslint-disable */
importScripts('/assets/workers/wasm/2048.js');

let modulePromise = null;
let moduleInstance = null;
const pendingMessages = [];

function ensureModule() {
  if (!modulePromise) {
    modulePromise = create2048Module({
      locateFile: (path) => `/assets/workers/wasm/${path}`,
    }).then((module) => {
      moduleInstance = module;
      moduleInstance._init_tables();
      while (pendingMessages.length > 0) {
        handleMessage(pendingMessages.shift());
      }
    });
  }
  return modulePromise;
}

function handleMessage(event) {
  const data = event.data || {};
  const res = moduleInstance._JS_sc(
    data.mindepth,
    data.smartness,
    data.move,
    data.col1,
    data.col2,
    data.col3,
    data.col4
  );
  postMessage({ funct: data.funct, res });
}

onmessage = function (event) {
  if (!moduleInstance) {
    pendingMessages.push(event);
    ensureModule();
    return;
  }
  handleMessage(event);
};
