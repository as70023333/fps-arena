import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const container = document.getElementById("gameContainer");
const playerHealthBar = document.getElementById("playerHealthBar");
const enemyHealthBar = document.getElementById("enemyHealthBar");
const playerHealthText = document.getElementById("playerHealthText");
const enemyHealthText = document.getElementById("enemyHealthText");
const statusOverlay = document.getElementById("statusOverlay");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const restartButton = document.getElementById("restartButton");
const announcer = document.querySelector(".top-bar p");
const roundText = document.getElementById("roundText");
const scoreText = document.getElementById("scoreText");
const matchText = document.getElementById("matchText");
const ammoText = document.getElementById("ammoText");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1326);
scene.fog = new THREE.Fog(0x0d1326, 20, 85);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0x88bbff, 0x182131, 0.82);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff4dc, 0.82);
sun.position.set(15, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const ARENA_LIMIT = 34;
const PLAYER_HEIGHT = 1.7;

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 140),
  new THREE.MeshStandardMaterial({ color: 0x142033, roughness: 0.86, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function makeWall(x, z, width, depth) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, 5.5, depth),
    new THREE.MeshStandardMaterial({ color: 0x283755, roughness: 0.8, metalness: 0.15 })
  );
  wall.position.set(x, 2.75, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}

makeWall(0, -ARENA_LIMIT - 1.5, 72, 3);
makeWall(0, ARENA_LIMIT + 1.5, 72, 3);
makeWall(-ARENA_LIMIT - 1.5, 0, 3, 72);
makeWall(ARENA_LIMIT + 1.5, 0, 3, 72);

const pillars = [];
for (let i = 0; i < 8; i += 1) {
  const angle = (i / 8) * Math.PI * 2;
  const r = 15 + (i % 2) * 8;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.2, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0x364f6d, roughness: 0.72, metalness: 0.2 })
  );
  pillar.position.set(Math.cos(angle) * r, 3, Math.sin(angle) * r);
  pillar.castShadow = true;
  pillar.receiveShadow = true;
  scene.add(pillar);
  pillars.push({ x: pillar.position.x, z: pillar.position.z, radius: 2.5 });
}

const player = {
  position: new THREE.Vector3(0, PLAYER_HEIGHT, 24),
  yaw: Math.PI,
  health: 100,
  speed: 17,
  turnSpeed: 2.2,
  shootCooldown: 0,
  clipSize: 10,
  ammoInClip: 10,
  reloadDuration: 1.1,
  reloadTimer: 0,
  reloading: false,
  bloom: 0,
  bloomDecay: 2.2,
};

const enemy = {
  mesh: new THREE.Group(),
  health: 100,
  speed: 7,
  shootCooldown: 0,
  strafeClock: 0,
  damage: 12,
  accuracy: 0.62,
  fireMinCooldown: 0.32,
  fireMaxCooldown: 0.55,
};

const enemyBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(1.15, 2.4, 6, 14),
  new THREE.MeshStandardMaterial({
    color: 0xff5f86,
    emissive: 0x46111f,
    emissiveIntensity: 0.65,
    roughness: 0.46,
    metalness: 0.28,
  })
);
enemyBody.castShadow = true;
enemyBody.receiveShadow = true;
enemyBody.position.y = 2.45;

enemy.mesh.add(enemyBody);

const enemyCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0xffecb3, emissive: 0xff8c57, emissiveIntensity: 1.4 })
);
enemyCore.position.y = 3.9;
enemy.mesh.add(enemyCore);

