/* ============================================================================
 * IRONCLAD ARENA — 2D Side-view Fighting (vs AI)
 * ----------------------------------------------------------------------------
 * Düzenleme noktaları (hepsi dosyanın üstünde):
 *   CONFIG     → arena, fizik, hasar/blok çarpanları, raunt sistemi
 *   CHARACTERS → savaşçılar (hp, hız, hasar, vuruş süreleri, renk)
 *   AI_LEVELS  → AI zorluk parametreleri (reactT, agresiflik, blok şansı)
 *   TIERS      → rank kademeleri (site'deki RANK_CONFIG.TIERS ile aynı)
 *
 * Yeni karakter/AI/rank eklemek: ilgili dizilere ekle, yeter.
 * ========================================================================= */

(() => {
  "use strict";

  /* ==========================================================================
   * 1. CONFIG
   * ----------------------------------------------------------------------- */
  const CONFIG = {
    // Canvas (logical)
    LW: 800, LH: 500,
    // Arena
    floorY:        420,    // zemin yüzeyi y
    arenaPadX:     30,     // sol/sağ duvar payı
    // Fizik
    gravity:       2400,
    airControlPct: 0.7,    // havada yatay kontrol oranı
    // Savaşçı
    fighterW:      50,
    fighterH:      90,
    minSeparation: 50,     // iki savaşçı arası min mesafe (üst üste binmesin)
    // Vuruş geri tepme
    hitKnockX:     180,
    hitKnockY:     -180,
    hitStunBase:   0.35,
    blockStunHeavy:0.55,   // ağır vuruş blokta yenirse guard-break stun
    // Blok azaltma
    blockLightMult: 0.0,   // hafif vuruş blokta tamamen savulur
    blockHeavyMult: 0.35,  // ağır vuruş blokta %35 hasar geçer
    // Kombo
    comboDecay:    0.15,   // her ardışık vuruşta hasar -%15
    comboMinMult:  0.40,   // minimum hasar oranı
    comboTimeout:  1.6,    // s — son vuruştan sonra bu kadar süre yeni vuruş yoksa kombo sıfırlanır
    cancelWindow:  0.50,   // s — saldırı isabetinden sonra bu süre içinde cancel-into-next yapılabilir
    // Super meter
    meterMax:      100,    // tavan
    meterPerDmg:   1.5,    // vuruş başına +X (verilen hasar)
    meterTakenPct: 0.8,    // alınan hasar başına +X
    superMult:     2.2,    // super heavy hasar çarpanı
    superBlockMult:0.8,    // super heavy bloklanırsa bile %X hasar geçer (block bypass)
    // Raunt
    roundsToWin:   2,      // best-of-3
    roundTime:     60,     // saniye (0 = ko, yüksek hp kalan kazanır)
    roundIntroDur: 1.2,    // "ROUND X" süresi
    roundOutroDur: 1.6,    // "K.O." süresi
    // Rank
    startRating:   1000,
    ratingWin:     { easy: 30,  medium: 75,  hard: 150, training: 0 },
    ratingLoss:    { easy: 60,  medium: 45,  hard: 25,  training: 0 },
  };


  /* ==========================================================================
   * 2. CHARACTERS — Savaşçı tanımları
   * -----------------------------------------------------------------------
   *   hp, speed, jumpVel, color, accent
   *   lightDmg, lightDur (toplam vuruş süresi), lightActive (saldırı pencere
   *     [t0, t1]), lightRange, lightRecover (vuruştan sonra ek bekleme)
   *   heavyDmg, heavyDur, heavyActive, heavyRange, heavyRecover
   *   bodyW, bodyH (görsel — collision aynı CONFIG.fighter*)
   * ----------------------------------------------------------------------- */
  const CHARACTERS = [
    {
      id: "knight",
      name: "KNIGHT",
      desc: "Dengeli. Standart hız, standart hasar.",
      color: "#22d3ee", accent: "#7af0e0", visor: "#22d3ee",
      hp: 100, speed: 220, jumpVel: 760,
      lightDmg: 7,  lightDur: 0.34, lightActive: [0.10, 0.18], lightRange: 62,
      heavyDmg: 16, heavyDur: 0.58, heavyActive: [0.26, 0.38], heavyRange: 76,
    },
    {
      id: "striker",
      name: "STRIKER",
      desc: "Hızlı. Az hasar ama kısa windup.",
      color: "#5aff9c", accent: "#a8ffc8", visor: "#5aff9c",
      hp: 80,  speed: 290, jumpVel: 800,
      lightDmg: 6,  lightDur: 0.24, lightActive: [0.06, 0.13], lightRange: 56,
      heavyDmg: 13, heavyDur: 0.46, heavyActive: [0.22, 0.32], heavyRange: 70,
    },
    {
      id: "brute",
      name: "BRUTE",
      desc: "Ağır. Yavaş ama korkunç vuruş ve menzil.",
      color: "#b537f2", accent: "#e29bff", visor: "#b537f2",
      hp: 130, speed: 180, jumpVel: 700,
      lightDmg: 9,  lightDur: 0.40, lightActive: [0.16, 0.26], lightRange: 68,
      heavyDmg: 24, heavyDur: 0.74, heavyActive: [0.34, 0.50], heavyRange: 86,
    },
  ];


  /* ==========================================================================
   * 3. AI_LEVELS — Zorluk parametreleri
   * -----------------------------------------------------------------------
   *   reactT       → karar tazeleme süresi (s) — düşük = hızlı tepki
   *   aggrPct      → menzildeyken saldırı şansı (0-1)
   *   blockPct     → rakip saldırırken blok şansı (0-1)
   *   heavyPct     → saldırı kararında ağır vuruş tercih şansı
   *   optimalDist  → tutmaya çalıştığı mesafe (px)
   *   punishPct    → rakip whiff/cool down'da iken saldırı şansı
   * ----------------------------------------------------------------------- */
  const AI_LEVELS = {
    training: { reactT: 999, aggrPct: 0, blockPct: 0, heavyPct: 0,
                optimalDist: 70, punishPct: 0, jumpPct: 0, retreatHpPct: 0 },
    easy:   { reactT: 0.55, aggrPct: 0.30, blockPct: 0.10, heavyPct: 0.15,
              optimalDist: 90, punishPct: 0.25, jumpPct: 0.04, retreatHpPct: 0.20 },
    medium: { reactT: 0.28, aggrPct: 0.55, blockPct: 0.35, heavyPct: 0.30,
              optimalDist: 75, punishPct: 0.60, jumpPct: 0.06, retreatHpPct: 0.30 },
    hard:   { reactT: 0.12, aggrPct: 0.80, blockPct: 0.65, heavyPct: 0.45,
              optimalDist: 68, punishPct: 0.85, jumpPct: 0.08, retreatHpPct: 0.40 },
  };


  /* ==========================================================================
   * 4. TIERS — Rank kademeleri (site'deki RANK_CONFIG.TIERS ile aynı)
   * ----------------------------------------------------------------------- */
  const TIERS = [
    { name: "Demir",   minRating: 0,    color: "#8a8a99" },
    { name: "Bronz",   minRating: 800,  color: "#c97a3a" },
    { name: "Gümüş",   minRating: 1600, color: "#c9d1dc" },
    { name: "Altın",   minRating: 2400, color: "#f5c542" },
    { name: "Platin",  minRating: 3200, color: "#3ad6c2" },
    { name: "Elmas",   minRating: 4000, color: "#5aa9ff" },
    { name: "Usta",    minRating: 4800, color: "#b537f2" },
    { name: "Efsane",  minRating: 5800, color: "#ff3e8a" },
  ];
  function tierFor(rating) {
    let t = TIERS[0];
    for (const x of TIERS) if (rating >= x.minRating) t = x;
    return t;
  }


  /* ==========================================================================
   * 5. STATE & STORAGE
   * ----------------------------------------------------------------------- */
  const STATE = Object.freeze({
    TITLE: "title", SELECT: "select", PLAYING: "playing", PAUSED: "paused",
    INTRO: "intro", OUTRO: "outro", RESULT: "result",
  });
  let state = STATE.TITLE;

  const LS = {
    rating:     "ironclad:rating",
    lastChar:   "ironclad:char",
    lastDiff:   "ironclad:diff",
    muted:      "ironclad:muted",
  };
  const lsGet = (k)    => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  function loadRating() {
    const v = Number(lsGet(LS.rating));
    return Number.isFinite(v) ? v : CONFIG.startRating;
  }
  function saveRating(n) { lsSet(LS.rating, String(Math.max(0, Math.round(n)))); }
  let muted = lsGet(LS.muted) === "1";

  // Runtime
  let p1 = null, p2 = null;
  let particles = [];
  let shakeT = 0;
  let p1RoundsWon = 0, p2RoundsWon = 0;
  let roundNum = 1;
  let introT = 0, outroT = 0;
  let outroText = "K.O.!";
  let roundTimer = CONFIG.roundTime;
  let selectedCharId = lsGet(LS.lastChar) || "knight";
  let selectedDiff   = lsGet(LS.lastDiff) || "medium";
  // AI iç durumu
  let aiDecisionT = 0;
  let aiAction = { kind: "idle" };
  // Maç sonu
  let matchWinner = null;     // "p1" | "p2"
  let lastRatingDelta = 0;


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
    const v = vol * 0.15;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + atk);
    g.gain.linearRampToValueAtTime(0, t0 + dur + rel);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + rel + 0.02);
  }
  const sfx = {
    swingLight: () => tone({ freq: 760, freqEnd: 480, dur: 0.06, type: "square",   vol: 0.25 }),
    swingHeavy: () => tone({ freq: 220, freqEnd: 110, dur: 0.18, type: "sawtooth", vol: 0.45, rel: 0.08 }),
    hit:        () => { tone({ freq: 420, freqEnd: 220, dur: 0.08, type: "square",   vol: 0.5 });
                        tone({ freq: 180, freqEnd: 90,  dur: 0.10, type: "sawtooth", vol: 0.35 }); },
    hitHeavy:   () => { tone({ freq: 240, freqEnd: 100, dur: 0.18, type: "sawtooth", vol: 0.7, rel: 0.08 });
                        tone({ freq: 120, freqEnd: 50,  dur: 0.22, type: "square",   vol: 0.5, rel: 0.1 }); },
    block:      () => { tone({ freq: 660, freqEnd: 1100, dur: 0.08, type: "triangle", vol: 0.45 });
                        tone({ freq: 1200, freqEnd: 1600, dur: 0.06, type: "square",  vol: 0.3 }); },
    guardBreak: () => { tone({ freq: 320, freqEnd: 80, dur: 0.25, type: "sawtooth", vol: 0.6, rel: 0.1 });
                        tone({ freq: 660, freqEnd: 240, dur: 0.18, type: "square",  vol: 0.4 }); },
    jump:       () => tone({ freq: 460, freqEnd: 720, dur: 0.06, type: "triangle", vol: 0.3 }),
    land:       () => tone({ freq: 200, freqEnd: 120, dur: 0.05, type: "sine",    vol: 0.25 }),
    roundStart: () => { tone({ freq: 880, dur: 0.10, type: "square", vol: 0.55 });
                        tone({ freq: 1320, dur: 0.18, type: "triangle", vol: 0.5 }); },
    ko:         () => { tone({ freq: 220, freqEnd: 80, dur: 0.5, type: "sawtooth", vol: 0.7, rel: 0.2 });
                        tone({ freq: 110, freqEnd: 40, dur: 0.4, type: "square",   vol: 0.5, rel: 0.2 }); },
    win:        () => { tone({ freq: 660, dur: 0.12, type: "triangle", vol: 0.6 });
                        tone({ freq: 990, dur: 0.12, type: "triangle", vol: 0.6 });
                        tone({ freq: 1320, dur: 0.28, type: "triangle", vol: 0.6 }); },
    lose:       () => { tone({ freq: 240, freqEnd: 80, dur: 0.6, type: "sawtooth", vol: 0.7, rel: 0.2 });
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
   * 8. INPUT — Klavye + Mobil
   * ----------------------------------------------------------------------- */
  const input = {
    left: false, right: false,
    jumpQueued: false, jumpHeld: false,
    blockHeld: false,
    lightQueued: false,
    heavyQueued: false,
  };
  function keyDown(e) {
    if (state === STATE.PLAYING) {
      if (e.code === "KeyA" || e.code === "ArrowLeft")  { input.left  = true; e.preventDefault(); }
      if (e.code === "KeyD" || e.code === "ArrowRight") { input.right = true; e.preventDefault(); }
      if (e.code === "KeyW" || e.code === "ArrowUp" || e.code === "Space") {
        if (!input.jumpHeld) input.jumpQueued = true;
        input.jumpHeld = true; e.preventDefault();
      }
      if (e.code === "KeyS" || e.code === "ArrowDown")  { input.blockHeld = true; e.preventDefault(); }
      if (e.code === "KeyJ") { input.lightQueued = true; e.preventDefault(); }
      if (e.code === "KeyK") { input.heavyQueued = true; e.preventDefault(); }
      if (e.code === "Escape" || e.code === "KeyP") { pauseGame(); e.preventDefault(); }
      if (e.code === "KeyM") toggleMute();
    } else if (state === STATE.TITLE) {
      if (e.code === "Space" || e.code === "Enter") { openSelect(); e.preventDefault(); }
    } else if (state === STATE.PAUSED) {
      if (e.code === "Escape" || e.code === "KeyP") { resumeGame(); e.preventDefault(); }
    } else if (state === STATE.RESULT) {
      if (e.code === "Space" || e.code === "Enter") { startMatch(); e.preventDefault(); }
    }
  }
  function keyUp(e) {
    if (e.code === "KeyA" || e.code === "ArrowLeft")  input.left  = false;
    if (e.code === "KeyD" || e.code === "ArrowRight") input.right = false;
    if (e.code === "KeyW" || e.code === "ArrowUp" || e.code === "Space") input.jumpHeld = false;
    if (e.code === "KeyS" || e.code === "ArrowDown")  input.blockHeld = false;
  }
  window.addEventListener("keydown", keyDown, { passive: false });
  window.addEventListener("keyup",   keyUp);

  // Mobile button bindings (later in INIT)


  /* ==========================================================================
   * 9. FIGHTER — factory & state machine
   * ----------------------------------------------------------------------- */
  // Durumlar (state machine)
  const F = Object.freeze({
    IDLE: "idle", WALK: "walk", JUMP: "jump",
    LIGHT: "light", HEAVY: "heavy",
    BLOCK: "block", HIT: "hit", KO: "ko",
  });

  function makeFighter(charId, x, isAI) {
    const char = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0];
    return {
      char, isAI,
      x, y: CONFIG.floorY - CONFIG.fighterH,
      vx: 0, vy: 0,
      w: CONFIG.fighterW, h: CONFIG.fighterH,
      facing: isAI ? -1 : 1,
      onGround: true,
      hp: char.hp, maxHp: char.hp,
      state: F.IDLE, stateT: 0,
      attackHit: false,        // bu vuruşun rakibe değdi mi (çift hasar engeli)
      hitFlash: 0,
      // Kombo + hava saldırısı + super meter
      comboCount: 0,           // kaç ardışık vuruş yaptı (decay için)
      comboT: 0,               // son vuruştan beri geçen süre (timeout)
      airAttackUsed: false,    // zıplama başına bir kez hava saldırısı
      meter: 0,                // 0-100 super meter
      superActive: false,      // mevcut ağır vuruş super mu?
      isAttacking() { return this.state === F.LIGHT || this.state === F.HEAVY; },
      attackInActive() {
        if (!this.isAttacking()) return false;
        const a = this.state === F.LIGHT ? this.char.lightActive : this.char.heavyActive;
        return this.stateT >= a[0] && this.stateT <= a[1];
      },
    };
  }

  function setState(f, s) {
    f.state = s;
    f.stateT = 0;
    f.attackHit = false;
  }

  // Saldırı hitbox'ı: önde, fighter merkezinden uzanır.
  // Havadayken biraz aşağı kayar (dive feel) + boyu büyür.
  function attackHitbox(f) {
    if (!f.attackInActive()) return null;
    const range = f.state === F.LIGHT ? f.char.lightRange : f.char.heavyRange;
    const w = range, h = f.h * (f.onGround ? 0.6 : 0.75);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * (f.onGround ? 0.30 : 0.42);   // havada aşağı kayar
    const x = f.facing > 0 ? cx + 6 : cx - 6 - w;
    return { x, y: cy, w, h };
  }
  function bodyHurtbox(f) {
    return { x: f.x, y: f.y, w: f.w, h: f.h };
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }


  /* ==========================================================================
   * 10. UPDATE — Inputs → state → physics → collision → hits
   * ----------------------------------------------------------------------- */
  function updateFighter(f, opp, dt, inputs) {
    f.stateT += dt;
    if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt);

    // Rakibe doğru bak (KO ve hit'te değiştirme)
    if (f.state !== F.KO && f.state !== F.HIT) {
      f.facing = opp.x + opp.w / 2 < f.x + f.w / 2 ? -1 : 1;
    }

    // State-spesifik girdi işleme
    const canAct = (f.state === F.IDLE || f.state === F.WALK || f.state === F.JUMP);
    const onGroundAct = f.onGround && (f.state === F.IDLE || f.state === F.WALK || f.state === F.BLOCK);

    // Blok (yerdeyken)
    if (onGroundAct && inputs.blockHeld) {
      if (f.state !== F.BLOCK) setState(f, F.BLOCK);
    } else if (f.state === F.BLOCK && !inputs.blockHeld) {
      setState(f, F.IDLE);
    }

    // Saldırı tetikleyici (yerde + havada bir kez)
    const canAttackNow = canAct && (f.onGround || (f.state === F.JUMP && !f.airAttackUsed));
    // Cancel-into-next: mevcut saldırının active penceresi geçtiyse VE bu vuruş
    // isabet etmişse, yeni saldırı tuşu önceki recovery'yi atlayarak zincir başlatır.
    const inActiveEnd = f.isAttacking() &&
      f.stateT > (f.state === F.LIGHT ? f.char.lightActive[1] : f.char.heavyActive[1]);
    const canCancel = inActiveEnd && f.attackHit;

    if (canAttackNow || canCancel) {
      if (inputs.heavyQueued) {
        setState(f, F.HEAVY);
        // Süper meter doluysa bu ağır vuruş "super" olur
        if (f.meter >= CONFIG.meterMax) {
          f.superActive = true;
          f.meter = 0;
          // Süper sesi (mevcut sfx'lerden patlatma karışımı)
          sfx.hitHeavy();
        }
        sfx.swingHeavy();
        if (!f.onGround) f.airAttackUsed = true;
      } else if (inputs.lightQueued) {
        setState(f, F.LIGHT);
        sfx.swingLight();
        if (!f.onGround) f.airAttackUsed = true;
      }
    }
    inputs.lightQueued = false;
    inputs.heavyQueued = false;

    // Zıplama
    if (canAct && f.onGround && inputs.jumpQueued) {
      f.vy = -f.char.jumpVel;
      f.onGround = false;
      setState(f, F.JUMP);
      sfx.jump();
    }
    inputs.jumpQueued = false;

    // Hareket (saldırı/blok/hit/KO dışında)
    let mx = 0;
    if (inputs.left)  mx -= 1;
    if (inputs.right) mx += 1;
    const moveAllowed = !(f.state === F.LIGHT || f.state === F.HEAVY ||
                          f.state === F.HIT || f.state === F.KO || f.state === F.BLOCK);
    if (moveAllowed) {
      const ctrl = f.onGround ? 1 : CONFIG.airControlPct;
      f.vx = mx * f.char.speed * ctrl;
      if (mx !== 0 && f.onGround && f.state !== F.WALK && f.state !== F.JUMP) {
        setState(f, F.WALK);
      } else if (mx === 0 && f.onGround && f.state === F.WALK) {
        setState(f, F.IDLE);
      }
    } else if (f.state !== F.HIT) {
      // Saldırı/blok'ta yatay yavaşla
      f.vx *= 0.7;
    }

    // Yerçekimi
    f.vy += CONFIG.gravity * dt;

    // Pozisyon entegre
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    // Arena duvarları
    const xMin = CONFIG.arenaPadX;
    const xMax = LW - CONFIG.arenaPadX - f.w;
    if (f.x < xMin) { f.x = xMin; f.vx = 0; }
    if (f.x > xMax) { f.x = xMax; f.vx = 0; }

    // Zemin
    const floorTop = CONFIG.floorY - f.h;
    if (f.y >= floorTop) {
      if (!f.onGround && f.state === F.JUMP) sfx.land();
      f.y = floorTop;
      f.vy = 0;
      const wasAirborne = !f.onGround;
      f.onGround = true;
      if (wasAirborne) f.airAttackUsed = false;  // yeni zıplama için sıfırla
      if (f.state === F.JUMP) setState(f, F.IDLE);
    } else {
      f.onGround = false;
      // Sadece nötr durumdayken (yürüyüş/duruş) JUMP'a geçir.
      // F.LIGHT / F.HEAVY (hava saldırısı) iken state'i EZME — yoksa air attack
      // anında iptal olur.
      if (f.state === F.IDLE || f.state === F.WALK) setState(f, F.JUMP);
    }

    // Saldırı bitti mi? → IDLE. Whiff (isabetsiz) ise komboyu sıfırla.
    if (f.state === F.LIGHT && f.stateT >= f.char.lightDur) {
      if (!f.attackHit) f.comboCount = 0;
      setState(f, F.IDLE);
    }
    if (f.state === F.HEAVY && f.stateT >= f.char.heavyDur) {
      if (!f.attackHit) f.comboCount = 0;
      f.superActive = false;     // super bittiyse sıfırla (ister hit, ister whiff)
      setState(f, F.IDLE);
    }
    if (f.state === F.HIT) {
      const stun = f._hitStun || CONFIG.hitStunBase;
      if (f.stateT >= stun) setState(f, F.IDLE);
    }

    // Kombo timeout — son vuruştan sonra X saniye yeni vuruş yoksa sıfırla
    if (f.comboCount > 0) {
      f.comboT += dt;
      if (f.comboT >= CONFIG.comboTimeout) {
        f.comboCount = 0;
        f.comboT = 0;
      }
    }
  }

  // İki savaşçının vücutları üst üste binmesin
  function resolveBodyOverlap(a, b) {
    const ar = bodyHurtbox(a), br = bodyHurtbox(b);
    if (!rectsOverlap(ar, br)) return;
    // Y ekseninde çakışıyorsa X'te ittir
    if (a.x < b.x) {
      const overlap = (ar.x + ar.w) - br.x;
      a.x -= overlap / 2; b.x += overlap / 2;
    } else {
      const overlap = (br.x + br.w) - ar.x;
      a.x += overlap / 2; b.x -= overlap / 2;
    }
    // Duvar sınırı tekrar uygula
    const xMin = CONFIG.arenaPadX;
    const xMaxA = LW - CONFIG.arenaPadX - a.w;
    const xMaxB = LW - CONFIG.arenaPadX - b.w;
    a.x = Math.max(xMin, Math.min(a.x, xMaxA));
    b.x = Math.max(xMin, Math.min(b.x, xMaxB));
  }

  // Saldırı çarpışmasını işle (atan f'nin saldırısı rakip o'ya değiyor mu)
  function processHit(f, o) {
    if (!f.attackInActive() || f.attackHit) return;
    const ab = attackHitbox(f);
    const ob = bodyHurtbox(o);
    if (!ab || !rectsOverlap(ab, ob)) return;
    f.attackHit = true;
    const isHeavy = f.state === F.HEAVY;
    const isSuper = isHeavy && f.superActive;
    const baseDmg = isHeavy ? f.char.heavyDmg : f.char.lightDmg;
    // Rakip blokta mı? Yönü uygun mu? (saldıran yönüyle rakip yüzü ters olmalı)
    const blocking = o.state === F.BLOCK && o.facing === -f.facing;
    // Kombo hasarı azalımı (full block hariç)
    const decayMult = Math.max(CONFIG.comboMinMult, 1 - CONFIG.comboDecay * f.comboCount);
    let dmg = baseDmg * decayMult * (isSuper ? CONFIG.superMult : 1);
    let stun = CONFIG.hitStunBase + (isHeavy ? 0.10 : 0);
    if (blocking) {
      // Super heavy block'u büyük ölçüde delip geçer
      const mult = isSuper ? CONFIG.superBlockMult
                           : (isHeavy ? CONFIG.blockHeavyMult : CONFIG.blockLightMult);
      dmg = baseDmg * mult * (isSuper ? CONFIG.superMult : 1);
      if (isHeavy) {
        // Guard break: stun + biraz hasar + komboyu sıfırla (zincir kırıldı)
        stun = CONFIG.blockStunHeavy;
        sfx.guardBreak();
        spawnSparks(ab.x + (f.facing > 0 ? ab.w : 0), ab.y + ab.h / 2, "#ffb44a", 14);
        shakeT = 0.22;
        f.comboCount = 0;
        f.comboT = 0;
      } else {
        sfx.block();
        spawnSparks(ab.x + (f.facing > 0 ? ab.w : 0), ab.y + ab.h / 2, "#7af0e0", 10);
        // Blokta küçük geri itme — hit state'ine girme; kombo da kırılır
        o.vx = f.facing * 60;
        f.comboCount = 0;
        f.comboT = 0;
        return;
      }
    } else {
      if (isHeavy) { sfx.hitHeavy(); spawnSparks(ab.x + (f.facing > 0 ? ab.w : 0), ab.y + ab.h / 2, f.char.color, 20); shakeT = 0.30; }
      else         { sfx.hit();      spawnSparks(ab.x + (f.facing > 0 ? ab.w : 0), ab.y + ab.h / 2, f.char.color, 12); shakeT = 0.15; }
      // Başarılı vuruş: kombo say
      f.comboCount += 1;
      f.comboT = 0;
      // Rakip vuruldu → onun komboyu da kırılır
      o.comboCount = 0;
      o.comboT = 0;
    }

    o.hp -= dmg;
    o.hitFlash = 0.1;
    // Antrenman modunda HP düşmesin (dummy'ye sınırsız vurabilirsin)
    if (selectedDiff === "training") {
      if (o === p2) o.hp = o.maxHp;          // dummy CPU otomatik dolar
      else if (o.hp < 1) o.hp = o.maxHp;     // player da ölmez
    }
    // Super meter: saldıran biraz, vurulan biraz dolar
    f.meter = Math.min(CONFIG.meterMax, f.meter + dmg * CONFIG.meterPerDmg);
    o.meter = Math.min(CONFIG.meterMax, o.meter + dmg * CONFIG.meterTakenPct);
    // Super hit özel patlama
    if (isSuper && !blocking) {
      spawnSparks(ab.x + (f.facing > 0 ? ab.w : 0), ab.y + ab.h / 2, "#f5c542", 24);
      shakeT = 0.45;
    }
    if (o.hp <= 0) {
      o.hp = 0;
      koFighter(o);
    } else {
      // Hit stun + knockback
      o.vx = f.facing * CONFIG.hitKnockX * (isHeavy ? 1.4 : 1);
      o.vy = CONFIG.hitKnockY * (isHeavy ? 1.2 : 1);
      o.onGround = false;
      o._hitStun = stun;
      setState(o, F.HIT);
    }
    updateHud();
  }

  function koFighter(f) {
    setState(f, F.KO);
    f.vx = f.facing * -200;
    f.vy = -260;
    f.onGround = false;
    sfx.ko();
    shakeT = 0.45;
    spawnSparks(f.x + f.w / 2, f.y + f.h / 2, f.char.color, 28);
    // Raunt sonu tetikle
    if (state === STATE.PLAYING) endRound(f === p1 ? "p2" : "p1");
  }


  /* ==========================================================================
   * 11. AI — Karar mantığı
   * ----------------------------------------------------------------------- */
  function aiInputs() {
    // Karar kararlılığı: aiAction'ı tutar, reactT'de bir tazeler
    return {
      left: aiAction.kind === "approach_left",
      right: aiAction.kind === "approach_right",
      jumpQueued: aiAction.jump || false,
      jumpHeld: false,
      blockHeld: aiAction.kind === "block",
      lightQueued: aiAction.kind === "light",
      heavyQueued: aiAction.kind === "heavy",
    };
  }

  function aiThink(dt) {
    if (!p2 || !p1) return;
    aiDecisionT -= dt;
    if (aiDecisionT > 0) return;
    const cfg = AI_LEVELS[selectedDiff] || AI_LEVELS.medium;
    aiDecisionT = cfg.reactT * (0.7 + Math.random() * 0.6);

    // KO/HIT iken karar yok
    if (p2.state === F.KO || p2.state === F.HIT) {
      aiAction = { kind: "idle" };
      return;
    }
    // Halen saldırı animasyonundaysa devam
    if (p2.state === F.LIGHT || p2.state === F.HEAVY) {
      return;
    }

    const dx = (p1.x + p1.w / 2) - (p2.x + p2.w / 2);
    const dist = Math.abs(dx);
    const facingLeft = dx < 0;       // rakip solda mı?

    // Rakip aktif saldırı menzilindeyse → blok şansı
    if (p1.attackInActive() && dist < (p1.state === F.HEAVY ? p1.char.heavyRange : p1.char.lightRange) + 20) {
      if (Math.random() < cfg.blockPct) {
        aiAction = { kind: "block" };
        return;
      }
    }

    // Rakibin saldırısı yeni bitti (cooldown) → punish
    const oppRecovering = p1.state === F.IDLE && p1.stateT < 0.20;
    if (dist < p2.char.lightRange + 10 && oppRecovering && Math.random() < cfg.punishPct) {
      aiAction = { kind: Math.random() < cfg.heavyPct ? "heavy" : "light" };
      return;
    }

    // Düşük HP → biraz geri çekil
    if (p2.hp / p2.maxHp < cfg.retreatHpPct && dist < 110 && Math.random() < 0.5) {
      aiAction = { kind: facingLeft ? "approach_right" : "approach_left" };
      return;
    }

    // Menzildeyse saldırı şansı
    const inLightRange = dist < p2.char.lightRange + 6;
    const inHeavyRange = dist < p2.char.heavyRange + 6;
    if (inLightRange && Math.random() < cfg.aggrPct) {
      if (inHeavyRange && Math.random() < cfg.heavyPct) {
        aiAction = { kind: "heavy" };
      } else {
        aiAction = { kind: "light" };
      }
      return;
    }

    // Mesafe ayarlama
    const optimal = cfg.optimalDist;
    if (dist > optimal + 8) {
      aiAction = { kind: facingLeft ? "approach_left" : "approach_right" };
      // Bazen zıplama (havuçlanma)
      if (Math.random() < cfg.jumpPct && p2.onGround) aiAction.jump = true;
    } else if (dist < optimal - 8) {
      aiAction = { kind: facingLeft ? "approach_right" : "approach_left" };
    } else {
      aiAction = { kind: "idle" };
    }
  }


  /* ==========================================================================
   * 12. ROUND / MATCH FLOW
   * ----------------------------------------------------------------------- */
  function startMatch() {
    p1RoundsWon = 0;
    p2RoundsWon = 0;
    roundNum = 1;
    matchWinner = null;
    startRound();
  }

  function startRound() {
    // Fighter'ları konumla ve canları full
    p1 = makeFighter(selectedCharId, 200, false);
    // CPU karakter seçimi: zorda en güçlü gibi davranma adına raunt başına rastgele
    const cpuChar = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    p2 = makeFighter(cpuChar.id, 600, true);
    p2.facing = -1; p1.facing = 1;

    particles = [];
    aiAction = { kind: "idle" };
    aiDecisionT = 0;
    roundTimer = CONFIG.roundTime;

    setState(p1, F.IDLE);
    setState(p2, F.IDLE);

    introT = CONFIG.roundIntroDur;
    showAnnounce(`ROUND ${roundNum}`);
    state = STATE.INTRO;
    showOnly(null);
    updateHud();
    updateRoundsHud();
  }

  function endRound(winnerSide) {
    if (state !== STATE.PLAYING) return;
    if (winnerSide === "p1") p1RoundsWon++;
    else                     p2RoundsWon++;
    outroText = (p1.hp <= 0 || p2.hp <= 0) ? "K.O.!" : "ZAMAN!";
    outroT = CONFIG.roundOutroDur;
    state = STATE.OUTRO;
    showAnnounce(outroText);
    updateRoundsHud();
  }

  function afterOutro() {
    if (p1RoundsWon >= CONFIG.roundsToWin || p2RoundsWon >= CONFIG.roundsToWin) {
      // Maç bitti
      matchWinner = p1RoundsWon > p2RoundsWon ? "p1" : "p2";
      finalizeMatch();
    } else {
      roundNum++;
      startRound();
    }
  }

  function finalizeMatch() {
    const cfg = AI_LEVELS[selectedDiff] || AI_LEVELS.medium;
    let delta = 0;
    if (matchWinner === "p1") {
      delta = CONFIG.ratingWin[selectedDiff];
      sfx.win();
    } else {
      delta = -CONFIG.ratingLoss[selectedDiff];
      sfx.lose();
    }
    const cur = loadRating();
    const next = Math.max(0, cur + delta);
    saveRating(next);
    lastRatingDelta = delta;

    // UI doldur
    const eyebrow = document.getElementById("result-eyebrow");
    const title = document.getElementById("result-title");
    if (matchWinner === "p1") {
      eyebrow.textContent = "// VICTORY";
      eyebrow.className = "eyebrow eyebrow--win";
      title.textContent = "KAZANDIN";
    } else {
      eyebrow.textContent = "// DEFEAT";
      eyebrow.className = "eyebrow eyebrow--danger";
      title.textContent = "KAYBETTİN";
    }
    document.getElementById("result-rounds").textContent = `${p1RoundsWon} - ${p2RoundsWon}`;
    document.getElementById("result-delta").textContent  = (delta >= 0 ? "+" : "") + delta;
    document.getElementById("result-rating").textContent = String(next);
    const t = tierFor(next);
    const rankEl = document.getElementById("result-rank");
    rankEl.textContent = t.name;
    rankEl.style.color = t.color;

    state = STATE.RESULT;
    showOnly("result");
  }

  function showAnnounce(text) {
    const ann = document.getElementById("announce");
    const span = document.getElementById("announce-text");
    span.textContent = text;
    ann.hidden = true; // restart animation
    void ann.offsetWidth;
    ann.hidden = false;
  }
  function hideAnnounce() {
    document.getElementById("announce").hidden = true;
  }


  /* ==========================================================================
   * 13. PARTICLES
   * ----------------------------------------------------------------------- */
  function spawnSparks(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 240;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
        color, size: 2 + Math.random() * 2.5,
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 800 * dt;
      p.vx *= 0.94;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }


  /* ==========================================================================
   * 14. RENDER — Arena, savaşçılar, efektler
   * ----------------------------------------------------------------------- */
  function renderGame() {
    let sx = 0, sy = 0;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - 1/60);
      const amp = shakeT * 22;
      sx = (Math.random() - 0.5) * amp;
      sy = (Math.random() - 0.5) * amp;
    }
    ctx.save();
    ctx.translate(sx, sy);

    // Background
    ctx.fillStyle = "#05050b";
    ctx.fillRect(0, 0, LW, LH);

    drawArena();
    if (p1) drawFighter(p1);
    if (p2) drawFighter(p2);
    drawParticles();
    drawComboCounters();

    ctx.restore();
  }

  // Üst köşelerde her tarafa kendi kombo sayacını çiz (2+ vuruş için)
  function drawComboCounters() {
    if (p1 && p1.comboCount > 1) drawComboText(p1.comboCount, LW * 0.25, 96, p1.char.color, p1.comboT);
    if (p2 && p2.comboCount > 1) drawComboText(p2.comboCount, LW * 0.75, 96, p2.char.color, p2.comboT);
  }
  function drawComboText(n, x, y, color, age) {
    const fade = 1 - Math.max(0, age / CONFIG.comboTimeout);
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.font = "900 32px Orbitron, monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(`${n} HIT!`, x, y);
    ctx.font = "700 11px Orbitron, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("COMBO", x, y + 14);
    ctx.restore();
  }

  function drawArena() {
    // Üst yarısı: yıldız/gradyan
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.floorY);
    g.addColorStop(0, "rgba(34,211,238,0.05)");
    g.addColorStop(1, "rgba(181,55,242,0.02)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LW, CONFIG.floorY);

    // Yatay grid lines (uzaklık hissi)
    ctx.strokeStyle = "rgba(34,211,238,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 60; y < CONFIG.floorY; y += 40) {
      ctx.moveTo(0, y + 0.5); ctx.lineTo(LW, y + 0.5);
    }
    ctx.stroke();

    // Zemin
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, CONFIG.floorY, LW, LH - CONFIG.floorY);
    // Zemin neon çizgisi
    ctx.save();
    ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(34,211,238,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.floorY + 0.5);
    ctx.lineTo(LW, CONFIG.floorY + 0.5);
    ctx.stroke();
    ctx.restore();

    // Yan duvarlar (mor neon)
    ctx.save();
    ctx.shadowColor = "#b537f2"; ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(181,55,242,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CONFIG.arenaPadX + 0.5, 40);
    ctx.lineTo(CONFIG.arenaPadX + 0.5, CONFIG.floorY);
    ctx.moveTo(LW - CONFIG.arenaPadX + 0.5, 40);
    ctx.lineTo(LW - CONFIG.arenaPadX + 0.5, CONFIG.floorY);
    ctx.stroke();
    ctx.restore();

    // Tabanda hafif gölge
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, CONFIG.floorY - 2, LW, 2);
  }

  function drawFighter(f) {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const c = f.char;

    // Saldırı active'te yarı şeffaf vuruş "trail" (his için)
    if (f.attackInActive()) {
      const ab = attackHitbox(f);
      if (ab) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.shadowColor = c.color; ctx.shadowBlur = 14;
        ctx.fillStyle = c.color;
        ctx.fillRect(ab.x, ab.y, ab.w, ab.h);
        ctx.restore();
      }
    }

    // Gölge (zeminde)
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, CONFIG.floorY - 2, f.w * 0.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // KO eğme
    ctx.save();
    if (f.state === F.KO) {
      ctx.translate(cx, cy);
      ctx.rotate(f.facing * 0.6);
      ctx.translate(-cx, -cy);
    }

    // Yüz/eğim için flash
    const flash = f.hitFlash > 0;
    const bodyFill = flash ? "#fff" : "#0a0a14";
    const stroke   = flash ? "#fff" : c.color;

    // Gövde (dikdörtgen)
    ctx.save();
    ctx.shadowColor = c.color; ctx.shadowBlur = 12;
    ctx.fillStyle = bodyFill;
    ctx.fillRect(f.x + 6, f.y + 18, f.w - 12, f.h - 32);
    ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    ctx.strokeRect(f.x + 6 + 0.5, f.y + 18 + 0.5, f.w - 13, f.h - 33);
    ctx.restore();

    // Kafa (üst altıgen/yuvarlak)
    ctx.save();
    ctx.shadowColor = c.color; ctx.shadowBlur = 12;
    ctx.fillStyle = bodyFill;
    ctx.beginPath();
    ctx.arc(cx, f.y + 12, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, f.y + 12, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Vizör (göz, facing'e göre)
    ctx.save();
    ctx.shadowColor = c.visor; ctx.shadowBlur = 8;
    ctx.fillStyle = c.visor;
    const visX = cx + f.facing * 3 - 4;
    ctx.fillRect(visX, f.y + 9, 8, 3);
    ctx.restore();

    // Bacaklar (basit çizgi/dikdörtgen, walk anim için bob)
    const legBob = (f.state === F.WALK && f.onGround) ? Math.sin(performance.now() * 0.018) * 3 : 0;
    ctx.save();
    ctx.fillStyle = c.color;
    ctx.fillRect(cx - 9, f.y + f.h - 14, 6, 14 + legBob);
    ctx.fillRect(cx + 3, f.y + f.h - 14, 6, 14 - legBob);
    ctx.restore();

    // Kollar — saldırı/blok/standby
    drawArms(f);

    ctx.restore();
  }

  function drawArms(f) {
    const cx = f.x + f.w / 2;
    const sy = f.y + 26;            // omuz y
    const c = f.char;

    ctx.save();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.shadowColor = c.color; ctx.shadowBlur = 8;

    if (f.state === F.BLOCK) {
      // Kollar önde X şeklinde
      const dir = f.facing;
      ctx.beginPath();
      ctx.moveTo(cx - 4, sy);
      ctx.lineTo(cx + dir * 14, sy + 14);
      ctx.moveTo(cx + 4, sy);
      ctx.lineTo(cx + dir * 14, sy - 4);
      ctx.stroke();
      // Blok parlama
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#7af0e0";
      ctx.fillRect(cx + (dir > 0 ? 8 : -22), sy - 6, 14, 28);
      ctx.restore();
    } else if (f.state === F.LIGHT || f.state === F.HEAVY) {
      // İleri uzanmış kol (active'te dümdüz, windup'ta yarı)
      const a = f.state === F.LIGHT ? c.lightActive : c.heavyActive;
      let t = 0;
      if (f.stateT < a[0]) t = f.stateT / a[0];               // windup 0→1
      else if (f.stateT <= a[1]) t = 1;                       // active
      else t = 1 - Math.min(1, (f.stateT - a[1]) / 0.15);      // recovery
      const reach = f.state === F.HEAVY ? 30 : 22;
      const armX = cx + f.facing * (10 + reach * t);
      const armY = sy + (f.state === F.HEAVY ? -2 : 2);
      ctx.beginPath();
      ctx.moveTo(cx + f.facing * 4, sy);
      ctx.lineTo(armX, armY);
      ctx.stroke();
      // El (yumruk)
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(armX, armY, f.state === F.HEAVY ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      // Diğer kol yanda
      ctx.beginPath();
      ctx.moveTo(cx - f.facing * 4, sy);
      ctx.lineTo(cx - f.facing * 8, sy + 14);
      ctx.stroke();
    } else {
      // Idle / walk / jump → kollar yanda
      const sway = (f.state === F.WALK) ? Math.sin(performance.now() * 0.018) * 2 : 0;
      ctx.beginPath();
      ctx.moveTo(cx - 4, sy);
      ctx.lineTo(cx - 10, sy + 16 + sway);
      ctx.moveTo(cx + 4, sy);
      ctx.lineTo(cx + 10, sy + 16 - sway);
      ctx.stroke();
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


  /* ==========================================================================
   * 15. UI / OVERLAYS / HUD
   * ----------------------------------------------------------------------- */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const screens = {
    title:  $("#screen-title"),
    select: $("#screen-select"),
    pause:  $("#screen-pause"),
    result: $("#screen-result"),
  };
  const hudTop     = $("#hud-top");
  const hudActions = $("#hud-actions");
  const mctrls     = $("#mctrls");

  function isTouch() {
    return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  }
  function showOnly(name) {
    for (const [k, el] of Object.entries(screens)) el.hidden = (k !== name);
    const playing = name == null;
    hudTop.hidden     = !playing;
    hudActions.hidden = !playing;
    mctrls.hidden     = !(playing && isTouch());
    if (!playing) hideAnnounce();
  }

  function openSelect() {
    state = STATE.SELECT;
    showOnly("select");
    renderCharCards();
    renderDiffButtons();
  }

  function renderCharCards() {
    const root = $("#char-cards");
    root.innerHTML = "";
    CHARACTERS.forEach((c) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "char-card" + (c.id === selectedCharId ? " selected" : "");
      card.dataset.id = c.id;
      // Mini önizleme — küçük canvas
      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = 60; previewCanvas.height = 80;
      previewCanvas.style.width = "60px"; previewCanvas.style.height = "80px";
      const pctx = previewCanvas.getContext("2d");
      drawCharPreview(pctx, c);
      card.innerHTML = `
        <div class="char-preview"></div>
        <div class="char-name" style="color:${c.color}">${c.name}</div>
        <div class="char-stats">
          <div class="char-stat-row"><span class="char-stat-label">HP</span><span>${c.hp}</span></div>
          <div class="char-stat-row"><span class="char-stat-label">HIZ</span><span>${c.speed}</span></div>
          <div class="char-stat-row"><span class="char-stat-label">HAFİF</span><span>${c.lightDmg}</span></div>
          <div class="char-stat-row"><span class="char-stat-label">AĞIR</span><span>${c.heavyDmg}</span></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.4">${c.desc}</div>
      `;
      card.querySelector(".char-preview").appendChild(previewCanvas);
      card.addEventListener("click", () => {
        selectedCharId = c.id;
        lsSet(LS.lastChar, c.id);
        renderCharCards();
        $("#btn-fight").disabled = false;
      });
      root.appendChild(card);
    });
    $("#btn-fight").disabled = false;
  }

  function drawCharPreview(c, char) {
    c.clearRect(0, 0, 60, 80);
    c.shadowColor = char.color; c.shadowBlur = 10;
    c.fillStyle = "#0a0a14";
    c.fillRect(20, 24, 20, 38);
    c.strokeStyle = char.color; c.lineWidth = 2;
    c.strokeRect(20.5, 24.5, 19, 37);
    c.beginPath();
    c.arc(30, 18, 9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.shadowBlur = 6;
    c.fillStyle = char.visor;
    c.fillRect(26, 16, 8, 3);
    c.shadowBlur = 0;
    c.fillStyle = char.color;
    c.fillRect(22, 60, 5, 14);
    c.fillRect(33, 60, 5, 14);
  }

  function renderDiffButtons() {
    $$(".diff-btn").forEach((b) => {
      b.classList.toggle("diff-btn--active", b.dataset.diff === selectedDiff);
    });
  }

  function pauseGame()  { if (state === STATE.PLAYING) { state = STATE.PAUSED; screens.pause.hidden = false; } }
  function resumeGame() { if (state === STATE.PAUSED)  { state = STATE.PLAYING; screens.pause.hidden = true; } }

  // HUD update
  function updateHud() {
    if (!p1 || !p2) return;
    const p1Pct = Math.max(0, p1.hp / p1.maxHp);
    const p2Pct = Math.max(0, p2.hp / p2.maxHp);
    const p1Fill = $("#p1-hp"), p2Fill = $("#p2-hp");
    p1Fill.style.width = (p1Pct * 100) + "%";
    p2Fill.style.width = (p2Pct * 100) + "%";
    p1Fill.classList.toggle("hp-low", p1Pct < 0.3);
    p2Fill.classList.toggle("hp-low", p2Pct < 0.3);
    // Super meter
    const p1m = $("#p1-meter"), p2m = $("#p2-meter");
    if (p1m) {
      p1m.style.width = ((p1.meter / CONFIG.meterMax) * 100) + "%";
      p1m.classList.toggle("full", p1.meter >= CONFIG.meterMax);
    }
    if (p2m) {
      p2m.style.width = ((p2.meter / CONFIG.meterMax) * 100) + "%";
      p2m.classList.toggle("full", p2.meter >= CONFIG.meterMax);
    }
    $("#p1-name").textContent = p1.char.name;
    $("#p2-name").textContent = "CPU · " + p2.char.name;
    $("#round-timer").textContent = String(Math.max(0, Math.ceil(roundTimer)));
  }
  function updateRoundsHud() {
    const need = CONFIG.roundsToWin;
    function pips(won) {
      let html = "";
      for (let i = 0; i < need; i++) {
        html += `<span class="round-pip${i < won ? " won" : ""}"></span>`;
      }
      return html;
    }
    $("#p1-rounds").innerHTML = pips(p1RoundsWon);
    $("#p2-rounds").innerHTML = pips(p2RoundsWon);
  }
  function updateRankDisplay() {
    const r = loadRating();
    const t = tierFor(r);
    const nameEl = $("#rank-name");
    nameEl.textContent = t.name;
    nameEl.style.color = t.color;
    nameEl.style.textShadow = `0 0 12px ${t.color}`;
    $("#rank-rating").textContent = String(r);
  }


  /* ==========================================================================
   * 16. INPUT BINDING (UI + mobile)
   * ----------------------------------------------------------------------- */
  $("#btn-start").addEventListener("click", () => { ensureAudio(); openSelect(); });
  $("#btn-select-back").addEventListener("click", () => { state = STATE.TITLE; showOnly("title"); updateRankDisplay(); });
  $("#btn-fight").addEventListener("click", () => { ensureAudio(); startMatch(); });
  $("#btn-resume").addEventListener("click", resumeGame);
  $("#btn-pause-quit").addEventListener("click", () => { state = STATE.TITLE; showOnly("title"); updateRankDisplay(); });
  $("#btn-pause").addEventListener("click", pauseGame);
  $("#btn-result-rematch").addEventListener("click", () => startMatch());
  $("#btn-result-quit").addEventListener("click", () => { state = STATE.TITLE; showOnly("title"); updateRankDisplay(); });

  // Difficulty buttons
  $$(".diff-btn").forEach((b) => {
    b.addEventListener("click", () => {
      selectedDiff = b.dataset.diff;
      lsSet(LS.lastDiff, selectedDiff);
      renderDiffButtons();
    });
  });

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

  // Mobile buttons
  function bindHold(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); onDown(); };
    const up   = (e) => { e.preventDefault(); onUp(); };
    el.addEventListener("pointerdown",   down);
    el.addEventListener("pointerup",     up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave",  up);
  }
  bindHold($("#mb-left"),  () => input.left  = true, () => input.left  = false);
  bindHold($("#mb-right"), () => input.right = true, () => input.right = false);
  bindHold($("#mb-jump"),
    () => { if (!input.jumpHeld) input.jumpQueued = true; input.jumpHeld = true; },
    () => { input.jumpHeld = false; });
  bindHold($("#mb-block"), () => input.blockHeld = true, () => input.blockHeld = false);
  $("#mb-light").addEventListener("pointerdown", (e) => { e.preventDefault(); ensureAudio(); input.lightQueued = true; });
  $("#mb-heavy").addEventListener("pointerdown", (e) => { e.preventDefault(); ensureAudio(); input.heavyQueued = true; });

  // Visibility → auto pause
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === STATE.PLAYING) pauseGame();
  });


  /* ==========================================================================
   * 17. MAIN LOOP
   * ----------------------------------------------------------------------- */
  let lastTime = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1;

    if (state === STATE.PLAYING || state === STATE.INTRO || state === STATE.OUTRO) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        tick(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 4) acc = 0;
    } else {
      acc = 0;
    }

    renderGame();
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    // INTRO: "ROUND X" göster, sayaç bitince PLAYING'e geç
    if (state === STATE.INTRO) {
      introT -= dt;
      if (introT <= 0) {
        state = STATE.PLAYING;
        showAnnounce("FIGHT!");
        sfx.roundStart();
        setTimeout(hideAnnounce, 800);
      }
      // INTRO sırasında karakterler render edilsin ama input alma
      return;
    }
    if (state === STATE.OUTRO) {
      outroT -= dt;
      // Outro sırasında savaşçılar düşmeye devam edebilsin
      if (p1) updateFighter(p1, p2, dt, { left: false, right: false, jumpQueued: false, jumpHeld: false, blockHeld: false, lightQueued: false, heavyQueued: false });
      if (p2) updateFighter(p2, p1, dt, { left: false, right: false, jumpQueued: false, jumpHeld: false, blockHeld: false, lightQueued: false, heavyQueued: false });
      if (p1 && p2) resolveBodyOverlap(p1, p2);
      updateParticles(dt);
      if (outroT <= 0) {
        hideAnnounce();
        afterOutro();
      }
      return;
    }

    // PLAYING
    // Zamanlayıcı (antrenman modunda işlemez)
    if (selectedDiff !== "training") {
      roundTimer -= dt;
      if (roundTimer <= 0) {
        endRound(p1.hp >= p2.hp ? "p1" : "p2");
        return;
      }
    }

    // AI
    aiThink(dt);
    const aiInp = aiInputs();

    // Update fighters
    updateFighter(p1, p2, dt, input);
    updateFighter(p2, p1, dt, aiInp);

    // Vücut çakışmasını çöz
    resolveBodyOverlap(p1, p2);

    // Vuruşları işle
    processHit(p1, p2);
    processHit(p2, p1);

    // Particles
    updateParticles(dt);

    // HUD
    if ((performance.now() | 0) % 4 === 0) updateHud();
  }

  requestAnimationFrame((t) => { lastTime = t; frame(t); });


  /* ==========================================================================
   * 18. INIT
   * ----------------------------------------------------------------------- */
  state = STATE.TITLE;
  showOnly("title");
  updateRankDisplay();
})();
