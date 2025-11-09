// Eco Runner Deluxe - HTML Canvas Game
// Drop this file as game.js and open index.html to play.

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// set logical size for consistent behavior across displays
const W = 900;
const H = 600;
canvas.width = W;
canvas.height = H;

// UI elements
const scoreEl = document.getElementById('score');
const distanceEl = document.getElementById('distance');
const timeEl = document.getElementById('time');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg = document.getElementById('overlayMsg');

const btnPause = document.getElementById('btn-pause');
const btnRestart = document.getElementById('btn-restart');
const btnMute = document.getElementById('btn-mute');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn2 = document.getElementById('restartBtn2');

let muted = false;

// optional audio
const audio = {
  jump: new Audio('assets/jump.wav'),
  collect: new Audio('assets/collect.wav'),
  gameover: new Audio('assets/gameover.wav'),
};
for (const k in audio) {
  audio[k].volume = 0.6;
  audio[k].load?.();
}
function playSfx(name){
  if(muted) return;
  const a = audio[name];
  if(a) {
    try { a.currentTime = 0; a.play(); } catch(e) {}
  }
}

// Game state
let running = true;
let paused = false;
let gameOver = false;
let lastTime = 0;
let elapsed = 0; // seconds
let score = 0;
let distance = 0; // meters (approx)
let speed = 4.2; // base world speed (px per frame unit)
let spawnTimer = 0;
let collectibleTimer = 0;
let obstacleTimer = 0;
let frameCount = 0;
const survivalGoal = 300; // seconds => 5 minutes

// Background layers for parallax
const bgLayers = [
  { x:0, speed: 0.4, color: '#d7f0d9', height: 200 }, // distant treeline
  { x:0, speed: 0.8, color: '#bfe8b9', height: 160 }, // mid trees
  { x:0, speed: 1.2, color: '#95d88f', height: 120 }  // near bushes
];

// Entities
const obstacles = [];
const collectibles = [];

// Player: simple drawn human with running animation frames
const player = {
  x: 140, y: 0, width: 48, height: 92,
  vy: 0, gravity: 28, jumpForce: -720, grounded: false,
  animTime: 0, frame: 0, plantedSeeds: 0, shield: 0
};
player.y = H - 120 - player.height; // ground position offset

const groundY = H - 120; // y value where ground sits

// Input
let touchDown = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') attemptJump();
  if (e.code === 'KeyP') togglePause();
});
canvas.addEventListener('mousedown', (e) => { attemptJump(); });
canvas.addEventListener('touchstart', (e) => { attemptJump(); e.preventDefault(); }, {passive:false});

// Controls
btnPause.onclick = togglePause;
btnRestart.onclick = restartGame;
btnMute.onclick = () => { muted = !muted; btnMute.textContent = muted ? 'Unmute' : 'Mute'; };
resumeBtn.onclick = () => { resume(); };
restartBtn2.onclick = restartGame;
document.getElementById('restartBtn2').onclick = restartGame;

// Jump with physics (time-based)
function attemptJump(){
  if(gameOver) return;
  if(paused) { resume(); return; }
  if(player.grounded){
    player.vy = player.jumpForce * (1 - Math.min(0.4, player.plantedSeeds * 0.06)); 
    // planted seeds slightly improve jump
    player.grounded = false;
    playSfx('jump');
  }
}

// Utility: random
function rand(min, max){ return Math.random() * (max-min) + min; }

// Spawn obstacle (pollution)
function spawnObstacle(){
  // types: cloud, plastic pile
  const type = Math.random() < 0.6 ? 'plastic' : 'cloud';
  const w = type === 'cloud' ? rand(48, 92) : rand(32, 56);
  const h = type === 'cloud' ? rand(36, 60) : rand(24, 40);
  obstacles.push({
    type, x: W + 60, y: (type==='cloud' ? groundY - 200 : groundY - h), width: w, height: h,
    speedFactor: rand(0.95, 1.1)
  });
}

// Spawn collectible (trash or seed)
function spawnCollectible(){
  const type = Math.random() < 0.7 ? 'trash' : 'seed';
  const y = groundY - (type === 'seed' ? rand(140, 220) : rand(90, 140));
  collectibles.push({
    type, x: W + 40, y, width: type==='seed' ? 30 : 28, height: type==='seed' ? 30 : 28
  });
}

// Collision AABB
function collide(a, b){
  return a.x < b.x + b.width &&
         a.x + a.width > b.x &&
         a.y < b.y + b.height &&
         a.y + a.height > b.y;
}

