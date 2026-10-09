
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const $ = id => document.getElementById(id);

const screens = [
  "mainMenu",
  "modeMenu",
  "onlineMenu",
  "instructionsMenu",
  "gameScreen"
];
const overlays = ["rouletteOverlay", "bossOverlay", "upgradeOverlay", "gameOverOverlay", "victoryOverlay"];

const ABILITIES = [
  { name: "Invisibilidade", icon: "👻", key1: "1", key2: "Q", cooldown: 14, duration: 7 },
  { name: "Dash", icon: "💨", key1: "2", key2: "E", cooldown: 6, duration: 0 },
  { name: "Ímã", icon: "🧲", key1: "3", key2: "R", cooldown: 12, duration: 7 },
  { name: "Gelo", icon: "❄️", key1: "4", key2: "T", cooldown: 16, duration: 6 },
  { name: "Velocidade", icon: "⚡", key1: "5", key2: "Y", cooldown: 14, duration: 6 },
  { name: "Escudo", icon: "🛡️", key1: "6", key2: "U", cooldown: 18, duration: 8 },
  { name: "Cura", icon: "💚", key1: "7", key2: "I", cooldown: 20, duration: 0 },
  { name: "Explosão", icon: "💥", key1: "8", key2: "O", cooldown: 24, duration: 0 }
];

const ORB_XP = 25;
const DUO_ORB_COUNT_MULTIPLIER = 2;
const DUO_XP_MULTIPLIER = 0.5;
const NORMAL_SPAWN_DISTANCE = 280;
const BOSS_SPAWN_DISTANCE = 420;

const game = {
  state: "menu",
  mode: "solo",
  stage: 1,
  bossNumber: 0,
  time: 0,
  target: 0,
  collected: 0,
  score: 0,
  isBoss: false,
  players: [],
  enemies: [],
  orbs: [],
  particles: [],
  floatingTexts: [],
  stars: [],
  stageTimer: 0,
  bossAttackTimer: 0,
  enemySpawnTimer: 0,
  transitionLocked: false,
  upgradePlayer: null,
  lastTime: 0,
  shake: 0,
  toastTimer: 0,
  damageFlashTimer: 0,
  boss: null,
  rouletteTimer: null,
  bossIntroTimer: null,
  transitionTimer: null,
  rouletteSpinTimer: null,
  upgradeChoices: [],
  keys: {},
  musicEnabled: true,
  music: null,
  audioTimer: null
};

const joystickState = {
  1: { x: 0, y: 0, pointer: null },
  2: { x: 0, y: 0, pointer: null }
};

for (let i = 0; i < 110; i++) {
  game.stars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.7 + 0.3,
    alpha: Math.random() * 0.6 + 0.2,
    phase: Math.random() * Math.PI * 2
  });
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showScreen(id) {
  screens.forEach(screen => {
    $(screen).classList.toggle("active", screen === id);
  });
}

function hideOverlays() {
  overlays.forEach(id => $(id).classList.remove("show"));
  $("stageToast").classList.remove("show");
}

function clearGameTimers() {
  for (const key of ["rouletteTimer", "bossIntroTimer", "transitionTimer", "rouletteSpinTimer"]) {
    if (game[key] !== null) {
      clearTimeout(game[key]);
      clearInterval(game[key]);
      game[key] = null;
    }
  }
}

function showToast(message, duration = 1500) {
  $("stageToast").textContent = message;
  $("stageToast").classList.add("show");
  game.toastTimer = duration;
}

function createPlayer(id, x, y) {
  const abilities = Array(8).fill(false);
  abilities[1] = true;

  return {
    id,
    x,
    y,
    r: 15,
    color: id === 1 ? "#36f5ff" : "#a7ff5a",
    speed: 360,
    maxHealth: 3,
    health: 3,
    xp: 0,
    level: 1,
    xpRequired: 100,
    xpMultiplier: 1,
    cooldownReduction: 0,
    magnetRange: 0,
    shield: 0,
    invisible: 0,
    ice: 0,
    speedBoost: 0,
    hitCooldown: 0,
    abilities,
    cooldowns: Array(8).fill(0),
    abilityTimers: Array(8).fill(0),
    input: { x: 0, y: 0 },
    alive: true,
    totalCollected: 0
  };
}

function activePlayers() {
  return game.players.filter(player => player && player.alive);
}

function resetPlayerPanels() {
  $("playerPanel1").style.display = "";
  $("playerPanel2").style.display = game.mode === "duo" ? "" : "none";
  $("gameScreen").classList.toggle("duo", game.mode === "duo");
  $("joy2Block").style.visibility = game.mode === "duo" ? "visible" : "hidden";
}

function buildAbilityPanels() {
  for (const playerId of [1, 2]) {
    const container = $(`abilitiesP${playerId}`);
    container.innerHTML = "";

    ABILITIES.forEach((ability, index) => {
      const card = document.createElement("div");
      card.className = "ability-card locked";
      card.id = `p${playerId}Ability${index}`;
      card.innerHTML = `
        <span class="ability-icon">${ability.icon}</span>
        <span class="ability-name">${ability.name}</span>
        <span class="ability-key">${playerId === 1 ? ability.key1 : ability.key2}</span>
        <span class="ability-cooldown"></span>
      `;
      container.appendChild(card);
    });
  }
}

function updatePlayerPanels() {
  for (const id of [1, 2]) {
    const player = game.players[id - 1];
    if (!player) continue;

    $(`p${id}Lives`).textContent = `${player.health}/${player.maxHealth}`;
    $(`p${id}Level`).textContent = player.level;
    $(`p${id}XpText`).textContent = `${Math.floor(player.xp)}/${player.xpRequired}`;
    $(`p${id}XpBar`).style.width =
      `${clamp(player.xp / player.xpRequired * 100, 0, 100)}%`;

    ABILITIES.forEach((ability, index) => {
      const card = $(`p${id}Ability${index}`);
      if (!card) return;

      card.classList.toggle("unlocked", player.abilities[index]);
      card.classList.toggle("locked", !player.abilities[index]);
      card.classList.toggle("cooling", player.cooldowns[index] > 0);

      const cooldown = card.querySelector(".ability-cooldown");
      cooldown.textContent = player.cooldowns[index] > 0
        ? player.cooldowns[index].toFixed(1)
        : "";
    });
  }
}