const enemyMarker = new THREE.Mesh(
  new THREE.RingGeometry(1.45, 2.05, 24),
  new THREE.MeshBasicMaterial({ color: 0xff3f6b, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
);
enemyMarker.rotation.x = -Math.PI / 2;
enemyMarker.position.y = 0.06;
enemy.mesh.add(enemyMarker);

enemy.mesh.position.set(0, 0, 6);
scene.add(enemy.mesh);

camera.position.copy(player.position);

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  Space: false,
};

const bullets = [];
const BULLET_SPEED = 45;
const BULLET_LIFE = 2.2;
const ENEMY_AGGRO_RANGE = 90;
const HEALTH_PICKUP_HEAL = 24;
const HEALTH_PICKUP_RESPAWN_MIN = 6;
const HEALTH_PICKUP_RESPAWN_MAX = 10;
const MATCH_TARGET_WINS = 3;
const clock = new THREE.Clock();
let gameOver = false;
let announceTimeout = null;
const CONTROL_HINT =
  "Arrow keys move/turn. Space fires. R reloads. Esc ends round. R next round. N new match.";
const match = {
  round: 1,
  playerWins: 0,
  cpuWins: 0,
};

const healthPickup = {
  mesh: null,
  active: false,
  timer: 4,
};

function refreshScoreboard() {
  if (roundText) {
    roundText.textContent = `Round ${match.round}`;
  }

  if (scoreText) {
    scoreText.textContent = `You ${match.playerWins} - ${match.cpuWins} CPU`;
  }

  if (matchText) {
    const playerToWin = MATCH_TARGET_WINS - match.playerWins;
    const cpuToWin = MATCH_TARGET_WINS - match.cpuWins;
    if (playerToWin === 1 || cpuToWin === 1) {
      matchText.textContent = "Match Point";
    } else {
      matchText.textContent = `First to ${MATCH_TARGET_WINS}`;
    }
  }
}

function updateAmmoHud() {
  if (!ammoText) {
    return;
  }

  if (player.reloading) {
    ammoText.textContent = `Reloading ${player.ammoInClip}/${player.clipSize}`;
  } else {
    ammoText.textContent = `Ammo ${player.ammoInClip}/${player.clipSize}`;
  }
}

function startReload() {
  if (gameOver || player.reloading || player.ammoInClip >= player.clipSize) {
    return;
  }

  player.reloading = true;
  player.reloadTimer = player.reloadDuration;
  announce("Reloading.");
  updateAmmoHud();
}

function applyRoundDifficulty() {
  const level = Math.max(1, match.round);
  enemy.speed = Math.min(11.8, 6.2 + level * 0.55);
  enemy.damage = Math.min(24, 10 + level * 1.3);
  enemy.accuracy = Math.min(0.93, 0.58 + level * 0.045);
  enemy.fireMinCooldown = Math.max(0.2, 0.45 - level * 0.02);
  enemy.fireMaxCooldown = Math.max(0.34, 0.72 - level * 0.025);
}

function createHealthPickup() {
  const pickup = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.65, 0),
    new THREE.MeshStandardMaterial({ color: 0x5fffd1, emissive: 0x1d6a57, emissiveIntensity: 0.95 })
  );
  core.castShadow = true;
  core.receiveShadow = true;
  pickup.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.08, 12, 28),
    new THREE.MeshBasicMaterial({ color: 0xa7ffe8, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = Math.PI / 2;
  pickup.add(ring);

  pickup.position.set(0, 1.45, 0);
  pickup.visible = false;
  scene.add(pickup);
  healthPickup.mesh = pickup;
}

function randomPickupTimer() {
  return HEALTH_PICKUP_RESPAWN_MIN + Math.random() * (HEALTH_PICKUP_RESPAWN_MAX - HEALTH_PICKUP_RESPAWN_MIN);
}

function spawnHealthPickup() {
  if (!healthPickup.mesh) {
    return;
  }

  for (let tries = 0; tries < 14; tries += 1) {
    const x = THREE.MathUtils.randFloatSpread((ARENA_LIMIT - 6) * 2);
    const z = THREE.MathUtils.randFloatSpread((ARENA_LIMIT - 6) * 2);
    if (collidesPillar(x, z, 1.2)) {
      continue;
    }

    healthPickup.mesh.position.set(x, 1.45, z);
    healthPickup.mesh.visible = true;
    healthPickup.active = true;
    announce("Health pickup spawned.");
    return;
  }
}

function despawnHealthPickup() {
  if (!healthPickup.mesh) {
    return;
  }

  healthPickup.mesh.visible = false;
  healthPickup.active = false;
  healthPickup.timer = randomPickupTimer();
}

function announce(message, sticky = false) {
  if (!announcer) {
    return;
  }

  announcer.textContent = message;
  if (announceTimeout) {
    clearTimeout(announceTimeout);
    announceTimeout = null;
  }

  if (!sticky) {
    announceTimeout = setTimeout(() => {
      announcer.textContent = CONTROL_HINT;
      announceTimeout = null;
    }, 1500);
  }
}

function makeBullet(position, direction, owner) {
  const matColor = owner === "player" ? 0x7bffcb : 0xffa07c;
  const bulletRadius = owner === "player" ? 0.22 : 0.3;
  const emissiveIntensity = owner === "player" ? 0.5 : 0.95;
  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(bulletRadius, 10, 10),
    new THREE.MeshStandardMaterial({ color: matColor, emissive: matColor, emissiveIntensity })
  );
  bullet.position.copy(position);
  bullet.castShadow = true;
  scene.add(bullet);

  bullets.push({
    mesh: bullet,
    velocity: direction.clone().multiplyScalar(BULLET_SPEED),
    owner,
    life: BULLET_LIFE,
    damage: owner === "player" ? 12 : enemy.damage,
  });
}

