"use strict";

/* ===== CẤU HÌNH ===== */
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/A7HJ845Qg/";
const POSE_MAP = {
  // tên class trong model của bạn: skill1, skill2, def, idle
  skill1: "skill1",   // giơ tay trái
  skill2: "skill2",   // giơ tay phải
  def: "shield",      // hai tay bắt chéo (X)
  idle: "idle"        // đứng thẳng
};

const WORLD = { w: 960, h: 540, groundY: 470 };
const PLAYER_MAX_HP = 1200;
const BOSS_MAX_HP = 1200;
const SKILL1 = { dmg: 100, cd: 3000, speed: 620 };
const SKILL2 = { dmg: 150, cd: 5000, fuse: 1000 };
const BOSS_CFG = {
  shotDmg: 100, shotCd: 3000,
  slashDmg: 150, slashCd: 4000, slashRange: 220,
  shieldCdMin: 8000, shieldCdMax: 12000, shieldDur: 2000,
  moveSpeed: 95, keepMin: 120, keepMax: 200
};
const HEAL_PER_SEC = 5;
const SHIELD_FACTOR = 0.25;

/* ===== DOM ===== */
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
const video = $("video");
const poseLabel = $("pose-label");
const overlay = $("overlay");
const overlayTitle = $("overlay-title");
const overlaySub = $("overlay-sub");
const overlayBtn = $("overlay-btn");
const overlayBtn2 = $("overlay-btn2");
const helpBtn = $("help-btn");
const helpBack = $("help-back");
const overlayMain = $("overlay-main");
const helpPanel = $("help-panel");
const overlayActions = $("overlay-actions");
const bannerEl = $("banner");
const poseCanvas = $("pose-canvas");
const poseCtx = poseCanvas.getContext("2d");

/* ===== STATE ===== */
const STATE = {
  current: "home",       // home | loading | playing | won | lost
  pose: "idle",          // idle | skill1 | skill2 | shield
  poseAvailable: false,
  poseConfidence: 0,
  poseChangedAt: 0,
  last: null
};

const player = {
  x: 330, y: WORLD.groundY, w: 90, h: 140,
  hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
  facing: 1, vy: 0, onGround: true, crouch: false,
  invulnUntil: 0, shieldByKey: false,
  cd1: 0, cd2: 0
};
const boss = {
  x: 720, y: WORLD.groundY, w: 110, h: 160,
  hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP,
  facing: -1,
  shieldUntil: 0, nextShotAt: 0, nextSlashAt: 0, nextShieldAt: 0
};

const keys = Object.create(null);
let projectiles = [];
let bursts = [];
let reticles = [];
let slashes = [];
const images = { player: null, boss: null };

/* ===== ẢNH + FALLBACK ===== */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn("Không tải được " + src + " → dùng hình vẽ thay thế");
      resolve(null);
    };
    img.src = src;
  });
}

function drawFallback(c, kind, x, y, w, h) {
  c.save();
  if (kind === "player") {
    c.fillStyle = "#4fc3f7";
    c.beginPath(); c.arc(x + w / 2, y - 26, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#29b6f6";
    c.fillRect(x + w / 2 - 24, y - 48, 48, 14);
    c.fillStyle = "#81d4fa";
    c.fillRect(x + 14, y - h + 34, w - 28, h - 34);
  } else {
    c.fillStyle = "#ce93d8";
    c.beginPath(); c.arc(x + w / 2, y - 30, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ba68c8";
    c.fillRect(x + 8, y - h + 40, w - 16, h - 40);
    c.fillStyle = "#f3e5f5";
    c.fillRect(x + w / 2 - 16, y - 64, 32, 10);
  }
  c.restore();
}

function drawFighter(c, img, fallbackKind, e, now) {
  const bob = e.onGround === false ? 0 : Math.sin(now / 320 + e.x) * 2;
  const drawW = e.w, drawH = e.h;
  const drawX = e.x - drawW / 2;
  const drawY = e.y - drawH + bob;
  c.save();
  if (img) {
    if (e.facing && e.facing < 0) {
      c.translate(e.x, 0); c.scale(-1, 1); c.translate(-e.x, 0);
    }
    c.drawImage(img, drawX, drawY, drawW, drawH);
  } else {
    drawFallback(c, fallbackKind, drawX, e.y + bob, drawW, drawH);
  }
  c.restore();
}

/* ===== OVERLAY / BANNER ===== */
function showOverlay(title, sub, btnText, mode) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;
  overlayBtn.textContent = btnText;
  overlayTitle.className = mode === "win" ? "win" : mode === "lose" ? "lose" : "";
  overlayBtn2.classList.toggle("hidden", mode !== "win" && mode !== "lose");
  closeHelp();
  overlay.classList.remove("hidden");
}
function hideOverlay() { overlay.classList.add("hidden"); }

function openHelp() {
  overlayMain.classList.add("hidden");
  helpPanel.classList.remove("hidden");
}
function closeHelp() {
  helpPanel.classList.add("hidden");
  overlayMain.classList.remove("hidden");
}

let bannerTimer = 0;
function showBanner(text, ms = 3000) {
  bannerEl.textContent = text;
  bannerEl.classList.remove("hidden");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, ms);
}
function hideBanner() {
  clearTimeout(bannerTimer);
  bannerEl.classList.add("hidden");
}