function startGame(mode) {
  clearGameTimers();
  hideOverlays();
  stopMusic();

  game.mode = mode;
  game.state = "roulette";
  game.stage = 1;
  game.bossNumber = 0;
  game.time = 0;
  game.target = 0;
  game.collected = 0;
  game.score = 0;
  game.isBoss = false;
  game.players = [createPlayer(1, W * 0.32, H * 0.5)];

  if (mode === "duo") {
    game.players.push(createPlayer(2, W * 0.68, H * 0.5));
  }

  game.enemies = [];
  game.orbs = [];
  game.particles = [];
  game.floatingTexts = [];
  game.boss = null;
  game.transitionLocked = false;
  game.upgradePlayer = null;
  game.upgradeChoices = [];
  game.stageTimer = 0;
  game.bossAttackTimer = 0;
  game.enemySpawnTimer = 0;
  game.shake = 0;
  game.damageFlashTimer = 0;
  game.lastTime = performance.now();

  resetPlayerPanels();
  updatePlayerPanels();
  resetJoysticks();
  showScreen("gameScreen");
  startMusic();
  startStage();
}

function returnToMenu() {
  clearGameTimers();
  hideOverlays();
  stopMusic();

  game.state = "menu";
  game.players = [];
  game.enemies = [];
  game.orbs = [];
  game.particles = [];
  game.floatingTexts = [];
  game.boss = null;
  game.upgradePlayer = null;
  game.transitionLocked = false;
  game.keys = {};

  resetJoysticks();
  showScreen("mainMenu");
}

function getBossNumber(stage) {
  if (stage < 10) return 0;
  if (stage <= 20) return Math.floor(stage / 10);
  return 2 + Math.floor((stage - 20) / 5);
}

function isBossStage(stage) {
  return stage >= 10 && (
    stage % 10 === 0 ||
    (stage > 20 && stage % 5 === 0)
  );
}

function getBossOrbRange(bossNumber) {
  const min = 45 + (bossNumber - 1) * 20;
  return { min, max: min + 20 };
}

function getBossAttackInterval(bossNumber) {
  if (bossNumber === 1) return 5;
  if (bossNumber === 2) return 3.5;
  return Math.max(1.2, 3.5 - (bossNumber - 2) * 0.45);
}

function getBossHealth(bossNumber) {
  return 100 + bossNumber * 100;
}

function getBossSpeed(bossNumber) {
  return Math.min(75 + bossNumber * 12, 190);
}

function startStage() {
  if (!["roulette", "playing", "transition"].includes(game.state)) return;

  clearGameTimers();
  hideOverlays();

  game.state = "roulette";
  game.transitionLocked = false;
  game.isBoss = isBossStage(game.stage);
  game.bossNumber = game.isBoss ? getBossNumber(game.stage) : 0;
  game.collected = 0;
  game.time = 0;
  game.enemies = [];
  game.orbs = [];
  game.particles = [];
  game.floatingTexts = [];
  game.boss = null;
  game.upgradePlayer = null;

  let baseMin = 5;
  let baseMax = 15;

  if (game.isBoss) {
    const range = getBossOrbRange(game.bossNumber);
    baseMin = range.min;
    baseMax = range.max;
  }

  const multiplier = game.mode === "duo" ? DUO_ORB_COUNT_MULTIPLIER : 1;
  game.target = randInt(baseMin, baseMax) * multiplier;

  $("rouletteOverlay").classList.add("show");
  $("rouletteMessage").textContent = game.isBoss
    ? `👑 CHEFE ${game.bossNumber} · Colete ${game.target} orbes!`
    : `🟡 Colete ${game.target} orbes!`;

  $("rouletteNumber").textContent = game.target;

  game.rouletteSpinTimer = setInterval(() => {
    if (game.state !== "roulette") return;
    $("rouletteNumber").textContent =
      randInt(baseMin, baseMax) * multiplier;
  }, 95);

  game.rouletteTimer = setTimeout(() => {
    game.rouletteTimer = null;

    if (game.rouletteSpinTimer !== null) {
      clearInterval(game.rouletteSpinTimer);
      game.rouletteSpinTimer = null;
    }

    $("rouletteNumber").textContent = game.target;
    beginStage();
  }, 1600);

  updateHud();
}

function beginStage() {
  if (game.state !== "roulette") return;

  $("rouletteOverlay").classList.remove("show");

  if (game.isBoss) {
    startBossIntro();
    return;
  }

  enterGameplay();
}

function startBossIntro() {
  game.state = "bossIntro";
  $("bossOverlay").classList.add("show");
  $("bossTitle").textContent = `BOSS ${game.bossNumber} INCOMING`;

  let count = 3;
  $("bossCountdown").textContent = count;
  setBossMusic(true);

  const tick = () => {
    if (game.state !== "bossIntro") return;

    if (count > 1) {
      count--;
      $("bossCountdown").textContent = count;
      game.bossIntroTimer = setTimeout(tick, 700);
    } else {
      $("bossCountdown").textContent = "GOOO!";
      game.bossIntroTimer = setTimeout(() => {
        game.bossIntroTimer = null;
        $("bossOverlay").classList.remove("show");
        enterGameplay();
      }, 700);
    }
  };

  game.bossIntroTimer = setTimeout(tick, 700);
}

function enterGameplay() {
  game.state = "playing";
  game.time = game.isBoss ? 50 : 30;
  game.stageTimer = game.time;
  game.bossAttackTimer = game.isBoss
    ? getBossAttackInterval(game.bossNumber)
    : 0;
  game.enemySpawnTimer = 1.8;
  game.enemies = [];
  game.orbs = [];
  game.boss = null;

  spawnOrbs(game.target);

  const initialEnemies = Math.min(
    2 + Math.floor(game.stage / 2) + game.bossNumber,
    14
  );

  for (let i = 0; i < initialEnemies; i++) spawnEnemy();

  if (game.isBoss) {
    const spawn = findSafeSpawn(BOSS_SPAWN_DISTANCE, 38);

    game.boss = {
      x: spawn.x,
      y: spawn.y,
      r: 34,
      health: getBossHealth(game.bossNumber),
      maxHealth: getBossHealth(game.bossNumber),
      speed: getBossSpeed(game.bossNumber),
      hitFlash: 0
    };

    showToast(`👑 BOSS ${game.bossNumber}!`, 2000);
  } else {
    showToast(`🚀 FASE ${game.stage}`, 1400);
  }

  setBossMusic(game.isBoss);
  updateHud();
}

function finishStage(reason) {
  if (game.transitionLocked) return;
  if (!["playing", "upgrade"].includes(game.state)) return;

  game.transitionLocked = true;
  game.state = "transition";
  game.enemies = [];
  game.boss = null;
  game.orbs = [];
  game.upgradePlayer = null;
  $("upgradeOverlay").classList.remove("show");

  if (reason === "target") {
    game.score += game.target * 10;
    showToast("✨ FASE CONCLUÍDA!", 1000);
  } else {
    showToast("⏱️ TEMPO ESGOTADO!", 1000);
  }

  game.transitionTimer = setTimeout(() => {
    game.transitionTimer = null;

    if (game.state !== "transition") return;

    if (game.stage >= 50 && reason === "target") {
      showVictory();
      return;
    }

    game.stage++;
    startStage();
  }, 850);
}

