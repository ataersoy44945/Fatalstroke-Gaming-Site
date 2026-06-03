/* ============================================================================
 * FATALSTROKE — App
 * ----------------------------------------------------------------------------
 * Görevler:
 *   - Oyun kartlarını GAMES verisinden render et
 *   - Kart tıklamasında detay modalını aç (klavye + erişilebilirlik desteği)
 *   - Scroll-fade-in için IntersectionObserver
 *   - Kartlara hafif 3D tilt (pointer hareketi ile)
 *   - Ironclad Arena rank hesaplayıcı (RANK_CONFIG'i kullanır)
 *
 * Tüm yapılandırılabilir veriler data.js içinde. Burada sadece davranış var.
 * ========================================================================= */

(() => {
  "use strict";

  /* -------------------------------------------------------------------------
   * Yardımcılar
   * ---------------------------------------------------------------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // HTML escape — kullanıcı/data-driven metinleri DOM'a yerleştirmeden önce
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  // Sayıyı verilen aralıkta sınırla
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // İlk harfi tabela glyph'i için al
  const initial = (str) => (str || "?").trim().charAt(0).toUpperCase();


  /* -------------------------------------------------------------------------
   * Yıl (footer)
   * ---------------------------------------------------------------------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();


  /* -------------------------------------------------------------------------
   * TEMA SEÇİCİ — nav'daki palet butonu + dropdown
   * ----------------------------------------------------------------------
   * Aktif tema [data-theme] olarak <html>'a basılır (styles.css'teki
   * :root[data-theme="..."] blokları override eder). localStorage'da kalır.
   * Tema iframe içindeki oyunlara da postMessage ile iletilir, oyunların
   * kendi index.html'lerindeki küçük dinleyici CSS değişkenlerini günceller.
   * ---------------------------------------------------------------------- */
  const THEME_KEY = "fs-theme";
  const themeToggle = $("#theme-toggle");
  const themeMenu   = $("#theme-menu");
  const themeSwatches = $$(".theme-swatch", themeMenu || document);

  // Tema → hex renk paleti (iframe'e bu nesne gönderilir)
  const THEME_COLORS = {
    default: { accent: "#b537f2", accent2: "#22d3ee" },
    ember:   { accent: "#ff7a2b", accent2: "#f5c542" },
    forest:  { accent: "#5aff9c", accent2: "#a8ff36" },
    ice:     { accent: "#5a8cff", accent2: "#22d3ee" },
    rose:    { accent: "#ff3e8a", accent2: "#ff9ec4" },
    toxic:   { accent: "#c8ff00", accent2: "#00ffd5" },
  };

  function getCurrentTheme() {
    try { return localStorage.getItem(THEME_KEY) || "default"; } catch { return "default"; }
  }

  function sendThemeToIframe(iframe, theme) {
    if (!iframe || !iframe.contentWindow) return;
    const t = theme || getCurrentTheme();
    const palette = THEME_COLORS[t] || THEME_COLORS.default;
    try {
      iframe.contentWindow.postMessage({
        type: "fs-theme",
        theme: t,
        accent: palette.accent,
        accent2: palette.accent2,
      }, "*");
    } catch {}
  }

  function applyTheme(name) {
    if (!name || name === "default") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", name);
    }
    themeSwatches.forEach((s) => {
      s.classList.toggle("active", s.dataset.theme === (name || "default"));
    });
    try { localStorage.setItem(THEME_KEY, name || "default"); } catch {}
    // Aktif oyun iframe'ine de bildir
    const frame = document.getElementById("play-overlay-frame");
    if (frame && document.getElementById("play-overlay") && !document.getElementById("play-overlay").hidden) {
      sendThemeToIframe(frame, name);
    }
    // Tema değiştirildi achievement'ini tetiklemek için
    // (ACHIEVEMENTS henüz tanımlanmamış olabilir — ilk applyTheme çağrısı erken yapılıyor)
    try { if (typeof buildAchievements === "function") buildAchievements(); } catch (e) { /* TDZ */ }
  }

  // Iframe yüklendiğinde / "fs-theme-request" mesajı geldiğinde tema + ayar gönder
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "fs-theme-request") {
      const frame = document.getElementById("play-overlay-frame");
      if (frame) {
        sendThemeToIframe(frame);
        sendSettingsToIframe(frame);
      }
    }
  });


  /* -------------------------------------------------------------------------
   * GLOBAL SETTINGS — Master mute, efekt azaltma, hareket azaltma
   * ----------------------------------------------------------------------
   * fs-settings localStorage JSON'unda tutulur. Iframe'lere postMessage
   * ile iletilir; oyunlar kendi tema dinleyicilerine paralel olarak okur.
   * ---------------------------------------------------------------------- */
  const SETTINGS_KEY = "fs-settings";
  const DEFAULT_SETTINGS = { mute: false, reduce: false, reduceMotion: false };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  }

  function applySettingsToHtml(s) {
    document.documentElement.classList.toggle("reduce-motion", !!s.reduceMotion);
  }

  function sendSettingsToIframe(iframe) {
    if (!iframe || !iframe.contentWindow) return;
    const s = loadSettings();
    try {
      iframe.contentWindow.postMessage({ type: "fs-settings", ...s }, "*");
    } catch {}
  }

  const settingsToggle = $("#settings-toggle");
  const settingsModal  = $("#settings-modal");
  const setMute        = $("#set-mute");
  const setReduce      = $("#set-reduce");
  const setReduceMotion= $("#set-reducemotion");
  const setReset       = $("#set-reset");

  function refreshSettingsUI() {
    const s = loadSettings();
    if (setMute)         setMute.checked         = !!s.mute;
    if (setReduce)       setReduce.checked       = !!s.reduce;
    if (setReduceMotion) setReduceMotion.checked = !!s.reduceMotion;
    applySettingsToHtml(s);
  }
  refreshSettingsUI();

  function openSettings()  { if (settingsModal) { settingsModal.hidden = false; document.body.classList.add("modal-open"); } }
  function closeSettings() { if (settingsModal) { settingsModal.hidden = true;  document.body.classList.remove("modal-open"); } }

  if (settingsToggle && settingsModal) {
    settingsToggle.addEventListener("click", openSettings);
    settingsModal.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-settings]")) closeSettings();
    });
  }
  function persistAndPush() {
    const s = {
      mute:         setMute ? setMute.checked : false,
      reduce:       setReduce ? setReduce.checked : false,
      reduceMotion: setReduceMotion ? setReduceMotion.checked : false,
    };
    saveSettings(s);
    applySettingsToHtml(s);
    // Aktif iframe'e gönder
    const frame = document.getElementById("play-overlay-frame");
    if (frame && document.getElementById("play-overlay") && !document.getElementById("play-overlay").hidden) {
      sendSettingsToIframe(frame);
    }
  }
  if (setMute)         setMute.addEventListener("change", persistAndPush);
  if (setReduce)       setReduce.addEventListener("change", persistAndPush);
  if (setReduceMotion) setReduceMotion.addEventListener("change", persistAndPush);
  if (setReset)        setReset.addEventListener("click", () => {
    saveSettings({ ...DEFAULT_SETTINGS });
    refreshSettingsUI();
    const frame = document.getElementById("play-overlay-frame");
    if (frame && document.getElementById("play-overlay") && !document.getElementById("play-overlay").hidden) {
      sendSettingsToIframe(frame);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsModal && !settingsModal.hidden) closeSettings();
  });

  // İlk yüklemede kayıtlı temayı uygula
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) applyTheme(saved);
    else applyTheme("default");
  } catch { applyTheme("default"); }

  if (themeToggle && themeMenu) {
    themeToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !themeMenu.hidden;
      themeMenu.hidden = open;
      themeToggle.setAttribute("aria-expanded", String(!open));
    });
    themeMenu.addEventListener("click", (e) => {
      const sw = e.target.closest(".theme-swatch");
      if (!sw) return;
      applyTheme(sw.dataset.theme);
    });
    document.addEventListener("click", (e) => {
      if (themeMenu.hidden) return;
      if (themeMenu.contains(e.target) || e.target === themeToggle) return;
      themeMenu.hidden = true;
      themeToggle.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !themeMenu.hidden) {
        themeMenu.hidden = true;
        themeToggle.setAttribute("aria-expanded", "false");
        themeToggle.focus();
      }
    });
  }


  /* -------------------------------------------------------------------------
   * OYUN KARTLARINI RENDER ET
   * ----------------------------------------------------------------------
   * Asimetrik düzen: ilk oyun "featured", ikincisi "wide", kalanlar normal.
   * ---------------------------------------------------------------------- */
  const gridEl = $("#games-grid");

  // Asimetrik düzen tamamen CSS tarafında (nth-child) — burada sadece
  // tek tip kart üretiyoruz, sıralama görsel kademeyi belirler.
  function buildGameCardMarkup(game) {
    const tags = (game.tags || [])
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    return `
      <article class="game-card"
               data-game-id="${escapeHtml(game.id)}"
               tabindex="0"
               role="button"
               aria-label="${escapeHtml(game.title)} — detayları aç">
        <div class="game-card-cover cover--${escapeHtml(game.cover || "purple")}">
          <span class="cover-glyph" aria-hidden="true">${initial(game.title)}</span>
        </div>
        <div class="game-card-body">
          <span class="game-card-genre">${escapeHtml(game.genre || "")}</span>
          <h3 class="game-card-title">${escapeHtml(game.title)}</h3>
          <p class="game-card-desc">${escapeHtml(game.short || "")}</p>
          <div class="game-card-tags">${tags}</div>
          <span class="game-card-cta">Detay</span>
        </div>
      </article>
    `;
  }

  function renderGames() {
    if (!gridEl || typeof GAMES === "undefined") return;
    gridEl.innerHTML = GAMES.map(buildGameCardMarkup).join("");
  }

  renderGames();


  /* -------------------------------------------------------------------------
   * KART 3D TILT (pointer hover)
   * ----------------------------------------------------------------------
   * Pointer'ı kartın hangi köşesine yakınsa o köşe yukarı kalkar.
   * Touch cihazlarda uygulanmaz (hover yok).
   * ---------------------------------------------------------------------- */
  const supportsHover = window.matchMedia("(hover: hover)").matches;
  const reduceMotion  = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (supportsHover && !reduceMotion && gridEl) {
    const TILT_MAX = 6; // derece — abartısız tut

    gridEl.addEventListener("pointermove", (e) => {
      const card = e.target.closest(".game-card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top)  / rect.height;
      const rx = (0.5 - py) * TILT_MAX * 2;
      const ry = (px - 0.5) * TILT_MAX * 2;
      card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`;
    });

    gridEl.addEventListener("pointerleave", (e) => {
      const card = e.target.closest(".game-card");
      if (card) card.style.transform = "";
    }, true);

    // Hover bitişinde de sıfırla (mouseout yakalanmadığı durumlar için)
    $$(".game-card").forEach((c) => {
      c.addEventListener("pointerleave", () => { c.style.transform = ""; });
    });
  }


  /* -------------------------------------------------------------------------
   * STATS HUB — her oyundan kişisel rekoru çek + kart oluştur
   * ----------------------------------------------------------------------
   * Her oyun localStorage'da kendi anahtarlarıyla rekorları tutar.
   * Burada o anahtarları okuyup tek bir görünüm üretiriyoruz.
   * ---------------------------------------------------------------------- */
  function readNum(key, fallback) {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : (fallback ?? 0);
    } catch { return fallback ?? 0; }
  }
  function readStr(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  // Echo Protocol — tamamlanan bölüm sayısı (best:0..N hangileri varsa)
  function echoLevelsCleared() {
    let n = 0;
    try {
      for (let i = 0; i < 30; i++) {
        if (localStorage.getItem(`echo-protocol:best:${i}`) != null) n++;
      }
    } catch {}
    return n;
  }
  // Neon Drift — tüm araç high score'larının maksimumu
  function neonDriftBest() {
    let best = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("neon-drift:high:")) {
          const v = Number(localStorage.getItem(k));
          if (v > best) best = v;
        }
      }
    } catch {}
    return best;
  }
  function ironTier(rating) {
    const tiers = (typeof RANK_CONFIG !== "undefined" && RANK_CONFIG.TIERS) ? RANK_CONFIG.TIERS : [];
    let cur = tiers[0];
    for (const t of tiers) if (rating >= t.minRating) cur = t;
    return cur || { name: "Demir", color: "#8a8a99" };
  }

  // Her bir oyunun stat tanımı
  function buildStatCards() {
    const grid = $("#stats-grid");
    if (!grid || typeof GAMES === "undefined") return;
    const cards = [];

    // Pixel Siege
    const psWave = readNum("pixel-siege:bestWave");
    const psScore = readNum("pixel-siege:bestScore");
    cards.push({
      gameId: "pixel-siege", name: "Pixel Siege", genre: "Tower Defense",
      glow: "#22d3ee",
      rows: psWave > 0
        ? [["En İyi Dalga", psWave], ["Skor", psScore.toLocaleString("tr-TR"), "soft"]]
        : null,
    });

    // Voidbreaker
    const vbDepth = readNum("voidbreaker:bestDepth");
    const vbCoins = readNum("voidbreaker:coins");
    cards.push({
      gameId: "voidbreaker", name: "Voidbreaker", genre: "Roguelike Nişancı",
      glow: "#b537f2",
      rows: (vbDepth > 0 || vbCoins > 0)
        ? [["En Derin", vbDepth || 0], ["Coin Bakiye", vbCoins.toLocaleString("tr-TR"), "soft"]]
        : null,
    });

    // Echo Protocol
    const epCleared = echoLevelsCleared();
    cards.push({
      gameId: "echo-protocol", name: "Echo Protocol", genre: "Puzzle / Platform",
      glow: "#5aff9c",
      rows: epCleared > 0
        ? [["Çözülen Bölüm", `${epCleared} / 21`]]
        : null,
    });

    // Ironclad Arena
    const iaRating = readNum("ironclad:rating");
    const iaTier = iaRating > 0 ? ironTier(iaRating) : null;
    cards.push({
      gameId: "ironclad-arena", name: "Ironclad Arena", genre: "Dövüş / vs AI",
      glow: iaTier ? iaTier.color : "#ff3e8a",
      rows: iaTier
        ? [["Rank", iaTier.name], ["Rating", iaRating, "soft"]]
        : null,
    });

    // Neon Drift
    const ndBest = neonDriftBest();
    cards.push({
      gameId: "neon-drift", name: "Neon Drift", genre: "Endless Arcade",
      glow: "#ff3e8a",
      rows: ndBest > 0
        ? [["En İyi Skor", ndBest.toLocaleString("tr-TR")]]
        : null,
    });

    grid.innerHTML = cards.map((c) => {
      const game = GAMES.find((g) => g.id === c.gameId);
      const isPlayable = game && game.playable;
      const playBtn = isPlayable
        ? `<button class="stat-card-cta" data-stats-play="${escapeHtml(c.gameId)}">▶ Oyna</button>`
        : `<span class="stat-card-cta" style="opacity:0.45;cursor:default">Yakında</span>`;
      const rowsHtml = c.rows
        ? c.rows.map(([label, val, soft]) =>
            `<div class="stat-row">
              <span class="stat-row-label">${escapeHtml(label)}</span>
              <span class="stat-row-value ${soft ? "stat-row-value--soft" : ""}">${escapeHtml(String(val))}</span>
            </div>`).join("")
        : `<div class="stat-row-empty">Henüz oynamadın — bir oyun aç ve dene.</div>`;
      return `
        <div class="stat-card" style="--card-glow:${c.glow}">
          <div class="stat-card-head">
            <span class="stat-card-name">${escapeHtml(c.name)}</span>
            <span class="stat-card-genre">${escapeHtml(c.genre)}</span>
          </div>
          <div class="stat-rows">${rowsHtml}</div>
          ${playBtn}
        </div>
      `;
    }).join("");

    // CTA tıkları
    grid.querySelectorAll("[data-stats-play]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.statsPlay;
        const game = GAMES.find((g) => g.id === id);
        if (game && game.playable && game.playUrl) {
          openPlayOverlay(game.playUrl, game.title);
        }
      });
    });
  }
  // İlk render
  buildStatCards();


  /* -------------------------------------------------------------------------
   * ACHIEVEMENTS — cross-game madalyalar
   * ----------------------------------------------------------------------
   * Her madalyanın bir check(stats) fonksiyonu var. localStorage'daki oyun
   * istatistikleri okunup koşul kontrol edilir. Açılan madalyalar
   * "fs-achievements" altında kalıcı saklanır.
   * Yeni madalya eklemek: ACHIEVEMENTS dizisine yeni nesne ekle.
   * ---------------------------------------------------------------------- */
  const ACHIEVEMENTS = [
    // Pixel Siege
    { id: "ps-first",  icon: "★",  name: "İlk Savunma",     desc: "Pixel Siege: dalga 1 tamamla",
      color: "#22d3ee", check: () => readNum("pixel-siege:bestWave") >= 1 },
    { id: "ps-veteran",icon: "✦",  name: "Veteran",         desc: "Pixel Siege: dalga 10",
      color: "#22d3ee", check: () => readNum("pixel-siege:bestWave") >= 10 },
    { id: "ps-master", icon: "♛",  name: "Kule Lordu",      desc: "Pixel Siege: dalga 20",
      color: "#f5c542", check: () => readNum("pixel-siege:bestWave") >= 20 },
    // Voidbreaker
    { id: "vb-first",  icon: "▼",  name: "Aşağı İnen",      desc: "Voidbreaker: derinlik 3",
      color: "#b537f2", check: () => readNum("voidbreaker:bestDepth") >= 3 },
    { id: "vb-deep",   icon: "⛯",  name: "Derinlerde",      desc: "Voidbreaker: derinlik 10",
      color: "#b537f2", check: () => readNum("voidbreaker:bestDepth") >= 10 },
    { id: "vb-void",   icon: "✸",  name: "Void Avcısı",     desc: "Voidbreaker: derinlik 20",
      color: "#f5c542", check: () => readNum("voidbreaker:bestDepth") >= 20 },
    { id: "vb-rich",   icon: "◆",  name: "Zengin",          desc: "Voidbreaker: 100 coin biriktir",
      color: "#f5c542", check: () => readNum("voidbreaker:coins") >= 100 },
    // Echo Protocol
    { id: "ep-first",  icon: "↺",  name: "İlk Yankı",       desc: "Echo Protocol: 1 bölüm çöz",
      color: "#22d3ee", check: () => echoLevelsCleared() >= 1 },
    { id: "ep-half",   icon: "⌭",  name: "Yarı Yolda",      desc: "Echo Protocol: 10 bölüm çöz",
      color: "#22d3ee", check: () => echoLevelsCleared() >= 10 },
    { id: "ep-all",    icon: "✓",  name: "Protokol Çözüldü",desc: "Echo Protocol: tüm bölümler",
      color: "#f5c542", check: () => echoLevelsCleared() >= 22 },
    // Ironclad Arena
    { id: "ia-bronze", icon: "⚔",  name: "Bronz",           desc: "Ironclad: Bronz rütbeye çık",
      color: "#c97a3a", check: () => readNum("ironclad:rating") >= 800 },
    { id: "ia-silver", icon: "⚔",  name: "Gümüş",           desc: "Ironclad: Gümüş rütbeye çık",
      color: "#c9d1dc", check: () => readNum("ironclad:rating") >= 1600 },
    { id: "ia-gold",   icon: "⚔",  name: "Altın",           desc: "Ironclad: Altın rütbeye çık",
      color: "#f5c542", check: () => readNum("ironclad:rating") >= 2400 },
    { id: "ia-legend", icon: "♛",  name: "Efsane",          desc: "Ironclad: Efsane rütbeye çık",
      color: "#ff3e8a", check: () => readNum("ironclad:rating") >= 5800 },
    // Neon Drift
    { id: "nd-first",  icon: "▶",  name: "Asfalta",         desc: "Neon Drift: 5.000 skor",
      color: "#ff3e8a", check: () => neonDriftBest() >= 5000 },
    { id: "nd-pro",    icon: "≫",  name: "Pro Sürücü",      desc: "Neon Drift: 25.000 skor",
      color: "#ff3e8a", check: () => neonDriftBest() >= 25000 },
    // Cross-game
    { id: "xg-themes", icon: "◐",  name: "Renk Cüceleri",   desc: "Bir tema değiştir",
      color: "#5aff9c", check: () => {
        try { return (localStorage.getItem("fs-theme") || "default") !== "default"; }
        catch { return false; }
      }},
    { id: "xg-all",    icon: "✪",  name: "Tüm Cephe",       desc: "Tüm oyunlarda en az 1 rekor",
      color: "#5aff9c", check: () => readNum("pixel-siege:bestWave") >= 1 &&
                                    readNum("voidbreaker:bestDepth") >= 1 &&
                                    echoLevelsCleared() >= 1 &&
                                    readNum("ironclad:rating") > 0 &&
                                    neonDriftBest() > 0 },
  ];

  const ACH_KEY = "fs-achievements";
  function loadAchievements() {
    try { return JSON.parse(localStorage.getItem(ACH_KEY)) || {}; } catch { return {}; }
  }
  function saveAchievements(obj) {
    try { localStorage.setItem(ACH_KEY, JSON.stringify(obj)); } catch {}
  }

  function buildAchievements() {
    const grid = $("#ach-grid");
    if (!grid) return;
    const unlocked = loadAchievements();
    let changed = false;
    // Açılan yeni madalyalar
    for (const a of ACHIEVEMENTS) {
      if (!unlocked[a.id] && a.check()) {
        unlocked[a.id] = Date.now();
        changed = true;
      }
    }
    if (changed) saveAchievements(unlocked);

    grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const isOpen = !!unlocked[a.id];
      return `
        <div class="ach-card ${isOpen ? "unlocked" : ""}" style="--ach-color:${a.color}">
          <div class="ach-icon">${a.icon}</div>
          <div class="ach-info">
            <div class="ach-name">${escapeHtml(a.name)}</div>
            <div class="ach-desc">${escapeHtml(a.desc)}</div>
          </div>
        </div>
      `;
    }).join("");

    const total = ACHIEVEMENTS.length;
    const opened = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
    const prog = $("#ach-progress");
    if (prog) prog.textContent = `${opened} / ${total}`;
  }
  buildAchievements();

  /* -------------------------------------------------------------------------
   * DAILY CHALLENGE — günün görevi
   * ----------------------------------------------------------------------
   * Her gün listeden tarih-tabanlı bir görev seçilir. Görev tamamlandığında
   * "fs-daily" altında saklanır; ardışık günleri sayan streak takip edilir.
   * Görev "mevcut stat hedeften büyük mü?" mantığıyla kontrol edilir; daha
   * önce hedefe ulaştıysan bugün için "tamam" sayılır.
   * ---------------------------------------------------------------------- */
  const CHALLENGES = [
    { id: "ps5",   gameId: "pixel-siege", name: "Mini Savunma",      desc: "Pixel Siege'de en az 5. dalgayı temizle.",
      target: 5,  read: () => readNum("pixel-siege:bestWave") },
    { id: "ps12",  gameId: "pixel-siege", name: "Geç Savunma",       desc: "Pixel Siege'de en az 12. dalgaya ulaş.",
      target: 12, read: () => readNum("pixel-siege:bestWave") },
    { id: "vb6",   gameId: "voidbreaker", name: "Aşağı Dal",         desc: "Voidbreaker'da derinlik 6'ya ulaş.",
      target: 6,  read: () => readNum("voidbreaker:bestDepth") },
    { id: "vb14",  gameId: "voidbreaker", name: "Derin Dalış",       desc: "Voidbreaker'da derinlik 14'e ulaş.",
      target: 14, read: () => readNum("voidbreaker:bestDepth") },
    { id: "ep5",   gameId: "echo-protocol", name: "Yankı Sezisi",    desc: "Echo Protocol'de 5 bölüm çöz.",
      target: 5,  read: echoLevelsCleared },
    { id: "ep15",  gameId: "echo-protocol", name: "Yankı Ustalığı",  desc: "Echo Protocol'de 15 bölüm çöz.",
      target: 15, read: echoLevelsCleared },
    { id: "ia800", gameId: "ironclad-arena", name: "Bronz Yolu",      desc: "Ironclad'de Bronz rütbeye çık.",
      target: 800, read: () => readNum("ironclad:rating") },
    { id: "ia2400",gameId: "ironclad-arena", name: "Altın Yolu",      desc: "Ironclad'de Altın rütbeye çık.",
      target: 2400, read: () => readNum("ironclad:rating") },
    { id: "nd5k",  gameId: "neon-drift",  name: "Asfalt Sınavı",     desc: "Neon Drift'te 5.000 skor yap.",
      target: 5000, read: neonDriftBest },
    { id: "nd20k", gameId: "neon-drift",  name: "Sürücü Profesörü",  desc: "Neon Drift'te 20.000 skor yap.",
      target: 20000, read: neonDriftBest },
  ];

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function dayOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d - start + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000);
    return Math.floor(diff / 86400000);
  }
  function pickTodayChallenge() {
    const idx = dayOfYear(new Date()) % CHALLENGES.length;
    return CHALLENGES[idx];
  }

  const DAILY_KEY = "fs-daily";
  function loadDaily() {
    try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || { streak: 0, lastDate: null, completed: {} }; }
    catch { return { streak: 0, lastDate: null, completed: {} }; }
  }
  function saveDaily(d) {
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch {}
  }

  function buildDaily() {
    const today = todayKey();
    const ch = pickTodayChallenge();
    const cur = ch.read();
    const isComplete = cur >= ch.target;
    const pct = Math.min(100, Math.round((cur / ch.target) * 100));

    const card = $("#daily-card");
    if (!card) return;
    card.classList.toggle("complete", isComplete);

    $("#daily-date").textContent = today;
    $("#daily-name").textContent = ch.name;
    $("#daily-desc").textContent = ch.desc;
    $("#daily-fill").style.width = pct + "%";
    $("#daily-progress-text").textContent = `${Math.min(cur, ch.target)} / ${ch.target}`;
    $("#daily-status").textContent = isComplete ? "✓ TAMAM" : "";

    // Streak güncelleme
    const data = loadDaily();
    if (isComplete && data.completed[today] !== true) {
      data.completed[today] = true;
      // Streak: dünün tamamlandıysa +1, yoksa 1
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yKey = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`;
      if (data.completed[yKey]) data.streak = (data.streak || 0) + 1;
      else                       data.streak = 1;
      data.lastDate = today;
      saveDaily(data);
    }

    // Görev butonu
    const btn = $("#daily-play");
    if (btn) {
      btn.onclick = () => {
        const game = GAMES.find((g) => g.id === ch.gameId);
        if (game && game.playable && game.playUrl) openPlayOverlay(game.playUrl, game.title);
      };
    }
  }
  buildDaily();

  // Stats + achievements + daily'yi oyun kapatınca yenile
  window.addEventListener("focus", () => { buildStatCards(); buildAchievements(); buildDaily(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { buildStatCards(); buildAchievements(); buildDaily(); }
  });


  /* -------------------------------------------------------------------------
   * GAME DETAIL MODAL
   * ---------------------------------------------------------------------- */
  const modal       = $("#game-modal");
  const modalBody   = $("#modal-body");
  const modalPanel  = $(".modal-panel", modal);
  let   lastFocused = null;

  function openModal(game) {
    if (!modal || !modalBody) return;

    const tags = (game.tags || [])
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    const features = (game.features || [])
      .map((f) => `<li>${escapeHtml(f)}</li>`)
      .join("");

    const shotCount = Math.max(0, Number(game.screenshots) || 0);
    const shots = Array.from({ length: shotCount }, (_, i) =>
      `<div class="modal-shot" aria-hidden="true">SHOT 0${i + 1}</div>`
    ).join("");

    // Oynanabilir oyunlar için "Oyna" CTA blogu
    const playBlock = game.playable && game.playUrl ? `
      <div class="modal-play">
        <button type="button" class="btn-play"
                data-play-url="${escapeHtml(game.playUrl)}"
                data-play-title="${escapeHtml(game.title)}">
          <span aria-hidden="true">▶</span> Oyna
        </button>
        <span class="modal-play-hint">Tarayıcıda oynanır · Mobil &amp; klavye uyumlu</span>
      </div>
    ` : "";

    modalBody.innerHTML = `
      <div class="modal-cover cover--${escapeHtml(game.cover || "purple")}">
        <span class="modal-cover-glyph" aria-hidden="true">${initial(game.title)}</span>
      </div>
      <div class="modal-content">
        <span class="modal-eyebrow">${escapeHtml(game.genre || "")}</span>
        <h2 id="modal-title" class="modal-title">${escapeHtml(game.title)}</h2>
        <div class="modal-tags">${tags}</div>
        <p class="modal-description">${escapeHtml(game.long || game.short || "")}</p>

        ${playBlock}

        ${features ? `
          <div>
            <h3 class="modal-section-title">Öne Çıkan Özellikler</h3>
            <ul class="modal-features">${features}</ul>
          </div>` : ""}

        ${shots ? `
          <div>
            <h3 class="modal-section-title">Ekran Görüntüleri</h3>
            <div class="modal-shots">${shots}</div>
          </div>` : ""}
      </div>
    `;

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    // Odağı panele al ki Escape yakalanabilsin ve focus trap çalışsın
    requestAnimationFrame(() => modalPanel && modalPanel.focus());
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  // Kart tıklaması / klavyesi — event delegation
  if (gridEl) {
    gridEl.addEventListener("click", (e) => {
      const card = e.target.closest(".game-card");
      if (!card) return;
      const id = card.dataset.gameId;
      const game = GAMES.find((g) => g.id === id);
      if (game) openModal(game);
    });

    gridEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".game-card");
      if (!card) return;
      e.preventDefault();
      const id = card.dataset.gameId;
      const game = GAMES.find((g) => g.id === id);
      if (game) openModal(game);
    });
  }

  // Modal kapama (backdrop, kapatma butonu, Escape)
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-modal]")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });
  }

  // "Oyna" butonu — modal içinden tetiklenir
  if (modalBody) {
    modalBody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-play");
      if (!btn) return;
      const url   = btn.dataset.playUrl;
      const title = btn.dataset.playTitle;
      if (url) openPlayOverlay(url, title);
    });
  }


  /* -------------------------------------------------------------------------
   * PLAY OVERLAY (iframe)
   * ----------------------------------------------------------------------
   * Oynanabilir oyunları siteden çıkmadan tam ekran iframe içinde açar.
   * Esc veya X ile kapanır; "Yeni sekme" linki ayrı pencerede açar.
   * ---------------------------------------------------------------------- */
  const playOverlay      = $("#play-overlay");
  const playFrame        = $("#play-overlay-frame");
  const playTitleEl      = $("#play-overlay-title");
  const playNewtab       = $("#play-overlay-newtab");
  const playCloseBtn     = $("#play-overlay-close");
  let   playReturnFocus  = null;

  function openPlayOverlay(url, title) {
    if (!playOverlay || !playFrame) return;
    // Önce modal'ı kapat (üst üste binmesin) — focus return'ü kendimiz yönetiyoruz
    if (modal && !modal.hidden) {
      playReturnFocus = lastFocused;       // kart odağına geri dön
      modal.hidden = true;
      document.body.classList.remove("modal-open");
    } else {
      playReturnFocus = document.activeElement;
    }

    playTitleEl.textContent = title || "";
    playNewtab.href = url;
    playFrame.src = url;                   // load tetikler
    playOverlay.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => playCloseBtn.focus());

    // Iframe yüklendiğinde mevcut temayı gönder (oyun küçük listener'ı CSS vars'a basacak)
    playFrame.addEventListener("load", () => sendThemeToIframe(playFrame), { once: true });
  }

  function closePlayOverlay() {
    if (!playOverlay || playOverlay.hidden) return;
    playFrame.src = "about:blank";         // oyunu durdur (ses dahil)
    playOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    if (playReturnFocus && typeof playReturnFocus.focus === "function") {
      playReturnFocus.focus();
    }
    playReturnFocus = null;
    // Oyundan dönünce stats kartlarını + başarımları + günlük görevi yenile
    if (typeof buildStatCards === "function") buildStatCards();
    if (typeof buildAchievements === "function") buildAchievements();
    if (typeof buildDaily === "function") buildDaily();
  }

  if (playCloseBtn) playCloseBtn.addEventListener("click", closePlayOverlay);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playOverlay && !playOverlay.hidden) {
      closePlayOverlay();
    }
  });


  /* -------------------------------------------------------------------------
   * SCROLL FADE-IN (.reveal)
   * ----------------------------------------------------------------------
   * Güvenlik: IntersectionObserver tetiklenmezse içerik gizli kalmasın diye
   * önce hepsine .is-visible ekliyoruz; sonra observer ile zarif fade-in
   * için yine de bekleyenleri takip ediyoruz.
   * ---------------------------------------------------------------------- */
  const revealEls = $$(".reveal");
  // Anında görünür yap — hiçbir koşulda gizli kalmasın
  revealEls.forEach((el) => el.classList.add("is-visible"));
  // İsteğe bağlı: yine de IntersectionObserver çalışsın (uyumlu tarayıcılarda)
  if (revealEls.length && "IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  }


  /* =========================================================================
   * RANK HESAPLAYICI — Ironclad Arena
   * -------------------------------------------------------------------------
   * Hesap mantığı:
   *   rating = mmr + (wins * winWeight) - (losses * lossWeight)
   *          + (streak * streakBonus)
   *   rating < minRating ise minRating'e sabitlenir.
   *
   * Sonra TIERS listesinde rating'in karşılığı bulunur.
   * ====================================================================== */

  function calcRating({ wins, losses, mmr, streak }) {
    const w = RANK_CONFIG.WEIGHTS;
    const raw = mmr
              + wins   * w.winWeight
              - losses * w.lossWeight
              + streak * w.streakBonus;
    return Math.max(w.minRating, Math.round(raw));
  }

  // Verilen rating için: { current, next, progressPct, ratingToNext }
  function resolveTier(rating) {
    const tiers = RANK_CONFIG.TIERS;
    let current = tiers[0];
    let next    = null;

    for (let i = 0; i < tiers.length; i++) {
      if (rating >= tiers[i].minRating) {
        current = tiers[i];
        next    = tiers[i + 1] || null;
      }
    }

    let progressPct  = 100;
    let ratingToNext = 0;

    if (next) {
      const span = next.minRating - current.minRating;
      const gained = rating - current.minRating;
      progressPct  = clamp(Math.round((gained / span) * 100), 0, 100);
      ratingToNext = Math.max(0, next.minRating - rating);
    }

    return { current, next, progressPct, ratingToNext };
  }

  // Kazanma oranı %
  function calcWinRate(wins, losses) {
    const total = wins + losses;
    if (total <= 0) return 0;
    return Math.round((wins / total) * 100);
  }

  // Sayı girdisini güvenli oku
  function readNumber(input) {
    const raw = Number(input.value);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    // Çok büyük absürd sayıları sınırla (UI'yi korumak için)
    return Math.min(raw, 1e9);
  }

  /* -------------------------- Sonuç paneli render --------------------------- */
  const resultEl = $("#rank-result");

  function renderEmptyResult() {
    if (!resultEl) return;
    resultEl.dataset.state = "empty";
    resultEl.style.removeProperty("--tier-color");
    resultEl.style.removeProperty("--tier-glow");
    resultEl.style.removeProperty("--tier-soft");
    resultEl.innerHTML = `
      <div class="rank-empty">
        <div class="rank-empty-icon">?</div>
        <div class="rank-empty-title">Hesap için verilerini gir</div>
        <p>Maç istatistiklerini doldurup <strong>Rütbeyi Hesapla</strong>'ya bas.</p>
      </div>
    `;
  }

  function renderResult({ rating, winRate, totalMatches, tierInfo }) {
    if (!resultEl) return;
    const { current, next, progressPct, ratingToNext } = tierInfo;

    // CSS değişkenleri ile tier rengini paneli geneline aç
    resultEl.style.setProperty("--tier-color", current.color);
    resultEl.style.setProperty("--tier-glow",  current.glow);
    resultEl.style.setProperty("--tier-soft",  current.color + "22"); // ~13% opaklık
    resultEl.dataset.state = "filled";

    const progressBlock = next
      ? `
        <div class="rank-progress" aria-label="Sonraki rütbeye ilerleme">
          <div class="rank-progress-info">
            <span>Sonraki: <strong>${escapeHtml(next.name)}</strong></span>
            <span><strong>${ratingToNext}</strong> rating kaldı</span>
          </div>
          <div class="rank-progress-bar" role="progressbar"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}">
            <div class="rank-progress-fill" style="width: ${progressPct}%"></div>
          </div>
        </div>`
      : `
        <div class="rank-progress">
          <div class="rank-progress-info">
            <span><strong>En yüksek rütbeye ulaştın</strong></span>
            <span>MAX</span>
          </div>
          <div class="rank-progress-bar">
            <div class="rank-progress-fill" style="width: 100%"></div>
          </div>
        </div>`;

    resultEl.innerHTML = `
      <div class="rank-badge" style="--tier: ${current.color}">
        <div class="rank-badge-ring"></div>
        <div class="rank-badge-core">${escapeHtml(current.name)}</div>
      </div>
      <div class="rank-name">${escapeHtml(current.name)}</div>
      <div class="rank-rating">Rating · <strong>${rating}</strong></div>

      <div class="rank-stats">
        <div class="rank-stat">
          <span class="rank-stat-label">Kazanma Oranı</span>
          <span class="rank-stat-value">%${winRate}</span>
        </div>
        <div class="rank-stat">
          <span class="rank-stat-label">Toplam Maç</span>
          <span class="rank-stat-value">${totalMatches}</span>
        </div>
      </div>

      ${progressBlock}
    `;
  }

  /* -------------------------- Form bağla --------------------------- */
  const form = $("#rank-form");

  if (form) {
    renderEmptyResult();

    const fWins   = $("#f-wins",   form);
    const fLosses = $("#f-losses", form);
    const fMmr    = $("#f-mmr",    form);
    const fStreak = $("#f-streak", form);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const wins   = readNumber(fWins);
      const losses = readNumber(fLosses);
      const mmr    = readNumber(fMmr);
      const streak = readNumber(fStreak);

      // Mantık güvenliği: streak, kazanılan maç sayısından büyük olamaz
      const safeStreak = Math.min(streak, wins);

      const rating       = calcRating({ wins, losses, mmr, streak: safeStreak });
      const winRate      = calcWinRate(wins, losses);
      const totalMatches = wins + losses;
      const tierInfo     = resolveTier(rating);

      renderResult({ rating, winRate, totalMatches, tierInfo });

      // Sonuç paneline yumuşak kaydır (mobilde yardımcı)
      if (window.innerWidth < 880) {
        resultEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    form.addEventListener("reset", () => {
      // Reset sonrası DOM güncellensin
      setTimeout(renderEmptyResult, 0);
    });
  }

})();