function spawnConfetti() {
  const layer = document.createElement("div");
  layer.id = "confetti-layer";
  const colors = ["#ffd54a", "#ff6f00", "#fff176", "#ff4081", "#69f0ae", "#40c4ff"];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = (1.8 + Math.random() * 2.2) + "s";
    p.style.animationDelay = (Math.random() * 1.4) + "s";
    layer.appendChild(p);
  }
  document.getElementById("stage").appendChild(layer);
  setTimeout(() => layer.remove(), 6000);
}

/* ===== GAME STATE ===== */
function resetGame() {
  player.x = 330; player.hp = PLAYER_MAX_HP; player.facing = 1;
  player.vy = 0; player.crouch = false; player.invulnUntil = 0;
  player.cd1 = 0; player.cd2 = 0; player.shieldByKey = false;
  boss.x = 720; boss.hp = BOSS_MAX_HP; boss.shieldUntil = 0;
  const now = performance.now();
  boss.nextShotAt = now + 2500;
  boss.nextSlashAt = now + 4000;
  boss.nextShieldAt = now + (BOSS_CFG.shieldCdMin + BOSS_CFG.shieldCdMax) / 2;
  projectiles = []; bursts = []; reticles = []; slashes = [];
}

function updateHUD() {
  $("hp-player-fill").style.width = Math.max(0, player.hp / player.maxHp * 100) + "%";
  $("hp-boss-fill").style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
  $("hp-player-num").textContent = Math.max(0, Math.ceil(player.hp));
  $("hp-boss-num").textContent = Math.max(0, Math.ceil(boss.hp));
}

/* ===== INPUT ===== */
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
  if ((STATE.current === "won" || STATE.current === "lost") && (e.key === "r" || e.key === "R")) {
    startPlaying();
    return;
  }
  if (STATE.current !== "playing") return;
  // phím 1/2/3 là backup khi không có pose
  if (!STATE.poseAvailable) {
    if (e.key === "1") trySkill1();
    if (e.key === "2") trySkill2();
    if (e.key === "3") player.shieldByKey = true;
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
  if (e.key === "3") player.shieldByKey = false;
});

/* ===== PLAYER COMBAT ===== */
function playerHasShield(now) {
  if (STATE.poseAvailable && STATE.pose === "shield") return true;
  return !!player.shieldByKey;
}

function trySkill1(now = performance.now()) {
  if (STATE.current !== "playing") return;
  if (now < player.cd1) { showBanner("Skill 1 đang hồi chiêu", 1200); return; }
  player.cd1 = now + SKILL1.cd;
  projectiles.push({
    owner: "player",
    x: player.x + player.facing * 40,
    y: player.y - player.h * 0.6,
    vx: SKILL1.speed * player.facing,
    dmg: SKILL1.dmg,
    r: 9
  });
}

