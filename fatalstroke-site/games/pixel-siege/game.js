/* ============================================================================
 * PIXEL SIEGE — Neon Tower Defense
 * ----------------------------------------------------------------------------
 * Düzenleme noktaları (hepsi dosyanın üstünde, tek yer):
 *   CONFIG   → genel oyun ayarları (para, can, dalga bonusu, satış oranı)
 *   MAP      → harita boyutu + path waypoint'leri
 *   TOWERS   → kule türleri (fiyat, hasar, menzil, upgrade ağacı)
 *   ENEMIES  → düşman türleri (hp, hız, ödül, götürdüğü can)
 *   WAVES    → dalga tanımları (her dalga için spawn grupları)
 *
 * Render: sabit 540×960 mantıksal koordinat. Üst 60px HUD, alt 120px panel,
 * orta 780px (9×13 tile × 60px) harita alanı.
 * ========================================================================= */

(() => {
  "use strict";

  /* ==========================================================================
   * 1. CONFIG — Genel ayarlar
   * ----------------------------------------------------------------------- */
  const CONFIG = {
    startingMoney:    140,   // başlangıç parası — başlangıçta 2 blaster + biraz artar
    startingLives:    15,    // başlangıç canı
    waveBonusBase:    18,    // ilk dalga bonusu (yavaş ramp)
    waveBonusGrowth:  5,     // her dalgada +X bonus artar
    sellRefundPct:    0.55,  // sat geri ödeme oranı (toplam yatırılanın)
    moveCostPct:      0.30,  // taşıma maliyeti (toplam yatırımın oranı)
    moveCostMin:      15,    // taşımanın minimum maliyeti ($)
    spawnDelay:       0,     // (s) dalga başlat → ilk spawn beklemesi
  };


  /* ==========================================================================
   * 2. MAP — Harita ve yol
   * -----------------------------------------------------------------------
   * 9 sütun × 13 satır × 60 px = 540 × 780 (harita alanı).
   * y-ofseti 60 (üst HUD boşluğu).
   *
   * Yol, waypoint dizisi olarak tanımlı. Segmentler aksiyal (yatay/dikey)
   * olmalı. Düşmanlar bu çizgi boyunca akar; aynı tile'ler "yol" sayılır
   * ve üzerlerine kule konulamaz.
   * ----------------------------------------------------------------------- */
  const MAP = {
    cols: 9,
    rows: 11,                // 11 × 60 = 660 px (alt HUD'a yer bırakır)
    tile: 60,
    offsetY: 60,             // canvas içinde harita üst kenarı (üst HUD)
    // (-1) / cols → ekran dışı giriş/çıkış
    path: [
      { col: -1, row: 2 },   // giriş (sol-üst)
      { col: 6,  row: 2 },
      { col: 6,  row: 5 },
      { col: 2,  row: 5 },
      { col: 2,  row: 8 },
      { col: 9,  row: 8 },   // çıkış (sağ-orta) → üs
    ],
  };


  /* ==========================================================================
   * 3. TOWERS — Kule türleri ve upgrade ağaçları
   * -----------------------------------------------------------------------
   * Alanlar:
   *   id, name, description, color, accent
   *   cost      → satın alma fiyatı (level 1)
   *   range     → ateş menzili (px)
   *   damage    → tek vuruş hasarı
   *   fireRate  → saniyede atış sayısı
   *   projSpeed → mermi hızı (px/s)
   *   splash    → (ops.) çarpışma noktasında alan hasarı yarıçapı (px)
   *   slow      → (ops.) { factor, duration } yavaşlatma
   *   pierce    → (ops.) tek mermide kaç düşman delinir
   *   shape     → drawTower'a verilecek görsel tip ("blaster"|"cannon"|"frost"|"sniper")
   *   upgrades  → [{ cost, damage, range, fireRate, splash, slow, ... }, ...]
   *               (max seviye = upgrades.length + 1)
   * ----------------------------------------------------------------------- */
  const TOWERS = [
    {
      id: "blaster", name: "BLASTER",
      description: "Hızlı ateş, düşük hasar.",
      color: "#22d3ee", accent: "#7af0e0",
      cost: 50, range: 130, damage: 8, fireRate: 3.5, projSpeed: 700,
      shape: "blaster",
      upgrades: [
        { cost: 70,  damage: 14, range: 150, fireRate: 4.2, projSpeed: 750 },
        { cost: 140, damage: 24, range: 170, fireRate: 5.0, projSpeed: 800 },
      ],
    },
    {
      id: "cannon", name: "CANNON",
      description: "Yavaş, splash hasar.",
      color: "#b537f2", accent: "#e29bff",
      cost: 120, range: 140, damage: 40, fireRate: 0.7, projSpeed: 500,
      splash: 55, shape: "cannon",
      upgrades: [
        { cost: 150, damage: 70,  range: 160, fireRate: 0.85, splash: 70 },
        { cost: 240, damage: 120, range: 180, fireRate: 1.0,  splash: 85 },
      ],
    },
    {
      id: "frost", name: "FROST",
      description: "Yavaşlatır, alan etkili.",
      color: "#5aa9ff", accent: "#a8d4ff",
      cost: 90, range: 115, damage: 4, fireRate: 1.2, projSpeed: 550,
      splash: 60, slow: { factor: 0.55, duration: 2.0 }, shape: "frost",
      upgrades: [
        { cost: 110, damage: 8,  range: 130, fireRate: 1.4, splash: 70,
          slow: { factor: 0.45, duration: 2.5 } },
        { cost: 180, damage: 14, range: 145, fireRate: 1.6, splash: 80,
          slow: { factor: 0.35, duration: 3.0 } },
      ],
    },
    {
      id: "sniper", name: "SNIPER",
      description: "Uzun menzil, ağır hasar.",
      color: "#ff3e8a", accent: "#ff9ec4",
      cost: 180, range: 280, damage: 80, fireRate: 0.55, projSpeed: 1400,
      shape: "sniper",
      upgrades: [
        { cost: 220, damage: 140, range: 310, fireRate: 0.75 },
        { cost: 340, damage: 240, range: 340, fireRate: 1.0  },
      ],
    },
    {
      // PULSAR — mermi atmaz; her cooldown'da çevresine alan hasarı uygular.
      // Çok kısa menzil ama her şeyi vurur. Yakın yol noktalarına (köşeler/dar
      // geçitler) konumlandırıldığında müthiş etkili.
      id: "pulsar", name: "PULSAR",
      description: "Çevresine darbe.",
      color: "#5aff9c", accent: "#a8ffc8",
      cost: 110, range: 95, damage: 18, fireRate: 1.4, projSpeed: 0,
      shape: "pulsar",
      pulse: true,
      upgrades: [
        { cost: 130, damage: 32, range: 110, fireRate: 1.7 },
        { cost: 210, damage: 58, range: 125, fireRate: 2.1 },
      ],
    },
  ];


  /* ==========================================================================
   * 4. ENEMIES — Düşman türleri
   * -----------------------------------------------------------------------
   *   hp     → can
   *   speed  → px/sn yol üzerinde hız
   *   bounty → öldürünce alınan para
   *   lives  → üsse ulaşırsa götürdüğü can
   *   size   → görsel yarıçap (px)
   *   shape  → "square" | "triangle" | "hexagon" | "diamond"
   * ----------------------------------------------------------------------- */
  // attack: {range, damage, interval}  — varsa düşman yakın kuleye saldırır
  const ENEMIES = {
    grunt:      { name: "Grunt",      hp: 55,   speed: 65,  bounty: 5,   lives: 1, size: 14, shape: "square",   color: "#22d3ee" },
    runner:     { name: "Runner",     hp: 30,   speed: 165, bounty: 4,   lives: 1, size: 12, shape: "triangle", color: "#7af0e0" },
    tank:       { name: "Tank",       hp: 520,  speed: 42,  bounty: 24,  lives: 3, size: 20, shape: "hexagon",  color: "#b537f2" },
    swarm:      { name: "Swarm",      hp: 18,   speed: 120, bounty: 2,   lives: 1, size: 9,  shape: "diamond",  color: "#ff3e8a" },
    // --- Zorlu dalga düşmanları (Dalga 11+) — bunlar bilerek brutal ---
    destroyer:  { name: "Destroyer",  hp: 820,  speed: 58,  bounty: 26,  lives: 2, size: 18, shape: "square",   color: "#ff6b3e",
                  attack: { range: 105, damage: 40, interval: 0.7 } },
    elite:      { name: "Elite",      hp: 680,  speed: 100, bounty: 16,  lives: 2, size: 16, shape: "triangle", color: "#f5c542" },
    juggernaut: { name: "Juggernaut", hp: 3800, speed: 36,  bounty: 90,  lives: 7, size: 26, shape: "hexagon",  color: "#ff3e8a",
                  attack: { range: 125, damage: 60, interval: 0.6 } },
  };


  /* ==========================================================================
   * 5. WAVES — Dalga tanımları
   * -----------------------------------------------------------------------
   * Her dalga, sırayla tüketilen "spawn grup" dizisi.
   *   type   → ENEMIES içindeki id
   *   count  → kaç tane
   *   delay  → bu grup içinde spawn aralığı (saniye)
   *   pause  → (ops.) bu grup BİTTİKTEN sonra sonraki gruba kadar bekleme
   * ----------------------------------------------------------------------- */
  const WAVES = [
    // --- Erken (1-3) — yumuşak başlangıç, 1-2 blasterla rahat ---
    /* 1 */ [ { type: "grunt",  count: 8,  delay: 0.85 } ],
    /* 2 */ [ { type: "grunt",  count: 10, delay: 0.70 },
              { type: "runner", count: 4,  delay: 0.50, pause: 0.8 } ],
    /* 3 */ [ { type: "runner", count: 10, delay: 0.40 },
              { type: "grunt",  count: 10, delay: 0.55, pause: 0.5 } ],
    // --- Orta (4-6) — tank tanışması, çeşit gelir ---
    /* 4 */ [ { type: "grunt",  count: 14, delay: 0.45 },
              { type: "tank",   count: 2,  delay: 1.8, pause: 0.4 } ],
    /* 5 */ [ { type: "swarm",  count: 22, delay: 0.18 },
              { type: "runner", count: 10, delay: 0.32, pause: 0.6 },
              { type: "tank",   count: 2,  delay: 1.5 } ],
    /* 6 */ [ { type: "tank",   count: 4,  delay: 1.5 },
              { type: "grunt",  count: 20, delay: 0.35, pause: 0.4 },
              { type: "runner", count: 14, delay: 0.25 } ],
    // --- Geç (7-10) — gerçek baskı, ekonomiyi doğru kurmazsan zorlanırsın ---
    /* 7 */ [ { type: "swarm",  count: 40, delay: 0.13 },
              { type: "tank",   count: 6,  delay: 1.2, pause: 0.4 },
              { type: "runner", count: 14, delay: 0.24 } ],
    /* 8 */ [ { type: "runner", count: 24, delay: 0.20 },
              { type: "tank",   count: 8,  delay: 1.05, pause: 0.3 },
              { type: "grunt",  count: 26, delay: 0.28 } ],
    /* 9 */ [ { type: "tank",   count: 11, delay: 0.95 },
              { type: "swarm",  count: 56, delay: 0.11, pause: 0.3 },
              { type: "runner", count: 22, delay: 0.18 } ],
    /* 10*/ [ { type: "tank",   count: 16, delay: 0.85 },
              { type: "swarm",  count: 78, delay: 0.09, pause: 0.3 },
              { type: "runner", count: 28, delay: 0.16 },
              { type: "grunt",  count: 32, delay: 0.26 } ],

    // ====== ZORLU DALGALAR — 10. dalga sonrası açılır ======
    /* 11 */ [ { type: "destroyer", count: 6,  delay: 1.0 },
               { type: "grunt",     count: 30, delay: 0.24, pause: 0.4 },
               { type: "runner",    count: 16, delay: 0.18 } ],
    /* 12 */ [ { type: "tank",      count: 9,  delay: 0.9 },
               { type: "destroyer", count: 7,  delay: 0.8, pause: 0.3 },
               { type: "runner",    count: 28, delay: 0.14 } ],
    /* 13 */ [ { type: "elite",     count: 11, delay: 0.55 },
               { type: "swarm",     count: 80, delay: 0.09, pause: 0.3 },
               { type: "destroyer", count: 7,  delay: 0.95 } ],
    /* 14 */ [ { type: "destroyer", count: 12, delay: 0.7 },
               { type: "elite",     count: 14, delay: 0.45, pause: 0.3 },
               { type: "grunt",     count: 40, delay: 0.20 } ],
    /* 15 */ [ { type: "juggernaut",count: 2,  delay: 3 },
               { type: "tank",      count: 14, delay: 0.8, pause: 0.4 },
               { type: "swarm",     count: 90, delay: 0.08 },
               { type: "destroyer", count: 6,  delay: 0.9 } ],
    /* 16 */ [ { type: "destroyer", count: 18, delay: 0.6 },
               { type: "elite",     count: 18, delay: 0.40, pause: 0.3 },
               { type: "runner",    count: 42, delay: 0.13 } ],
    /* 17 */ [ { type: "juggernaut",count: 3,  delay: 3.5 },
               { type: "destroyer", count: 14, delay: 0.55, pause: 0.3 },
               { type: "swarm",     count: 130, delay: 0.07 },
               { type: "elite",     count: 12, delay: 0.45 } ],
    /* 18 */ [ { type: "tank",      count: 22, delay: 0.7 },
               { type: "elite",     count: 22, delay: 0.35, pause: 0.3 },
               { type: "destroyer", count: 18, delay: 0.55 },
               { type: "runner",    count: 40, delay: 0.12 } ],
    /* 19 */ [ { type: "juggernaut",count: 5,  delay: 2.5 },
               { type: "elite",     count: 30, delay: 0.30, pause: 0.3 },
               { type: "destroyer", count: 14, delay: 0.55 },
               { type: "runner",    count: 60, delay: 0.11 } ],
    /* 20 */ [ { type: "juggernaut",count: 8,  delay: 2 },
               { type: "destroyer", count: 26, delay: 0.45, pause: 0.3 },
               { type: "elite",     count: 36, delay: 0.26 },
               { type: "tank",      count: 30, delay: 0.55 },
               { type: "swarm",     count: 160, delay: 0.07 } ],
  ];

  // 10. dalgadan sonra "DEVAM ET" opsiyonu açılır (game.extendedMode = true)
  const CHECKPOINT_WAVE = 10;


  /* ==========================================================================
   * 6. STATE & STORAGE
   * ----------------------------------------------------------------------- */
  const STATE = Object.freeze({
    TITLE: "title", PLAYING: "playing", PAUSED: "paused",
    WON: "won", LOST: "lost",
  });
  let state = STATE.TITLE;
  let game  = null;   // runtime — startGame()'de doldurulur (canvas id="game" çakışmasını da engeller)

  const LS = {
    bestWave:  "pixel-siege:bestWave",
    bestScore: "pixel-siege:bestScore",
    muted:     "pixel-siege:muted",
  };
  const lsGet = (k)    => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k,v)  => { try { localStorage.setItem(k, v); } catch {} };
  const loadBestWave   = () => Number(lsGet(LS.bestWave))  || 0;
  const loadBestScore  = () => Number(lsGet(LS.bestScore)) || 0;
  const saveBestWave   = (n) => lsSet(LS.bestWave,  String(n));
  const saveBestScore  = (n) => lsSet(LS.bestScore, String(n));

  let muted = lsGet(LS.muted) === "1";


  /* ==========================================================================
   * 7. AUDIO — Web Audio API ile prosedürel sesler
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
    const v = vol * 0.18;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + atk);
    g.gain.linearRampToValueAtTime(0, t0 + dur + rel);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + rel + 0.02);
  }
  const sfx = {
    shoot:    () => tone({ freq: 1100, freqEnd: 700,  dur: 0.04, type: "square",   vol: 0.3 }),
    cannon:   () => tone({ freq: 220,  freqEnd: 90,   dur: 0.12, type: "sawtooth", vol: 0.5 }),
    frost:    () => tone({ freq: 660,  freqEnd: 880,  dur: 0.10, type: "sine",     vol: 0.35 }),
    snipe:    () => tone({ freq: 1800, freqEnd: 240,  dur: 0.08, type: "triangle", vol: 0.5 }),
    hit:      () => tone({ freq: 320,  freqEnd: 220,  dur: 0.05, type: "square",   vol: 0.25 }),
    kill:     () => tone({ freq: 520,  freqEnd: 1040, dur: 0.10, type: "triangle", vol: 0.45 }),
    place:    () => tone({ freq: 440,  freqEnd: 880,  dur: 0.10, type: "triangle", vol: 0.55 }),
    sell:     () => tone({ freq: 880,  freqEnd: 440,  dur: 0.10, type: "sine",     vol: 0.40 }),
    upgrade:  () => { tone({ freq: 660, freqEnd: 990,  dur: 0.10, type: "triangle", vol: 0.55 });
                      tone({ freq: 990, freqEnd: 1320, dur: 0.10, type: "triangle", vol: 0.40 }); },
    leak:     () => tone({ freq: 180,  freqEnd: 80,   dur: 0.25, type: "sawtooth", vol: 0.55, rel: 0.1 }),
    towerDestroy: () => { tone({ freq: 300, freqEnd: 60, dur: 0.4, type: "sawtooth", vol: 0.7, rel: 0.2 });
                          tone({ freq: 150, freqEnd: 40, dur: 0.35, type: "square",  vol: 0.4, rel: 0.15 }); },
    enemyAttack: () => tone({ freq: 460, freqEnd: 240, dur: 0.08, type: "square", vol: 0.30 }),
    waveStart:() => { tone({ freq: 440, freqEnd: 660,  dur: 0.12, type: "square",   vol: 0.5 });
                      tone({ freq: 660, freqEnd: 880,  dur: 0.12, type: "square",   vol: 0.4 }); },
    waveDone: () => { tone({ freq: 660, dur: 0.12, type: "triangle", vol: 0.5 });
                      tone({ freq: 880, dur: 0.16, type: "triangle", vol: 0.5 }); },
    win:      () => { tone({ freq: 660, dur: 0.15, type: "triangle", vol: 0.6 });
                      tone({ freq: 880, dur: 0.15, type: "triangle", vol: 0.6 });
                      tone({ freq: 1320,dur: 0.30, type: "triangle", vol: 0.6 }); },
    lose:     () => { tone({ freq: 240, freqEnd: 80, dur: 0.6, type: "sawtooth", vol: 0.7, rel: 0.2 });
                      tone({ freq: 120, freqEnd: 40, dur: 0.5, type: "square",   vol: 0.5, rel: 0.2 }); },
  };


  /* ==========================================================================
   * 8. CANVAS / RESIZE
   * ----------------------------------------------------------------------- */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const LW = 540, LH = 960;
  let dpr = 1;
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(LW * dpr);
    canvas.height = Math.round(LH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false; // pixel art net olsun
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);


  /* ==========================================================================
   * 9. PATH — Hesaplama yardımcıları
   * -----------------------------------------------------------------------
   * Waypoint'lerden:
   *   • path tile seti (build kontrolü için)
   *   • toplam path uzunluğu (px)
   *   • progress → {x, y, angle} dönüşümü
   * ----------------------------------------------------------------------- */
  function cellToPx(col, row) {
    return { x: col * MAP.tile + MAP.tile / 2, y: MAP.offsetY + row * MAP.tile + MAP.tile / 2 };
  }

  // Segmentleri (start→end px ve uzunluk) önceden hesapla
  const PATH_SEGMENTS = [];
  let PATH_TOTAL = 0;
  for (let i = 0; i < MAP.path.length - 1; i++) {
    const a = cellToPx(MAP.path[i].col,   MAP.path[i].row);
    const b = cellToPx(MAP.path[i+1].col, MAP.path[i+1].row);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    PATH_SEGMENTS.push({ a, b, len });
    PATH_TOTAL += len;
  }

  // progress (0..PATH_TOTAL) → {x, y, angle, finished}
  function progressToPos(progress) {
    let remaining = progress;
    for (const seg of PATH_SEGMENTS) {
      if (remaining <= seg.len) {
        const t = seg.len > 0 ? remaining / seg.len : 0;
        return {
          x: seg.a.x + (seg.b.x - seg.a.x) * t,
          y: seg.a.y + (seg.b.y - seg.a.y) * t,
          angle: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x),
          finished: false,
        };
      }
      remaining -= seg.len;
    }
    const last = PATH_SEGMENTS[PATH_SEGMENTS.length - 1];
    return { x: last.b.x, y: last.b.y, angle: 0, finished: true };
  }

  // Path tile set (kule yerleştirme yasağı için)
  // Aksiyal segmentlerde, segmentin geçtiği tüm tile'lar (a..b dahil) yola dahil.
  const PATH_TILES = new Set();
  function tileKey(col, row) { return col + "," + row; }
  for (let i = 0; i < MAP.path.length - 1; i++) {
    const a = MAP.path[i], b = MAP.path[i+1];
    if (a.col === b.col) {
      const c = a.col;
      const [r0, r1] = a.row < b.row ? [a.row, b.row] : [b.row, a.row];
      for (let r = r0; r <= r1; r++) PATH_TILES.add(tileKey(c, r));
    } else if (a.row === b.row) {
      const r = a.row;
      const [c0, c1] = a.col < b.col ? [a.col, b.col] : [b.col, a.col];
      for (let c = c0; c <= c1; c++) PATH_TILES.add(tileKey(c, r));
    }
    // Çapraz segmentler desteklenmiyor (tasarım kararı: aksiyal-only yol)
  }
  function isPathTile(col, row) { return PATH_TILES.has(tileKey(col, row)); }
  function inMap(col, row) { return col >= 0 && col < MAP.cols && row >= 0 && row < MAP.rows; }


  /* ==========================================================================
   * 10. DRAWING — Map, towers, enemies, projectiles
   * ----------------------------------------------------------------------- */

  // --- Map zemini + yol -------------------------------------------------
  function drawMap() {
    // Map alanı
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, MAP.offsetY, MAP.cols * MAP.tile, MAP.rows * MAP.tile);

    // Tile grid'i (buildable görünüm) — sadece path olmayan kareler için ince çizgi
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        if (isPathTile(c, r)) continue;
        const x = c * MAP.tile, y = MAP.offsetY + r * MAP.tile;
        ctx.strokeRect(x + 0.5, y + 0.5, MAP.tile - 1, MAP.tile - 1);
      }
    }

    // Path — düzgün bir neon strip olarak (segment segment çizilir)
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Alt katman: koyu yol zemini
    ctx.strokeStyle = "#1d1d33";
    ctx.lineWidth = MAP.tile - 6;
    drawPathStroke();

    // Orta katman: orta-koyu vurgulu çizgi
    ctx.strokeStyle = "rgba(34,211,238,0.10)";
    ctx.lineWidth = MAP.tile - 16;
    drawPathStroke();

    // Üst katman: ince neon kenarlık
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(34,211,238,0.65)";
    ctx.lineWidth = 2;
    drawPathStroke();
    ctx.shadowBlur = 0;

    // Giriş ve çıkış işaretçileri
    drawPathEnds();
  }

  function drawPathStroke() {
    ctx.beginPath();
    const first = cellToPx(MAP.path[0].col, MAP.path[0].row);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < MAP.path.length; i++) {
      const p = cellToPx(MAP.path[i].col, MAP.path[i].row);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function drawPathEnds() {
    // Giriş (yeşilimsi cyan)
    const start = cellToPx(MAP.path[0].col, MAP.path[0].row);
    const end   = cellToPx(MAP.path[MAP.path.length - 1].col, MAP.path[MAP.path.length - 1].row);

    ctx.save();
    ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(34,211,238,0.85)";
    ctx.beginPath();
    ctx.arc(start.x, start.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Üs (kırmızı/magenta — düşman buraya ulaşırsa can gider)
    ctx.save();
    ctx.shadowColor = "#ff3e8a"; ctx.shadowBlur = 20;
    ctx.strokeStyle = "rgba(255,62,138,0.9)";
    ctx.fillStyle = "rgba(255,62,138,0.18)";
    ctx.lineWidth = 2;
    const s = MAP.tile * 0.5;
    ctx.fillRect(end.x - s / 2, end.y - s / 2, s, s);
    ctx.strokeRect(end.x - s / 2 + 0.5, end.y - s / 2 + 0.5, s - 1, s - 1);
    ctx.restore();
  }

  // --- Build/Move hover: range circle + valid/invalid hint ---------------
  function drawBuildPreview() {
    if (!game) return;
    const tdef = activeBuildDef();
    if (!tdef) return;
    if (game.hoverTile == null) return;
    const { col, row } = game.hoverTile;
    if (!inMap(col, row)) return;
    const px = cellToPx(col, row);

    // Move modunda taşınan kulenin tile'ı geçerli sayılır
    const excludeTower = game.moveTower || null;
    const valid = isValidPlacement(col, row, excludeTower);
    // Move maliyeti karşılanıyor mu? (build modunda kule fiyatına bakılır)
    let canAfford = true;
    if (game.moveTower)        canAfford = game.money >= moveCost(game.moveTower);
    else if (game.buildTowerId) canAfford = game.money >= tdef.cost;
    const ok = valid && canAfford;
    const level = game.moveTower ? game.moveTower.level : 1;

    // Tile vurgusu
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? "rgba(90,255,156,0.18)" : "rgba(255,62,138,0.20)";
    ctx.fillRect(col * MAP.tile, MAP.offsetY + row * MAP.tile, MAP.tile, MAP.tile);
    ctx.strokeStyle = ok ? "#5aff9c" : "#ff3e8a";
    ctx.lineWidth = 2;
    ctx.strokeRect(col * MAP.tile + 1, MAP.offsetY + row * MAP.tile + 1, MAP.tile - 2, MAP.tile - 2);
    ctx.restore();

    // Menzil dairesi
    const range = effectiveStats(tdef, level).range;
    ctx.save();
    ctx.strokeStyle = tdef.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(px.x, px.y, range, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Aracın hayalet önizlemesi
    ctx.save();
    ctx.globalAlpha = ok ? 0.7 : 0.45;
    drawTower(ctx, px.x, px.y, tdef, level);
    ctx.restore();
  }

  // --- Selected tower vurgusu (menzil göstergesi) ------------------------
  function drawSelectedRange() {
    if (!game || !game.selectedTower) return;
    const t = game.selectedTower;
    const tdef = TOWERS.find((x) => x.id === t.id);
    const range = effectiveStats(tdef, t.level).range;
    ctx.save();
    ctx.strokeStyle = tdef.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.arc(t.x, t.y, range, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // --- Tower çizimi (pixel art) ------------------------------------------
  function drawTower(c, x, y, tdef, level) {
    const s = MAP.tile * 0.5;  // base pixel boyutu
    c.save();
    c.translate(Math.round(x), Math.round(y));

    // Glow tabanı
    c.shadowColor = tdef.color;
    c.shadowBlur = 14;

    // Ortak: kaide
    c.fillStyle = "#0a0a14";
    c.fillRect(-s / 2 - 2, s / 2 - 8, s + 4, 8);
    c.fillStyle = tdef.color;
    c.fillRect(-s / 2, s / 2 - 6, s, 4);

    // Türe göre üst yapı
    if (tdef.shape === "blaster") {
      // Küçük gövde + tek namlu
      c.fillStyle = "#0a0a14";
      c.fillRect(-s / 2 + 4, -4, s - 8, s / 2);
      c.strokeStyle = tdef.color; c.lineWidth = 2;
      c.strokeRect(-s / 2 + 4, -4, s - 8, s / 2);
      // namlu
      c.fillStyle = tdef.color;
      c.fillRect(-3, -14, 6, 14);
      // tepe ışığı
      c.fillStyle = tdef.accent;
      c.fillRect(-3, -18, 6, 4);
    } else if (tdef.shape === "cannon") {
      // Geniş gövde + büyük namlu
      c.fillStyle = "#0a0a14";
      c.fillRect(-s / 2 + 2, -8, s - 4, s / 2 + 4);
      c.strokeStyle = tdef.color; c.lineWidth = 2;
      c.strokeRect(-s / 2 + 2, -8, s - 4, s / 2 + 4);
      // büyük namlu
      c.fillStyle = tdef.color;
      c.fillRect(-6, -20, 12, 18);
      // tepe
      c.fillStyle = tdef.accent;
      c.fillRect(-6, -24, 12, 4);
    } else if (tdef.shape === "frost") {
      // Sekiz köşeli kristal his
      c.fillStyle = "#0a0a14";
      c.fillRect(-s / 2 + 4, -6, s - 8, s / 2 + 2);
      c.strokeStyle = tdef.color; c.lineWidth = 2;
      c.strokeRect(-s / 2 + 4, -6, s - 8, s / 2 + 2);
      // kristal pikseller
      c.fillStyle = tdef.accent;
      c.fillRect(-2, -18, 4, 6);
      c.fillRect(-8, -14, 4, 4);
      c.fillRect( 4, -14, 4, 4);
      c.fillStyle = tdef.color;
      c.fillRect(-2, -22, 4, 4);
    } else if (tdef.shape === "sniper") {
      // Uzun ince kule + dürbün
      c.fillStyle = "#0a0a14";
      c.fillRect(-s / 2 + 6, -16, s - 12, s / 2 + 14);
      c.strokeStyle = tdef.color; c.lineWidth = 2;
      c.strokeRect(-s / 2 + 6, -16, s - 12, s / 2 + 14);
      // uzun namlu
      c.fillStyle = tdef.color;
      c.fillRect(-2, -28, 4, 14);
      // dürbün
      c.fillStyle = tdef.accent;
      c.fillRect(-5, -24, 10, 4);
    } else if (tdef.shape === "pulsar") {
      // Yuvarlak-ish kaide + tepe orb (darbeyi sembolize eder)
      c.fillStyle = "#0a0a14";
      c.fillRect(-s / 2 + 4, -8, s - 8, s / 2 + 4);
      c.strokeStyle = tdef.color; c.lineWidth = 2;
      c.strokeRect(-s / 2 + 4, -8, s - 8, s / 2 + 4);
      // çekirdek orb
      c.shadowBlur = 18;
      c.fillStyle = tdef.color;
      c.beginPath(); c.arc(0, -4, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = tdef.accent;
      c.beginPath(); c.arc(0, -4, 2.5, 0, Math.PI * 2); c.fill();
      // antenler
      c.shadowBlur = 0;
      c.fillStyle = tdef.color;
      c.fillRect(-s / 2 + 2, -14, 3, 8);
      c.fillRect( s / 2 - 5, -14, 3, 8);
    }

    // Seviye göstergesi — sağ üstte küçük noktalar
    c.shadowBlur = 0;
    for (let i = 0; i < level; i++) {
      c.fillStyle = tdef.accent;
      c.fillRect(s / 2 - 5 - i * 5, -s / 2 + 2, 3, 3);
    }
    c.restore();
  }

  // --- Enemy çizimi -------------------------------------------------------
  function drawEnemy(e) {
    const def = ENEMIES[e.type];
    const x = Math.round(e.x), y = Math.round(e.y);
    const s = def.size;

    ctx.save();
    ctx.translate(x, y);

    // Slow vurgusu (mavi halka)
    if (e.slowT > 0) {
      ctx.shadowColor = "#a8d4ff";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "rgba(168,212,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, s + 4, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.shadowColor = def.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = def.color;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;

    if (def.shape === "square") {
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(-s + 3, -s + 3, s * 2 - 6, s * 2 - 6);
      ctx.fillStyle = def.color;
      ctx.fillRect(-3, -3, 6, 6);
    } else if (def.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s, -s);
      ctx.lineTo(-s,  s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0a0a14";
      ctx.beginPath();
      ctx.moveTo(s - 4, 0);
      ctx.lineTo(-s + 4, -s + 4);
      ctx.lineTo(-s + 4,  s - 4);
      ctx.closePath();
      ctx.fill();
    } else if (def.shape === "hexagon") {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * s, py = Math.sin(a) * s;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0a0a14";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * (s - 4), py = Math.sin(a) * (s - 4);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = def.color;
      ctx.fillRect(-3, -3, 6, 6);
    } else if (def.shape === "diamond") {
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

    // HP bar
    const hpPct = e.hp / def.hp;
    if (hpPct < 0.999) {
      const w = s * 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - w / 2, y - s - 8, w, 4);
      ctx.fillStyle = hpPct > 0.5 ? "#5aff9c" : hpPct > 0.25 ? "#f5c542" : "#ff3e8a";
      ctx.fillRect(x - w / 2, y - s - 8, w * hpPct, 4);
    }
  }

  // --- Projectile çizimi --------------------------------------------------
  function drawProjectile(p) {
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = p.color;
    if (p.kind === "cannon") {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === "frost") {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#a8d4ff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === "sniper") {
      // ince çizgi (hızlı), uzun trail
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    } else {
      // blaster default
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.restore();
  }

  // --- Effects (patlama / hit) --------------------------------------------
  function drawEffect(e) {
    const a = Math.max(0, e.life / e.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 14;
    if (e.kind === "splash") {
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      const r = e.radius * (1 - a + 0.4);
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
    } else if (e.kind === "attack") {
      // Düşman kuleye saldırırken bağlayıcı ışın
      ctx.strokeStyle = e.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    } else {
      // küçük spark
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - 2, e.y - 2, 4, 4);
    }
    ctx.restore();
  }


  /* ==========================================================================
   * 11. GAME LOGIC
   * ----------------------------------------------------------------------- */

  function effectiveStats(tdef, level) {
    // level 1 = base; level >=2 = upgrades[level-2]'i base'in üzerine bindirir
    if (level <= 1) return tdef;
    const up = tdef.upgrades[level - 2];
    return Object.assign({}, tdef, up || {});
  }

  function towerTotalCost(tdef, level) {
    // Seviyeye kadar yapılan tüm yatırım
    let total = tdef.cost;
    for (let i = 0; i < level - 1; i++) total += tdef.upgrades[i].cost;
    return total;
  }

  function isValidPlacement(col, row, excludeTower) {
    if (!inMap(col, row)) return false;
    if (isPathTile(col, row)) return false;
    if (game.towers.some((t) => t !== excludeTower && t.col === col && t.row === row)) return false;
    return true;
  }

  // Aktif "build/move def" — preview için: hangi kule türünü hayalet çiziyoruz?
  function activeBuildDef() {
    if (game.moveTower)   return TOWERS.find((t) => t.id === game.moveTower.id);
    if (game.buildTowerId) return TOWERS.find((t) => t.id === game.buildTowerId);
    return null;
  }

  function createGame() {
    return {
      money:        CONFIG.startingMoney,
      lives:        CONFIG.startingLives,
      waveIndex:    0,                 // sıradaki dalganın 0-tabanlı indeksi
      waveActive:   false,
      waveDone:     0,                 // tamamlanan dalga sayısı
      spawnQueue:   [],                // [{type, atTime}, ...]
      enemies:      [],
      towers:       [],
      projectiles: [],
      effects:      [],
      score:        0,
      time:         0,
      buildTowerId: null,              // seçili kule türü (yerleştirilecek)
      selectedTower:null,              // tıklanmış mevcut kule (kontekst menü)
      moveTower:    null,              // taşıma modunda olan kule (varsa)
      hoverTile:    null,              // {col,row} build/move preview için
      extendedMode: false,             // 10. dalga sonrası "Devam Et" basıldıysa true
    };
  }

  // Bir kule için max HP (seviyeye göre)
  function towerMaxHp(level) {
    return 100 + (level - 1) * 40;     // lv1=100, lv2=140, lv3=180
  }

  /* --- Wave management ------------------------------------------------- */
  function startWave() {
    if (!game || game.waveActive) return;
    if (game.waveIndex >= WAVES.length) return;
    const wdef = WAVES[game.waveIndex];

    // Spawn'ları zamanlamalı kuyruğa çevir
    game.spawnQueue = [];
    let t = game.time + CONFIG.spawnDelay;
    for (const grp of wdef) {
      for (let i = 0; i < grp.count; i++) {
        game.spawnQueue.push({ type: grp.type, at: t });
        t += grp.delay;
      }
      if (grp.pause) t += grp.pause;
    }
    game.waveActive = true;
    sfx.waveStart();
    updateUI();
  }

  function spawnEnemy(type) {
    const def = ENEMIES[type];
    const pos = progressToPos(0);
    game.enemies.push({
      type,
      hp:       def.hp,
      maxHp:    def.hp,
      progress: 0,
      x: pos.x, y: pos.y,
      slowT:    0,        // kalan slow süresi (s)
      slowFactor: 1,      // anlık hız çarpanı (1 = normal)
    });
  }

  /* --- Tower firing + targeting ---------------------------------------- */
  function towerTick(tower, dt) {
    const tdef = TOWERS.find((t) => t.id === tower.id);
    const stats = effectiveStats(tdef, tower.level);
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > 0) return;

    // PULSAR: mermi atmaz, menzildeki herkese alan hasarı uygular
    if (tdef.pulse) {
      const r2 = stats.range * stats.range;
      let hitAny = false;
      // Kopyala (applyDamage diziyi değiştirir)
      const targets = game.enemies.filter((e) => {
        const dx = e.x - tower.x, dy = e.y - tower.y;
        return dx * dx + dy * dy <= r2;
      });
      for (const e of targets) {
        applyDamage(e, stats.damage);
        hitAny = true;
      }
      if (hitAny) {
        game.effects.push({ kind: "splash", x: tower.x, y: tower.y,
                            radius: stats.range, color: tdef.color,
                            life: 0.35, maxLife: 0.35 });
        sfx.frost();
      }
      tower.cooldown = 1 / stats.fireRate;
      return;
    }

    // Hedef ara — menzildeki en ileri (progress en yüksek) düşman
    let best = null, bestProg = -1;
    const r2 = stats.range * stats.range;
    for (const e of game.enemies) {
      const dx = e.x - tower.x, dy = e.y - tower.y;
      if (dx * dx + dy * dy <= r2 && e.progress > bestProg) {
        best = e; bestProg = e.progress;
      }
    }
    if (!best) return;

    // Hedefe ateş
    const dx = best.x - tower.x, dy = best.y - tower.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = stats.projSpeed;
    game.projectiles.push({
      x: tower.x, y: tower.y,
      vx: dx / d * speed, vy: dy / d * speed,
      damage: stats.damage,
      splash: stats.splash || 0,
      slow:   stats.slow   || null,
      color:  tdef.color,
      kind:   tdef.shape,
      life:   1.2,
      pierce: 1,
    });
    tower.cooldown = 1 / stats.fireRate;

    // Sound
    if (tdef.id === "cannon")      sfx.cannon();
    else if (tdef.id === "sniper") sfx.snipe();
    else if (tdef.id === "frost")  sfx.frost();
    else                            sfx.shoot();
  }

  /* --- Projectile update + collision ----------------------------------- */
  function updateProjectiles(dt) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const p = game.projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      // Ekran dışı veya ömrü doldu
      if (p.life <= 0 ||
          p.x < -20 || p.x > LW + 20 ||
          p.y < MAP.offsetY - 20 || p.y > MAP.offsetY + MAP.rows * MAP.tile + 20) {
        game.projectiles.splice(i, 1);
        continue;
      }
      // Çarpışma
      const hit = enemyAt(p.x, p.y, 12);
      if (hit) {
        applyDamage(hit, p.damage);
        if (p.splash > 0) {
          // alan etkili
          for (const e of game.enemies) {
            const dx = e.x - p.x, dy = e.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d <= p.splash && e !== hit) {
              applyDamage(e, p.damage * 0.6);
              if (p.slow) applySlow(e, p.slow);
            }
          }
          game.effects.push({ kind: "splash", x: p.x, y: p.y, radius: p.splash,
                              color: p.color, life: 0.3, maxLife: 0.3 });
        } else {
          game.effects.push({ kind: "spark", x: p.x, y: p.y,
                              color: p.color, life: 0.15, maxLife: 0.15 });
        }
        if (p.slow) applySlow(hit, p.slow);
        game.projectiles.splice(i, 1);
      }
    }
  }

  function enemyAt(x, y, radius) {
    for (const e of game.enemies) {
      const def = ENEMIES[e.type];
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= (def.size + radius) ** 2) return e;
    }
    return null;
  }

  function applyDamage(enemy, dmg) {
    enemy.hp -= dmg;
    if (enemy.hp <= 0) {
      const def = ENEMIES[enemy.type];
      game.money += def.bounty;
      game.score += def.bounty;
      game.effects.push({ kind: "spark", x: enemy.x, y: enemy.y,
                          color: "#5aff9c", life: 0.25, maxLife: 0.25 });
      sfx.kill();
      const i = game.enemies.indexOf(enemy);
      if (i >= 0) game.enemies.splice(i, 1);
      updateUI();
    } else {
      sfx.hit();
    }
  }

  function applySlow(enemy, slow) {
    // Yeni slow daha güçlüyse uygula; aksi halde süreyi tazele
    if (slow.factor < enemy.slowFactor || enemy.slowT <= 0) {
      enemy.slowFactor = slow.factor;
    }
    enemy.slowT = Math.max(enemy.slowT, slow.duration);
  }

  /* --- Enemy update ---------------------------------------------------- */
  function updateEnemies(dt) {
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];
      const def = ENEMIES[e.type];

      // Slow tükenmesi
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slowFactor = 1;
      }

      e.progress += def.speed * e.slowFactor * dt;
      const pos = progressToPos(e.progress);
      e.x = pos.x; e.y = pos.y;

      // Kule saldırısı (sadece def.attack varsa)
      if (def.attack) {
        e.attackT = (e.attackT || def.attack.interval * 0.5) - dt;
        if (e.attackT <= 0) {
          // En yakın kuleyi bul (menzilde)
          const r2 = def.attack.range * def.attack.range;
          let target = null, bestD2 = r2;
          for (const tw of game.towers) {
            const dx = tw.x - e.x, dy = tw.y - e.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= bestD2) { target = tw; bestD2 = d2; }
          }
          if (target) {
            target.hp -= def.attack.damage;
            game.effects.push({
              kind: "attack", x1: e.x, y1: e.y, x2: target.x, y2: target.y,
              color: def.color, life: 0.18, maxLife: 0.18,
            });
            sfx.enemyAttack();
            e.attackT = def.attack.interval;
            if (target.hp <= 0) destroyTower(target);
            else if (game.selectedTower === target) refreshCtxPanel();
          } else {
            // Menzilde kule yok, biraz daha sık denesin
            e.attackT = 0.3;
          }
        }
      }

      if (pos.finished) {
        // Üsse ulaştı
        game.lives -= def.lives;
        sfx.leak();
        game.enemies.splice(i, 1);
        if (game.lives <= 0) {
          game.lives = 0;
          updateUI();
          loseGame();
          return;
        }
        updateUI();
      }
    }
  }

  /* --- Effects update -------------------------------------------------- */
  function updateEffects(dt) {
    for (let i = game.effects.length - 1; i >= 0; i--) {
      const e = game.effects[i];
      e.life -= dt;
      if (e.life <= 0) game.effects.splice(i, 1);
    }
  }

  /* --- Main update ----------------------------------------------------- */
  function updateGame(dt) {
    game.time += dt;

    // Spawn kuyruğu
    if (game.waveActive) {
      while (game.spawnQueue.length && game.spawnQueue[0].at <= game.time) {
        const s = game.spawnQueue.shift();
        spawnEnemy(s.type);
      }
      // Dalga bitişi: kuyruk boş + sahnedeki düşman kalmadı
      if (game.spawnQueue.length === 0 && game.enemies.length === 0) {
        game.waveActive = false;
        game.waveDone += 1;
        game.waveIndex += 1;
        // Bonus para
        const bonus = CONFIG.waveBonusBase + CONFIG.waveBonusGrowth * (game.waveDone - 1);
        game.money += bonus;
        game.score += bonus;
        sfx.waveDone();

        // High score kaydı
        if (game.waveDone > loadBestWave()) saveBestWave(game.waveDone);
        if (game.score   > loadBestScore()) saveBestScore(game.score);

        // Checkpoint: 10. dalga + henüz extended değil → "Devam Et" ekranı
        if (game.waveDone === CHECKPOINT_WAVE && !game.extendedMode) {
          winGame(/*checkpoint=*/true);
          return;
        }
        // Final: tüm dalgalar bitti
        if (game.waveIndex >= WAVES.length) {
          winGame(/*checkpoint=*/false);
          return;
        }
        updateUI();
      }
    }

    // Kuleler ateş
    for (const tw of game.towers) towerTick(tw, dt);

    // Mermiler
    updateProjectiles(dt);

    // Düşmanlar
    updateEnemies(dt);

    // Efektler
    updateEffects(dt);
  }

  /* --- Render ---------------------------------------------------------- */
  function renderGame() {
    // Arkaplan
    ctx.fillStyle = "#07070d";
    ctx.fillRect(0, 0, LW, LH);

    drawMap();
    drawBuildPreview();
    drawSelectedRange();

    if (game) {
      // Kuleler + HP barı (sadece hasar görmüşse)
      for (const tw of game.towers) {
        const tdef = TOWERS.find((t) => t.id === tw.id);
        drawTower(ctx, tw.x, tw.y, tdef, tw.level);
        if (tw.hp < tw.maxHp) {
          const w = 36;
          const x = tw.x - w / 2, y = tw.y - 26;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(x, y, w, 3);
          const pct = Math.max(0, tw.hp / tw.maxHp);
          ctx.fillStyle = pct > 0.5 ? "#5aff9c" : pct > 0.25 ? "#f5c542" : "#ff3e8a";
          ctx.fillRect(x, y, w * pct, 3);
        }
      }
      // Düşmanlar
      for (const e of game.enemies) drawEnemy(e);
      // Mermiler
      for (const p of game.projectiles) drawProjectile(p);
      // Efektler
      for (const ef of game.effects) drawEffect(ef);
    }
  }


  /* ==========================================================================
   * 12. STATE TRANSITIONS & UI
   * ----------------------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const screens = {
    title:    $("#screen-title"),
    pause:    $("#screen-pause"),
    won:      $("#screen-won"),
    lost:     $("#screen-lost"),
  };
  const hudTop    = $("#hud-top");
  const hudBottom = $("#hud-bottom");

  function showOnly(name) {
    for (const [k, el] of Object.entries(screens)) el.hidden = (k !== name);
    const showHud = (name == null);
    hudTop.hidden = !showHud;
    hudBottom.hidden = !showHud;
  }
  function setState(s) {
    state = s;
    if (s === STATE.TITLE)   showOnly("title");
    if (s === STATE.PLAYING) showOnly(null);
    if (s === STATE.PAUSED)  { screens.pause.hidden = false; }
    if (s === STATE.WON)     showOnly("won");
    if (s === STATE.LOST)    showOnly("lost");
  }

  function startGame() {
    ensureAudio();
    game = createGame();
    setState(STATE.PLAYING);
    buildToolbar();   // butonları afford state'e göre güncelle
    refreshNextWaveBtn();
    updateUI();
  }
  function pauseGame()  { if (state === STATE.PLAYING) setState(STATE.PAUSED); }
  function resumeGame() { if (state === STATE.PAUSED) setState(STATE.PLAYING); }

  function winGame(checkpoint) {
    sfx.win();
    $("#won-lives").textContent = game.lives;
    $("#won-score").textContent = game.score.toLocaleString("tr-TR");
    $("#won-best").textContent  = loadBestWave();
    const isNewBest = game.score >= loadBestScore();
    $("#won-newbest").hidden = !isNewBest;

    // Checkpoint: "Devam Et" göster, başlık/altyazı farklı; final: standart
    if (checkpoint) {
      $("#won-eyebrow").textContent = "// CHECKPOINT 10/10";
      $("#won-title").textContent   = "DALGA 10 TAMAM";
      $("#won-subtitle").hidden = false;
      $("#btn-won-continue").hidden = false;
    } else {
      $("#won-eyebrow").textContent = "// SIEGE BROKEN";
      $("#won-title").textContent   = "KAZANDIN";
      $("#won-subtitle").hidden = true;
      $("#btn-won-continue").hidden = true;
    }
    setState(STATE.WON);
  }
  function loseGame() {
    sfx.lose();
    $("#lost-wave").textContent  = game.waveDone;
    $("#lost-score").textContent = game.score.toLocaleString("tr-TR");
    $("#lost-best").textContent  = loadBestWave();
    const isNewBest = game.waveDone >= loadBestWave();
    $("#lost-newbest").hidden = !isNewBest;
    setState(STATE.LOST);
  }


  /* ==========================================================================
   * 13. HUD UPDATE — money/lives/wave + build/ctx panel
   * ----------------------------------------------------------------------- */
  const $money     = $("#stat-money");
  const $lives     = $("#stat-lives");
  const $wave      = $("#stat-wave");
  const $waveMax   = $("#stat-wave-max");
  const $nextBtn   = $("#btn-next-wave");
  const $nextSub   = $("#next-wave-sub");
  const $buildPnl  = $("#build-panel");
  const $ctxPnl    = $("#ctx-panel");
  const $ctxName   = $("#ctx-name");
  const $ctxStats  = $("#ctx-stats");
  const $upBtn     = $("#btn-upgrade");
  const $upCost    = $("#upgrade-cost");
  const $moveBtn   = $("#btn-move");
  const $moveCost  = $("#move-cost");
  const $repairBtn = $("#btn-repair");
  const $repairCost= $("#repair-cost");
  const $sellBtn   = $("#btn-sell");
  const $sellVal   = $("#sell-value");

  function waveMax() {
    // Extended modda 20, henüz değilse 10
    return game.extendedMode ? WAVES.length : CHECKPOINT_WAVE;
  }

  function updateUI() {
    if (!game) return;
    $money.textContent   = game.money;
    $lives.textContent   = game.lives;
    const max = waveMax();
    $wave.textContent    = Math.min(game.waveIndex + 1, max);
    $waveMax.textContent = max;
    refreshNextWaveBtn();
    refreshBuildButtons();
    refreshCtxPanel();
  }

  function refreshNextWaveBtn() {
    if (!game) return;
    // 10. dalga sonrası checkpoint ekrana gidiliyor → orada extended=true olmadan
    // başlatma olmaz. extended olmadıysa max 10. dalgayı sun, sonra durdur.
    const max = waveMax();
    const hasMore = game.waveIndex < max;
    const visible = hasMore && !game.waveActive;
    $nextBtn.hidden = !visible;
    if (visible) {
      $nextSub.textContent = `Dalga ${game.waveIndex + 1} / ${max}`;
    }
  }

  function buildToolbar() {
    $buildPnl.innerHTML = "";
    TOWERS.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "build-btn";
      btn.style.setProperty("--tower-color", t.color);
      btn.dataset.towerId = t.id;
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", `${t.name} kulesi, ${t.cost} para`);

      // Mini canvas önizleme — kule görseli
      const mini = document.createElement("canvas");
      mini.className = "build-btn-icon";
      mini.width = 32; mini.height = 32;
      btn.appendChild(mini);

      const name = document.createElement("span");
      name.className = "build-btn-name";
      name.textContent = t.name;
      btn.appendChild(name);

      const cost = document.createElement("span");
      cost.className = "build-btn-cost";
      cost.textContent = t.cost;
      btn.appendChild(cost);

      // Mini canvas'ta kule
      const mctx = mini.getContext("2d");
      const mdpr = Math.min(window.devicePixelRatio || 1, 2);
      mini.width = 32 * mdpr; mini.height = 32 * mdpr;
      mini.style.width = "32px"; mini.style.height = "32px";
      mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
      mctx.imageSmoothingEnabled = false;
      drawTower(mctx, 16, 22, t, 1);

      btn.addEventListener("click", () => {
        if (!game) return;
        if (game.money < t.cost) return;
        // Toggle
        if (game.buildTowerId === t.id) {
          game.buildTowerId = null;
        } else {
          game.buildTowerId = t.id;
          game.selectedTower = null;
        }
        refreshBuildButtons();
        refreshCtxPanel();
      });

      $buildPnl.appendChild(btn);
    });
    refreshBuildButtons();
  }

  function refreshBuildButtons() {
    if (!game) return;
    const buttons = $buildPnl.querySelectorAll(".build-btn");
    buttons.forEach((btn) => {
      const t = TOWERS.find((x) => x.id === btn.dataset.towerId);
      btn.disabled = game.money < t.cost;
      btn.setAttribute("aria-pressed", String(game.buildTowerId === t.id));
    });
  }

  function refreshCtxPanel() {
    if (!game) return;
    const t = game.selectedTower;
    if (!t) { $ctxPnl.hidden = true; return; }
    const tdef = TOWERS.find((x) => x.id === t.id);
    $ctxPnl.hidden = false;
    $ctxPnl.style.setProperty("--tower-color", tdef.color);
    const stats = effectiveStats(tdef, t.level);
    $ctxName.textContent  = `${tdef.name}  ·  Lv${t.level}`;
    $ctxStats.textContent =
      `HASAR ${stats.damage}  ·  MENZİL ${stats.range}` +
      `  ·  ${stats.fireRate.toFixed(1)}/s` +
      (stats.splash ? `  ·  SPLASH ${stats.splash}` : "") +
      (stats.slow   ? `  ·  YAVAŞ ${Math.round((1 - stats.slow.factor) * 100)}%` : "");

    const maxLevel = tdef.upgrades.length + 1;
    if (t.level < maxLevel) {
      const upCost = tdef.upgrades[t.level - 1].cost;
      $upBtn.disabled = game.money < upCost;
      $upCost.textContent = upCost;
    } else {
      $upBtn.disabled = true;
      $upCost.textContent = "MAX";
    }
    const mCost = moveCost(t);
    $moveBtn.disabled = game.money < mCost;
    $moveCost.textContent = mCost;
    $moveBtn.setAttribute("aria-pressed", String(game.moveTower === t));

    // Tamir butonu — sadece HP eksikse görünür
    if (t.hp < t.maxHp) {
      const rCost = repairCost(t);
      $repairBtn.hidden = false;
      $repairBtn.disabled = game.money < rCost;
      $repairCost.textContent = rCost;
    } else {
      $repairBtn.hidden = true;
    }

    const sell = Math.floor(towerTotalCost(tdef, t.level) * CONFIG.sellRefundPct);
    $sellVal.textContent = sell;
  }

  /* --- Tower placement ------------------------------------------------- */
  function tryPlaceTower(col, row) {
    if (!isValidPlacement(col, row)) return false;
    const tdef = TOWERS.find((t) => t.id === game.buildTowerId);
    if (!tdef || game.money < tdef.cost) return false;
    const px = cellToPx(col, row);
    const maxHp = towerMaxHp(1);
    game.towers.push({
      id: tdef.id, col, row, x: px.x, y: px.y,
      level: 1, cooldown: 0,
      hp: maxHp, maxHp,
    });
    game.money -= tdef.cost;
    sfx.place();
    updateUI();
    return true;
  }

  // Seçili kuleyi yeni karaya taşı. Maliyet: toplam yatırımın moveCostPct'i.
  function tryMoveTower(col, row) {
    const t = game.moveTower;
    if (!t) return false;
    if (!isValidPlacement(col, row, t)) return false;
    const cost = moveCost(t);
    if (game.money < cost) return false;
    game.money -= cost;
    t.col = col; t.row = row;
    const px = cellToPx(col, row);
    t.x = px.x; t.y = px.y;
    t.cooldown = Math.max(t.cooldown, 0.5);  // taşıma sonrası kısa ısınma
    game.moveTower = null;
    sfx.place();
    updateUI();
    return true;
  }

  function moveCost(tower) {
    const tdef = TOWERS.find((x) => x.id === tower.id);
    const base = towerTotalCost(tdef, tower.level) * CONFIG.moveCostPct;
    return Math.max(CONFIG.moveCostMin, Math.floor(base));
  }

  // Tamir maliyeti = kulenin toplam yatırımının %20'si × eksik HP oranı (min $4)
  function repairCost(tower) {
    if (tower.hp >= tower.maxHp) return 0;
    const tdef = TOWERS.find((x) => x.id === tower.id);
    const missingFrac = 1 - tower.hp / tower.maxHp;
    const base = towerTotalCost(tdef, tower.level) * 0.20 * missingFrac;
    return Math.max(4, Math.ceil(base));
  }

  function repairSelected() {
    const t = game.selectedTower;
    if (!t) return;
    if (t.hp >= t.maxHp) return;
    const cost = repairCost(t);
    if (game.money < cost) return;
    game.money -= cost;
    t.hp = t.maxHp;
    // Yeşil iyileşme efekti
    game.effects.push({
      kind: "splash", x: t.x, y: t.y, radius: 32,
      color: "#5aff9c", life: 0.4, maxLife: 0.4,
    });
    sfx.upgrade();
    updateUI();
  }

  // Kule yok et: çevredeki düşman saldırısından HP biterse veya manuel sat
  function destroyTower(tower) {
    const tdef = TOWERS.find((x) => x.id === tower.id);
    const refund = Math.floor(towerTotalCost(tdef, tower.level) * 0.5);
    game.money += refund;
    game.effects.push({
      kind: "splash", x: tower.x, y: tower.y, radius: 40,
      color: "#ff3e8a", life: 0.5, maxLife: 0.5,
    });
    const i = game.towers.indexOf(tower);
    if (i >= 0) game.towers.splice(i, 1);
    if (game.selectedTower === tower) { game.selectedTower = null; refreshCtxPanel(); }
    if (game.moveTower === tower) game.moveTower = null;
    sfx.towerDestroy();
    updateUI();
  }

  function trySelectTower(col, row) {
    const t = game.towers.find((x) => x.col === col && x.row === row);
    game.selectedTower = t || null;
    game.buildTowerId = null;        // build modunu kapat
    refreshBuildButtons();
    refreshCtxPanel();
    return !!t;
  }

  function upgradeSelected() {
    const t = game.selectedTower;
    if (!t) return;
    const tdef = TOWERS.find((x) => x.id === t.id);
    const maxLevel = tdef.upgrades.length + 1;
    if (t.level >= maxLevel) return;
    const upCost = tdef.upgrades[t.level - 1].cost;
    if (game.money < upCost) return;
    game.money -= upCost;
    t.level += 1;
    t.maxHp = towerMaxHp(t.level);
    t.hp = t.maxHp;                // yükseltme tam onarır
    sfx.upgrade();
    updateUI();
  }

  function sellSelected() {
    const t = game.selectedTower;
    if (!t) return;
    const tdef = TOWERS.find((x) => x.id === t.id);
    const refund = Math.floor(towerTotalCost(tdef, t.level) * CONFIG.sellRefundPct);
    game.money += refund;
    const i = game.towers.indexOf(t);
    if (i >= 0) game.towers.splice(i, 1);
    game.selectedTower = null;
    sfx.sell();
    updateUI();
  }


  /* ==========================================================================
   * 14. INPUT
   * ----------------------------------------------------------------------- */

  // Klavye
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      if (state === STATE.TITLE)  { e.preventDefault(); startGame(); return; }
      if (state === STATE.WON)    { e.preventDefault(); startGame(); return; }
      if (state === STATE.LOST)   { e.preventDefault(); startGame(); return; }
      if (state === STATE.PAUSED) { e.preventDefault(); resumeGame(); return; }
      if (state === STATE.PLAYING && !game.waveActive) {
        e.preventDefault();
        startWave(); return;
      }
    }
    if (state === STATE.PLAYING) {
      if (e.key === "Escape") {
        e.preventDefault();
        // Önce aktif modları/seçimi temizle, hiçbiri yoksa pause
        if (game.buildTowerId || game.moveTower || game.selectedTower) {
          game.buildTowerId = null;
          game.moveTower = null;
          game.selectedTower = null;
          refreshBuildButtons();
          refreshCtxPanel();
        } else {
          pauseGame();
        }
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault(); pauseGame();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      }
    } else if (state === STATE.PAUSED && e.key === "Escape") {
      resumeGame();
    }
  }, { passive: false });

  // Canvas tıklama / dokunma
  function canvasToLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (LW / rect.width);
    const y = (clientY - rect.top)  * (LH / rect.height);
    return { x, y };
  }

  function handleMapClick(x, y) {
    if (state !== STATE.PLAYING || !game) return;
    if (y < MAP.offsetY) return;
    if (y >= MAP.offsetY + MAP.rows * MAP.tile) return;

    const col = Math.floor(x / MAP.tile);
    const row = Math.floor((y - MAP.offsetY) / MAP.tile);
    if (!inMap(col, row)) return;

    // 1) Taşıma modu aktifse → kuleyi taşımayı dene
    if (game.moveTower) {
      // Başka bir kuleye basarsa → onu seç, taşıma modunu kapat
      const other = game.towers.find((t) => t.col === col && t.row === row);
      if (other && other !== game.moveTower) {
        game.moveTower = null;
        trySelectTower(col, row);
        return;
      }
      // Aynı kuleye basarsa hiçbir şey yapma (kazara iptal olmasın);
      // iptal için ctx panelindeki X ya da yeniden Taşı butonu kullanılır.
      if (other === game.moveTower) return;
      // Geçerli boş kareye taşı
      if (tryMoveTower(col, row)) {
        refreshCtxPanel();
      }
      return;
    }

    // 2) Var olan kuleye tıklandıysa seç
    const existing = game.towers.find((t) => t.col === col && t.row === row);
    if (existing) { trySelectTower(col, row); return; }

    // 3) Build modu aktifse → yerleştirmeyi dene
    if (game.buildTowerId) {
      if (tryPlaceTower(col, row)) refreshBuildButtons();
      return;
    }

    // 4) Hiçbir şey → seçimi temizle
    game.selectedTower = null;
    refreshCtxPanel();
  }

  function handleMapHover(x, y) {
    if (state !== STATE.PLAYING || !game) return;
    const hasActiveMode = game.buildTowerId || game.moveTower;
    if (!hasActiveMode) { game.hoverTile = null; return; }
    if (y < MAP.offsetY || y >= MAP.offsetY + MAP.rows * MAP.tile) {
      game.hoverTile = null;
      return;
    }
    const col = Math.floor(x / MAP.tile);
    const row = Math.floor((y - MAP.offsetY) / MAP.tile);
    game.hoverTile = { col, row };
  }

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return; // touch'ta hover yok
    const { x, y } = canvasToLogical(e.clientX, e.clientY);
    handleMapHover(x, y);
  });
  canvas.addEventListener("pointerleave", () => {
    if (game) game.hoverTile = null;
  });
  canvas.addEventListener("pointerdown", (e) => {
    ensureAudio();
    const { x, y } = canvasToLogical(e.clientX, e.clientY);
    handleMapClick(x, y);
    // Dokunmatikte preview göstermek için son tile'ı kaydet
    if (e.pointerType === "touch" && game) {
      game.hoverTile = null;
    }
  });

  // HUD butonları
  $("#btn-start").addEventListener("click", () => startGame());
  $("#btn-resume").addEventListener("click", () => resumeGame());
  $("#btn-pause-quit").addEventListener("click", () => setState(STATE.TITLE));
  $("#btn-pause").addEventListener("click", () => pauseGame());
  $("#btn-won-restart").addEventListener("click", () => startGame());
  $("#btn-won-quit").addEventListener("click",    () => setState(STATE.TITLE));
  $("#btn-lost-restart").addEventListener("click",() => startGame());
  $("#btn-lost-quit").addEventListener("click",   () => setState(STATE.TITLE));
  $nextBtn.addEventListener("click", () => { ensureAudio(); startWave(); });

  // Kontekst paneli butonları
  $upBtn.addEventListener("click",  () => upgradeSelected());
  $repairBtn.addEventListener("click", () => repairSelected());
  $sellBtn.addEventListener("click",() => sellSelected());
  $moveBtn.addEventListener("click", () => {
    const t = game.selectedTower;
    if (!t) return;
    if (game.money < moveCost(t)) return;
    // Toggle: aynı butona basarsa modu iptal et
    game.moveTower = (game.moveTower === t) ? null : t;
    game.buildTowerId = null;
    refreshBuildButtons();
    refreshCtxPanel();
  });
  $("#btn-ctx-close").addEventListener("click", () => {
    game.selectedTower = null;
    game.moveTower = null;
    refreshCtxPanel();
  });
  $("#btn-won-continue").addEventListener("click", () => {
    if (!game) return;
    game.extendedMode = true;
    setState(STATE.PLAYING);
    updateUI();
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

  // Sekme arka planda → otomatik pause
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === STATE.PLAYING) pauseGame();
  });


  /* ==========================================================================
   * 15. MAIN LOOP
   * ----------------------------------------------------------------------- */
  let lastTime = performance.now();
  // Oyun hızı çarpanı (1 / 2 / 3). HUD butonu toggle eder.
  let gameSpeed = Number(lsGet("pixel-siege:speed")) || 1;
  if (![1, 2, 3].includes(gameSpeed)) gameSpeed = 1;

  function setGameSpeed(n) {
    gameSpeed = n;
    lsSet("pixel-siege:speed", String(n));
    const btn = document.getElementById("btn-speed");
    if (btn) btn.textContent = n + "×";
  }
  function cycleGameSpeed() {
    setGameSpeed(gameSpeed === 1 ? 2 : gameSpeed === 2 ? 3 : 1);
  }

  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    if (state === STATE.PLAYING && game) {
      // Hızlandırma: aynı dt ile birden çok updateGame çağrısı yap (N×).
      for (let i = 0; i < gameSpeed && state === STATE.PLAYING; i++) {
        updateGame(dt);
      }
    }
    renderGame();

    requestAnimationFrame(frame);
  }
  // Hız butonunu bağla (varsa)
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn-speed");
    if (btn) {
      btn.textContent = gameSpeed + "×";
      btn.addEventListener("click", cycleGameSpeed);
    }
  });
  // Zaten yüklendiyse de
  {
    const btn = document.getElementById("btn-speed");
    if (btn) {
      btn.textContent = gameSpeed + "×";
      btn.addEventListener("click", cycleGameSpeed);
    }
  }
  requestAnimationFrame((t) => { lastTime = t; frame(t); });


  /* ==========================================================================
   * 16. INIT
   * ----------------------------------------------------------------------- */
  setState(STATE.TITLE);

})();