function clampToArena(vec, margin = 0.5) {
  vec.x = THREE.MathUtils.clamp(vec.x, -ARENA_LIMIT + margin, ARENA_LIMIT - margin);
  vec.z = THREE.MathUtils.clamp(vec.z, -ARENA_LIMIT + margin, ARENA_LIMIT - margin);
}

function collidesPillar(x, z, buffer = 0.9) {
  for (const pillar of pillars) {
    const dx = x - pillar.x;
    const dz = z - pillar.z;
    if (dx * dx + dz * dz < (pillar.radius + buffer) * (pillar.radius + buffer)) {
      return true;
    }
  }
  return false;
}

function updateHUD() {
  playerHealthBar.style.width = `${Math.max(player.health, 0)}%`;
  enemyHealthBar.style.width = `${Math.max(enemy.health, 0)}%`;
  playerHealthText.textContent = `${Math.max(0, Math.ceil(player.health))}`;
  enemyHealthText.textContent = `${Math.max(0, Math.ceil(enemy.health))}`;
}

function endGame(result) {
  if (gameOver) {
    return;
  }

  gameOver = true;
  statusOverlay.classList.remove("hidden");

  if (result === "win") {
    match.playerWins += 1;
  } else {
    match.cpuWins += 1;
  }

  const playerMatchWin = match.playerWins >= MATCH_TARGET_WINS;
  const cpuMatchWin = match.cpuWins >= MATCH_TARGET_WINS;

  if (playerMatchWin || cpuMatchWin) {
    statusTitle.textContent = playerMatchWin ? "Match Champion: You" : "Match Champion: CPU";
    statusText.textContent =
      `Trophy awarded. First to ${MATCH_TARGET_WINS} secured. Press N for a new match or R to keep playing.`;
    announce(playerMatchWin ? "You won the full match." : "CPU won the full match.", true);
    refreshScoreboard();
    despawnHealthPickup();
    return;
  }

  if (result === "win") {
    statusTitle.textContent = "Round Win";
    statusText.textContent = "Opponent health reached zero. Press R or click for next round.";
    announce("Victory this round.", true);
    refreshScoreboard();
    despawnHealthPickup();
    return;
  }

  if (result === "escape") {
    statusTitle.textContent = "Match Ended";
    statusText.textContent = "You pressed Esc to forfeit this round. Press R or click for next round.";
    announce("Round forfeited. CPU takes the round.", true);
    refreshScoreboard();
    despawnHealthPickup();
    return;
  }

  statusTitle.textContent = "Round Lost";
  statusText.textContent = "Your health reached zero. Press R or click for next round.";
  announce("Defeat. Opponent wins this round.", true);
  refreshScoreboard();
  despawnHealthPickup();
}

function resetGame() {
  applyRoundDifficulty();

  player.position.set(0, PLAYER_HEIGHT, 24);
  player.yaw = Math.PI;
  player.health = 100;
  player.shootCooldown = 0;
  player.ammoInClip = player.clipSize;
  player.reloadTimer = 0;
  player.reloading = false;
  player.bloom = 0;

  enemy.mesh.position.set(0, 0, 6);
  enemy.health = 100;
  enemy.shootCooldown = enemy.fireMinCooldown;
  enemy.strafeClock = 0;

  for (const shot of bullets) {
    scene.remove(shot.mesh);
  }
  bullets.length = 0;

  if (healthPickup.mesh) {
    healthPickup.mesh.visible = false;
  }
  healthPickup.active = false;
  healthPickup.timer = randomPickupTimer();

  gameOver = false;
  statusOverlay.classList.add("hidden");
  updateHUD();
  refreshScoreboard();
  updateAmmoHud();
  announce(`Round ${match.round} live. CPU accuracy ${Math.round(enemy.accuracy * 100)}%.`);
}

