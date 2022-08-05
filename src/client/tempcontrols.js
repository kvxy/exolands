function initControls() {
  
  let keymap = {
    87: 'forward', // w
    83: 'back',    // s
    65: 'left',    // a
    68: 'right',   // d
    32: 'up',      // space
    16: 'down',    // shift
    17: 'lock'     // ctrl
  };
  let input = Object.fromEntries(Object.entries(keymap).map(a => [a[1], false]));
  let leftMouse = false;
  let rightMouse = false;
  
  sim.world.player.tick = function() {    
    const speed = 0.05;
    let vx = vy = vz = 0;
    if (input.forward) vz -= speed;
    if (input.back) vz += speed;
    if (input.up) vy += speed;
    if (input.down) vy -= speed;
    if (input.left) vx -= speed;
    if (input.right) vx += speed;
        
    this.moveX(vx);
    this.moveY(vy);
    this.moveZ(vz);
    
    if (sim.ticks % 5 !== 0) return;
    if (leftMouse) sim.world.player.breakBlock();
    if (rightMouse) sim.world.player.placeBlock();
  };
  
  // event listeners
  window.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== null) {
      let rot = sim.world.player.rotation;
      rot[1] -= e.movementX / 500;
      rot[0] += e.movementY / 500;
      if (rot[0] > Math.PI / 2) rot[0] = Math.PI / 2;
      if (rot[0] < -Math.PI / 2) rot[0] = -Math.PI / 2;
    }
  });
  
  window.addEventListener('mousedown', e => {
    if (event.button === 2) {
      rightMouse = true;
    } else if (event.button === 0) {
      leftMouse = true;
    }
  });
  
  window.addEventListener('mouseup', e => {
    if (event.button === 2) {
      rightMouse = false;
    } else if (event.button === 0) {
      leftMouse = false;
    }
  });

  window.addEventListener('keydown', () => {
    input[keymap[event.keyCode]] = true;
    if (input.lock) document.getElementById('glcanvas').requestPointerLock();
  });
  
  window.addEventListener('keyup', () => {
    input[keymap[event.keyCode]] = false;
  });
 
};