function showVictory() {
  clearGameTimers();
  game.state = "victory";
  hideOverlays();
  $("victoryOverlay").classList.add("show");
  stopMusic();
}

function showGameOver() {
  clearGameTimers();
  game.state = "gameover";
  hideOverlays();

  $("gameOverText").textContent =
    `Você chegou à fase ${game.stage} e fez ${game.score} pontos.`;

  $("gameOverOverlay").classList.add("show");
  stopMusic();
}

function spawnOrbs(count) {
  for (let i = 0; i < count; i++) {
    const point = findSafeSpawn(65, 9);

    game.orbs.push({
      x: point.x,
      y: point.y,
      baseX: point.x,
      baseY: point.y,
      r: rand(7, 10),
      phase: rand(0, Math.PI * 2),
      collected: false,
      attracted: false,
      xpValue: ORB_XP
    });
  }
}

function distanceToPlayers(x, y) {
  const players = activePlayers();
  if (!players.length) return Infinity;

  return Math.min(
    ...players.map(player => distance(x, y, player.x, player.y))
  );
}

function findSafeSpawn(minDistance = NORMAL_SPAWN_DISTANCE, radius = 14) {
  let best = null;
  let bestDistance = -1;

  for (let i = 0; i < 140; i++) {
    const x = rand(radius + 18, W - radius - 18);
    const y = rand(radius + 18, H - radius - 18);
    const d = distanceToPlayers(x, y);

    if (d > bestDistance) {
      bestDistance = d;
      best = { x, y };
    }

    if (d >= minDistance) return { x, y };
  }

  return best || { x: W / 2, y: H / 2 };
}

function spawnEnemy() {
  const speedMultiplier = Math.min(
    1 + (game.stage - 1) * 0.25,
    3.5
  );

  const bossMultiplier = game.isBoss
    ? 1 + game.bossNumber * 0.08
    : 1;

  const spawn = findSafeSpawn(NORMAL_SPAWN_DISTANCE, 15);

  game.enemies.push({
    x: spawn.x,
    y: spawn.y,
    r: rand(12, 17),
    speed: rand(48, 66) * speedMultiplier * bossMultiplier,
    color: Math.random() > 0.5 ? "#ff438c" : "#ff7a4d",
    phase: rand(0, Math.PI * 2),
    hitFlash: 0
  });
}

function collectOrb(orb, player) {
  if (orb.collected || game.state !== "playing") return;

  orb.collected = true;
  game.collected++;
  player.totalCollected++;

  spawnOrbParticles(orb.x, orb.y);
  addFloatingText(orb.x, orb.y - 8, "+XP", "#ffe66d");

  const multiplier = game.mode === "duo" ? DUO_XP_MULTIPLIER : 1;
  const amount = orb.xpValue * multiplier * player.xpMultiplier;

  gainXP(player, amount);
  updateHud();

  if (game.collected >= game.target) {
    finishStage("target");
  }
}

function gainXP(player, amount) {
  if (!player || !player.alive) return;

  player.xp += amount;

  while (player.xp >= player.xpRequired) {
    player.xp -= player.xpRequired;
    player.level++;
    player.xpRequired = Math.ceil(player.xpRequired * 1.25);

    if (
      player.level % 5 === 0 &&
      game.state === "playing" &&
      game.collected < game.target
    ) {
      openUpgradeSelection(player);
      break;
    }
  }

  updatePlayerPanels();
}

function updateOrbs(dt) {
  for (const orb of game.orbs) {
    if (orb.collected) continue;

    orb.phase += dt * 2;

    let targetPlayer = null;
    let nearestDistance = Infinity;

    for (const player of activePlayers()) {
      const d = distance(orb.x, orb.y, player.x, player.y);
      const range = 85 + player.magnetRange;

      if (d <= range && d < nearestDistance) {
        nearestDistance = d;
        targetPlayer = player;
      }
    }

    if (targetPlayer) {
      orb.attracted = true;

      const dx = targetPlayer.x - orb.x;
      const dy = targetPlayer.y - orb.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const speed = 440 + targetPlayer.magnetRange * 1.5;
      const step = Math.min(d, speed * dt);

      orb.x += dx / d * step;
      orb.y += dy / d * step;

      if (d <= targetPlayer.r + orb.r + 5) {
        collectOrb(orb, targetPlayer);
      }
    } else {
      orb.x += Math.sin(orb.phase) * 5 * dt;
      orb.y += Math.cos(orb.phase * 0.8) * 4 * dt;
    }
  }

  game.orbs = game.orbs.filter(orb => !orb.collected);
}

function spawnOrbParticles(x, y) {
  const colors = ["#ffe66d", "#ffffff", "#36f5ff", "#ffcf45"];

  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(45, 210);
    const life = rand(0.25, 0.7);

    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: rand(2, 5),
      color: colors[randInt(0, colors.length - 1)]
    });
  }

  for (let i = 0; i < 5; i++) {
    game.particles.push({
      x: x + rand(-5, 5),
      y: y + rand(-5, 5),
      vx: rand(-25, 25),
      vy: rand(-35, 35),
      life: 0.5,
      maxLife: 0.5,
      size: rand(4, 7),
      color: "#ffe66d",
      ring: true
    });
  }
}

function addFloatingText(x, y, text, color) {
  game.floatingTexts.push({
    x,
    y,
    text,
    color,
    life: 0.8,
    maxLife: 0.8
  });
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.04, dt);
    particle.vy *= Math.pow(0.04, dt);
  }

  game.particles = game.particles.filter(p => p.life > 0);

  for (const item of game.floatingTexts) {
    item.life -= dt;
    item.y -= 26 * dt;
  }

  game.floatingTexts = game.floatingTexts.filter(item => item.life > 0);
}