function tryPlayerShot() {
  if (player.shootCooldown > 0 || gameOver || player.reloading) {
    return;
  }

  if (player.ammoInClip <= 0) {
    startReload();
    return;
  }

  const spread = 0.01 + player.bloom * 0.045;
  const dir = new THREE.Vector3(
    Math.sin(player.yaw) + (Math.random() - 0.5) * spread,
    0,
    Math.cos(player.yaw) + (Math.random() - 0.5) * spread
  ).normalize();
  const start = player.position.clone().add(dir.clone().multiplyScalar(1.1));
  start.y -= 0.25;

  makeBullet(start, dir, "player");
  player.ammoInClip -= 1;
  player.bloom = Math.min(1.2, player.bloom + 0.23);
  player.shootCooldown = 0.23;
  updateAmmoHud();

  if (player.ammoInClip <= 0) {
    startReload();
  }
}

function enemyBrain(delta) {
  if (gameOver) {
    return;
  }

  const enemyPos = enemy.mesh.position;
  const toPlayer = new THREE.Vector3(
    player.position.x - enemyPos.x,
    0,
    player.position.z - enemyPos.z
  );
  const distance = toPlayer.length();

  enemy.strafeClock += delta;

  const forward = toPlayer.clone().normalize();
  const strafe = new THREE.Vector3(-forward.z, 0, forward.x);
  let moveVector = new THREE.Vector3();

  if (distance > 18) {
    moveVector.add(forward);
  } else if (distance < 10) {
    moveVector.sub(forward);
  }

  moveVector.add(strafe.multiplyScalar(Math.sin(enemy.strafeClock * 2.4) * 0.75));

  if (moveVector.lengthSq() > 0.001) {
    moveVector.normalize().multiplyScalar(enemy.speed * delta);
    const nextX = enemyPos.x + moveVector.x;
    const nextZ = enemyPos.z + moveVector.z;

    if (!collidesPillar(nextX, nextZ, 1.1)) {
      enemyPos.x = nextX;
      enemyPos.z = nextZ;
      clampToArena(enemyPos, 1.4);
    }
  }

  enemy.mesh.lookAt(player.position.x, enemy.mesh.position.y + 1.8, player.position.z);

  if (enemy.shootCooldown <= 0 && distance < ENEMY_AGGRO_RANGE) {
    const shotStart = enemyPos.clone().setY(2.2);
    const aimTarget = new THREE.Vector3(player.position.x, player.position.y - 0.15, player.position.z);
    const baseDir = aimTarget.sub(shotStart).normalize();
    const aimError = (1 - enemy.accuracy) * (0.42 + (distance / ENEMY_AGGRO_RANGE) * 0.35);
    const shotDir = baseDir
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * aimError,
          (Math.random() - 0.5) * aimError * 0.32,
          (Math.random() - 0.5) * aimError
        )
      )
      .normalize();
    shotStart.add(shotDir.clone().multiplyScalar(1.3));
    makeBullet(shotStart, shotDir, "enemy");
    enemy.shootCooldown =
      enemy.fireMinCooldown + Math.random() * (enemy.fireMaxCooldown - enemy.fireMinCooldown);
  }
}

