/* ============================================================================
 * NEON DRIFT — Synthwave Endless Arcade
 * ----------------------------------------------------------------------------
 * Tek dosyada tüm oyun mantığı. Düzenleme noktaları:
 *
 *   CONFIG    → hız, zorluk, spawn sıklığı, görsel parametreleri
 *   VEHICLES  → araç listesi (istediğin kadar ekleyebilirsin)
 *
 * Render: sabit 540×960 mantıksal koordinatlarda. Ekrana CSS ile ölçeklenir,
 * yüksek DPI cihazlarda keskin görünür.
 * ========================================================================= */

(() => {
  "use strict";

  /* ==========================================================================
   * 1. CONFIG — Oyun ayarları (TEK DÜZENLEME NOKTASI)
   * ----------------------------------------------------------------------- */
  const CONFIG = {
    world: {
      logicalW: 540,
      logicalH: 960,
      laneCount: 3,
      roadWidth: 360,           // toplam yol genişliği (logical px)
      baseSpeed: 380,           // başlangıç hızı (px/sec)
      maxSpeed: 1300,           // hız tavanı
      accelPerSec: 16,          // her saniye hızlanma miktarı
    },

    player: {
      width: 56,
      height: 92,
      yFromBottom: 140,         // ekranın altından yukarı offset
      laneChangeBaseSpeed: 14,  // şerit geçişinde lerp katsayısı (× handling)
    },

    spawn: {
      gracePeriodSec: 1.5,      // başlangıçta engel yok (anında çarpma engeli)
      obstacleBaseInterval: 1.35, // engel spawn aralığı (sn)
      obstacleMinInterval: 0.55,  // hız arttıkça düşebileceği taban
      intervalDecayPerSec: 0.035, // her saniye spawn aralığı kısalır
      orbChance: 0.35,            // her spawn'da orb gelme şansı
      multiBlockSpeedThreshold: 750, // bu hızdan sonra ara sıra 2 şerit bloklanır
      multiBlockChance: 0.22,
    },

    score: {
      basePerSecond: 10,        // base hızda saniyede kaç puan
      orbValue: 50,
      shieldAbsorbPenalty: 0.5, // kalkanla yutulan çarpışmada hız %X düşer
    },

    effects: {
      gridSpacing: 60,          // arka plan grid hücre boyutu
      bgScrollMultiplier: 0.5,  // arka plan grid'i yola göre yarı hızda kaysın
      maxParticles: 200,
      trailEmitPerFrame: 2,
      shakeOnCrash: 16,         // crash sonrası kamera sarsıntı şiddeti (px)
    },

    audio: { masterVolume: 0.18 },
  };

  /* ==========================================================================
   * 2. VEHICLES — Araç listesi
   * -----------------------------------------------------------------------
   * stats:    1.0 = baseline. Yüksek değer = avantaj.
   *   speed     → dünya kayma hızının çarpanı (yüksek = hızlı + skor hızlı artar)
   *   accel     → hızlanma rampasının çarpanı
   *   handling  → şerit geçişinde lerp çarpanı (yüksek = çevik)
   *
   * shield:   sıfırdan büyükse, ilk çarpışmada 1 darbe yutar (yok edilir,
   *           crash olmaz, sadece hız düşer).
   *
   * shape:    Canvas'ta nasıl çizileceği (drawCar fonksiyonu okur).
   *   noseWidth/tailWidth → 0..1 oranı (gövde trapezi)
   *   wings → arka kanatlar
   *
   * Yeni araç eklemek için diziye yeni nesne ekle. id benzersiz olmalı.
   * ----------------------------------------------------------------------- */
  const VEHICLES = [
    {
      id: "pulse",
      name: "PULSE",
      tagline: "Dengeli temel araç. Yeni başlayanlar için.",
      color: "#b537f2",          // ana neon renk
      accentColor: "#22d3ee",    // ikincil (kokpit/farlar)
      stats: { speed: 1.00, accel: 1.00, handling: 1.00 },
      shield: 0,
      shape: { noseWidth: 0.75, tailWidth: 0.90, wings: false },
    },
    {
      id: "hyperion",
      name: "HYPERION",
      tagline: "Çok hızlı, sert kontrol. Skor avı için.",
      color: "#ff3e8a",
      accentColor: "#ffb547",
      stats: { speed: 1.30, accel: 1.35, handling: 0.72 },
      shield: 0,
      shape: { noseWidth: 0.55, tailWidth: 1.00, wings: true },
    },
    {
      id: "vortex",
      name: "VORTEX",
      tagline: "Çevik şerit geçişi, daha yavaş.",
      color: "#22d3ee",
      accentColor: "#7af0e0",
      stats: { speed: 0.92, accel: 0.85, handling: 1.55 },
      shield: 0,
      shape: { noseWidth: 0.95, tailWidth: 0.70, wings: false },
    },
    {
      id: "aegis",
      name: "AEGIS",
      tagline: "Tank — bir çarpışmayı yutar (1 kalkan).",
      color: "#f5c542",
      accentColor: "#ffe27a",
      stats: { speed: 0.85, accel: 0.78, handling: 0.88 },
      shield: 1,
      shape: { noseWidth: 1.00, tailWidth: 1.00, wings: true },
    },
  ];

  // Engel araçları için renk paleti (tehlike tonu)
  const OBSTACLE_PALETTE = [
    { color: "#ff3e8a", accent: "#ff9ec4" },
    { color: "#ff6b3e", accent: "#ffb892" },
    { color: "#e2e2e8", accent: "#ffffff" },
  ];


  /* ==========================================================================
   * 3. STATE & STORAGE
   * ----------------------------------------------------------------------- */
  const STATE = Object.freeze({
    TITLE: "title", SELECT: "select",
    PLAYING: "playing", PAUSED: "paused", GAMEOVER: "gameover",
  });
  let state = STATE.TITLE;
  let game = null;  // Çalışma zamanı oyun durumu — startGame()'de oluşturulur.
                    // Mutlaka burada deklare etmek lazım: aksi halde "use strict"
                    // altında tanımsız atama, ayrıca <canvas id="game"> nedeniyle
                    // window.game implicit globali (canvas elementi) ile çakışır.

  const LS = {
    selected: "neon-drift:selectedVehicle",
    highPrefix: "neon-drift:high:",
    muted: "neon-drift:muted",
  };

  function lsGet(k)         { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v)      { try { localStorage.setItem(k, v); }    catch { /* sessiz */ } }

  function loadSelectedVehicle() {
    const id = lsGet(LS.selected);
    return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
  }
  function saveSelectedVehicle(v) { lsSet(LS.selected, v.id); }
  function loadHigh(vId)          { return Number(lsGet(LS.highPrefix + vId)) || 0; }
  function saveHigh(vId, score)   { lsSet(LS.highPrefix + vId, String(Math.round(score))); }

  let selectedVehicle = loadSelectedVehicle();
  let muted = lsGet(LS.muted) === "1";


  /* ==========================================================================
   * 4. AUDIO — Web Audio API ile prosedürel sesler
   * ----------------------------------------------------------------------- */
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx || muted) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { audioCtx = null; }
  }
  function playTone({ freq, freqEnd, duration = 0.1, type = "sine",
                      volume = 1, attack = 0.005, release = 0.04 }) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), t0 + duration);
    }
    const v = volume * CONFIG.audio.masterVolume;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(v, t0 + attack);
    gain.gain.linearRampToValueAtTime(0, t0 + duration + release);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + release + 0.02);
  }
  const sfx = {
    collect:    () => playTone({ freq: 880, freqEnd: 1480, duration: 0.10, type: "triangle", volume: 0.7 }),
    crash:      () => {
      playTone({ freq: 200, freqEnd: 50,  duration: 0.55, type: "sawtooth", volume: 0.95, release: 0.2 });
      playTone({ freq: 80,  freqEnd: 40,  duration: 0.35, type: "square",   volume: 0.5,  release: 0.15 });
    },
    shieldHit:  () => playTone({ freq: 320, freqEnd: 640, duration: 0.18, type: "square", volume: 0.6 }),
    laneChange: () => playTone({ freq: 540, freqEnd: 720, duration: 0.06, type: "sine",   volume: 0.30 }),
    start:      () => playTone({ freq: 440, freqEnd: 880, duration: 0.18, type: "triangle", volume: 0.5 }),
  };


  /* ==========================================================================
   * 5. CANVAS / RESIZE — Sabit 540×960 logical, DPI-aware
   * ----------------------------------------------------------------------- */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const { logicalW: LW, logicalH: LH } = CONFIG.world;
  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); // 2x DPR cap (perf)
    canvas.width  = Math.round(LW * dpr);
    canvas.height = Math.round(LH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);


  /* ==========================================================================
   * 6. DRAWING HELPERS
   * ----------------------------------------------------------------------- */

  // Yol/şerit geometrisi
  const ROAD_W    = CONFIG.world.roadWidth;
  const ROAD_LEFT = (LW - ROAD_W) / 2;
  const LANE_W    = ROAD_W / CONFIG.world.laneCount;

  function laneCenterX(lane) {
    return ROAD_LEFT + LANE_W * (lane + 0.5);
  }

  /* --- Arka plan (synthwave grid) -------------------------------------- */
  function drawBackground(scrollY) {
    // Üstte mor-cyan gradient (sunset/horizon hissi)
    const grad = ctx.createLinearGradient(0, 0, 0, LH);
    grad.addColorStop(0,    "#1a0a2e");
    grad.addColorStop(0.4,  "#0a0a14");
    grad.addColorStop(1,    "#07070d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LW, LH);

    // Yan grid — yol dışındaki alanlar
    const spacing = CONFIG.effects.gridSpacing;
    const offset = scrollY % spacing;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(181, 55, 242, 0.20)";
    // Dikey çizgiler (sol yan)
    for (let x = 0; x < ROAD_LEFT; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LH); ctx.stroke();
    }
    // Dikey çizgiler (sağ yan)
    for (let x = ROAD_LEFT + ROAD_W; x < LW; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LH); ctx.stroke();
    }
    // Yatay çizgiler (kayan)
    ctx.strokeStyle = "rgba(34, 211, 238, 0.18)";
    for (let y = -spacing + offset; y < LH; y += spacing) {
      // sol şerit
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ROAD_LEFT, y); ctx.stroke();
      // sağ şerit
      ctx.beginPath(); ctx.moveTo(ROAD_LEFT + ROAD_W, y); ctx.lineTo(LW, y); ctx.stroke();
    }
  }

  /* --- Yol + şerit çizgileri ------------------------------------------ */
  function drawRoad(scrollY) {
    // Yol zemini
    const grad = ctx.createLinearGradient(0, 0, 0, LH);
    grad.addColorStop(0, "#080812");
    grad.addColorStop(1, "#11111d");
    ctx.fillStyle = grad;
    ctx.fillRect(ROAD_LEFT, 0, ROAD_W, LH);

    // Yol kenar neon çizgileri
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(34,211,238,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ROAD_LEFT + 0.5, 0);
    ctx.lineTo(ROAD_LEFT + 0.5, LH);
    ctx.moveTo(ROAD_LEFT + ROAD_W - 0.5, 0);
    ctx.lineTo(ROAD_LEFT + ROAD_W - 0.5, LH);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Şerit ayraçları — dashed, kayan
    const dashLen = 36;
    const gapLen  = 32;
    const period  = dashLen + gapLen;
    const offset  = scrollY % period;

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([dashLen, gapLen]);
    ctx.lineDashOffset = -offset;
    for (let i = 1; i < CONFIG.world.laneCount; i++) {
      const x = ROAD_LEFT + LANE_W * i;
      ctx.beginPath(); ctx.moveTo(x, -gapLen); ctx.lineTo(x, LH); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  /* --- Araç çizimi (oyuncu + engel + araç önizlemesi hep aynı fonksiyon) -- */
  // ctx'i parametre olarak alıyor — hem ana canvas hem mini önizleme canvas'ları kullanabilir
  function drawCar(c, x, y, w, h, vehicle) {
    const nw = w * vehicle.shape.noseWidth;
    const tw = w * vehicle.shape.tailWidth;

    c.save();
    c.translate(x, y);

    // Gölge altlık
    c.fillStyle = "rgba(0,0,0,0.5)";
    c.beginPath();
    c.ellipse(0, h / 2 - 2, w * 0.45, 6, 0, 0, Math.PI * 2);
    c.fill();

    // Gövde (trapez)
    c.shadowColor = vehicle.color;
    c.shadowBlur = 18;
    c.fillStyle = "#0a0a14";
    c.beginPath();
    c.moveTo(-nw / 2, -h / 2 + 6);
    c.lineTo( nw / 2, -h / 2 + 6);
    c.lineTo( tw / 2,  h / 2 - 6);
    c.lineTo(-tw / 2,  h / 2 - 6);
    c.closePath();
    c.fill();

    // Neon kontur
    c.shadowBlur = 12;
    c.strokeStyle = vehicle.color;
    c.lineWidth = 2;
    c.stroke();

    // Kokpit (cam)
    c.shadowBlur = 0;
    c.fillStyle = vehicle.accentColor;
    c.globalAlpha = 0.45;
    const cw = Math.min(nw, tw) * 0.55;
    const ch = h * 0.32;
    c.fillRect(-cw / 2, -ch / 2 - 4, cw, ch);
    c.globalAlpha = 1;

    // Farlar (öndeki çizgi)
    c.shadowColor = vehicle.accentColor;
    c.shadowBlur = 10;
    c.fillStyle = vehicle.accentColor;
    const hl = Math.max(4, nw * 0.18);
    c.fillRect(-nw / 2 + 4, -h / 2 + 4, hl, 3);
    c.fillRect( nw / 2 - hl - 4, -h / 2 + 4, hl, 3);

    // Arka stop ışığı
    c.shadowColor = vehicle.color;
    c.shadowBlur = 14;
    c.fillStyle = vehicle.color;
    c.fillRect(-tw / 2 + 4, h / 2 - 9, tw - 8, 3);

    // Kanatlar (varsa)
    if (vehicle.shape.wings) {
      c.shadowBlur = 8;
      c.fillStyle = vehicle.color;
      c.fillRect(-w / 2 - 2, h / 2 - 16, 8, 10);
      c.fillRect( w / 2 - 6, h / 2 - 16, 8, 10);
    }

    c.restore();
    c.shadowBlur = 0;
  }

  /* --- Orb (toplanabilir) ---------------------------------------------- */
  function drawOrb(x, y, r, time) {
    const pulse = 0.85 + 0.15 * Math.sin(time * 6);
    ctx.save();
    ctx.translate(x, y);

    // Dış halka
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 18 * pulse;
    ctx.strokeStyle = "rgba(34,211,238,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * pulse, 0, Math.PI * 2); ctx.stroke();

    // İç çekirdek
    ctx.shadowBlur = 22 * pulse;
    ctx.fillStyle = "rgba(34,211,238,0.85)";
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;
  }


  /* ==========================================================================
   * 7. PARTICLES — Hafif iz/patlama efektleri
   * ----------------------------------------------------------------------- */
  const particles = [];

  function emitTrail(x, y, color) {
    if (particles.length > CONFIG.effects.maxParticles) return;
    particles.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y + Math.random() * 8,
      vx: (Math.random() - 0.5) * 30,
      vy: 60 + Math.random() * 80,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color,
      size: 3 + Math.random() * 2,
    });
  }
  function emitExplosion(x, y, color) {
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 100 + Math.random() * 280;
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1.0,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.99;
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }


  /* ==========================================================================
   * 8. GAME LOGIC
   * ----------------------------------------------------------------------- */

  // Çalışma zamanı oyun durumu (her oyun başında resetlenir)
  function createGame(vehicle) {
    return {
      vehicle,
      time: 0,
      score: 0,
      scrollY: 0,
      speed: CONFIG.world.baseSpeed * vehicle.stats.speed,
      // Oyuncu: lane = mevcut şerit indexi, x = anlık x (lerp ile hedefe yaklaşır)
      player: {
        lane: 1,                          // ortada başla
        x: laneCenterX(1),
        y: LH - CONFIG.player.yFromBottom,
        w: CONFIG.player.width,
        h: CONFIG.player.height,
        shieldRemaining: vehicle.shield,
      },
      obstacles: [],
      orbs: [],
      spawnTimer: CONFIG.spawn.gracePeriodSec, // grace period uygulanır
      shakeT: 0,
      crashedAt: 0,
      lastTrailEmit: 0,
    };
  }

  function changeLane(dir) {
    if (state !== STATE.PLAYING || !game) return;
    const newLane = Math.max(0, Math.min(CONFIG.world.laneCount - 1, game.player.lane + dir));
    if (newLane !== game.player.lane) {
      game.player.lane = newLane;
      sfx.laneChange();
    }
  }

  function spawnObstacle(game) {
    // Açık olmayan şeritler (yakın engellerle çakışmasın) — basit: top'taki engellere bak
    const blockedLanes = new Set();
    for (const o of game.obstacles) {
      if (o.y < 220) blockedLanes.add(o.lane);
    }

    // Multi-block: yüksek hızda bazen 2 şerit bloklanır
    let toSpawn = 1;
    if (game.speed > CONFIG.spawn.multiBlockSpeedThreshold
        && Math.random() < CONFIG.spawn.multiBlockChance) {
      toSpawn = 2;
    }

    const allLanes = [0, 1, 2, 3, 4].slice(0, CONFIG.world.laneCount);
    const candidates = allLanes.filter((l) => !blockedLanes.has(l));

    // En az bir şerit AÇIK kalmalı (oyuncu için mutlaka geçit lazım)
    const maxBlock = Math.max(0, candidates.length - 1);
    toSpawn = Math.min(toSpawn, maxBlock);

    // Karıştır + ilk N'yi al
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (let i = 0; i < toSpawn; i++) {
      const lane = candidates[i];
      const palette = OBSTACLE_PALETTE[Math.floor(Math.random() * OBSTACLE_PALETTE.length)];
      game.obstacles.push({
        lane,
        x: laneCenterX(lane),
        y: -CONFIG.player.height,
        w: CONFIG.player.width,
        h: CONFIG.player.height,
        vehicle: {
          color: palette.color,
          accentColor: palette.accent,
          shape: { noseWidth: 0.85, tailWidth: 0.85, wings: false },
        },
      });
    }
  }

  function spawnOrb(game) {
    // Engellerle aynı şeride orb koyma (en yakın engele bakarak)
    const taken = new Set(game.obstacles.filter((o) => o.y < 300).map((o) => o.lane));
    const all = [];
    for (let i = 0; i < CONFIG.world.laneCount; i++) if (!taken.has(i)) all.push(i);
    if (!all.length) return;
    const lane = all[Math.floor(Math.random() * all.length)];
    game.orbs.push({
      lane, x: laneCenterX(lane), y: -30, r: 14,
    });
  }

  // AABB çarpışma
  function rectsOverlap(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) * 0.5 * 0.85
        && Math.abs(a.y - b.y) < (a.h + b.h) * 0.5 * 0.85;
  }

  function updateGame(dt) {
    if (!game) return;
    game.time += dt;

    // Hız rampası (hız tavanına kadar)
    const { baseSpeed, maxSpeed, accelPerSec } = CONFIG.world;
    const targetSpeed = Math.min(
      maxSpeed * game.vehicle.stats.speed,
      baseSpeed * game.vehicle.stats.speed + accelPerSec * game.vehicle.stats.accel * game.time
    );
    game.speed += (targetSpeed - game.speed) * Math.min(1, dt * 2);

    // Oyuncu lane lerp
    const targetX = laneCenterX(game.player.lane);
    const lerpK = CONFIG.player.laneChangeBaseSpeed * game.vehicle.stats.handling * dt;
    game.player.x += (targetX - game.player.x) * Math.min(1, lerpK);

    // Trail particles (oyuncu altında)
    game.lastTrailEmit += dt;
    if (game.lastTrailEmit > 0.03) {
      game.lastTrailEmit = 0;
      for (let i = 0; i < CONFIG.effects.trailEmitPerFrame; i++) {
        emitTrail(game.player.x, game.player.y + game.player.h * 0.4, game.vehicle.color);
      }
    }

    // Dünyayı kaydır (engel ve orb'lar aşağı iner)
    const move = game.speed * dt;
    game.scrollY += move;

    for (const o of game.obstacles) o.y += move;
    for (const o of game.orbs)      o.y += move;

    // Ekran dışına çıkanları temizle
    game.obstacles = game.obstacles.filter((o) => o.y < LH + 100);
    game.orbs      = game.orbs.filter((o) => o.y < LH + 50);

    // Spawn
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      // Aralığı hıza göre kısalt (yaşadığın süre arttıkça)
      const interval = Math.max(
        CONFIG.spawn.obstacleMinInterval,
        CONFIG.spawn.obstacleBaseInterval - CONFIG.spawn.intervalDecayPerSec * game.time
      );
      spawnObstacle(game);
      if (Math.random() < CONFIG.spawn.orbChance) spawnOrb(game);
      game.spawnTimer = interval;
    }

    // Çarpışma kontrolü — engeller
    for (let i = game.obstacles.length - 1; i >= 0; i--) {
      if (rectsOverlap(game.player, game.obstacles[i])) {
        if (game.player.shieldRemaining > 0) {
          game.player.shieldRemaining--;
          game.obstacles.splice(i, 1);
          game.speed *= (1 - CONFIG.score.shieldAbsorbPenalty);
          game.shakeT = 0.2;
          emitExplosion(game.player.x, game.player.y, game.vehicle.accentColor);
          sfx.shieldHit();
        } else {
          gameOver();
          return;
        }
      }
    }
    // Orb toplama
    for (let i = game.orbs.length - 1; i >= 0; i--) {
      const o = game.orbs[i];
      const dx = o.x - game.player.x;
      const dy = o.y - game.player.y;
      if (dx * dx + dy * dy < (o.r + game.player.w * 0.4) ** 2) {
        game.orbs.splice(i, 1);
        game.score += CONFIG.score.orbValue;
        sfx.collect();
        emitExplosion(o.x, o.y, "#22d3ee");
      }
    }

    // Skor — zamana + hıza bağlı
    const speedMult = game.speed / CONFIG.world.baseSpeed;
    game.score += CONFIG.score.basePerSecond * speedMult * dt;

    // Kamera sarsıntısı sönümlemesi
    if (game.shakeT > 0) game.shakeT = Math.max(0, game.shakeT - dt);

    updateParticles(dt);
    updateHUD();
  }

  function renderGame() {
    // Kamera sarsıntısı
    let shakeX = 0, shakeY = 0;
    if (game && game.shakeT > 0) {
      const intensity = CONFIG.effects.shakeOnCrash * (game.shakeT / 0.2);
      shakeX = (Math.random() - 0.5) * intensity;
      shakeY = (Math.random() - 0.5) * intensity;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    const scroll = game ? game.scrollY : 0;
    drawBackground(scroll * CONFIG.effects.bgScrollMultiplier);
    drawRoad(scroll);

    if (game) {
      // Orb'lar (önce çiz, araçların altında kalsın)
      for (const o of game.orbs) drawOrb(o.x, o.y, o.r, game.time);

      // Engel araçları
      for (const o of game.obstacles) drawCar(ctx, o.x, o.y, o.w, o.h, o.vehicle);

      // Trail particles
      drawParticles();

      // Oyuncu
      drawCar(ctx, game.player.x, game.player.y, game.player.w, game.player.h, game.vehicle);

      // Kalkan göstergesi (oyuncunun etrafında halka)
      if (game.player.shieldRemaining > 0) {
        ctx.save();
        ctx.shadowColor = "#f5c542";
        ctx.shadowBlur = 16;
        ctx.strokeStyle = "rgba(245,197,66,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(game.player.x, game.player.y,
                Math.max(game.player.w, game.player.h) * 0.65,
                0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Grace period rehberi (ilk anlarda yumuşak ipucu)
    if (game && game.time < 1.2) {
      const a = 1 - game.time / 1.2;
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 18px " + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = "center";
      ctx.fillText("← / →   şerit değiştir", LW / 2, LH / 2 - 40);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }


  /* ==========================================================================
   * 9. STATE TRANSITIONS
   * ----------------------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const screens = {
    title:    $("#screen-title"),
    select:   $("#screen-select"),
    pause:    $("#screen-pause"),
    gameover: $("#screen-gameover"),
  };
  const hud = $("#hud");

  function showOnly(name) {
    for (const [k, el] of Object.entries(screens)) {
      el.hidden = (k !== name);
    }
    hud.hidden = (name !== null);
  }
  function setState(newState) {
    state = newState;
    if (state === STATE.TITLE)    showOnly("title");
    if (state === STATE.SELECT)   { showOnly("select"); buildVehicleGrid(); }
    if (state === STATE.PLAYING)  showOnly(null);
    if (state === STATE.PAUSED)   { screens.pause.hidden = false; hud.hidden = false; }
    if (state === STATE.GAMEOVER) { showOnly("gameover"); }
  }

  function startGame() {
    ensureAudio();
    game = createGame(selectedVehicle);
    setState(STATE.PLAYING);
    updateHUD();
    sfx.start();
  }

  function gameOver() {
    if (state !== STATE.PLAYING) return;
    sfx.crash();
    emitExplosion(game.player.x, game.player.y, game.vehicle.color);
    emitExplosion(game.player.x, game.player.y, "#ff3e8a");
    game.shakeT = 0.4;
    game.crashedAt = performance.now();

    const finalScore = Math.round(game.score);
    const prevHigh   = loadHigh(game.vehicle.id);
    const isNewBest  = finalScore > prevHigh;
    if (isNewBest) saveHigh(game.vehicle.id, finalScore);

    // Kısa gecikme — patlama görünsün, sonra GO ekranı
    setTimeout(() => {
      $("#go-score").textContent = finalScore;
      $("#go-high").textContent  = Math.max(finalScore, prevHigh);
      $("#go-newbest").hidden    = !isNewBest;
      setState(STATE.GAMEOVER);
    }, 800);

    // Bu süre içinde başka çarpışma tetiklenmemesi için
    state = STATE.GAMEOVER;
  }

  function pauseGame() {
    if (state !== STATE.PLAYING) return;
    setState(STATE.PAUSED);
  }
  function resumeGame() {
    if (state !== STATE.PAUSED) return;
    setState(STATE.PLAYING);
  }


  /* ==========================================================================
   * 10. UI — Vehicle grid render
   * ----------------------------------------------------------------------- */
  const vehicleGrid = $("#vehicle-grid");

  function statDots(value, max = 1.6) {
    // 0..max'i 5 segmente eşle
    const filled = Math.round((value / max) * 5);
    return Math.max(1, Math.min(5, filled));
  }

  function buildVehicleGrid() {
    vehicleGrid.innerHTML = "";
    VEHICLES.forEach((v) => {
      const card = document.createElement("div");
      card.className = "vehicle-card";
      card.style.setProperty("--vehicle-color", v.color);
      card.style.setProperty("--vehicle-glow",  v.color);
      card.setAttribute("role", "radio");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-checked", v.id === selectedVehicle.id ? "true" : "false");
      card.dataset.vehicleId = v.id;

      const speed    = statDots(v.stats.speed,    1.4);
      const accel    = statDots(v.stats.accel,    1.4);
      const handling = statDots(v.stats.handling, 1.6);

      card.innerHTML = `
        <div class="vehicle-preview"><canvas width="160" height="128"></canvas></div>
        <div class="vehicle-name">${v.name}</div>
        <div class="vehicle-tag">${v.tagline}</div>
        <div class="vehicle-stats" aria-label="Araç istatistikleri">
          ${statRow("HIZ",     speed)}
          ${statRow("İVME",    accel)}
          ${statRow("KONTROL", handling)}
          ${v.shield ? statRow("KALKAN", v.shield) : ""}
        </div>
      `;

      // Mini canvas'a aracı çiz (DPI scaling için)
      const mini = card.querySelector("canvas");
      const mctx = mini.getContext("2d");
      const mdpr = Math.min(window.devicePixelRatio || 1, 2);
      const baseW = mini.width, baseH = mini.height;
      mini.width  = baseW * mdpr;
      mini.height = baseH * mdpr;
      mini.style.width  = "100%";
      mini.style.height = "100%";
      mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
      drawCar(mctx, baseW / 2, baseH / 2, 60, 100, v);

      card.addEventListener("click", () => selectVehicle(v.id));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectVehicle(v.id);
        }
      });

      vehicleGrid.appendChild(card);
    });
  }

  function statRow(label, n) {
    const pct = Math.max(5, (n / 5) * 100);
    return `
      <div class="vehicle-stat">
        <span class="vehicle-stat-label">${label}</span>
        <div class="vehicle-stat-bar">
          <div class="vehicle-stat-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  function selectVehicle(id) {
    const v = VEHICLES.find((x) => x.id === id);
    if (!v) return;
    selectedVehicle = v;
    saveSelectedVehicle(v);
    for (const card of vehicleGrid.children) {
      card.setAttribute("aria-checked", card.dataset.vehicleId === id ? "true" : "false");
    }
  }

  /* ==========================================================================
   * 11. HUD UPDATE
   * ----------------------------------------------------------------------- */
  const hudScore  = $("#hud-score");
  const hudHigh   = $("#hud-high");
  const speedFill = $("#speed-fill");

  function updateHUD() {
    if (!game) return;
    hudScore.textContent = Math.round(game.score).toLocaleString("tr-TR");
    hudHigh.textContent  = loadHigh(game.vehicle.id).toLocaleString("tr-TR");
    const maxSpeed = CONFIG.world.maxSpeed * game.vehicle.stats.speed;
    const pct = Math.min(100, (game.speed / maxSpeed) * 100);
    speedFill.style.width = pct + "%";
  }


  /* ==========================================================================
   * 12. INPUT
   * ----------------------------------------------------------------------- */
  window.addEventListener("keydown", (e) => {
    // Title/select/pause/gameover ekranlarında space = ana eyleme bağla
    if (e.key === " " || e.key === "Enter") {
      if (state === STATE.TITLE)     { e.preventDefault(); setState(STATE.SELECT); return; }
      if (state === STATE.SELECT)    { e.preventDefault(); startGame(); return; }
      if (state === STATE.GAMEOVER)  { e.preventDefault(); startGame(); return; }
      if (state === STATE.PAUSED)    { e.preventDefault(); resumeGame(); return; }
    }

    if (state === STATE.PLAYING) {
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") { e.preventDefault(); changeLane(-1); }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); changeLane( 1); }
      if (e.key === "p" || e.key === "P" || e.key === "Escape")     { e.preventDefault(); pauseGame(); }
      if (e.key === "m" || e.key === "M")                            { toggleMute(); }
    } else if (state === STATE.PAUSED && e.key === "Escape")         { resumeGame(); }
  }, { passive: false });

  // Mobil dokunmatik: ekranın sol/sağ yarısı
  canvas.addEventListener("touchstart", (e) => {
    if (state !== STATE.PLAYING) return;
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const x = t.clientX - rect.left;
      changeLane(x < rect.width / 2 ? -1 : 1);
    }
    e.preventDefault();
  }, { passive: false });

  // Sol/sağ tıklama (fare ile de oynanabilsin)
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return; // touchstart hallediyor
    if (state !== STATE.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    changeLane(x < rect.width / 2 ? -1 : 1);
  });

  // Buton bağlantıları
  $("#btn-start").addEventListener("click",   () => { ensureAudio(); setState(STATE.SELECT); });
  $("#btn-back").addEventListener("click",    () => setState(STATE.TITLE));
  $("#btn-launch").addEventListener("click",  () => startGame());
  $("#btn-restart").addEventListener("click", () => startGame());
  $("#btn-changecar").addEventListener("click", () => setState(STATE.SELECT));
  $("#btn-resume").addEventListener("click",  () => resumeGame());
  $("#btn-pause-quit").addEventListener("click", () => setState(STATE.TITLE));
  $("#btn-pause").addEventListener("click",   () => pauseGame());

  // Ses aç/kapa
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

  // Pencere odağı kaybedince otomatik duraklat (mobilde de sekme değişiminde)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === STATE.PLAYING) pauseGame();
  });


  /* ==========================================================================
   * 13. MAIN LOOP
   * ----------------------------------------------------------------------- */
  let lastTime = performance.now();
  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    // Sekme arka plandayken büyük dt patlamalarını engelle
    if (dt > 0.05) dt = 0.05;

    // Update
    if (state === STATE.PLAYING) {
      updateGame(dt);
    } else if (state === STATE.GAMEOVER && game) {
      // Patlama animasyonu için sadece particles + shake güncelle
      if (game.shakeT > 0) game.shakeT = Math.max(0, game.shakeT - dt);
      updateParticles(dt);
    }

    // Render — her zaman çiz (arka plan görünsün)
    renderGame();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => { lastTime = t; frame(t); });


  /* ==========================================================================
   * 14. INIT
   * ----------------------------------------------------------------------- */
  setState(STATE.TITLE);

})();