function createUpgradeChoices(player) {
  const upgrades = [
    {
      icon: "⚡",
      name: "Mais velocidade",
      description: "+12% de movimento",
      apply: () => player.speed *= 1.12
    },
    {
      icon: "❤️",
      name: "Vida extra",
      description: "+1 vida máxima e atual",
      apply: () => {
        player.maxHealth++;
        player.health = Math.min(player.maxHealth, player.health + 1);
      }
    },
    {
      icon: "🧲",
      name: "Ímã avançado",
      description: "+55 de alcance de coleta",
      apply: () => player.magnetRange += 55
    },
    {
      icon: "✨",
      name: "XP aprimorado",
      description: "+20% de XP pessoal",
      apply: () => player.xpMultiplier *= 1.2
    },
    {
      icon: "⏱️",
      name: "Recarga rápida",
      description: "Habilidades recarregam mais rápido",
      apply: () => {
        player.cooldownReduction =
          Math.min(0.45, player.cooldownReduction + 0.08);
      }
    },
    {
      icon: "🛡️",
      name: "Escudo",
      description: "Ganha proteção temporária",
      apply: () => player.shield = Math.max(player.shield, 8)
    },
    {
      icon: "💚",
      name: "Recuperação",
      description: "Recupera uma vida",
      apply: () => {
        player.health = Math.min(player.maxHealth, player.health + 1);
      }
    },
    {
      icon: "🔓",
      name: "Nova habilidade",
      description: "Desbloqueia uma habilidade aleatória",
      apply: () => {
        const locked = player.abilities
          .map((unlocked, index) => ({ unlocked, index }))
          .filter(item => !item.unlocked);

        if (locked.length) {
          const selected = locked[randInt(0, locked.length - 1)];
          player.abilities[selected.index] = true;
        } else {
          player.cooldownReduction =
            Math.min(0.45, player.cooldownReduction + 0.05);
        }
      }
    }
  ];

  const deadPartner = game.mode === "duo"
    ? game.players.find(other => other.id !== player.id && !other.alive)
    : null;

  if (deadPartner) {
    upgrades.push({
      icon: "💚",
      name: `Reviver jogador ${deadPartner.id}`,
      description: "Seu parceiro volta com 1 vida",
      revive: true,
      apply: () => revivePlayer(deadPartner)
    });
  }

  for (let i = upgrades.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [upgrades[i], upgrades[j]] = [upgrades[j], upgrades[i]];
  }

  return upgrades.slice(0, 3);
}

function openUpgradeSelection(player) {
  if (game.state !== "playing" || game.collected >= game.target) return;

  game.state = "upgrade";
  game.upgradePlayer = player;
  game.upgradeChoices = createUpgradeChoices(player);

  $("upgradeTitle").textContent = `⭐ JOGADOR ${player.id}: SUBIU DE NÍVEL!`;
  $("upgradeSubtitle").textContent =
    `Escolha uma melhoria para o Jogador ${player.id}. Só ele recebe o bônus.`;

  const container = $("upgradeChoices");
  container.innerHTML = "";

  game.upgradeChoices.forEach((upgrade, index) => {
    const button = document.createElement("button");
    button.className = "upgrade-choice";

    if (upgrade.revive) button.classList.add("revive-choice");

    button.innerHTML = `
      <span class="upgrade-icon">${upgrade.icon}</span>
      <strong>${upgrade.name}</strong>
      <small>${upgrade.description}</small>
    `;

    button.addEventListener("click", () => chooseUpgrade(index));
    container.appendChild(button);
  });

  $("upgradeOverlay").classList.add("show");
}

function chooseUpgrade(index) {
  if (game.state !== "upgrade") return;

  const upgrade = game.upgradeChoices[index];
  if (upgrade) upgrade.apply();

  $("upgradeOverlay").classList.remove("show");

  const playerId = game.upgradePlayer ? game.upgradePlayer.id : 1;
  game.upgradePlayer = null;
  game.upgradeChoices = [];

  if (activePlayers().length === 0) {
    showGameOver();
    return;
  }

  game.state = "playing";
  updatePlayerPanels();

  showToast(
    upgrade && upgrade.revive
      ? `💚 JOGADOR ${3 - playerId} REVIVIDO!`
      : `⭐ MELHORIA DO JOGADOR ${playerId}!`,
    1300
  );
}

function revivePlayer(player) {
  if (!player || player.alive) return;

  player.alive = true;
  player.health = 1;
  player.hitCooldown = 1.5;

  const spawn = findSafeSpawn(BOSS_SPAWN_DISTANCE, player.r);
  player.x = spawn.x;
  player.y = spawn.y;
  player.shield = 2;

  spawnOrbParticles(player.x, player.y);
  addFloatingText(player.x, player.y - 22, "REVIVE!", "#a7ff5a");
  updatePlayerPanels();
}

function activateAbility(player, index) {
  if (!player || !player.alive || game.state !== "playing") return;
  if (!player.abilities[index] || player.cooldowns[index] > 0) return;

  const ability = ABILITIES[index];
  const cooldown = ability.cooldown * (1 - player.cooldownReduction);

  if (index === 0) {
    player.invisible = ability.duration;
    player.abilityTimers[index] = ability.duration;
  } else if (index === 1) {
    const input = getPlayerInput(player);
    let dx = input.x;
    let dy = input.y;

    if (!dx && !dy) {
      const nearest = getNearestEnemy(player.x, player.y);
      if (nearest) {
        dx = player.x - nearest.x;
        dy = player.y - nearest.y;
      } else {
        dx = player.id === 1 ? 1 : -1;
      }
    }

    const len = Math.max(1, Math.hypot(dx, dy));
    player.x = clamp(player.x + dx / len * 125, player.r, W - player.r);
    player.y = clamp(player.y + dy / len * 125, player.r, H - player.r);
    spawnDashParticles(player);
    player.cooldowns[index] = cooldown;
  } else if (index === 2) {
    player.magnetRange = Math.max(player.magnetRange, 180);
    player.abilityTimers[index] = ability.duration;
  } else if (index === 3) {
    player.ice = ability.duration;
    player.abilityTimers[index] = ability.duration;
  } else if (index === 4) {
    player.speedBoost = ability.duration;
    player.abilityTimers[index] = ability.duration;
  } else if (index === 5) {
    player.shield = ability.duration;
    player.abilityTimers[index] = ability.duration;
  } else if (index === 6) {
    player.health = Math.min(player.maxHealth, player.health + 1);
    spawnHealParticles(player);
    player.cooldowns[index] = cooldown;
  } else if (index === 7) {
    for (const enemy of game.enemies) {
      if (distance(player.x, player.y, enemy.x, enemy.y) < 210) {
        enemy.dead = true;
        spawnOrbParticles(enemy.x, enemy.y);
      }
    }

    if (game.boss && distance(player.x, player.y, game.boss.x, game.boss.y) < 240) {
      game.boss.health -= 30;
      game.boss.hitFlash = 0.2;
      spawnOrbParticles(game.boss.x, game.boss.y);
    }

    game.enemies = game.enemies.filter(enemy => !enemy.dead);
    player.cooldowns[index] = cooldown;
  }

  if (ability.duration > 0 && index !== 1) {
    player.cooldowns[index] = cooldown;
  }

  updatePlayerPanels();
}

