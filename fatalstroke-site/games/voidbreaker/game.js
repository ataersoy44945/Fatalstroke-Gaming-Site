/* ============================================================================
 * VOIDBREAKER — Top-down Neon Roguelike Shooter
 * ----------------------------------------------------------------------------
 * Düzenleme noktaları (hepsi dosyanın üstünde):
 *   CONFIG    → genel oyun ayarları (oyuncu, mermi, oda, derinlik formülü)
 *   ENEMIES   → düşman türleri (hp, hız, hasar, AI tipi, ödül)
 *   UPGRADES  → run içi geliştirmeler (oda sonu seçim ekranı)
 *   PERMA     → kalıcı yükseltmeler (coin ile alınır, localStorage)
 *
 * Yeni düşman/upgrade/perma eklemek: ilgili diziye yeni nesne ekle, bitti.
 * ========================================================================= */

(() => {
  "use strict";

  /* ==========================================================================
   * 1. CONFIG
   * ----------------------------------------------------------------------- */
  const CONFIG = {
    // Canvas (logical)
    LW: 800, LH: 500,
    // Oda alanı (HUD üst payı düşülerek)
    roomTop:    56,
    roomMargin: 24,             // canvas kenarından duvar kalınlığı
    // Oyuncu
    playerStartHp:    5,
    playerSize:       12,
    playerSpeed:      230,     // px/s
    playerInvuln:     0.7,     // hasar sonrası süre (s) dokunulmaz
    // Mermi (oyuncu)
    bulletSpeed:      720,
    bulletDamage:     1,
    bulletSize:       4,
    bulletLifetime:   0.9,     // s
    fireRate:         4.0,     // shots/sec
    multishotSpread:  0.18,    // rad — multishot'ta her ek mermi arası açı
    // Düşman mermisi
    enemyBulletSpeed: 280,
    enemyBulletSize:  5,
    // Oda / derinlik
    obstacleCount:    [2, 5],  // min, max
    obstacleSize:     [40, 100],
    enemyCountBase:   2,       // depth 1'de spawn sayısı
    enemyCountGrowth: 0.7,     // her depth +X
    enemyCountMax:    12,
    bossEvery:        5,       // her N. odada boss
    // Coin
    coinDropPct:      0.4,     // her düşmanın coin düşürme şansı
    coinValue:        1,
    coinRoomBonus:    2,       // oda temizleme bonusu
    coinPickupRadius: 18,      // coin'in oyuncuya çekildiği mesafe
    // Render
    particleCap:      120,
  };


  /* ==========================================================================
   * 2. ENEMIES
   * -----------------------------------------------------------------------
   *   hp, speed, damage(contact), size, color, bounty(coin)
   *   ai: "chase" | "shoot" | "boss"
   *   shoot için: projSpeed, fireRate (shots/sec), range (px — bu mesafe içinde yaklaşmaz)
   *   weight: dalga karışımında çekilme ağırlığı (depth'e göre filtrelenir)
   *   minDepth: bu derinlik ve sonrasında çıkmaya başlar
   * ----------------------------------------------------------------------- */
  const ENEMIES = {
    grunt:    { hp: 2,  speed: 90,  damage: 1, size: 12, color: "#22d3ee", accent: "#7af0e0",
                bounty: 2, ai: "chase", weight: 4, minDepth: 1 },
    swarm:    { hp: 1,  speed: 170, damage: 1, size: 8,  color: "#ff3e8a", accent: "#ff9ec4",
                bounty: 1, ai: "chase", weight: 3, minDepth: 2 },
    shooter:  { hp: 3,  speed: 60,  damage: 1, size: 13, color: "#f5c542", accent: "#fce58a",
                bounty: 4, ai: "shoot", weight: 3, minDepth: 3,
                projSpeed: 280, fireRate: 0.7, range: 240 },
    tank:     { hp: 10, speed: 45,  damage: 2, size: 18, color: "#b537f2", accent: "#e29bff",
                bounty: 8, ai: "chase", weight: 2, minDepth: 4 },
    boss:     { hp: 70, speed: 70,  damage: 3, size: 30, color: "#ff3e8a", accent: "#ff9ec4",
                bounty: 30, ai: "boss", weight: 0, minDepth: 999,
                projSpeed: 320, fireRate: 1.3 },
  };


  /* ==========================================================================
   * 3. UPGRADES — Run içi (oda sonu seçim)
   * -----------------------------------------------------------------------
   *   id, name, desc, icon, apply(stats)
   *   maxStacks: aynı upgrade kaç kez alınabilir (varsayılan 5)
   * ----------------------------------------------------------------------- */
  const UPGRADES = [
    { id: "dmg",     name: "+1 HASAR",      icon: "+",  desc: "Mermiler 1 hasar daha verir.",
      apply: (s) => { s.damage += 1; } },
    { id: "fire",    name: "+ATEŞ HIZI",    icon: "≣",  desc: "Saniyede daha çok atış.",
      apply: (s) => { s.fireRate += 1.0; } },
    { id: "multi",   name: "+1 MERMİ",      icon: "❋",  desc: "Tek atışta bir mermi daha çıkar.",
      apply: (s) => { s.multishot += 1; }, maxStacks: 3 },
    { id: "pierce",  name: "+1 DELME",      icon: "→",  desc: "Mermiler bir düşman daha deler.",
      apply: (s) => { s.pierce += 1; }, maxStacks: 3 },
    { id: "speed",   name: "+HAREKET HIZI", icon: "⤧",  desc: "Daha hızlı koşarsın.",
      apply: (s) => { s.moveSpeed += 40; } },
    { id: "hp",      name: "+1 MAX CAN",    icon: "♥",  desc: "Maks canın artar ve dolar.",
      apply: (s) => { s.maxHp += 1; s.hp = s.maxHp; } },
    { id: "heal",    name: "TAM CAN",       icon: "✚",  desc: "Canını sıfırla doldur.",
      apply: (s) => { s.hp = s.maxHp; }, maxStacks: 99 },
    { id: "bsize",   name: "+MERMİ BOYUT",  icon: "●",  desc: "Mermiler büyür (daha kolay isabet).",
      apply: (s) => { s.bulletSize += 1.5; }, maxStacks: 3 },
    { id: "bspeed",  name: "+MERMİ HIZI",   icon: "»",  desc: "Mermiler daha hızlı uçar.",
      apply: (s) => { s.bulletSpeed += 220; }, maxStacks: 3 },
    { id: "magnet",  name: "COIN MIKNATIS", icon: "◆",  desc: "Coin çekme menzili büyür.",
      apply: (s) => { s.pickupRadius += 40; }, maxStacks: 3 },
  ];


  /* ==========================================================================
   * 4. PERMA — Kalıcı yükseltmeler (coin ile)
   * -----------------------------------------------------------------------
   *   id, name, desc, baseCost, costGrowth (her seviyede +X), max, apply(stats)
   * ----------------------------------------------------------------------- */
  const PERMA = [
    { id: "hp",     name: "+1 BAŞLANGIÇ CAN",  desc: "Maks can artar.",
      baseCost: 8,  costGrowth: 6, max: 5,
      apply: (s, lvl) => { s.maxHp += lvl; s.hp += lvl; } },
    { id: "dmg",    name: "+1 BAŞLANGIÇ HASAR", desc: "Mermi hasarı artar.",
      baseCost: 12, costGrowth: 8, max: 3,
      apply: (s, lvl) => { s.damage += lvl; } },
    { id: "fire",   name: "+0.5 ATEŞ HIZI",   desc: "Başlangıç ateş hızı artar.",
      baseCost: 10, costGrowth: 8, max: 3,
      apply: (s, lvl) => { s.fireRate += 0.5 * lvl; } },
    { id: "speed",  name: "+30 HAREKET",       desc: "Başlangıç hareket hızı artar.",
      baseCost: 8,  costGrowth: 6, max: 3,
      apply: (s, lvl) => { s.moveSpeed += 30 * lvl; } },
    { id: "coin",   name: "+%25 COIN",         desc: "Düşmandan düşen coin artar.",
      baseCost: 15, costGrowth: 10, max: 3,
      apply: (s, lvl) => { s.coinMult *= (1 + 0.25 * lvl); } },
    { id: "magnet", name: "+COIN MIKNATIS",   desc: "Başlangıç coin çekme menzili.",
      baseCost: 6, costGrowth: 5, max: 3,
      apply: (s, lvl) => { s.pickupRadius += 30 * lvl; } },
  ];


  /* ==========================================================================
   * 5. STATE & STORAGE
   * ----------------------------------------------------------------------- */
  const STATE = Object.freeze({
    TITLE: "title", PERMA: "perma", PLAYING: "playing", PAUSED: "paused",
    UPGRADE: "upgrade", DEAD: "dead",
  });
  let state = STATE.TITLE;

  const LS = {
    coins:    "voidbreaker:coins",       // mevcut kalıcı coin bakiyesi
    bestDepth:"voidbreaker:bestDepth",   // en derin ulaşılan
    perma:    "voidbreaker:perma",       // kalıcı upgrade seviyeleri (id → lvl)
    muted:    "voidbreaker:muted",
  };
  const lsGet = (k)    => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  function loadCoins()    { return Number(lsGet(LS.coins)) || 0; }
  function saveCoins(n)   { lsSet(LS.coins, String(Math.max(0, Math.floor(n)))); }
  function loadBestDepth(){ return Number(lsGet(LS.bestDepth)) || 0; }
  function saveBestDepth(n){ lsSet(LS.bestDepth, String(n)); }
  function loadPerma() {
    try { return JSON.parse(lsGet(LS.perma)) || {}; } catch { return {}; }
  }
  function savePerma(obj) { lsSet(LS.perma, JSON.stringify(obj)); }

  let muted = lsGet(LS.muted) === "1";

  // Runtime — startGame()'de doldurulur
  let player    = null;
  let bullets   = [];
  let enemyBullets = [];
  let enemies   = [];
  let particles = [];
  let coins     = [];        // yere düşen coinler
  let obstacles = [];
  let depth     = 1;
  let runCoins  = 0;
  let roomCleared = false;
  let roomExitOpen = false;
  let exitDoor  = null;      // { x, y, w, h }
  let upgradeChoices = [];   // mevcut yükseltme seçimleri
  let shakeT    = 0;         // ekran sallama
  // Run stats (her run sonunda death screen'de gösterilir)
  let runStats = null;
  function resetRunStats() {
    runStats = {
      startTime: performance.now(),
      kills: 0,
      killsByType: {},
      bulletsFired: 0,
      bulletsHit: 0,
      damageTaken: 0,
      upgradesPicked: 0,
    };
  }


  /* ==========================================================================
   * 6. AUDIO — Web Audio API
   * ----------------------------------------------------------------------- */
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx || muted) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { audioCtx = null; }
  }
  function tone({ freq, freqEnd, dur = 0.1, type = "sine", vol = 1, atk = 0.005, rel = 0.04 }) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), t0 + dur);
    const v = vol * 0.12;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + atk);
    g.gain.linearRampToValueAtTime(0, t0 + dur + rel);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + rel + 0.02);
  }
  const sfx = {
    shoot:  () => tone({ freq: 1100, freqEnd: 600,  dur: 0.05, type: "square",   vol: 0.25 }),
    hit:    () => tone({ freq: 380,  freqEnd: 240,  dur: 0.06, type: "square",   vol: 0.3 }),
    kill:   () => tone({ freq: 520,  freqEnd: 1040, dur: 0.10, type: "triangle", vol: 0.45 }),
    hurt:   () => tone({ freq: 200,  freqEnd: 80,   dur: 0.20, type: "sawtooth", vol: 0.55, rel: 0.1 }),
    enemyShoot: () => tone({ freq: 460, freqEnd: 240, dur: 0.06, type: "square",  vol: 0.25 }),
    coin:   () => tone({ freq: 1400, freqEnd: 1800, dur: 0.05, type: "triangle", vol: 0.35 }),
    upgrade:() => { tone({ freq: 660, freqEnd: 990,  dur: 0.10, type: "triangle", vol: 0.55 });
                    tone({ freq: 990, freqEnd: 1320, dur: 0.10, type: "triangle", vol: 0.40 }); },
    roomClr:() => { tone({ freq: 440, freqEnd: 660,  dur: 0.10, type: "square",   vol: 0.45 });
                    tone({ freq: 660, freqEnd: 880,  dur: 0.10, type: "square",   vol: 0.35 }); },
    door:   () => tone({ freq: 880,  freqEnd: 1320, dur: 0.18, type: "triangle", vol: 0.45 }),
    boss:   () => { tone({ freq: 110, freqEnd: 220, dur: 0.4, type: "sawtooth", vol: 0.7, rel: 0.2 });
                    tone({ freq: 220, freqEnd: 110, dur: 0.4, type: "square",   vol: 0.5, rel: 0.2 }); },
    dead:   () => { tone({ freq: 240, freqEnd: 80, dur: 0.6, type: "sawtooth", vol: 0.7, rel: 0.2 });
                    tone({ freq: 120, freqEnd: 40, dur: 0.5, type: "square",   vol: 0.5, rel: 0.2 }); },
  };


  /* ==========================================================================
   * 7. CANVAS / RESIZE
   * ----------------------------------------------------------------------- */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const LW = CONFIG.LW, LH = CONFIG.LH;
  let dpr = 1;
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(LW * dpr);
    canvas.height = Math.round(LH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);


  /* ==========================================================================
   * 8. INPUT — Klavye + Fare + Mobil twin-stick
   * ----------------------------------------------------------------------- */
  const input = {
    up: false, down: false, left: false, right: false,
    mouseX: LW / 2, mouseY: LH / 2,
    firing: false,
    // Mobil
    moveVec:   { x: 0, y: 0 },    // sol stick normalize edilmiş
    aimVec:    { x: 0, y: 0 },    // sağ stick normalize edilmiş
    aimActive: false,
  };

  // Klavye
  window.addEventListener("keydown", (e) => {
    if (state === STATE.PLAYING) {
      if (e.code === "KeyW" || e.code === "ArrowUp")    { input.up    = true; e.preventDefault(); }
      if (e.code === "KeyS" || e.code === "ArrowDown")  { input.down  = true; e.preventDefault(); }
      if (e.code === "KeyA" || e.code === "ArrowLeft")  { input.left  = true; e.preventDefault(); }
      if (e.code === "KeyD" || e.code === "ArrowRight") { input.right = true; e.preventDefault(); }
      if (e.code === "KeyP" || e.code === "Escape")     { pauseGame();        e.preventDefault(); }
      if (e.code === "KeyM") toggleMute();
    } else if (state === STATE.TITLE) {
      if (e.code === "Space" || e.code === "Enter") { startGame(); e.preventDefault(); }
    } else if (state === STATE.PAUSED) {
      if (e.code === "Escape" || e.code === "KeyP") { resumeGame(); e.preventDefault(); }
    } else if (state === STATE.DEAD) {
      if (e.code === "Space" || e.code === "Enter") { startGame(); e.preventDefault(); }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyW" || e.code === "ArrowUp")    input.up    = false;
    if (e.code === "KeyS" || e.code === "ArrowDown")  input.down  = false;
    if (e.code === "KeyA" || e.code === "ArrowLeft")  input.left  = false;
    if (e.code === "KeyD" || e.code === "ArrowRight") input.right = false;
  });

  // Fare
  function canvasToLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (LW / rect.width);
    const y = (clientY - rect.top)  * (LH / rect.height);
    return { x, y };
  }
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const { x, y } = canvasToLogical(e.clientX, e.clientY);
    input.mouseX = x; input.mouseY = y;
  });
  canvas.addEventListener("pointerdown", (e) => {
    ensureAudio();
    if (e.pointerType === "touch") return;
    input.firing = true;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") return;
    input.firing = false;
  });
  canvas.addEventListener("pointerleave", () => { input.firing = false; });
  // Sağ tıkla varsayılan menü engelleme
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Mobil — twin stick
  const stickLeft  = document.getElementById("stick-left");
  const stickRight = document.getElementById("stick-right");
  const stickLeftBase  = document.getElementById("stick-left-base");
  const stickLeftKnob  = document.getElementById("stick-left-knob");
  const stickRightBase = document.getElementById("stick-right-base");
  const stickRightKnob = document.getElementById("stick-right-knob");
  const STICK_RADIUS = 50;     // knob ile base merkez arasındaki max mesafe

  function setupStick(zone, base, knob, onMove, onEnd) {
    let activeId = null;
    let startX = 0, startY = 0;
    zone.addEventListener("pointerdown", (e) => {
      if (activeId !== null) return;
      activeId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      base.style.left = (startX - 55) + "px";
      base.style.top  = (startY - 55) + "px";
      knob.style.left = (startX - 25) + "px";
      knob.style.top  = (startY - 25) + "px";
      base.classList.add("active");
      knob.classList.add("active");
      ensureAudio();
      zone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== activeId) return;
      const rect = zone.getBoundingClientRect();
      const dx = (e.clientX - rect.left) - startX;
      const dy = (e.clientY - rect.top) - startY;
      const d = Math.hypot(dx, dy);
      const clamp = Math.min(d, STICK_RADIUS);
      const nx = d > 0 ? dx / d : 0;
      const ny = d > 0 ? dy / d : 0;
      knob.style.left = (startX - 25 + nx * clamp) + "px";
      knob.style.top  = (startY - 25 + ny * clamp) + "px";
      const mag = clamp / STICK_RADIUS;
      onMove({ x: nx * mag, y: ny * mag, mag });
      e.preventDefault();
    });
    const end = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      base.classList.remove("active");
      knob.classList.remove("active");
      onEnd();
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
    zone.addEventListener("pointerleave", end);
  }

  setupStick(stickLeft, stickLeftBase, stickLeftKnob,
    (v) => { input.moveVec.x = v.x; input.moveVec.y = v.y; },
    () => { input.moveVec.x = 0; input.moveVec.y = 0; });

  setupStick(stickRight, stickRightBase, stickRightKnob,
    (v) => {
      input.aimVec.x = v.x; input.aimVec.y = v.y;
      input.aimActive = v.mag > 0.15;
    },
    () => { input.aimVec.x = 0; input.aimVec.y = 0; input.aimActive = false; });


  /* ==========================================================================
   * 9. PLAYER + STATS + RUN START
   * ----------------------------------------------------------------------- */
  // Kalıcı yükseltmeleri uygulayarak başlangıç stats'ı üretir
  function makeStartStats() {
    const stats = {
      maxHp:        CONFIG.playerStartHp,
      hp:           CONFIG.playerStartHp,
      damage:       CONFIG.bulletDamage,
      fireRate:     CONFIG.fireRate,
      moveSpeed:    CONFIG.playerSpeed,
      multishot:    1,                // ana mermi (1 = tek atış)
      pierce:       0,
      bulletSpeed:  CONFIG.bulletSpeed,
      bulletSize:   CONFIG.bulletSize,
      pickupRadius: CONFIG.coinPickupRadius,
      coinMult:     1,
      // Run sırasında biriken upgrade sayıları (UI için)
      upgradeStacks: {},
    };
    const lvls = loadPerma();
    for (const p of PERMA) {
      const lvl = Math.max(0, Math.min(p.max, lvls[p.id] || 0));
      if (lvl > 0) p.apply(stats, lvl);
    }
    return stats;
  }

  function makePlayer() {
    const s = makeStartStats();
    return {
      x: LW / 2, y: (CONFIG.roomTop + LH) / 2,
      vx: 0, vy: 0,
      r: CONFIG.playerSize,
      angle: 0,
      stats: s,
      hp: s.hp, maxHp: s.maxHp,
      fireCooldown: 0,
      invulnT: 0,
    };
  }


  /* ==========================================================================
   * 10. ROOM GENERATION
   * ----------------------------------------------------------------------- */
  function roomBounds() {
    return {
      x1: CONFIG.roomMargin,
      y1: CONFIG.roomTop + CONFIG.roomMargin,
      x2: LW - CONFIG.roomMargin,
      y2: LH - CONFIG.roomMargin,
    };
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pickWeighted(items) {
    const total = items.reduce((s, it) => s + it.weight, 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function generateRoom() {
    obstacles = [];
    const b = roomBounds();

    // Boss odası: engel yok, geniş alan
    const isBoss = (depth % CONFIG.bossEvery === 0);
    if (!isBoss) {
      const nObs = randInt(CONFIG.obstacleCount[0], CONFIG.obstacleCount[1]);
      for (let i = 0; i < nObs; i++) {
        let tries = 0;
        while (tries++ < 20) {
          const w = randInt(CONFIG.obstacleSize[0], CONFIG.obstacleSize[1]);
          const h = randInt(CONFIG.obstacleSize[0], CONFIG.obstacleSize[1]);
          const x = randInt(b.x1 + 30, b.x2 - w - 30);
          const y = randInt(b.y1 + 30, b.y2 - h - 30);
          const rect = { x, y, w, h };
          // Oyuncu spawn bölgesinden uzak dur
          const cx = LW / 2, cy = (b.y1 + b.y2) / 2;
          if (rectContainsPoint(rect, cx, cy) || rectDistToPoint(rect, cx, cy) < 60) continue;
          // Diğer engellerle örtüşmesin
          if (obstacles.some((o) => rectsOverlap(o, rect))) continue;
          obstacles.push(rect);
          break;
        }
      }
    }

    // Düşmanları spawn et
    enemies = [];
    enemyBullets = [];
    bullets = [];
    particles = [];
    coins = [];
    roomCleared = false;
    roomExitOpen = false;
    exitDoor = null;

    if (isBoss) {
      const def = ENEMIES.boss;
      spawnEnemy("boss", LW / 2, b.y1 + 80, def);
      sfx.boss();
    } else {
      // Düşman karışımı: depth'e göre uygun türlerden ağırlıklı çek
      const available = Object.entries(ENEMIES)
        .filter(([id, def]) => id !== "boss" && depth >= def.minDepth)
        .map(([id, def]) => ({ id, def, weight: def.weight }));
      const count = Math.min(
        CONFIG.enemyCountBase + Math.floor((depth - 1) * CONFIG.enemyCountGrowth),
        CONFIG.enemyCountMax
      );
      for (let i = 0; i < count; i++) {
        const pick = pickWeighted(available);
        const def = pick.def;
        // Spawn pozisyonu — oyuncudan uzak ve engellere girmemiş
        let sx = 0, sy = 0, ok = false;
        for (let tries = 0; tries < 30; tries++) {
          sx = rand(b.x1 + 30, b.x2 - 30);
          sy = rand(b.y1 + 30, b.y2 - 30);
          const distToPlayer = Math.hypot(sx - LW / 2, sy - (b.y1 + b.y2) / 2);
          if (distToPlayer < 140) continue;
          if (obstacles.some((o) => circleRectOverlap(sx, sy, def.size + 6, o))) continue;
          ok = true; break;
        }
        if (!ok) { sx = b.x1 + 40; sy = b.y1 + 40; }
        spawnEnemy(pick.id, sx, sy, def);
      }
    }
  }

  function spawnEnemy(type, x, y, def) {
    enemies.push({
      type, x, y,
      vx: 0, vy: 0,
      r: def.size,
      hp: def.hp, maxHp: def.hp,
      fireT: 0.5 + Math.random() * 0.8,
      hitFlash: 0,
    });
  }


  /* ==========================================================================
   * 11. COLLISION HELPERS
   * ----------------------------------------------------------------------- */
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function rectContainsPoint(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function rectDistToPoint(r, x, y) {
    const cx = Math.max(r.x, Math.min(x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(y, r.y + r.h));
    return Math.hypot(x - cx, y - cy);
  }
  function circleRectOverlap(cx, cy, cr, r) {
    return rectDistToPoint(r, cx, cy) < cr;
  }
  function circleCircle(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy < (ar + br) * (ar + br);
  }

  // Daireyi tüm engellerden ve oda sınırından dışarı it
  function resolveCircleAgainstRects(ent, rects) {
    const b = roomBounds();
    // Oda sınırı
    if (ent.x - ent.r < b.x1) ent.x = b.x1 + ent.r;
    if (ent.x + ent.r > b.x2) ent.x = b.x2 - ent.r;
    if (ent.y - ent.r < b.y1) ent.y = b.y1 + ent.r;
    if (ent.y + ent.r > b.y2) ent.y = b.y2 - ent.r;
    // Engeller
    for (const r of rects) {
      const cx = Math.max(r.x, Math.min(ent.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(ent.y, r.y + r.h));
      const dx = ent.x - cx, dy = ent.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < ent.r * ent.r) {
        const d = Math.sqrt(d2) || 0.0001;
        ent.x = cx + (dx / d) * ent.r;
        ent.y = cy + (dy / d) * ent.r;
      }
    }
  }


  /* ==========================================================================
   * 12. UPDATE — Player, Bullets, Enemies, Particles
   * ----------------------------------------------------------------------- */
  function updatePlayer(dt) {
    const s = player.stats;

    // Hareket vektörü: klavye + mobil joystick (ikisini topla)
    let mx = 0, my = 0;
    if (input.left)  mx -= 1;
    if (input.right) mx += 1;
    if (input.up)    my -= 1;
    if (input.down)  my += 1;
    mx += input.moveVec.x;
    my += input.moveVec.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }

    player.vx = mx * s.moveSpeed;
    player.vy = my * s.moveSpeed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    resolveCircleAgainstRects(player, obstacles);

    // Nişan açısı: mobilde aimVec öncelikli, değilse fare
    if (input.aimActive) {
      player.angle = Math.atan2(input.aimVec.y, input.aimVec.x);
    } else {
      player.angle = Math.atan2(input.mouseY - player.y, input.mouseX - player.x);
    }

    // Ateş
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    const isFiring = input.firing || input.aimActive;
    if (isFiring && player.fireCooldown <= 0) {
      shoot();
      player.fireCooldown = 1 / s.fireRate;
    }

    // Hasar dokunulmazlığı
    if (player.invulnT > 0) player.invulnT = Math.max(0, player.invulnT - dt);

    // Düşman teması → hasar
    for (const e of enemies) {
      const def = ENEMIES[e.type];
      if (circleCircle(player.x, player.y, player.r, e.x, e.y, e.r) && player.invulnT <= 0) {
        damagePlayer(def.damage);
      }
    }

    // Coin topla
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const dx = player.x - c.x, dy = player.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < player.r + 6) {
        runCoins += c.value;
        coins.splice(i, 1);
        sfx.coin();
        spawnSpark(c.x, c.y, "#f5c542");
        updateHud();
      } else if (d < s.pickupRadius) {
        // çekme
        const pull = 380 * dt;
        c.x += (dx / d) * pull;
        c.y += (dy / d) * pull;
      }
    }

    // Oda çıkışı: cleared && exit door var && oyuncu kapıya dokundu
    if (roomCleared && exitDoor && rectContainsPoint(exitDoor, player.x, player.y)) {
      enterNextRoomTransition();
    }
  }

  function shoot() {
    const s = player.stats;
    sfx.shoot();
    if (runStats) runStats.bulletsFired += s.multishot;
    // Multishot: ana atış + ekstra mermiler arasında küçük açı yelpazesi
    const n = s.multishot;
    const spread = CONFIG.multishotSpread;
    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2) * spread;
      const a = player.angle + offset;
      bullets.push({
        x: player.x + Math.cos(a) * (player.r + 4),
        y: player.y + Math.sin(a) * (player.r + 4),
        vx: Math.cos(a) * s.bulletSpeed,
        vy: Math.sin(a) * s.bulletSpeed,
        r: s.bulletSize,
        damage: s.damage,
        pierce: s.pierce,
        hitSet: new Set(),
        life: CONFIG.bulletLifetime,
      });
    }
  }

  function damagePlayer(amount) {
    if (player.invulnT > 0) return;
    player.hp -= amount;
    player.invulnT = CONFIG.playerInvuln;
    shakeT = 0.25;
    sfx.hurt();
    spawnBurst(player.x, player.y, "#ff3e8a", 8);
    if (runStats) runStats.damageTaken += amount;
    updateHud();
    if (player.hp <= 0) {
      player.hp = 0;
      die();
    }
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 0.08;
    sfx.hit();
    spawnSpark(e.x, e.y, ENEMIES[e.type].color);
    if (runStats) runStats.bulletsHit += 1;
    if (e.hp <= 0) {
      killEnemy(e);
    }
  }

  function killEnemy(e) {
    const def = ENEMIES[e.type];
    sfx.kill();
    spawnBurst(e.x, e.y, def.color, e.type === "boss" ? 28 : 12);
    if (runStats) {
      runStats.kills += 1;
      runStats.killsByType[e.type] = (runStats.killsByType[e.type] || 0) + 1;
    }
    // Coin drop
    if (e.type === "boss" || Math.random() < CONFIG.coinDropPct) {
      const value = Math.max(1, Math.round(def.bounty * player.stats.coinMult));
      coins.push({
        x: e.x + rand(-6, 6), y: e.y + rand(-6, 6),
        value,
      });
    }
    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    if (enemies.length === 0) {
      onRoomCleared();
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const p = bullets[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || outOfRoom(p.x, p.y)) {
        bullets.splice(i, 1); continue;
      }
      // Engellere çarp
      if (obstacles.some((o) => rectContainsPoint(o, p.x, p.y))) {
        spawnSpark(p.x, p.y, "#7af0e0");
        bullets.splice(i, 1); continue;
      }
      // Düşmanlara çarp (pierce destekli)
      let destroyed = false;
      for (const e of enemies) {
        if (p.hitSet.has(e)) continue;
        if (circleCircle(p.x, p.y, p.r, e.x, e.y, e.r)) {
          damageEnemy(e, p.damage);
          p.hitSet.add(e);
          if (p.pierce > 0) { p.pierce -= 1; }
          else { destroyed = true; break; }
        }
      }
      if (destroyed) bullets.splice(i, 1);
    }
  }

  function updateEnemyBullets(dt) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const p = enemyBullets[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || outOfRoom(p.x, p.y)) { enemyBullets.splice(i, 1); continue; }
      if (obstacles.some((o) => rectContainsPoint(o, p.x, p.y))) {
        spawnSpark(p.x, p.y, "#ff9ec4");
        enemyBullets.splice(i, 1); continue;
      }
      if (circleCircle(p.x, p.y, p.r, player.x, player.y, player.r) && player.invulnT <= 0) {
        damagePlayer(p.damage);
        enemyBullets.splice(i, 1);
      }
    }
  }

  function outOfRoom(x, y) {
    const b = roomBounds();
    return x < b.x1 - 20 || x > b.x2 + 20 || y < b.y1 - 20 || y > b.y2 + 20;
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      const def = ENEMIES[e.type];
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const ang = Math.atan2(dy, dx);

      if (def.ai === "chase") {
        const speed = def.speed;
        e.x += (dx / dist) * speed * dt;
        e.y += (dy / dist) * speed * dt;
      } else if (def.ai === "shoot") {
        // Menzilden uzaksa yaklaş, yakındaysa biraz uzaklaş, fırsatta ateş
        const range = def.range;
        let mx = 0, my = 0;
        if (dist > range * 1.1)      { mx = dx / dist;  my = dy / dist; }
        else if (dist < range * 0.8) { mx = -dx / dist; my = -dy / dist; }
        e.x += mx * def.speed * dt;
        e.y += my * def.speed * dt;
        e.fireT -= dt;
        if (e.fireT <= 0 && dist < range * 1.3) {
          enemyBullets.push({
            x: e.x + Math.cos(ang) * (e.r + 4),
            y: e.y + Math.sin(ang) * (e.r + 4),
            vx: Math.cos(ang) * def.projSpeed,
            vy: Math.sin(ang) * def.projSpeed,
            r: CONFIG.enemyBulletSize,
            damage: def.damage,
            life: 2.0,
          });
          sfx.enemyShoot();
          e.fireT = 1 / def.fireRate;
        }
      } else if (def.ai === "boss") {
        // Boss: yavaşça yaklaşır + her cooldown'da 3'lü/5'li atış yapar
        const speed = def.speed * 0.6;
        e.x += (dx / dist) * speed * dt;
        e.y += (dy / dist) * speed * dt;
        e.fireT -= dt;
        if (e.fireT <= 0) {
          const n = 5;
          const spread = 0.35;
          for (let i = 0; i < n; i++) {
            const a = ang + (i - (n - 1) / 2) * spread;
            enemyBullets.push({
              x: e.x + Math.cos(a) * (e.r + 4),
              y: e.y + Math.sin(a) * (e.r + 4),
              vx: Math.cos(a) * def.projSpeed,
              vy: Math.sin(a) * def.projSpeed,
              r: CONFIG.enemyBulletSize + 1,
              damage: def.damage,
              life: 2.2,
            });
          }
          sfx.enemyShoot();
          e.fireT = 1 / def.fireRate;
        }
      }

      resolveCircleAgainstRects(e, obstacles);
    }
    // Düşmanların birbirine girmesini hafifçe önle
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i], b = enemies[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d > 0 && d < min) {
          const push = (min - d) * 0.5;
          a.x += (dx / d) * push; a.y += (dy / d) * push;
          b.x -= (dx / d) * push; b.y -= (dy / d) * push;
        }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function spawnSpark(x, y, color) {
    if (particles.length > CONFIG.particleCap) return;
    for (let i = 0; i < 4; i++) {
      particles.push({
        x, y,
        vx: rand(-120, 120), vy: rand(-120, 120),
        life: 0.25 + Math.random() * 0.15,
        maxLife: 0.4,
        color, size: 2 + Math.random() * 2,
      });
    }
  }
  function spawnBurst(x, y, color, n) {
    if (particles.length > CONFIG.particleCap) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.7,
        color, size: 2 + Math.random() * 3,
      });
    }
  }


  /* ==========================================================================
   * 13. ROOM CLEARED / EXIT / NEXT ROOM
   * ----------------------------------------------------------------------- */
  function onRoomCleared() {
    if (roomCleared) return;
    roomCleared = true;
    runCoins += CONFIG.coinRoomBonus;
    sfx.roomClr();
    // Çıkış kapısı: sağ duvarda
    const b = roomBounds();
    exitDoor = {
      x: b.x2 - 16, y: (b.y1 + b.y2) / 2 - 26,
      w: 16, h: 52,
    };
    roomExitOpen = true;
    sfx.door();
    updateHud();
  }

  function enterNextRoomTransition() {
    depth += 1;
    // Yeni oda yüklemeden önce yükseltme seçimi
    if (depth % CONFIG.bossEvery !== 1) {
      // Normal akış: önce yükseltme ekranı (boss'tan SONRAKİ ilk odaya geçerken de)
    }
    openUpgradeScreen();
  }


  /* ==========================================================================
   * 14. UPGRADE PICK SCREEN
   * ----------------------------------------------------------------------- */
  function rollUpgradeChoices() {
    // Stack limitlerine uyan upgrade'leri filtrele
    const stacks = player.stats.upgradeStacks;
    const pool = UPGRADES.filter((u) => {
      const max = u.maxStacks == null ? 5 : u.maxStacks;
      return (stacks[u.id] || 0) < max;
    });
    // 3 farklı seç
    const out = [];
    const used = new Set();
    while (out.length < 3 && out.length < pool.length) {
      const u = pool[Math.floor(Math.random() * pool.length)];
      if (used.has(u.id)) continue;
      used.add(u.id);
      out.push(u);
    }
    return out;
  }

  function openUpgradeScreen() {
    upgradeChoices = rollUpgradeChoices();
    const list = document.getElementById("upgrade-cards");
    list.innerHTML = "";
    upgradeChoices.forEach((u, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "upgrade-card";
      btn.innerHTML = `
        <div class="upgrade-card-icon" aria-hidden="true">${u.icon}</div>
        <div class="upgrade-card-name">${u.name}</div>
        <div class="upgrade-card-desc">${u.desc}</div>
      `;
      btn.addEventListener("click", () => pickUpgrade(idx));
      list.appendChild(btn);
    });
    setState(STATE.UPGRADE);
  }

  function pickUpgrade(idx) {
    const u = upgradeChoices[idx];
    if (u) {
      u.apply(player.stats);
      const stacks = player.stats.upgradeStacks;
      stacks[u.id] = (stacks[u.id] || 0) + 1;
      if (runStats) runStats.upgradesPicked += 1;
      sfx.upgrade();
    }
    // Yeni odayı kur ve oyna
    player.maxHp = player.stats.maxHp;
    if (player.hp > player.maxHp) player.hp = player.maxHp;
    generateRoom();
    setState(STATE.PLAYING);
    updateHud();
  }


  /* ==========================================================================
   * 15. RENDER
   * ----------------------------------------------------------------------- */
  function renderGame() {
    // Ekran sallama
    let sx = 0, sy = 0;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - 1/60);
      const amp = shakeT * 18;
      sx = rand(-amp, amp); sy = rand(-amp, amp);
    }
    ctx.save();
    ctx.translate(sx, sy);

    // Arka plan
    ctx.fillStyle = "#05050b";
    ctx.fillRect(0, 0, LW, LH);

    drawGrid();
    drawRoom();
    drawObstacles();
    drawExitDoor();
    drawCoins();
    drawEnemies();
    drawEnemyBullets();
    drawBullets();
    if (player) drawPlayer();
    drawParticles();

    ctx.restore();
  }

  function drawGrid() {
    const b = roomBounds();
    ctx.strokeStyle = "rgba(34,211,238,0.04)";
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = b.x1; x <= b.x2; x += step) {
      ctx.moveTo(x + 0.5, b.y1); ctx.lineTo(x + 0.5, b.y2);
    }
    for (let y = b.y1; y <= b.y2; y += step) {
      ctx.moveTo(b.x1, y + 0.5); ctx.lineTo(b.x2, y + 0.5);
    }
    ctx.stroke();
  }

  function drawRoom() {
    const b = roomBounds();
    // Çerçeve neon
    ctx.save();
    ctx.shadowColor = "#b537f2"; ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(181,55,242,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x1 + 0.5, b.y1 + 0.5, b.x2 - b.x1 - 1, b.y2 - b.y1 - 1);
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.fillStyle = "#13131f";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.save();
      ctx.shadowColor = "#b537f2"; ctx.shadowBlur = 8;
      ctx.strokeStyle = "rgba(181,55,242,0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      ctx.restore();
    }
  }

  function drawExitDoor() {
    if (!exitDoor) return;
    const d = exitDoor;
    const now = performance.now() * 0.004;
    const pulse = 0.6 + 0.4 * Math.sin(now * 2);
    ctx.save();
    ctx.shadowColor = "#5aff9c"; ctx.shadowBlur = 16 + pulse * 8;
    ctx.fillStyle = `rgba(90,255,156,${0.5 + pulse * 0.3})`;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = "#5aff9c"; ctx.lineWidth = 2;
    ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
    // Ok işareti
    ctx.fillStyle = "#0a3a1e";
    ctx.beginPath();
    ctx.moveTo(d.x + 4, d.y + d.h / 2 - 6);
    ctx.lineTo(d.x + d.w - 4, d.y + d.h / 2);
    ctx.lineTo(d.x + 4, d.y + d.h / 2 + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const p = player;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Invuln flash
    const visible = p.invulnT <= 0 || Math.floor(p.invulnT * 12) % 2 === 0;
    if (visible) {
      ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 14;
      ctx.fillStyle = "#0a0a14";
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.stroke();
      // Nişan ucu (varil)
      ctx.rotate(p.angle);
      ctx.fillStyle = "#7af0e0";
      ctx.fillRect(p.r - 2, -3, 12, 6);
    }
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      const def = ENEMIES[e.type];
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.shadowColor = def.color;
      ctx.shadowBlur = e.type === "boss" ? 22 : 12;
      const flash = e.hitFlash > 0;
      ctx.fillStyle = flash ? "#fff" : "#0a0a14";
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = flash ? "#fff" : def.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.stroke();
      // İç işaret (AI türüne göre simge)
      ctx.shadowBlur = 0;
      ctx.fillStyle = def.accent;
      if (def.ai === "shoot") {
        ctx.fillRect(-2, -2, 4, 4);
        ctx.fillRect(-e.r * 0.5, -1, 4, 2);
        ctx.fillRect(e.r * 0.5 - 4, -1, 4, 2);
      } else if (def.ai === "boss") {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const r = i % 2 === 0 ? e.r * 0.5 : e.r * 0.25;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(-2, -2, 4, 4);
      }
      ctx.restore();

      // HP bar (boss her zaman; diğerleri hasar varsa)
      if (e.type === "boss" || e.hp < e.maxHp) {
        const w = e.type === "boss" ? 80 : e.r * 2.2;
        const hh = 4;
        const yy = e.y - e.r - 10;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(e.x - w / 2, yy, w, hh);
        const pct = e.hp / e.maxHp;
        ctx.fillStyle = pct > 0.5 ? "#5aff9c" : pct > 0.25 ? "#f5c542" : "#ff3e8a";
        ctx.fillRect(e.x - w / 2, yy, w * pct, hh);
      }
    }
  }

  function drawBullets() {
    ctx.save();
    ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 10;
    for (const p of bullets) {
      ctx.fillStyle = "#7af0e0";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawEnemyBullets() {
    ctx.save();
    ctx.shadowColor = "#ff9ec4"; ctx.shadowBlur = 10;
    for (const p of enemyBullets) {
      ctx.fillStyle = "#ff9ec4";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = p.color; ctx.shadowBlur = 6;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  function drawCoins() {
    const now = performance.now() * 0.005;
    for (const c of coins) {
      const bob = Math.sin(now + c.x * 0.05) * 1.5;
      ctx.save();
      ctx.shadowColor = "#f5c542"; ctx.shadowBlur = 10;
      ctx.fillStyle = "#f5c542";
      ctx.beginPath(); ctx.arc(c.x, c.y + bob, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fce58a";
      ctx.beginPath(); ctx.arc(c.x, c.y + bob, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }


  /* ==========================================================================
   * 16. UI / STATE TRANSITIONS
   * ----------------------------------------------------------------------- */
  const $ = (s) => document.querySelector(s);
  const screens = {
    title:   $("#screen-title"),
    perma:   $("#screen-perma"),
    pause:   $("#screen-pause"),
    upgrade: $("#screen-upgrade"),
    dead:    $("#screen-dead"),
  };
  const hudTop   = $("#hud-top");
  const hudBuffs = $("#hud-buffs");
  const mctrls   = $("#mctrls");

  function isTouch() {
    return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  }

  function showOnly(name) {
    for (const [k, el] of Object.entries(screens)) el.hidden = (k !== name);
    const playing = name == null;
    hudTop.hidden = !playing;
    hudBuffs.hidden = !playing;
    mctrls.hidden = !(playing && isTouch());
  }
  function setState(s) {
    state = s;
    if (s === STATE.TITLE)         showOnly("title");
    else if (s === STATE.PERMA)    showOnly("perma");
    else if (s === STATE.PLAYING)  showOnly(null);
    else if (s === STATE.PAUSED)   { showOnly(null); screens.pause.hidden = false; hudTop.hidden = false; }
    else if (s === STATE.UPGRADE)  showOnly("upgrade");
    else if (s === STATE.DEAD)     showOnly("dead");
  }

  function startGame() {
    ensureAudio();
    player = makePlayer();
    depth = 1;
    runCoins = 0;
    resetRunStats();
    generateRoom();
    setState(STATE.PLAYING);
    updateHud();
  }
  function pauseGame() { if (state === STATE.PLAYING) setState(STATE.PAUSED); }
  function resumeGame() { if (state === STATE.PAUSED) setState(STATE.PLAYING); }

  function die() {
    sfx.dead();
    // Coin bakiyesini kalıcı hafızaya ekle
    const totalCoins = loadCoins() + runCoins;
    saveCoins(totalCoins);
    const isNew = depth > loadBestDepth();
    if (isNew) saveBestDepth(depth);

    $("#dead-depth").textContent = String(depth);
    $("#dead-coin").textContent  = String(runCoins);
    $("#dead-best").textContent  = String(loadBestDepth());
    $("#dead-newbest").hidden = !isNew;

    // Detaylı run stats
    renderRunStats();

    setState(STATE.DEAD);
  }

  function renderRunStats() {
    if (!runStats) return;
    const container = document.getElementById("dead-stats-detail");
    if (!container) return;
    const elapsed = ((performance.now() - runStats.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const timeStr = mins > 0 ? `${mins}d ${secs}s` : `${secs}s`;
    const acc = runStats.bulletsFired > 0
      ? Math.round(100 * runStats.bulletsHit / runStats.bulletsFired)
      : 0;
    // En çok öldürülen düşman türü
    let topType = "—", topCount = 0;
    for (const [t, n] of Object.entries(runStats.killsByType)) {
      if (n > topCount) { topCount = n; topType = t; }
    }
    const typeName = ENEMIES[topType] ? topType.charAt(0).toUpperCase() + topType.slice(1) : "—";
    container.innerHTML = `
      <div class="score-row"><span class="score-label">Öldürdüğün</span><span class="score-value score-value--soft">${runStats.kills}</span></div>
      <div class="score-row"><span class="score-label">İsabet</span><span class="score-value score-value--soft">%${acc}</span></div>
      <div class="score-row"><span class="score-label">Süre</span><span class="score-value score-value--soft">${timeStr}</span></div>
      <div class="score-row"><span class="score-label">Aldığın Hasar</span><span class="score-value score-value--soft">${Math.round(runStats.damageTaken)}</span></div>
      <div class="score-row"><span class="score-label">Yükseltme</span><span class="score-value score-value--soft">${runStats.upgradesPicked}</span></div>
      <div class="score-row"><span class="score-label">En Çok</span><span class="score-value score-value--soft">${typeName} ×${topCount}</span></div>
    `;
  }


  /* ==========================================================================
   * 17. HUD
   * ----------------------------------------------------------------------- */
  const hpFill   = $("#hp-fill");
  const hpText   = $("#hp-text");
  const sDepth   = $("#stat-depth");
  const sCoin    = $("#stat-coin");

  function updateHud() {
    if (!player) return;
    const pct = Math.max(0, player.hp / player.maxHp);
    hpFill.style.width = (pct * 100) + "%";
    hpText.textContent = `${player.hp}/${player.maxHp}`;
    sDepth.textContent = String(depth);
    sCoin.textContent  = String(runCoins);
    renderBuffs();
  }

  function renderBuffs() {
    if (!player) return;
    const stacks = player.stats.upgradeStacks;
    hudBuffs.innerHTML = "";
    for (const u of UPGRADES) {
      const n = stacks[u.id] || 0;
      if (n <= 0) continue;
      const chip = document.createElement("span");
      chip.className = "buff-chip";
      chip.innerHTML = `<span>${u.icon}</span><span>${u.name.replace(/^\+1?\s?/, "")}</span><span class="buff-chip-count">×${n}</span>`;
      hudBuffs.appendChild(chip);
    }
  }


  /* ==========================================================================
   * 18. PERMA UPGRADE MENU
   * ----------------------------------------------------------------------- */
  function permaCost(p, lvl) {
    return p.baseCost + p.costGrowth * lvl;
  }

  function renderPermaMenu() {
    const list = $("#perma-list");
    const lvls = loadPerma();
    let coins = loadCoins();
    $("#perma-coin").textContent = String(coins);
    list.innerHTML = "";
    for (const p of PERMA) {
      const lvl = Math.max(0, Math.min(p.max, lvls[p.id] || 0));
      const maxed = lvl >= p.max;
      const cost = permaCost(p, lvl);
      const item = document.createElement("div");
      item.className = "perma-item";
      const btnLabel = maxed ? "MAX" : `${cost} ◆`;
      const btnClass = maxed ? "perma-buy maxed" : "perma-buy";
      item.innerHTML = `
        <div class="perma-item-head">
          <span class="perma-name">${p.name}</span>
          <span class="perma-level">Lv ${lvl}/${p.max}</span>
        </div>
        <div style="font-size:12px;color:var(--text-soft)">${p.desc}</div>
        <button type="button" class="${btnClass}" data-id="${p.id}" ${maxed || cost > coins ? "disabled" : ""}>
          ${btnLabel}
        </button>
      `;
      list.appendChild(item);
    }
    // Event delegation
    list.querySelectorAll("button.perma-buy:not(:disabled)").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const p = PERMA.find((x) => x.id === id);
        if (!p) return;
        const lvls2 = loadPerma();
        const lvl = lvls2[id] || 0;
        if (lvl >= p.max) return;
        const cost = permaCost(p, lvl);
        const coins2 = loadCoins();
        if (coins2 < cost) return;
        saveCoins(coins2 - cost);
        lvls2[id] = lvl + 1;
        savePerma(lvls2);
        sfx.upgrade();
        renderPermaMenu();
      });
    });
  }

  function openPermaMenu(returnTo) {
    permaReturnState = returnTo;
    renderPermaMenu();
    setState(STATE.PERMA);
  }
  let permaReturnState = STATE.TITLE;


  /* ==========================================================================
   * 19. INPUT BAĞLAMA (UI)
   * ----------------------------------------------------------------------- */
  $("#btn-start").addEventListener("click", () => { ensureAudio(); startGame(); });
  $("#btn-perma").addEventListener("click", () => openPermaMenu(STATE.TITLE));
  $("#btn-perma-back").addEventListener("click", () => {
    if (permaReturnState === STATE.DEAD) setState(STATE.DEAD);
    else setState(STATE.TITLE);
  });
  $("#btn-resume").addEventListener("click", resumeGame);
  $("#btn-pause-quit").addEventListener("click", () => setState(STATE.TITLE));
  $("#btn-pause").addEventListener("click", pauseGame);
  $("#btn-skip-upgrade").addEventListener("click", () => pickUpgrade(-1));
  $("#btn-dead-retry").addEventListener("click", startGame);
  $("#btn-dead-perma").addEventListener("click", () => openPermaMenu(STATE.DEAD));
  $("#btn-dead-quit").addEventListener("click", () => setState(STATE.TITLE));

  // Mute
  const btnMute = $("#btn-mute");
  function applyMuteUI() {
    btnMute.querySelector("[data-on]").hidden  = muted;
    btnMute.querySelector("[data-off]").hidden = !muted;
    btnMute.setAttribute("aria-pressed", String(muted));
  }
  function toggleMute() {
    muted = !muted;
    lsSet(LS.muted, muted ? "1" : "0");
    applyMuteUI();
    if (!muted) ensureAudio();
  }
  btnMute.addEventListener("click", toggleMute);
  applyMuteUI();

  // Sekme arka plana → auto pause
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === STATE.PLAYING) pauseGame();
  });


  /* ==========================================================================
   * 20. MAIN UPDATE + LOOP
   * ----------------------------------------------------------------------- */
  function updateGame(dt) {
    updatePlayer(dt);
    if (state !== STATE.PLAYING) return;
    updateBullets(dt);
    updateEnemyBullets(dt);
    updateEnemies(dt);
    updateParticles(dt);
  }

  let lastTime = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1;

    if (state === STATE.PLAYING) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) { updateGame(STEP); acc -= STEP; steps++; }
      if (steps === 4) acc = 0;
    } else {
      acc = 0;
    }
    renderGame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => { lastTime = t; frame(t); });


  /* ==========================================================================
   * 21. INIT
   * ----------------------------------------------------------------------- */
  // Başlangıçta dummy oda (render çökmesin diye)
  obstacles = [];
  setState(STATE.TITLE);

})();