function trySkill2(now = performance.now()) {
  if (STATE.current !== "playing") return;
  if (now < player.cd2) { showBanner("Skill 2 đang hồi chiêu", 1200); return; }
  player.cd2 = now + SKILL2.cd;
  reticles.push({
    x: boss.x, y: boss.y - boss.h * 0.5,
    explodeAt: now + SKILL2.fuse,
    dmg: SKILL2.dmg, r: 46
  });
}

function applyDamageTo(target, amount, now) {
  if (target === player && now < player.invulnUntil) return;
  const shielding = target === player
    ? playerHasShield(now)
    : now < boss.shieldUntil;
  const real = shielding ? Math.ceil(amount * SHIELD_FACTOR) : amount;
  target.hp -= real;
  if (target === player) player.invulnUntil = now + 400;
  bursts.push({
    x: target.x, y: target.y - target.h * 0.5,
    born: now, text: "-" + real, shielded: shielding
  });
}

function movementAllowsKeys() {
  if (STATE.poseAvailable && STATE.pose !== "idle") return false;
  return true;
}

function updatePlayer(dt, now) {
  const canMove = movementAllowsKeys();
  player.crouch = canMove && !!keys["ArrowDown"] && player.onGround;

  let vx = 0;
  if (canMove && !player.crouch) {
    if (keys["ArrowRight"]) { vx = 230; player.facing = 1; }
    if (keys["ArrowLeft"]) { vx = -230; player.facing = -1; }
  }
  player.x = Math.max(40, Math.min(WORLD.w - 40, player.x + vx * dt));

  if (canMove && keys["ArrowUp"] && player.onGround) {
    player.vy = -750;
    player.onGround = false;
  }
  player.vy += 1400 * dt;
  player.y += player.vy * dt;
  if (player.y >= WORLD.groundY) {
    player.y = WORLD.groundY;
    player.vy = 0;
    player.onGround = true;
  }

  // pose skill kích hoạt chiêu
  if (STATE.poseAvailable && STATE.current === "playing") {
    if (STATE.pose === "skill1") trySkill1(now);
    if (STATE.pose === "skill2") trySkill2(now);
  }

  // hồi máu khi đứng yên thật sự (idle + không bấm phím)
  const idleOk = STATE.poseAvailable ? STATE.pose === "idle" : true;
  const pressing = keys["ArrowLeft"] || keys["ArrowRight"] || keys["ArrowUp"] || keys["ArrowDown"];
  if (idleOk && !pressing && player.hp > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + HEAL_PER_SEC * dt);
  }
}

/* ===== BOSS AI ===== */
function updateBoss(dt, now) {
  if (boss.hp <= 0) return;
  boss.facing = player.x < boss.x ? -1 : 1;

  // di chuyển: áp sát khi còn xa, lùi lại khi quá gần (giữ khoảng đánh)
  const dist = Math.abs(boss.x - player.x);
  if (dist > BOSS_CFG.keepMax) {
    boss.x += Math.sign(player.x - boss.x) * BOSS_CFG.moveSpeed * dt;
  } else if (dist < BOSS_CFG.keepMin) {
    boss.x -= Math.sign(player.x - boss.x) * BOSS_CFG.moveSpeed * 0.6 * dt;
  }
  boss.x = Math.max(60, Math.min(WORLD.w - 60, boss.x));

  if (now >= boss.nextShotAt) {
    boss.nextShotAt = now + BOSS_CFG.shotCd;
    projectiles.push({
      owner: "boss",
      x: boss.x + boss.facing * 45,
      y: boss.y - boss.h * 0.62,
      vx: boss.facing * 540,
      dmg: BOSS_CFG.shotDmg,
      r: 11
    });
  }

  if (dist < BOSS_CFG.slashRange && now >= boss.nextSlashAt && player.onGround) {
    boss.nextSlashAt = now + BOSS_CFG.slashCd;
    slashes.push({ x: player.x, y: player.y - player.h * 0.5, born: now });
    applyDamageTo(player, BOSS_CFG.slashDmg, now);
  }

  if (now >= boss.nextShieldAt) {
    boss.shieldUntil = now + BOSS_CFG.shieldDur;
    boss.nextShieldAt = now + BOSS_CFG.shieldCdMin +
      Math.random() * (BOSS_CFG.shieldCdMax - BOSS_CFG.shieldCdMin);
  }
}