function updateHealthPickup(delta) {
  if (!healthPickup.mesh || gameOver) {
    return;
  }

  if (!healthPickup.active) {
    healthPickup.timer -= delta;
    if (healthPickup.timer <= 0) {
      spawnHealthPickup();
    }
    return;
  }

  healthPickup.mesh.rotation.y += delta * 2.1;
  healthPickup.mesh.position.y = 1.45 + Math.sin(performance.now() * 0.004) * 0.16;

  const pickupPos = healthPickup.mesh.position;
  const playerDistance = pickupPos.distanceTo(player.position);
  if (playerDistance < 1.8) {
    player.health = Math.min(100, player.health + HEALTH_PICKUP_HEAL);
    announce(`Health pickup collected. You healed to ${Math.ceil(player.health)}.`);
    despawnHealthPickup();
    return;
  }

  const enemyDistance = pickupPos.distanceTo(enemy.mesh.position.clone().setY(1.45));
  if (enemyDistance < 1.8) {
    enemy.health = Math.min(100, enemy.health + HEALTH_PICKUP_HEAL);
    announce(`CPU collected health. Opponent at ${Math.ceil(enemy.health)}.`);
    despawnHealthPickup();
  }
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const shot = bullets[i];
    shot.life -= delta;
    shot.mesh.position.addScaledVector(shot.velocity, delta);

    const pos = shot.mesh.position;
    if (
      shot.life <= 0 ||
      Math.abs(pos.x) > ARENA_LIMIT + 4 ||
      Math.abs(pos.z) > ARENA_LIMIT + 4 ||
      collidesPillar(pos.x, pos.z, 0.35)
    ) {
      scene.remove(shot.mesh);
      bullets.splice(i, 1);
      continue;
    }

    if (shot.owner === "player") {
      const distEnemy = pos.distanceTo(enemy.mesh.position.clone().setY(2));
      if (distEnemy < 1.4) {
        enemy.health -= shot.damage;
        scene.remove(shot.mesh);
        bullets.splice(i, 1);
        if (enemy.health <= 0) {
          enemy.health = 0;
          endGame("win");
        } else {
          announce(`Direct hit. Opponent health: ${Math.ceil(enemy.health)}`);
        }
      }
    } else {
      const distPlayer = pos.distanceTo(player.position);
      if (distPlayer < 1.0) {
        player.health -= shot.damage;
        scene.remove(shot.mesh);
        bullets.splice(i, 1);
        if (player.health <= 0) {
          player.health = 0;
          endGame("lose");
        } else {
          announce(`You were hit. Your health: ${Math.ceil(player.health)}`);
        }
      }
    }
  }
}

function updatePlayer(delta) {
  if (gameOver) {
    return;
  }

  if (keys.ArrowLeft) {
    player.yaw += player.turnSpeed * delta;
  }
  if (keys.ArrowRight) {
    player.yaw -= player.turnSpeed * delta;
  }

  const moveSign = (keys.ArrowUp ? 1 : 0) + (keys.ArrowDown ? -1 : 0);
  if (moveSign !== 0) {
    const dir = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const step = dir.multiplyScalar(player.speed * delta * moveSign);
    const nextX = player.position.x + step.x;
    const nextZ = player.position.z + step.z;
    if (!collidesPillar(nextX, nextZ, 0.8)) {
      player.position.x = nextX;
      player.position.z = nextZ;
      clampToArena(player.position, 1.1);
    }
  }

  if (keys.Space) {
    tryPlayerShot();
  }

  if (player.shootCooldown > 0) {
    player.shootCooldown -= delta;
  }

  if (player.reloading) {
    player.reloadTimer -= delta;
    if (player.reloadTimer <= 0) {
      player.reloading = false;
      player.ammoInClip = player.clipSize;
      announce("Reload complete.");
      updateAmmoHud();
    }
  }

  if (player.bloom > 0) {
    player.bloom = Math.max(0, player.bloom - player.bloomDecay * delta);
  }

  camera.position.copy(player.position);
  camera.lookAt(
    player.position.x + Math.sin(player.yaw),
    player.position.y - 0.2,
    player.position.z + Math.cos(player.yaw)
  );
}

function tick() {
  const delta = Math.min(clock.getDelta(), 0.033);

  if (enemy.shootCooldown > 0) {
    enemy.shootCooldown -= delta;
  }

  updatePlayer(delta);
  enemyBrain(delta);
  updateBullets(delta);
  updateHealthPickup(delta);
  updateHUD();

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (event) => {
  if (event.code in keys) {
    keys[event.code] = true;
    event.preventDefault();
  }

  if (event.code === "Escape" && !gameOver) {
    endGame("escape");
    event.preventDefault();
  }

  if (event.code === "KeyR" && gameOver) {
    match.round += 1;
    resetGame();
    event.preventDefault();
  }

  if (event.code === "KeyR" && !gameOver) {
    startReload();
    event.preventDefault();
  }

  if (event.code === "KeyN") {
    match.round = 1;
    match.playerWins = 0;
    match.cpuWins = 0;
    resetGame();
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code in keys) {
    keys[event.code] = false;
    event.preventDefault();
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

restartButton.addEventListener("click", () => {
  if (gameOver) {
    match.round += 1;
  }
  resetGame();
});

applyRoundDifficulty();
createHealthPickup();
updateHUD();
refreshScoreboard();
updateAmmoHud();
announce(CONTROL_HINT, true);
tick();