function spawnDashParticles(player) {
  for (let i = 0; i < 12; i++) {
    const life = rand(0.15, 0.4);

    game.particles.push({
      x: player.x + rand(-10, 10),
      y: player.y + rand(-10, 10),
      vx: rand(-90, 90),
      vy: rand(-90, 90),
      life,
      maxLife: life,
      size: rand(2, 5),
      color: player.color
    });
  }
}

function spawnHealParticles(player) {
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const life = rand(0.3, 0.8);

    game.particles.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(angle) * rand(30, 100),
      vy: Math.sin(angle) * rand(30, 100),
      life,
      maxLife: life,
      size: rand(2, 4),
      color: "#6dff9b"
    });
  }
}

function getNearestEnemy(x, y) {
  let closest = null;
  let nearest = Infinity;

  for (const enemy of game.enemies) {
    const d = distance(x, y, enemy.x, enemy.y);

    if (d < nearest) {
      nearest = d;
      closest = enemy;
    }
  }

  if (game.boss) {
    const d = distance(x, y, game.boss.x, game.boss.y);
    if (d < nearest) closest = game.boss;
  }

  return closest;
}

function getPlayerInput(player) {
  const joystick = joystickState[player.id];

  if (joystick.x || joystick.y) {
    return { x: joystick.x, y: joystick.y };
  }

  let x = 0;
  let y = 0;

  if (player.id === 1) {
    if (game.keys.ArrowLeft) x--;
    if (game.keys.ArrowRight) x++;
    if (game.keys.ArrowUp) y--;
    if (game.keys.ArrowDown) y++;
  } else {
    if (game.keys.a || game.keys.A) x--;
    if (game.keys.d || game.keys.D) x++;
    if (game.keys.w || game.keys.W) y--;
    if (game.keys.s || game.keys.S) y++;
  }

  const len = Math.hypot(x, y);

  if (len > 1) {
    x /= len;
    y /= len;
  }

  return { x, y };
}

function updatePlayer(player, dt) {
  if (!player.alive) return;

  player.hitCooldown = Math.max(0, player.hitCooldown - dt);
  player.shield = Math.max(0, player.shield - dt);
  player.invisible = Math.max(0, player.invisible - dt);
  player.ice = Math.max(0, player.ice - dt);
  player.speedBoost = Math.max(0, player.speedBoost - dt);

  if (player.abilityTimers[2] > 0) {
    player.abilityTimers[2] = Math.max(0, player.abilityTimers[2] - dt);

    if (player.abilityTimers[2] === 0) {
      player.magnetRange = 0;
    }
  }

  ABILITIES.forEach((ability, index) => {
    if (player.cooldowns[index] <= 0) return;

    if (
      ability.duration > 0 &&
      index !== 1 &&
      player.abilityTimers[index] > 0
    ) {
      player.abilityTimers[index] =
        Math.max(0, player.abilityTimers[index] - dt);

      if (player.abilityTimers[index] === 0) {
        player.cooldowns[index] =
          Math.max(0, player.cooldowns[index] - dt);
      }
    } else {
      player.cooldowns[index] =
        Math.max(0, player.cooldowns[index] - dt);
    }
  });

  const input = getPlayerInput(player);
  player.input = input;

  const speedMultiplier = player.speedBoost > 0 ? 1.65 : 1;

  player.x += input.x * player.speed * speedMultiplier * dt;
  player.y += input.y * player.speed * speedMultiplier * dt;

  player.x = clamp(player.x, player.r + 3, W - player.r - 3);
  player.y = clamp(player.y, player.r + 3, H - player.r - 3);
}

function damagePlayer(player) {
  if (
    !player.alive ||
    player.hitCooldown > 0 ||
    player.shield > 0 ||
    player.invisible > 0
  ) return;

  player.health--;
  player.hitCooldown = 1.1;
  game.shake = 0.24;
  game.damageFlashTimer = 0.2;

  $("arenaWrap").classList.remove("shake");
  void $("arenaWrap").offsetWidth;
  $("arenaWrap").classList.add("shake");

  if (player.health <= 0) {
    player.health = 0;
    player.alive = false;
    addFloatingText(player.x, player.y - 20, "💔", "#ff438c");
  }

  updatePlayerPanels();

  if (activePlayers().length === 0) showGameOver();
}

function updateEnemies(dt) {
  const players = activePlayers();

  for (const enemy of game.enemies) {
    if (!players.length) break;

    let target = players[0];
    let closest = distance(enemy.x, enemy.y, target.x, target.y);

    for (const player of players.slice(1)) {
      const d = distance(enemy.x, enemy.y, player.x, player.y);

      if (d < closest) {
        closest = d;
        target = player;
      }
    }

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const iceMultiplier = target.ice > 0 ? 0.55 : 1;

    enemy.x += dx / len * enemy.speed * iceMultiplier * dt;
    enemy.y += dy / len * enemy.speed * iceMultiplier * dt;
    enemy.phase += dt * 3;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

    if (closest < enemy.r + target.r) {
      damagePlayer(target);
      enemy.x -= dx / len * 18;
      enemy.y -= dy / len * 18;
    }
  }

  game.enemies = game.enemies.filter(enemy => !enemy.dead);

  if (game.boss) updateBoss(dt);
}

function updateBoss(dt) {
  const boss = game.boss;
  if (!boss) return;

  const players = activePlayers();
  if (!players.length) return;

  let target = players[0];
  let nearest = distance(boss.x, boss.y, target.x, target.y);

  for (const player of players.slice(1)) {
    const d = distance(boss.x, boss.y, player.x, player.y);

    if (d < nearest) {
      nearest = d;
      target = player;
    }
  }

  const dx = target.x - boss.x;
  const dy = target.y - boss.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const speed = target.ice > 0 ? boss.speed * 0.55 : boss.speed;

  boss.x += dx / len * speed * dt;
  boss.y += dy / len * speed * dt;
  boss.x = clamp(boss.x, boss.r, W - boss.r);
  boss.y = clamp(boss.y, boss.r, H - boss.r);
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);

  if (nearest < boss.r + target.r) damagePlayer(target);

  game.bossAttackTimer -= dt;

  if (game.bossAttackTimer <= 0 && game.state === "playing") {
    game.bossAttackTimer = getBossAttackInterval(game.bossNumber);

    for (const orb of game.orbs) {
      if (orb.collected) continue;

      const point = findSafeSpawn(70, 8);
      orb.x = point.x;
      orb.y = point.y;
      orb.baseX = point.x;
      orb.baseY = point.y;
      orb.attracted = false;
    }

    const extraEnemies = Math.min(1 + Math.floor(game.bossNumber / 2), 5);

    for (let i = 0; i < extraEnemies; i++) {
      if (game.enemies.length < 22) spawnEnemy();
    }

    showToast(`👑 ATAQUE DO CHEFE ${game.bossNumber}!`, 750);
  }

  if (boss.health <= 0) {
    spawnOrbParticles(boss.x, boss.y);
    game.boss = null;
    showToast("💥 CHEFE DERROTADO!", 1400);
  }
}