/* ===== ĐẠN / HIỆU ỨNG ===== */
function updateProjectiles(dt, now) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * dt;
    if (p.x < -40 || p.x > WORLD.w + 40) { projectiles.splice(i, 1); continue; }

    if (p.owner === "player") {
      if (Math.abs(p.x - boss.x) < boss.w / 2 + p.r &&
          p.y > boss.y - boss.h && p.y < boss.y + 10) {
        applyDamageTo(boss, p.dmg, now);
        projectiles.splice(i, 1);
      }
    } else {
      const ph = player.crouch ? player.h * 0.55 : player.h;
      if (Math.abs(p.x - player.x) < player.w / 2 + p.r &&
          p.y > player.y - ph && p.y < player.y + 10) {
        applyDamageTo(player, p.dmg, now);
        projectiles.splice(i, 1);
      }
    }
  }
}

function updateEffects(now) {
  for (let i = reticles.length - 1; i >= 0; i--) {
    const r = reticles[i];
    if (now >= r.explodeAt) {
      applyDamageTo(boss, r.dmg, now);
      bursts.push({
        x: r.x, y: r.y, born: now,
        text: "-" + r.dmg, shielded: now < boss.shieldUntil, big: true
      });
      // nổ bay mất đạn boss trong bán kính
      projectiles = projectiles.filter(
        (p) => p.owner === "boss" && Math.abs(p.x - r.x) > 90
      );
      reticles.splice(i, 1);
    }
  }
  bursts = bursts.filter((b) => now - b.born < 900);
  slashes = slashes.filter((s) => now - s.born < 300);
}

function checkEnd() {
  if (STATE.current !== "playing") return;
  if (boss.hp <= 0) {
    boss.hp = 0;
    STATE.current = "won";
    showOverlay("CHIẾN THẮNG", "Boss đã bị hạ gục — warrior giỏi lắm!", "CHƠI LẠI", "win");
    spawnConfetti();
  } else if (player.hp <= 0) {
    player.hp = 0;
    STATE.current = "lost";
    showOverlay("BẠN ĐÃ THUA", "Thử lại nào — bấm nút hoặc nhấn R", "CHƠI LẠI", "lose");
  }
}

/* ===== BẮT ĐẦU / CHƠI LẠI ===== */
async function startGame() {
  STATE.current = "loading";
  showOverlay("ĐANG TẢI…", "Đang khởi tạo model và camera", "", "home");
  overlayActions.classList.add("hidden");
  if (!STATE.poseAvailable) {
    try {
      await initPose();
    } catch (err) {
      console.warn("Pose init failed:", err);
      STATE.poseAvailable = false;
      showBanner("Không khởi tạo được pose — chơi bằng phím 1/2/3 nhé!", 6000);
    }
  }
  overlayActions.classList.remove("hidden");
  startPlaying();
}

function startPlaying() {
  closeHelp();
  resetGame();
  STATE.current = "playing";
  hideOverlay();
  if (!STATE.poseAvailable) {
    showBanner("Chế độ phím: 1 = bắn, 2 = cầu nổ, 3 = khiên, ↑↓←→ di chuyển", 6000);
  }
}

function goHome() {
  STATE.current = "home";
  resetGame();
  showOverlay(
    "POSE FIGHTER",
    "Điều khiển bằng tư thế qua camera — chiến thắng boss!",
    "BẮT ĐẦU",
    "home"
  );
}

/* ===== POSE DETECTION ===== */
let poseModel = null;
let lastPose = "idle";

function resolveClass(className) {
  if (!className) return null;
  const c = className.trim().toLowerCase();
  for (const [cls, action] of Object.entries(POSE_MAP)) {
    if (cls.toLowerCase() === c || String(action).toLowerCase() === c) return action;
  }
  return null;
}