// Game over
function endGame(victory=false){
  gameOver = true; running = false;
  overlay.classList.remove('hidden');
  overlayTitle.textContent = victory ? "Victory!" : "Game Over";
  overlayMsg.textContent = victory ? `You survived ${formatTime(elapsed)} and scored ${score} points.` :
                                     `You lasted ${formatTime(elapsed)}. Score: ${score}.`;
  if(!victory) playSfx('gameover');
}

// Restart
function restartGame(){
  // reset state
  running = true; paused = false; gameOver = false;
  elapsed = 0; score = 0; distance = 0; speed = 4.2;
  obstacles.length = 0; collectibles.length = 0;
  player.y = H - 120 - player.height; player.vy = 0; player.grounded = true; player.plantedSeeds = 0;
  overlay.classList.add('hidden');
  lastTime = performance.now();
  frameCount = 0;
}

// Pause/resume
function togglePause(){ paused ? resume() : pause(); }
function pause(){ paused = true; overlay.classList.remove('hidden'); overlayTitle.textContent='Paused'; overlayMsg.textContent='Tap Resume to continue'; running = false; }
function resume(){ if(!gameOver){ paused = false; overlay.classList.add('hidden'); running = true; lastTime = performance.now(); } }

// format time
function formatTime(s){
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = Math.floor(s%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}

// Draw HUD background ground and parallax
function drawBackground(dt){
  // sky gradient already provided by canvas bg; add layered shapes
  for(let i=0;i<bgLayers.length;i++){
    const layer = bgLayers[i];
    layer.x -= layer.speed * (speed/4) * dt * 60;
    if(layer.x <= -W) layer.x = 0;
    // draw two tiles for seamless scroll
    ctx.fillStyle = layer.color;
    const h = layer.height;
    ctx.fillRect(layer.x, groundY - h, W, h);
    ctx.fillRect(layer.x + W, groundY - h, W, h);
  }

  // ground
  ctx.fillStyle = '#5ea860';
  ctx.fillRect(0, groundY, W, H-groundY);
  // subtle stripes
  for(let i=0;i<20;i++){
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(i*60 + (frameCount%60), groundY + 6, 40, 4);
  }
}

// Draw player as simple human with running legs animation
function drawPlayer(dt){
  player.animTime += dt * 12;
  if(player.animTime > 1) { player.animTime = 0; }
  const legAngle = Math.sin(player.animTime * Math.PI * 2);

  const px = player.x;
  const py = player.y;
  // torso
  ctx.save();
  ctx.translate(px + player.width/2, py + 16);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.ellipse(0 + 6, player.height - 12, 22, 8, 0, 0, Math.PI*2); ctx.fill();

  // body
  ctx.fillStyle = '#3a7d52';
  ctx.fillRect(-14, 0, 28, 44);
  // head
  ctx.fillStyle = '#f6d6b8';
  ctx.beginPath(); ctx.ellipse(0, -16, 16, 18, 0, 0, Math.PI*2); ctx.fill();
  // legs
  ctx.strokeStyle = '#2b4d38'; ctx.lineWidth = 6; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-6, 44);
  ctx.lineTo(-6 + 12 * legAngle, 44 + 26);
  ctx.moveTo(6, 44);
  ctx.lineTo(6 - 12 * legAngle, 44 + 26);
  ctx.stroke();
  // arms
  ctx.beginPath();
  ctx.moveTo(-14, 10);
  ctx.lineTo(-30, 10 + 6 * legAngle);
  ctx.moveTo(14, 10);
  ctx.lineTo(30, 10 - 6 * legAngle);
  ctx.stroke();

  // hair (small)
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(-8, -28, 16, 6);
  ctx.restore();
}