function updateHud() {
  $("timeValue").textContent = Math.max(0, Math.ceil(game.time));
  $("stageValue").textContent = game.stage;
  $("collectedValue").textContent = game.collected;
  $("targetValue").textContent = game.target;
  $("enemyValue").textContent = game.enemies.length + (game.boss ? 1 : 0);
}

function update(dt) {
  if (game.toastTimer > 0) {
    game.toastTimer -= dt * 1000;

    if (game.toastTimer <= 0) {
      $("stageToast").classList.remove("show");
    }
  }

  if (game.damageFlashTimer > 0) {
    game.damageFlashTimer -= dt;
    $("damageFlash").style.opacity =
      String(clamp(game.damageFlashTimer / 0.2, 0, 1));
  }

  if (game.shake > 0) {
    game.shake = Math.max(0, game.shake - dt);
  }

  updateParticles(dt);

  if (game.state !== "playing") return;

  game.time -= dt;

  for (const player of activePlayers()) {
    updatePlayer(player, dt);
  }

  updateOrbs(dt);
  updateEnemies(dt);

  if (game.state !== "playing") return;

  game.enemySpawnTimer -= dt;

  if (game.enemySpawnTimer <= 0) {
    game.enemySpawnTimer = Math.max(1.1, 3 - game.stage * 0.035);

    if (game.enemies.length < 16 + game.bossNumber) {
      spawnEnemy();
    }
  }

  if (game.time <= 0) {
    game.time = 0;
    finishStage("timeout");
  }

  updateHud();
  updatePlayerPanels();
}

