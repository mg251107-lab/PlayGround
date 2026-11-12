(() => {
  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const distanceEl = $('#distance'), sparksEl = $('#sparks'), routeFill = $('#routeFill'), routeCar = $('#routeCar');
  const boostFill = $('#boostFill'), moxLine = $('#moxLine'), toast = $('#toast');
  const startOverlay = $('#startOverlay'), finishOverlay = $('#finishOverlay');
  const TOTAL = 1450, SPARK_TARGET = 8;
  let W = 0, H = 0, dpr = 1, running = false, finished = false, last = 0, elapsed = 0;
  let progress = 0, speed = 0, boost = 100, sparks = 0, airborne = 0, airVelocity = 0, lean = 0, shake = 0;
  let keys = {}, touch = { gas: false, brake: false, boost: false }, soundOn = true, audioCtx = null;
  let toastTimer, lastLine = 0;
  const sparkSpots = [118, 276, 419, 574, 737, 906, 1084, 1260];
  const hazards = [196, 350, 515, 674, 842, 1000, 1174, 1360];
  const lines = ['That hill looks very tall. I vote we be taller.','Spark spotted! My snack radar is also beeping.','You’re doing great, Nova. I’m only holding on a little.','A bump! My ears have their own seatbelts, right?','Pip is gonna love this. Especially the dramatic entrance.','If we go fast enough, the dust can’t catch us. Science!','Look at you go! I’m being brave in your general direction.','Nearly there! I can practically smell Pip’s trail mix.'];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const terrain = (m) => H * .75 - (Math.sin(m * .0105) * 22 + Math.sin(m * .023 + 1.4) * 12 + Math.sin(m * .0042 + .4) * 24 + Math.sin(m * .038 + 2.2) * 4 + Math.pow(Math.max(0, Math.sin(m * .0068 + .6)), 8) * 28);
  function resize() {
    const rect = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (!running) draw(0);
  }
  window.addEventListener('resize', resize);
  function beep(freq = 480, duration = .09, type = 'sine') {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * .65), audioCtx.currentTime + duration);
      gain.gain.setValueAtTime(.055, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }
  function say(line, notice) {
    moxLine.textContent = line;
    if (notice) { toast.textContent = notice; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1500); }
  }
  function start() {
    if (running) return;
    if (finished) reset();
    running = true; startOverlay.classList.add('hidden'); finishOverlay.classList.add('hidden');
    last = performance.now(); requestAnimationFrame(loop); beep(340, .12);
    say('Road trip mode: ON. Confidence level: pretending.', 'MOX IS RIDING SHOTGUN');
  }
  function reset() {
    progress = 0; speed = 0; boost = 100; sparks = 0; elapsed = 0; airborne = 0; airVelocity = 0; lean = 0;
    sparkSpots.splice(0, sparkSpots.length, 118, 276, 419, 574, 737, 906, 1084, 1260);
    hazards.splice(0, hazards.length, 196, 350, 515, 674, 842, 1000, 1174, 1360);
    finished = false; running = false; lastLine = 0;
    distanceEl.textContent = '0'; sparksEl.textContent = '0'; routeFill.style.width = '0%'; routeCar.style.left = '0%'; boostFill.style.width = '100%';
    say('Okay, Nova. I packed snacks, a map, and absolutely no fear. (Mostly.)');
    startOverlay.classList.remove('hidden'); finishOverlay.classList.add('hidden'); draw(0);
  }
  function endGame() {
    running = false; finished = true; progress = TOTAL;
    $('#finalSparks').textContent = sparks; $('#finalTime').textContent = formatTime(elapsed);
    $('#finishMessage').textContent = sparks >= SPARK_TARGET ? 'Pip is safe, the truck is muddy, and Mox has a new story.' : 'Pip is safe! Mox says the best treasure was the ride together.';
    finishOverlay.classList.remove('hidden'); say('PIP! I told you we’d make it. I mean, I hoped loudly.', 'FRIENDS REUNITED ✦');
    beep(740, .25, 'triangle'); setTimeout(() => beep(920, .3, 'triangle'), 150);
  }
  function formatTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
  function jump() { if (!running || airborne > 0) return; airborne = 2; airVelocity = 245; beep(240, .08, 'square'); }
  function loop(now) {
    if (!running) return; const dt = Math.min((now - last) / 1000, .04); last = now;
    update(dt); draw(now / 1000); if (progress >= TOTAL) endGame(); if (running) requestAnimationFrame(loop);
  }
  function update(dt) {
    elapsed += dt;
    const gas = keys.ArrowRight || keys.KeyD || touch.gas, braking = keys.ArrowLeft || keys.KeyA || touch.brake;
    const boosting = (keys.Space || touch.boost) && boost > 0;
    const target = gas ? 154 : 92; speed += (target - speed) * dt * (gas ? 1.1 : .55);
    if (braking) speed = Math.max(0, speed - 210 * dt);
    if (boosting) { speed += 170 * dt; boost = Math.max(0, boost - 35 * dt); } else boost = Math.min(100, boost + dt * (sparks ? 8 : 4));
    speed = clamp(speed, 0, 250); progress += speed * dt / 3.6;
    const slope = terrain(progress + 3) - terrain(progress - 3);
    const targetLean = (keys.ArrowUp || keys.KeyW ? -.14 : 0) + (keys.ArrowDown || keys.KeyS ? .18 : 0) + (boosting ? -.08 : 0);
    lean += (targetLean - lean) * dt * 5;
    if (airborne > 0) {
      airVelocity -= 570 * dt; airborne += airVelocity * dt;
      if (airborne <= 0 && airVelocity < 0) { airborne = 0; airVelocity = 0; shake = 5; say('Nailed that landing! My tummy is still up there.', 'SOFT LANDING'); }
    } else if (slope < -18 && speed > 105) { airborne = 2; airVelocity = Math.min(190, speed * .9); }
    if (shake > 0) shake = Math.max(0, shake - dt * 12);
    for (let i = 0; i < sparkSpots.length; i++) {
      const x = sparkSpots[i];
      if (x >= 0 && Math.abs(progress - x) < 9 && airborne < 60) {
        sparkSpots[i] = -1000; sparks++; sparksEl.textContent = sparks; boost = Math.min(100, boost + 20); beep(800 + sparks * 35, .13, 'triangle');
        say(sparks % 2 ? 'Shiny! I’ll guard it with my life. And my pockets.' : lines[(sparks + 1) % lines.length], '✦ SPARK FOUND  +1  ·  BOOST +20');
      }
    }
    for (let i = 0; i < hazards.length; i++) {
      const x = hazards[i];
      if (x >= 0 && Math.abs(progress - x) < 5 && airborne < 10) {
        hazards[i] = -1000; speed *= .55; shake = 7; say('Cactus! It was mostly in my way. Mostly.', 'CACTUS BONK  ·  KEEP ROLLING'); beep(120, .15, 'square');
      }
    }
    const m = Math.floor(progress / 170);
    if (m > lastLine) { lastLine = m; if (m < 8 && Math.random() > .35) say(lines[m % lines.length]); }
    distanceEl.textContent = Math.floor(progress).toString();
    const pct = clamp(progress / TOTAL * 100, 0, 100); routeFill.style.width = `${pct}%`; routeCar.style.left = `${pct}%`;
    boostFill.style.width = `${boost}%`; boostFill.style.background = boost < 20 ? '#ff7448' : '';
  }
  function draw(time = 0) {
    if (!W || !H) return;
    ctx.save(); const jx = shake ? (Math.random() - .5) * shake : 0; ctx.translate(jx, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#f4c985'); sky.addColorStop(.58, '#eab576'); sky.addColorStop(1, '#cd9362');
    ctx.fillStyle = sky; ctx.fillRect(-10, 0, W + 20, H);
    ctx.fillStyle = '#fff0bd'; ctx.globalAlpha = .78; ctx.beginPath(); ctx.arc(W * .79, H * .23, Math.min(H * .105, 64), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#d69467'; ctx.beginPath(); ctx.moveTo(0, H * .55);
    for (let x = 0; x <= W + 20; x += 4) { const wx = progress * .24 + x / W * 5; ctx.lineTo(x, H * .53 + Math.sin(wx * 1.6) * H * .04 + Math.sin(wx * .47) * H * .035); }
    ctx.lineTo(W + 20, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bb805b'; ctx.beginPath(); ctx.moveTo(0, H * .68);
    for (let x = 0; x <= W + 20; x += 4) { const wx = progress * .45 + x / W * 7; ctx.lineTo(x, H * .65 + Math.sin(wx * 1.25 + 2) * H * .045 + Math.sin(wx * .48) * H * .025); }
    ctx.lineTo(W + 20, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    const scale = 1.12, carX = W * .28;
    const worldAt = (sx) => progress + (sx - carX) / scale, groundY = (sx) => terrain(worldAt(sx));
    ctx.beginPath(); ctx.moveTo(-2, H + 5); for (let sx = -3; sx <= W + 3; sx += 3) ctx.lineTo(sx, groundY(sx));
    ctx.lineTo(W + 3, H + 5); ctx.closePath();
    const dirt = ctx.createLinearGradient(0, H * .66, 0, H); dirt.addColorStop(0, '#b97646'); dirt.addColorStop(.08, '#aa6039'); dirt.addColorStop(1, '#78442f'); ctx.fillStyle = dirt; ctx.fill();
    ctx.beginPath(); for (let sx = -3; sx <= W + 3; sx += 3) { const y = groundY(sx); if (sx === -3) ctx.moveTo(sx, y); else ctx.lineTo(sx, y); }
    ctx.strokeStyle = '#efd08d'; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); for (let sx = -3; sx <= W + 3; sx += 3) { const y = groundY(sx) + 4; if (sx === -3) ctx.moveTo(sx, y); else ctx.lineTo(sx, y); }
    ctx.strokeStyle = '#d89a5c'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 22; i++) { const sx = ((i * 103 - (progress * scale) % 103) + W + 103) % W, sy = groundY(sx) + 20 + (i % 4) * 13; ctx.fillStyle = i % 2 ? '#d0925b' : '#8d5038'; ctx.globalAlpha = .55; ctx.fillRect(sx, sy, 8 + (i % 4) * 3, 2); ctx.globalAlpha = 1; }
    for (const m of hazards) { const sx = carX + (m - progress) * scale; if (m >= 0 && sx >= -40 && sx <= W + 40) drawCactus(sx, groundY(sx)); }
    for (const m of sparkSpots) {
      const sx = carX + (m - progress) * scale; if (m < 0 || sx < -30 || sx > W + 30) continue;
      const sy = groundY(sx) - 48 - Math.sin(time * 4 + m) * 5; ctx.save(); ctx.translate(sx, sy); ctx.rotate(time * 1.5);
      ctx.shadowColor = '#fff09b'; ctx.shadowBlur = 17; ctx.fillStyle = '#fff0a0'; ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(3, -3); ctx.lineTo(11, 0); ctx.lineTo(3, 3); ctx.lineTo(0, 11); ctx.lineTo(-3, 3); ctx.lineTo(-11, 0); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
    }
    const finishX = carX + (TOTAL - progress) * scale; if (finishX < W + 180 && finishX > -180) drawLookout(finishX, groundY(finishX), time);
    drawTruck(carX, groundY(carX) - 8 - airborne, time); ctx.restore();
  }
  function drawCactus(x, y) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#477044'; ctx.strokeStyle = '#365837'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-5, -31, 10, 32, 5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-15, -23, 9, 20, 5); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.roundRect(-15, -23, 11, 8, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(6, -18, 9, 17, 5); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.roundRect(1, -18, 13, 8, 4); ctx.fill(); ctx.restore();
  }
  function drawLookout(x, y, time) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#f0d49b'; ctx.fillRect(-3, -86, 6, 86);
    ctx.strokeStyle = '#f0d49b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3, -76); ctx.lineTo(-24, -45); ctx.moveTo(3, -76); ctx.lineTo(24, -45); ctx.stroke();
    ctx.fillStyle = '#e86d4b'; ctx.beginPath(); ctx.moveTo(-25, -84); ctx.lineTo(30, -84); ctx.lineTo(3, -62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9f17d'; ctx.beginPath(); ctx.arc(34, -42 + Math.sin(time * 4) * 3, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#584b58'; ctx.beginPath(); ctx.arc(30, -45, 2, 0, 7); ctx.arc(38, -45, 2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#584b58'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(34, -41, 4, .2, 2.8); ctx.stroke();
    ctx.fillStyle = '#f5efdd'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText('PIP!', 0, -92); ctx.restore();
  }
  function drawTruck(x, y, time) {
    const scale = clamp(W / 850, .7, 1);
    const slope = Math.atan2(terrain(progress + 5) - terrain(progress - 5), 11);
    ctx.save(); ctx.translate(x, y); ctx.rotate(slope * .72 + lean); ctx.scale(scale, scale);
    // Dust puff and soft shadow.
    ctx.fillStyle = '#663e2f'; ctx.globalAlpha = .2; ctx.beginPath(); ctx.ellipse(-4, 5, 54, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (speed > 110 && Math.random() > .35) { ctx.fillStyle = '#f1d09a88'; ctx.beginPath(); ctx.arc(-49 - Math.random() * 12, 1 + Math.random() * 8, 3 + Math.random() * 4, 0, Math.PI * 2); ctx.fill(); }
    // Big knobby wheels.
    for (const wx of [-27, 29]) {
      ctx.fillStyle = '#202522'; ctx.beginPath(); ctx.arc(wx, -8, 19, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#393e38'; ctx.lineWidth = 3;
      for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4 + time * speed * .012; ctx.beginPath(); ctx.moveTo(wx + Math.cos(ang) * 14, -8 + Math.sin(ang) * 14); ctx.lineTo(wx + Math.cos(ang) * 18, -8 + Math.sin(ang) * 18); ctx.stroke(); }
      ctx.fillStyle = '#a4a994'; ctx.beginPath(); ctx.arc(wx, -8, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#646d5e'; ctx.beginPath(); ctx.arc(wx, -8, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Lifted body, fenders, windshield and friendly monster passenger.
    ctx.fillStyle = '#263126'; ctx.beginPath(); ctx.roundRect(-47, -46, 91, 29, 8); ctx.fill();
    ctx.fillStyle = '#d8ef91'; ctx.beginPath(); ctx.moveTo(-44, -44); ctx.lineTo(-24, -65); ctx.quadraticCurveTo(-20, -69, -11, -68); ctx.lineTo(12, -66); ctx.lineTo(27, -46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#343e32'; ctx.beginPath(); ctx.moveTo(-17, -63); ctx.lineTo(-10, -63); ctx.lineTo(-10, -48); ctx.lineTo(-35, -48); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#445542'; ctx.beginPath(); ctx.moveTo(-6, -63); ctx.lineTo(10, -62); ctx.lineTo(22, -48); ctx.lineTo(-6, -48); ctx.closePath(); ctx.fill();
    // Mox’s little passenger silhouette in the cab.
    ctx.fillStyle = '#9473ce'; ctx.beginPath(); ctx.arc(5, -57, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f0dc'; ctx.beginPath(); ctx.arc(2, -58, 2, 0, Math.PI * 2); ctx.arc(8, -58, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#30342b'; ctx.beginPath(); ctx.arc(2, -58, 1, 0, Math.PI * 2); ctx.arc(8, -58, 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1784b'; ctx.beginPath(); ctx.roundRect(-46, -34, 88, 16, 5); ctx.fill();
    ctx.fillStyle = '#f4d284'; ctx.fillRect(31, -42, 9, 5); ctx.fillStyle = '#f7e7b6'; ctx.fillRect(-45, -42, 5, 5);
    ctx.fillStyle = '#202922'; ctx.fillRect(9, -38, 17, 3);
    ctx.strokeStyle = '#252b24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-39, -18); ctx.lineTo(-35, -11); ctx.moveTo(35, -18); ctx.lineTo(34, -11); ctx.stroke();
    ctx.restore();
  }
  function bindHold(id, prop) {
    const el = $(id); if (!el) return;
    const down = (e) => { e.preventDefault(); touch[prop] = true; if (!running) start(); };
    const up = (e) => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  }
  bindHold('#gasBtn', 'gas'); bindHold('#brakeBtn', 'brake'); bindHold('#boostBtn', 'boost');
  $('#startBtn').addEventListener('click', start); $('#againBtn').addEventListener('click', reset);
  $('#soundBtn').addEventListener('click', () => {
    soundOn = !soundOn; $('#soundIcon').textContent = soundOn ? '♫' : '♪';
    $('.sound-label').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    if (soundOn) beep(520, .08);
  });
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
    if ((e.code === 'Space' || e.code === 'Enter') && !running && !finished) start();
    if (e.code === 'ArrowUp' && !e.repeat) jump();
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { keys = {}; touch = { gas: false, brake: false, boost: false }; });
  resize();
})();