async function initPose() {
  if (!MODEL_URL) throw new Error("MODEL_URL chưa được điền");
  if (typeof tmPose === "undefined") throw new Error("Thư viện Teachable Machine chưa tải");

  showBanner("Đang tải model pose…", 15000);
  poseModel = await tmPose.load(MODEL_URL + "model.json", MODEL_URL + "metadata.json");

  showBanner("Đang xin quyền camera…", 15000);
  const stream = await Promise.race([
    navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    }),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("Camera không phản hồi (bị từ chối?)")), 12000)
    )
  ]);
  video.srcObject = stream;
  await new Promise((res) => { video.onloadedmetadata = () => res(); });
  await video.play();
  if (video.videoWidth && video.videoHeight) {
    // posenet đọc video.width/height (DOM attrs) để scale keypoints;
    // nếu = 0 → mọi position về (0,0). CSS width:100% vẫn giữ layout.
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    poseCanvas.width = video.videoWidth;
    poseCanvas.height = video.videoHeight;
  }

  STATE.poseAvailable = true;
  hideBanner();
  showBanner("Pose đã sẵn sàng — chơi thôi!", 2500);
  startPoseLoop();
}

function drawPoseSkeleton(pose) {
  poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
  if (!pose || !pose.keypoints) return;
  const minConfidence = 0.5;
  try {
    tmPose.drawKeypoints(pose.keypoints, minConfidence, poseCtx, 6, "lime", "#0b3d0b");
    tmPose.drawSkeleton(pose.keypoints, minConfidence, poseCtx, 3, "lime");
  } catch (err) {
    console.warn("drawSkeleton error", err);
  }
}

function startPoseLoop() {
  const loop = async () => {
    if (!STATE.poseAvailable) return;
    try {
      const { pose, posenetOutput } = await poseModel.estimatePose(video);
      const prediction = await poseModel.predict(posenetOutput);
      let best = null;
      for (const p of prediction) {
        if (!best || p.probability > best.probability) best = p;
      }
      const mapped = resolveClass(best ? best.className : null);
      const conf = best ? best.probability : 0;

      if (mapped && conf >= 0.6) {
        if (mapped !== lastPose) {
          lastPose = mapped;
          STATE.poseChangedAt = performance.now();
        }
        STATE.pose = mapped;
        STATE.poseConfidence = conf;
      } else if (performance.now() - STATE.poseChangedAt > 500) {
        STATE.pose = "idle";
        STATE.poseConfidence = conf;
      }
      poseLabel.textContent = "Pose: " + (best ? best.className : "?") +
        " (" + Math.round(conf * 100) + "%)";
      drawPoseSkeleton(pose);
    } catch (err) {
      console.warn("pose loop error", err);
    }
    setTimeout(loop, 120);
  };
  loop();
}

/* ===== UPDATE ===== */
function update(dt, now) {
  updatePlayer(dt, now);
  updateBoss(dt, now);
  updateProjectiles(dt, now);
  updateEffects(now);
  checkEnd();
}

/* ===== RENDER ===== */
function drawBackground(c) {
  const sky = c.createLinearGradient(0, 0, 0, WORLD.h);
  sky.addColorStop(0, "#2b1055");
  sky.addColorStop(0.55, "#5c2a8a");
  sky.addColorStop(1, "#ff7e5f");
  c.fillStyle = sky;
  c.fillRect(0, 0, WORLD.w, WORLD.h);

  c.fillStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137) % WORLD.w;
    const sy = (i * 61) % 220;
    c.fillRect(sx, sy, 2, 2);
  }

  c.fillStyle = "#1b5e20";
  c.beginPath();
  c.moveTo(0, WORLD.groundY);
  c.quadraticCurveTo(240, WORLD.groundY - 70, 480, WORLD.groundY);
  c.quadraticCurveTo(720, WORLD.groundY - 90, WORLD.w, WORLD.groundY);
  c.lineTo(WORLD.w, WORLD.h); c.lineTo(0, WORLD.h);
  c.closePath(); c.fill();

  c.fillStyle = "#2e7d32";
  c.fillRect(0, WORLD.groundY, WORLD.w, WORLD.h - WORLD.groundY);
}