function drawBackground(time) {
  ctx.clearRect(0, 0, W, H);

  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, "#080e20");
  gradient.addColorStop(0.5, "#071020");
  gradient.addColorStop(1, "#0a0b1c");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = "rgba(54,245,255,0.075)";
  ctx.lineWidth = 1;

  const grid = 40;
  const offset = (time * 8) % grid;

  for (let x = -grid + offset; x < W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  for (let y = -grid + offset; y < H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  for (const star of game.stars) {
    const alpha =
      star.alpha * (0.65 + Math.sin(time * 1.5 + star.phase) * 0.3);

    ctx.fillStyle = `rgba(180,235,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (game.isBoss && ["playing", "transition"].includes(game.state)) {
    ctx.strokeStyle = "rgba(255,67,140,0.18)";
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }
}

function drawOrbs(time) {
  for (const orb of game.orbs) {
    if (orb.collected) continue;

    const pulse = 1 + Math.sin(time * 4 + orb.phase) * 0.12;

    ctx.save();
    ctx.shadowColor = "#ffe66d";
    ctx.shadowBlur = orb.attracted ? 25 : 17;
    ctx.fillStyle = "#ffe66d";
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.r * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(orb.x - 2, orb.y - 2, Math.max(1.5, orb.r * 0.28), 0, Math.PI * 2);
    ctx.fill();

    if (orb.attracted) {
      ctx.strokeStyle = "rgba(255,230,109,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        orb.x,
        orb.y,
        orb.r + 6 + Math.sin(time * 12) * 2,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawPlayer(player, time) {
  if (!player.alive) return;

  ctx.save();
  ctx.globalAlpha = player.invisible > 0 ? 0.35 : 1;
  ctx.shadowColor = player.color;
  ctx.shadowBlur = player.hitCooldown > 0 ? 4 : 22;
  ctx.fillStyle = player.color;

  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#071020";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r * 0.65, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "17px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(player.id === 1 ? "⚡" : "🔥", player.x, player.y + 1);

  if (player.shield > 0) {
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(
      player.x,
      player.y,
      player.r + 7 + Math.sin(time * 6) * 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  if (player.speedBoost > 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(3,8,20,0.85)";
  ctx.fillRect(player.x - 18, player.y - 29, 36, 4);
  ctx.fillStyle = player.color;
  ctx.fillRect(
    player.x - 18,
    player.y - 29,
    36 * (player.health / player.maxHealth),
    4
  );

  ctx.restore();
}

function drawEnemy(enemy, time) {
  ctx.save();
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = enemy.hitFlash > 0 ? 25 : 14;
  ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : enemy.color;

  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#240b20";

  const eyeOffset = Math.sin(time * 5 + enemy.phase) * 1.2;

  ctx.beginPath();
  ctx.arc(enemy.x - 5, enemy.y - 2 + eyeOffset, 2.6, 0, Math.PI * 2);
  ctx.arc(enemy.x + 5, enemy.y - 2 - eyeOffset, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#240b20";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y + 4, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

function drawBoss(time) {
  const boss = game.boss;
  if (!boss) return;

  ctx.save();
  ctx.shadowColor = "#ff438c";
  ctx.shadowBlur = 28;
  ctx.fillStyle = boss.hitFlash > 0 ? "#ffffff" : "#b52164";

  ctx.beginPath();
  ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ff8db8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(
    boss.x,
    boss.y,
    boss.r + 5 + Math.sin(time * 4) * 3,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.font = "30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👑", boss.x, boss.y - 3);

  const barWidth = 100;
  const barY = boss.y - boss.r - 17;

  ctx.fillStyle = "#2b1126";
  ctx.fillRect(boss.x - barWidth / 2, barY, barWidth, 7);

  ctx.fillStyle = "#ff438c";
  ctx.fillRect(
    boss.x - barWidth / 2,
    barY,
    barWidth * clamp(boss.health / boss.maxHealth, 0, 1),
    7
  );

  ctx.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = particle.color;
    ctx.fillStyle = particle.color;
    ctx.lineWidth = 2;

    if (particle.ring) {
      const radius = particle.size * (1 + (1 - alpha) * 3);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.size * alpha,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  for (const item of game.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = clamp(item.life / item.maxLife, 0, 1);
    ctx.fillStyle = item.color;
    ctx.font = "bold 15px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 8;
    ctx.fillText(item.text, item.x, item.y);
    ctx.restore();
  }
}

function draw(time) {
  drawBackground(time);
  drawOrbs(time);

  for (const enemy of game.enemies) drawEnemy(enemy, time);

  drawBoss(time);

  for (const player of game.players) {
    if (player) drawPlayer(player, time);
  }

  drawParticles();

  if (game.isBoss && game.boss) {
    ctx.save();
    ctx.fillStyle = "#ff9bbf";
    ctx.font = "bold 15px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`👑 BOSS ${game.bossNumber}`, W / 2, 25);
    ctx.restore();
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - game.lastTime) / 1000 || 0, 0.035);
  game.lastTime = timestamp;

  update(dt);
  draw(timestamp / 1000);

  requestAnimationFrame(loop);
}

function setupJoystick(id, playerId) {
  const joystick = $(id);
  const knob = joystick.querySelector(".joystick-knob");
  const state = joystickState[playerId];

  function move(event) {
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.32;

    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const len = Math.hypot(dx, dy);

    if (len > maxRadius) {
      dx = dx / len * maxRadius;
      dy = dy / len * maxRadius;
    }

    state.x = dx / maxRadius;
    state.y = dy / maxRadius;

    knob.style.left = `calc(50% + ${dx}px)`;
    knob.style.top = `calc(50% + ${dy}px)`;
  }

  function end(event) {
    if (state.pointer !== event.pointerId) return;

    state.pointer = null;
    state.x = 0;
    state.y = 0;
    knob.style.left = "50%";
    knob.style.top = "50%";
  }

  joystick.addEventListener("pointerdown", event => {
    event.preventDefault();
    state.pointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    move(event);
  });

  joystick.addEventListener("pointermove", event => {
    if (state.pointer === event.pointerId) {
      event.preventDefault();
      move(event);
    }
  });

  joystick.addEventListener("pointerup", end);
  joystick.addEventListener("pointercancel", end);
  joystick.addEventListener("lostpointercapture", end);
}

function resetJoysticks() {
  for (const id of [1, 2]) {
    joystickState[id].x = 0;
    joystickState[id].y = 0;
    joystickState[id].pointer = null;

    const joystick = $(`joy${id}`);
    if (!joystick) continue;

    const knob = joystick.querySelector(".joystick-knob");
    knob.style.left = "50%";
    knob.style.top = "50%";
  }
}

function handleAbilityKey(key) {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  const keys1 = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const keys2 = ["q", "e", "r", "t", "y", "u", "i", "o"];

  const index1 = keys1.indexOf(normalized);

  if (index1 !== -1) {
    activateAbility(game.players[0], index1);
    return;
  }

  const index2 = keys2.indexOf(normalized);

  if (index2 !== -1 && game.mode === "duo") {
    activateAbility(game.players[1], index2);
  }
}

function startMusic() {
  if (!game.musicEnabled) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    if (!game.music) {
      const audio = new AudioContextClass();
      const master = audio.createGain();

      master.gain.value = 0.045;
      master.connect(audio.destination);

      game.music = {
        audio,
        master,
        boss: false,
        note: 0
      };
    }

    if (game.music.audio.state === "suspended") {
      game.music.audio.resume();
    }

    scheduleMusic();
  } catch {
    game.music = null;
  }
}

function scheduleMusic() {
  if (!game.music || game.audioTimer) return;

  const scale = [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 15];
  const audio = game.music.audio;

  game.audioTimer = setInterval(() => {
    if (!game.musicEnabled || !game.music) return;

    const now = audio.currentTime;
    const index = game.music.note++ % scale.length;
    const boss = game.music.boss;
    const base = boss ? 110 : 82.4;
    const frequency = base * Math.pow(2, scale[index] / 12);

    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = boss ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(boss ? 0.1 : 0.07, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + (boss ? 0.18 : 0.28)
    );

    oscillator.connect(gain);
    gain.connect(game.music.master);
    oscillator.start(now);
    oscillator.stop(now + (boss ? 0.2 : 0.3));

    if (boss && index % 3 === 0) {
      const bass = audio.createOscillator();
      const bassGain = audio.createGain();

      bass.type = "square";
      bass.frequency.setValueAtTime(base / 2, now);

      bassGain.gain.setValueAtTime(0.0001, now);
      bassGain.gain.linearRampToValueAtTime(0.07, now + 0.02);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      bass.connect(bassGain);
      bassGain.connect(game.music.master);
      bass.start(now);
      bass.stop(now + 0.25);
    }
  }, game.music.boss ? 180 : 270);
}

function setBossMusic(isBoss) {
  if (!game.music) {
    if (game.musicEnabled) startMusic();
    if (!game.music) return;
  }

  if (game.music.boss !== isBoss) {
    game.music.boss = isBoss;

    if (game.audioTimer) {
      clearInterval(game.audioTimer);
      game.audioTimer = null;
    }

    scheduleMusic();
  }
}

function stopMusic() {
  if (game.audioTimer) {
    clearInterval(game.audioTimer);
    game.audioTimer = null;
  }

  if (game.music) {
    try {
      game.music.master.gain.setTargetAtTime(
        0,
        game.music.audio.currentTime,
        0.08
      );
      game.music.audio.close();
    } catch {
      void 0;
    }

    game.music = null;
  }
}

function toggleMusic() {
  game.musicEnabled = !game.musicEnabled;
  $("musicBtn").textContent = game.musicEnabled ? "🔊" : "🔇";

  if (game.musicEnabled) {
    startMusic();
    if (game.isBoss) setBossMusic(true);
  } else {
    stopMusic();
  }
}
// ===== MULTIPLAYER ONLINE: CONEXÃO E SALAS =====

let onlineSocket = null;
let onlineRoom = null;
let onlineRole = null;
let onlineRequestPending = false;

const ONLINE_SERVER_URL = "https://joguinho-ma2q.onrender.com";

function setOnlineStatus(message, type = "") {
  const status = $("onlineStatus");
  status.textContent = message;
  status.className = `online-status ${type}`.trim();
}

function setOnlineButtonsDisabled(disabled) {
  $("createRoomBtn").disabled = disabled;
  $("joinRoomBtn").disabled = disabled;
}

function updateOnlineRoomInfo(playerCount) {
  if (!onlineRoom) return;

  $("roomInfo").hidden = false;
  $("roomCodeDisplay").textContent = onlineRoom;

  if (playerCount >= 2) {
    $("roomPlayersDisplay").textContent =
      "2/2 jogadores conectados! Sala pronta.";
    setOnlineStatus(
      "Os dois jogadores estão conectados. A sala está pronta para a próxima etapa.",
      "success"
    );
  } else {
    $("roomPlayersDisplay").textContent =
      "1/2 jogadores conectados. Aguardando outro jogador...";
  }
}

function setupOnlineSocket() {
  if (onlineSocket) return onlineSocket;

  if (typeof window.io !== "function") {
    setOnlineStatus(
      "Não foi possível carregar o cliente de conexão. Confira a internet e recarregue a página.",
      "error"
    );
    return null;
  }

  onlineSocket = window.io(ONLINE_SERVER_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    timeout: 15000
  });

  onlineSocket.on("connect", () => {
    if (!onlineRoom) {
      setOnlineStatus("Conectado ao servidor. Pronto para criar ou entrar em uma sala.", "success");
    }
  });

  onlineSocket.on("connect_error", () => {
    setOnlineStatus(
      "Não foi possível conectar ao servidor. Ele pode estar iniciando; tente novamente em alguns segundos.",
      "error"
    );
    setOnlineButtonsDisabled(false);
    onlineRequestPending = false;
  });

  onlineSocket.on("room-update", data => {
    if (!data || !onlineRoom || data.code !== onlineRoom) return;
    updateOnlineRoomInfo(data.players);
  });

  onlineSocket.on("player-joined", () => {
    setOnlineStatus("Outro jogador entrou na sala!", "success");
  });

  onlineSocket.on("player-left", () => {
    if (onlineRoom) {
      updateOnlineRoomInfo(1);
      setOnlineStatus("O outro jogador saiu. Aguardando alguém entrar novamente.");
    }
  });

  onlineSocket.on("room-closed", () => {
    onlineRoom = null;
    onlineRole = null;
    $("roomInfo").hidden = true;
    setOnlineStatus("O criador encerrou a sala. Crie ou entre em outra sala.");
    setOnlineButtonsDisabled(false);
  });

  onlineSocket.on("disconnect", () => {
    if (onlineRoom) {
      setOnlineStatus("Conexão interrompida. Tentando reconectar...", "error");
    }
  });

  return onlineSocket;
}

function runOnlineRequest(action) {
  if (onlineRoom) {
    setOnlineStatus("Você já está em uma sala. Volte e saia dela antes de entrar em outra.");
    return;
  }

  const socket = setupOnlineSocket();
  if (!socket) return;

  setOnlineButtonsDisabled(true);
  onlineRequestPending = true;
  setOnlineStatus("Conectando ao servidor...");

  const request = () => {
    if (!onlineRequestPending) return;

    action(socket, result => {
      onlineRequestPending = false;
      setOnlineButtonsDisabled(false);

      if (!result || !result.success) {
        setOnlineStatus(
          result?.error || "Não foi possível concluir a operação.",
          "error"
        );
        return;
      }

      onlineRoom = result.code;
      onlineRole = result.role;

      $("roomInfo").hidden = false;
      $("roomCodeDisplay").textContent = result.code;
      $("roomPlayersDisplay").textContent =
        "1/2 jogadores conectados. Aguardando outro jogador...";

      setOnlineStatus(
        result.role === "host"
          ? "Sala criada! Compartilhe o código com seu amigo."
          : "Você entrou na sala! Aguardando a conexão do outro jogador.",
        "success"
      );
    });
  };

  if (socket.connected) {
    request();
  } else {
    socket.once("connect", request);
  }
}

$("onlineBtn").addEventListener("click", () => {
  $("roomInfo").hidden = true;
  $("roomCodeInput").value = "";
  setOnlineStatus("Crie uma sala ou digite o código de outra sala.");
  setOnlineButtonsDisabled(false);
  showScreen("onlineMenu");
});

$("createRoomBtn").addEventListener("click", () => {
  runOnlineRequest((socket, callback) => {
    socket.emit("create-room", callback);
  });
});

$("joinRoomBtn").addEventListener("click", () => {
  const code = $("roomCodeInput").value.trim().toUpperCase();

  if (!/^[A-F0-9]{6}$/.test(code)) {
    setOnlineStatus("Digite um código válido de 6 caracteres.", "error");
    return;
  }

  runOnlineRequest((socket, callback) => {
    socket.emit("join-room", code, callback);
  });
});

$("roomCodeInput").addEventListener("input", () => {
  $("roomCodeInput").value = $("roomCodeInput").value
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "")
    .slice(0, 6);
});

$("copyRoomCodeBtn").addEventListener("click", async () => {
  if (!onlineRoom) return;

  try {
    await navigator.clipboard.writeText(onlineRoom);
    setOnlineStatus("Código copiado! Envie para seu amigo.", "success");
  } catch {
    setOnlineStatus(
      `Copie manualmente este código: ${onlineRoom}`,
      "success"
    );
  }
});

$("backOnlineBtn").addEventListener("click", () => {
  onlineRequestPending = false;
  onlineRoom = null;
  onlineRole = null;

  if (onlineSocket) {
    onlineSocket.disconnect();
    onlineSocket = null;
  }

  $("roomInfo").hidden = true;
  setOnlineButtonsDisabled(false);
  showScreen("modeMenu");
});
$("playBtn").addEventListener("click", () => showScreen("modeMenu"));
$("instructionsBtn").addEventListener("click", () => showScreen("instructionsMenu"));
$("backModeBtn").addEventListener("click", () => showScreen("mainMenu"));
$("backInstructionsBtn").addEventListener("click", () => showScreen("mainMenu"));

$("soloBtn").addEventListener("click", () => startGame("solo"));
$("duoBtn").addEventListener("click", () => startGame("duo"));

$("menuBtn").addEventListener("click", returnToMenu);
$("gameOverMenuBtn").addEventListener("click", returnToMenu);
$("victoryMenuBtn").addEventListener("click", returnToMenu);

$("restartBtn").addEventListener("click", () => startGame(game.mode));
$("victoryRestartBtn").addEventListener("click", () => startGame(game.mode));
$("musicBtn").addEventListener("click", toggleMusic);

window.addEventListener("keydown", event => {
  const key = event.key;
  const blockedKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Tab"];

  if (blockedKeys.includes(key) && game.state === "playing") {
    event.preventDefault();
  }

  game.keys[key] = true;

  if (event.repeat) return;
  handleAbilityKey(key);
});

window.addEventListener("keyup", event => {
  game.keys[event.key] = false;
});

window.addEventListener("blur", () => {
  game.keys = {};
  resetJoysticks();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.keys = {};
    resetJoysticks();
  }
});

setupJoystick("joy1", 1);
setupJoystick("joy2", 2);
buildAbilityPanels();
updatePlayerPanels();
resetPlayerPanels();

requestAnimationFrame(timestamp => {
  game.lastTime = timestamp;
  requestAnimationFrame(loop);
});
