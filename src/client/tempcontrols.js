function Controls(keymap) {
  this.keymap = keymap || {
    87: 'forward', // w
    83: 'back',    // s
    65: 'left',    // a
    68: 'right',   // d
    32: 'up',      // space
    16: 'down',    // shift
    17: 'lock'     // ctrl
  };
  this.input = Object.fromEntries(Object.entries(this.keymap).map(a => [a[1], false]));

  this.mousemove = e => {};
  this.mousedown = e => {};

  // event listeners
  window.addEventListener('mousemove', e => this.mousemove(e));
  window.addEventListener('mousedown', e => this.mousedown(e));

  window.addEventListener('keydown', () => {
    this.input[this.keymap[event.keyCode]] = true;
    if (this.input.lock) document.getElementById('glcanvas').requestPointerLock();
  });
  window.addEventListener('keyup', () => {
    this.input[this.keymap[event.keyCode]] = false;
  });
}