// Draw obstacles
function drawObstacles(dt){
  for(let i = obstacles.length-1; i>=0; i--){
    const o = obstacles[i];
    o.x -= speed * o.speedFactor * (dt*60);
    // draw
    if(o.type === 'cloud'){
      // pollution cloud
      ctx.fillStyle = 'rgba(80,80,80,0.9)';
      ctx.beginPath();
      ctx.ellipse(o.x + o.width*0.3, o.y + o.height*0.4, o.width*0.4, o.height*0.4, 0, 0, Math.PI*2);
      ctx.ellipse(o.x + o.width*0.6, o.y + o.height*0.4, o.width*0.45, o.height*0.45, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(o.x + 4, o.y + 6, o.width - 8, 6);
    } else {
      // plastic pile (box-like)
      ctx.fillStyle = '#6b6b6b';
      ctx.fillRect(o.x, o.y, o.width, o.height);
      ctx.fillStyle = '#424242';
      ctx.fillRect(o.x+6, o.y+6, o.width-12, o.height-12);
    }

    // remove off-screen
    if(o.x + o.width < -40) obstacles.splice(i,1);

    // collision check
    const pl = {x: player.x+6, y: player.y+20, width: player.width-12, height: player.height-20};
    if(collide(pl, o)){
      if(player.shield > 0){ player.shield -= 1; obstacles.splice(i,1); }
      else { endGame(false); }
    }
  }
}

// Draw collectibles
function drawCollectibles(dt){
  for(let i = collectibles.length-1; i>=0; i--){
    const c = collectibles[i];
    c.x -= speed * (dt*60);
    if(c.type === 'trash'){
      // draw small trash bag
      ctx.fillStyle = '#f6c85f';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.width/2, c.height/2, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#6b3f3f';
      ctx.fillRect(c.x - 6, c.y - 8, 12, 4);
    } else {
      // seed (glowing)
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.width/2+2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2c7a2c';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.width/2-4, 0, Math.PI*2); ctx.fill();
    }

    if(c.x + c.width < -40) collectibles.splice(i,1);

    const pl = {x: player.x+6, y: player.y+20, width: player.width-12, height: player.height-20};
    const box = {x: c.x - c.width/2, y: c.y - c.height/2, width: c.width, height: c.height};
    if(collide(pl, box)){
      // collected
      if(c.type === 'trash'){ score += 10; distance += 1; playSfx('collect'); }
      else { score += 40; player.plantedSeeds += 1; player.shield = Math.min(3, player.shield + 1); playSfx('collect'); }
      collectibles.splice(i,1);
    }
  }
}

// Update physics & state
function update(dt){
  if(!running || paused || gameOver) return;

  frameCount++;
  elapsed += dt;
  distance += (speed * dt * 0.18); // convert px to meters-ish
  // increase difficulty gently over time
  if(Math.floor(elapsed) % 15 === 0 && Math.floor(elapsed) !== 0) {
    // small increments occasionally
    speed += 0.0003 * (elapsed); // very gentle increase
  }

  // Update player physics (using per-second units)
  player.vy += player.gravity * dt;
  player.y += player.vy * dt;
  if(player.y + player.height >= groundY){
    player.y = groundY - player.height;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  // Timers for spawn
  obstacleTimer += dt;
  collectibleTimer += dt;

  // spawn rate depends on elapsed
  const obsFreq = Math.max(0.65, 1.6 - elapsed / 180); // seconds
  const colFreq = Math.max(0.9, 2.4 - elapsed / 180);

  if(obstacleTimer > obsFreq){
    spawnObstacle();
    obstacleTimer = 0;
  }
  if(collectibleTimer > colFreq){
    spawnCollectible();
    collectibleTimer = 0;
  }

  // update arrays
  drawObstacles(dt);
  drawCollectibles(dt);

  // victory check (survive 5 minutes)
  if(elapsed >= survivalGoal && !gameOver){
    endGame(true);
  }

  // Update HUD
  scoreEl.textContent = `Score: ${Math.floor(score)}`;
  distanceEl.textContent = `Distance: ${Math.floor(distance)} m`;
  timeEl.textContent = `Time: ${formatTime(elapsed)}`;
}

// Render loop
function render(dt){
  // clear
  ctx.clearRect(0,0,W,H);

  // background layers
  drawBackground(dt);

  // draw collectibles & obstacles handled inside update, but we draw player at correct depth
  // draw player
  drawPlayer(dt);

  // draw HUD on canvas for aesthetic (optional)
  // small indicator for shields/seeds
  ctx.fillStyle = '#ffffffcc';
  ctx.font = '14px Inter, Arial';
  ctx.fillText(`Seeds: ${player.plantedSeeds}`, W - 140, 30);
  ctx.fillText(`Shield: ${player.shield}`, W - 140, 54);
}

// main loop using requestAnimationFrame with delta time
function loop(now){
  if(!lastTime) lastTime = now;
  const dt = Math.min(0.05, (now - lastTime) / 1000); // cap dt to 50ms to prevent huge jumps
  lastTime = now;

  if(running && !paused && !gameOver){
    update(dt);
  }

  render(dt);
  requestAnimationFrame(loop);
}

// Start
lastTime = performance.now();
requestAnimationFrame(loop);

// initial overlay to show instructions briefly
overlay.classList.remove('hidden');
overlayTitle.textContent = 'Eco Runner Deluxe';
overlayMsg.textContent = 'Tap/Click/Space to jump • Survive 5 minutes to win!\nCollect trash and seeds to gain points.';
setTimeout(()=>{ if(!gameOver && !paused) overlay.classList.add('hidden'); }, 2200);
