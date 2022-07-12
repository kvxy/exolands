
(function() {
  
  let then = 0;
  let tick = 0;
  
  const fpsElem = document.getElementById('fps');
  function fps(now) {
    now *= 0.001;
    const deltaTime = now - then;
    then = now;
    const fps = 1 / deltaTime * 60;
    fpsElem.textContent = fps.toFixed(1);
  }

  window.onload = function() {
    const sim = window.sim = new Sim();
    sim.client = true;
    sim.server = true;
    sim.init();
    
    for (let x = -4; x < 4; x ++) {
      for (let y = -1; y < 3; y ++) {
        for (let z = -4; z < 4; z ++) {
          sim.generateChunk(x, y, z);
        }
      }
    }

    draw();
    function draw(now) {
      if (tick % 60 === 0) fps(now);
      sim.draw();
      tick ++;
      requestAnimationFrame(draw);
    }
  };
  
})();