function drawShield(c, e, now, isBoss) {
  const active = isBoss ? now < e.shieldUntil : playerHasShield(now);
  if (!active) return;
  const dir = isBoss ? -1 : 1;
  const r = Math.max(e.w, e.h) * 0.72;
  c.save();
  c.strokeStyle = "rgba(120, 220, 255, .95)";
  c.fillStyle = "rgba(120, 220, 255, .22)";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(e.x + dir * 34, e.y - e.h * 0.5, r, -Math.PI * 0.75, Math.PI * 0.75);
  c.stroke();
  c.beginPath();
  c.arc(e.x + dir * 34, e.y - e.h * 0.5, r, -Math.PI * 0.75, Math.PI * 0.75);
  c.fill();
  c.restore();
}

function drawCooldownOverlays(now) {
  const set = (id, readyIn, total) => {
    const el = $(id);
    const pct = readyIn > 0 ? Math.max(0, Math.min(100, (readyIn / total) * 100)) : 0;
    el.style.setProperty("--cd-pct", pct + "%");
    el.classList.toggle("ready", readyIn <= 0);
  };
  set("cd1", player.cd1 - now, SKILL1.cd);
  set("cd2", player.cd2 - now, SKILL2.cd);
  set("cd3", playerHasShield(now) ? 1 : 0, 1);
}

function render(c, now) {
  c.clearRect(0, 0, WORLD.w, WORLD.h);
  drawBackground(c);

  if (STATE.current === "home" || STATE.current === "loading") return;

  drawShield(c, boss, now, true);
  drawFighter(c, images.boss, "boss", boss, now);
  drawShield(c, player, now, false);
  drawFighter(c, images.player, "player", player, now);

  // hồng tâm skill 2
  for (const r of reticles) {
    const t = Math.max(0, (r.explodeAt - now) / SKILL2.fuse);
    c.save();
    c.strokeStyle = "#ff4d94";
    c.lineWidth = 4;
    c.beginPath(); c.arc(r.x, r.y, r.r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(r.x, r.y, r.r * t, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(r.x - r.r * 1.3, r.y); c.lineTo(r.x + r.r * 1.3, r.y);
    c.moveTo(r.x, r.y - r.r * 1.3); c.lineTo(r.x, r.y + r.r * 1.3);
    c.stroke();
    c.fillStyle = "rgba(255,77,148,.2)";
    c.beginPath(); c.arc(r.x, r.y, r.r, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // đạn
  for (const p of projectiles) {
    c.save();
    c.fillStyle = p.owner === "player" ? "#ffe27a" : "#ff5252";
    c.shadowColor = c.fillStyle;
    c.shadowBlur = 14;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // hiệu ứng chém
  for (const s of slashes) {
    const a = 1 - (now - s.born) / 300;
    c.save();
    c.globalAlpha = Math.max(0, a);
    c.strokeStyle = "#fff";
    c.lineWidth = 7;
    c.beginPath();
    c.arc(s.x, s.y, 60, -Math.PI * 0.8, Math.PI * 0.3);
    c.stroke();
    c.restore();
  }

  // số damage bay lên
  for (const b of bursts) {
    const age = (now - b.born) / 900;
    c.save();
    c.globalAlpha = Math.max(0, 1 - age);
    c.fillStyle = b.shielded ? "#78dcff" : b.big ? "#ff4d94" : "#fff";
    c.font = (b.big ? "bold 40px " : "bold 24px ") + "Segoe UI";
    c.textAlign = "center";
    c.fillText(b.text, b.x, b.y - age * 46);
    c.restore();
  }

  drawCooldownOverlays(now);
}

/* ===== GAME LOOP ===== */
function tick(now) {
  requestAnimationFrame(tick);
  if (STATE.last == null) STATE.last = now;
  const dt = Math.min((now - STATE.last) / 1000, 0.05);
  STATE.last = now;
  if (STATE.current === "playing") update(dt, now);
  render(ctx, now);
  updateHUD();
}

window.addEventListener("DOMContentLoaded", async () => {
  [images.player, images.boss] = await Promise.all([
    loadImage("player.png"),
    loadImage("boss.png")
  ]);
  overlayBtn.addEventListener("click", () => {
    if (STATE.current === "home") startGame();
    else startPlaying();
  });
  overlayBtn2.addEventListener("click", goHome);
  helpBtn.addEventListener("click", openHelp);
  helpBack.addEventListener("click", closeHelp);
  resetGame();
  requestAnimationFrame(tick);
});
