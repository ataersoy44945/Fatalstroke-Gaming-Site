/* ============================================================================
 * ECHO PROTOCOL — Neon Puzzle-Platform · "Geri sar, klonlarınla çöz"
 * ----------------------------------------------------------------------------
 * Düzenleme noktaları (hepsi dosyanın üstünde):
 *   CONFIG   → fizik (gravity, hız, zıplama), döngü süresi, maks klon
 *   LEVELS   → bölüm haritaları + buton/kapı tanımları
 *
 * Mekanik özeti:
 *   Oyuncu hareket eder. Her sabit-zamanlı frame'de pozisyonu kaydedilir.
 *   "R" tuşuyla geri sarar → kayıt bir "klon" olarak listeye eklenir, dünya
 *   sıfırlanır (oyuncu spawn'a, butonlar bırakılır, mevcut klonlar frame 0'a).
 *   Klonlar yeni döngüde aynı hareketleri tekrar oynar; bir klonun durduğu
 *   tile'daki butonu basılı tutması sayesinde kapılar açılır.
 * ========================================================================= */

(() => {
  "use strict";

  /* ==========================================================================
   * 1. CONFIG
   * ----------------------------------------------------------------------- */
  const CONFIG = {
    // Tile boyutu ve grid (LH = HUD üst + grid yüksekliği)
    tile:           40,
    cols:           20,    // grid genişliği (tile)
    rows:           11,    // grid yüksekliği (tile)
    hudHeight:      60,    // canvas içinde üst HUD payı (px)

    // Fizik
    gravity:        1900,  // px/s^2
    walkSpeed:      230,   // px/s
    jumpVel:        720,   // px/s — ~3.4 tile yükseliş (jump-through platforma rahat ulaşılsın)
    maxFallSpeed:   1100,
    coyoteTime:     0.10,  // s — yere düşmüş gibi sayılma toleransı
    jumpBuffer:     0.12,  // s — zıpla tuşunu yere inmeden basabilme

    // Döngü
    loopMaxSeconds: 30,    // bir döngünün maks süresi (sonunda otomatik geri sar)
    maxClones:      8,     // bölüm başına maks klon (üzerinde geri sar yok)
    rewindHoldRestart: 1.0, // R'yi bu kadar saniye basılı tutarsan bölüm sıfırlanır

    // Render
    showHint:       4.0,   // ilk girişte bölüm ipucunu kaç sn göster
  };


  /* ==========================================================================
   * 2. LEVELS — Bölüm tanımları
   * -----------------------------------------------------------------------
   *   tiles  → 'rows' adet 'cols' karakterlik string dizisi
   *            '#' = duvar, ' ' = boş, 'S' = spawn, 'G' = hedef portal
   *   buttons → [{ col, row, id }, ...]  aynı id'li butonlar bir kapıya bağlı
   *   doors   → [{ col, row, id }, ...]  aynı id'li tüm butonlar basılıyken açık
   *   hint    → ilk girişte ekranda gösterilen kısa öğretici metin
   *
   * Yeni bölüm eklemek için yeni bir nesneyi LEVELS'a push et — başka yeri
   * değiştirmen gerekmez.
   * ----------------------------------------------------------------------- */
  const LEVELS = [
    /* ---------- 1. AWAKEN — sadece yürü ---------- */
    {
      name: "Awaken",
      hint: "← → ile yürü, ↑ / Boşluk / W ile zıpla.\nYeşil portala ulaş.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#S               G #",
        "####################",
      ],
      buttons: [],
      doors:   [],
    },

    /* ---------- 2. ECHO I — tek buton, tek klon ----------
     * Kapının üstünde 3-tile yüksek duvar sütunu var → üstünden zıplanamaz.
     * Oyuncu butona basar, R ile sarar, klon butonu tutarken kapıdan geçer. */
    {
      name: "Echo I",
      hint: "Buton üstündeyken kapı açılır.\nButona git, R ile sar — yankın butonu tutarken sen geç.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#             #    #",
        "#             #    #",
        "#             #    #",
        "#S               G #",
        "####################",
      ],
      buttons: [{ col: 7,  row: 9, id: 1 }],
      doors:   [{ col: 14, row: 9, id: 1 }],
    },

    /* ---------- 3. REACH — yüksek buton + zıplama ----------
     * Buton row 4'te. row 7 jump-through basamak, row 5 jump-through platform.
     * '=' = alttan geçilen platform (Mario tarzı), '#' = tam katı duvar. */
    {
      name: "Reach",
      hint: "Buton yüksekte. Zıplamaların da yankıya kaydedilir.\nBasamaklara çık, butona bas, R ile sar.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#       ====       #",
        "#             #    #",
        "#   ===       #    #",
        "#             #    #",
        "#S               G #",
        "####################",
      ],
      buttons: [{ col: 9,  row: 4, id: 1 }],
      doors:   [{ col: 14, row: 9, id: 1 }],
    },

    /* ---------- 4. ECHO II — iki buton, iki klon ----------
     * Kapı col 15, üstünde 3-tile sütun. 2 klon gerek. */
    {
      name: "Echo II",
      hint: "İki butonun ikisi de aynı anda basılı olmalı.\nİki klon hazırla, sonra kapıdan geç.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#              #   #",
        "#              #   #",
        "#              #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 4,  row: 9, id: 1 },
        { col: 12, row: 9, id: 1 },
      ],
      doors:   [{ col: 15, row: 9, id: 1 }],
    },

    /* ---------- 5. CASCADE — üç buton, üç klon (doruk) ---------- */
    {
      name: "Cascade",
      hint: "Üç buton, hepsi aynı anda basılı olmalı.\nÜç klon diz, son hamlede kapıdan geç.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#       ====       #",
        "#               #  #",
        "#   ===         #  #",
        "#               #  #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 3,  row: 9, id: 1 },
        { col: 9,  row: 4, id: 1 },
        { col: 14, row: 9, id: 1 },
      ],
      doors:   [{ col: 16, row: 9, id: 1 }],
    },

    /* ---------- 6. LOCKED — iki kapı, her birine farklı buton ----------
     * İlk kapıyı geç, sonra ikinci butona ulaş, sonra ikinci kapıyı geç. */
    {
      name: "Locked",
      hint: "İki ayrı kapı, farklı butonlara bağlı.\nÖnce ilk butonu klona tutturup geç, sonra ikinciyi bul.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#      #       #   #",
        "#      #       #   #",
        "#      #       #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 3,  row: 9, id: 1 },
        { col: 11, row: 9, id: 2 },
      ],
      doors: [
        { col: 7,  row: 9, id: 1 },
        { col: 15, row: 9, id: 2 },
      ],
    },

    /* ---------- 7. QUAD — dört buton aynı kapıya, dört klon ----------
     * Üç yerde + bir yüksek. Cascade'in zorlaştırılmış hali. */
    {
      name: "Quad",
      hint: "Dört buton, hepsi aynı kapıya bağlı.\nÜçü yerde, biri yüksek platformda — dört klon dizmen gerekecek.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#       ====       #",
        "#               #  #",
        "#   ===         #  #",
        "#               #  #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 2,  row: 9, id: 1 },
        { col: 9,  row: 4, id: 1 },
        { col: 11, row: 9, id: 1 },
        { col: 14, row: 9, id: 1 },
      ],
      doors:   [{ col: 16, row: 9, id: 1 }],
    },

    /* ---------- 8. SEQUENCE — iki kapı, 1+2 buton, üç klon ----------
     * Birinci kapı tek butonla, ikinci kapı iki butonun ikisi birden basılıyken. */
    {
      name: "Sequence",
      hint: "Birinci kapı tek butona bağlı, ikinci kapı iki butona.\nSıralamayı doğru kur.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#      #       #   #",
        "#      #       #   #",
        "#      #       #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 3,  row: 9, id: 1 },   // D1
        { col: 10, row: 9, id: 2 },   // D2 (her ikisi)
        { col: 13, row: 9, id: 2 },   // D2
      ],
      doors: [
        { col: 7,  row: 9, id: 1 },
        { col: 15, row: 9, id: 2 },
      ],
    },

    /* ---------- 9. NETWORK — iki kapı, her biri iki butona, dört klon ----------
     * D1 = B1+B2, D2 = B3+B4. */
    {
      name: "Network",
      hint: "İki kapı, her biri iki butona bağlı.\nDört klon — sırayla diz.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#      #       #   #",
        "#      #       #   #",
        "#      #       #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 2,  row: 9, id: 1 },
        { col: 5,  row: 9, id: 1 },
        { col: 10, row: 9, id: 2 },
        { col: 13, row: 9, id: 2 },
      ],
      doors: [
        { col: 7,  row: 9, id: 1 },
        { col: 15, row: 9, id: 2 },
      ],
    },

    /* ---------- 10. STORM — beş buton aynı kapıya, beş klon ---------- */
    {
      name: "Storm",
      hint: "Beş buton, hepsi aynı anda basılı olmalı.\nİyi planla — beş klon dizmen gerekecek.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#       ====       #",
        "#               #  #",
        "#   ===         #  #",
        "#               #  #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 2,  row: 9, id: 1 },
        { col: 5,  row: 9, id: 1 },
        { col: 9,  row: 4, id: 1 },
        { col: 11, row: 9, id: 1 },
        { col: 14, row: 9, id: 1 },
      ],
      doors:   [{ col: 16, row: 9, id: 1 }],
    },

    /* ---------- 11. TRIPLE DOOR — üç kapı sıralı, orta bölümde tırmanış ----------
     * D1 sol: yer butonu. D2 orta: yüksek buton (platforma tırman). D3 sağ: yer.
     * 3 klon, bir tanesi merdivenden çıkar. */
    {
      name: "Triple Door",
      hint: "Üç kapı, orta bölümün butonu yüksekte.\nOrta merdivenden çık, geri kalan ikisi yerde.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#    ====          #",
        "#   #    #    #    #",
        "#   #=== #    #    #",
        "#   #    #    #    #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 2,  row: 9, id: 1 },
        { col: 6,  row: 4, id: 2 },   // orta platform üstü (cols 5-8)
        { col: 11, row: 9, id: 3 },
      ],
      doors: [
        { col: 4,  row: 9, id: 1 },
        { col: 9,  row: 9, id: 2 },
        { col: 14, row: 9, id: 3 },
      ],
    },

    /* ---------- 12. VAULT — D1 tek buton, D2 üç buton (4 klon) ---------- */
    {
      name: "Vault",
      hint: "İlk kapı tek butona, ikincisi üç butona bağlı.\nDört klon — dağılımı planla.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#      #       #   #",
        "#      #       #   #",
        "#      #       #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 3,  row: 9, id: 1 },   // D1
        { col: 9,  row: 9, id: 2 },   // D2 (3'ü)
        { col: 11, row: 9, id: 2 },
        { col: 13, row: 9, id: 2 },
      ],
      doors: [
        { col: 7,  row: 9, id: 1 },
        { col: 15, row: 9, id: 2 },
      ],
    },

    /* ---------- 13. TWO TOWERS — iki yüksek + iki yer butonu (4 klon, 1 kapı) ----------
     * Row 7 col 16 da duvar (kapının üstünden geçilmesin diye). */
    {
      name: "Two Towers",
      hint: "Dört buton aynı kapıya bağlı.\nİkisi yerde, ikisi farklı yüksek platformlarda — dört yankı klon dizmen gerek.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#  ====     ====   #",
        "#               #  #",
        "#  ====     ====#  #",
        "#               #  #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 2,  row: 9, id: 1 },
        { col: 3,  row: 4, id: 1 },   // sol kule üstü (platform cols 3-6)
        { col: 13, row: 4, id: 1 },   // sağ kule üstü (platform cols 12-15)
        { col: 14, row: 9, id: 1 },
      ],
      doors: [{ col: 16, row: 9, id: 1 }],
    },

    /* ---------- 14. SEQUENCE III — üç kapı, 1+1+2 buton (4 klon) ---------- */
    {
      name: "Sequence III",
      hint: "Üç kapı: ilk ikisi tek butona, üçüncüsü iki butona bağlı.\nDört klon, sıkı planlama.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#   #    #     #   #",
        "#   #    #     #   #",
        "#   #    #     #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 2,  row: 9, id: 1 },
        { col: 6,  row: 9, id: 2 },
        { col: 11, row: 9, id: 3 },
        { col: 13, row: 9, id: 3 },
      ],
      doors: [
        { col: 4,  row: 9, id: 1 },
        { col: 9,  row: 9, id: 2 },
        { col: 15, row: 9, id: 3 },
      ],
    },

    /* ---------- 15. HEXA — üç kapı, her biri iki butona (6 klon) ---------- */
    {
      name: "Hexa",
      hint: "Üç kapı, her biri iki butona bağlı.\nAltı klon — kotanı zorlayacaksın.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#  #    #    #     #",
        "#  #    #    #     #",
        "#  #    #    #     #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        // D1 (id 1): iki buton
        { col: 1,  row: 9, id: 1 },
        { col: 2,  row: 9, id: 1 },
        // D2 (id 2): iki buton
        { col: 4,  row: 9, id: 2 },
        { col: 6,  row: 9, id: 2 },
        // D3 (id 3): iki buton
        { col: 9,  row: 9, id: 3 },
        { col: 11, row: 9, id: 3 },
      ],
      doors: [
        { col: 3,  row: 9, id: 1 },
        { col: 8,  row: 9, id: 2 },
        { col: 13, row: 9, id: 3 },
      ],
    },

    /* ---------- 16. STORM II — iki kapı, sağ bölüm kule ----------
     * D1: 2 yer butonu (sol). D2: 1 yer + 1 basamak + 1 platform (sağ kule). */
    {
      name: "Storm II",
      hint: "İki kapı. Sol iki yer butonuyla açılır; sağ kapı kuleye tırmanmadan açılmaz.\nBeş klon — üçü farklı yükseklikte.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#         ====     #",
        "#     #        #   #",
        "#     #  ===   #   #",
        "#     #        #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        // D1 (id 1): 2 yer butonu
        { col: 2,  row: 9, id: 1 },
        { col: 4,  row: 9, id: 1 },
        // D2 (id 2): yer + basamak üstü + platform üstü
        { col: 8,  row: 9, id: 2 },
        { col: 10, row: 6, id: 2 },   // basamak (row 7 cols 9-11) üstü
        { col: 11, row: 4, id: 2 },   // platform (row 5 cols 10-13) üstü
      ],
      doors: [
        { col: 6,  row: 9, id: 1 },
        { col: 15, row: 9, id: 2 },
      ],
    },

    /* ---------- 17. CROWN — dört yüksek buton tek kapıya (4 klon, tümü zıplama) ----------
     * Son platform cols 14-15 (col 16 kapı bölgesine taşmasın). */
    {
      name: "Crown",
      hint: "Dört buton aynı kapıya — hepsi yüksek platformlarda.\nHer biri için ayrı bir tırmanış.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#  ==  ==  == ==   #",
        "#               #  #",
        "#  ==  ==  == ==#  #",
        "#               #  #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 3,  row: 4, id: 1 },   // platform cols 3-4
        { col: 7,  row: 4, id: 1 },   // platform cols 7-8
        { col: 11, row: 4, id: 1 },   // platform cols 11-12
        { col: 14, row: 4, id: 1 },   // platform cols 14-15
      ],
      doors: [{ col: 16, row: 9, id: 1 }],
    },

    /* ---------- 18. LATTICE — iki kapı, her bölmede yer+basamak+platform karışımı ----------
     * Her iki tarafta da küçük kule var: 1 yer + 1 basamak + 1 platform butonu = 3 buton.
     * Toplam 6 klon. */
    {
      name: "Lattice",
      hint: "İki kapı, her birinde 3 buton — biri yerde, biri basamakta, biri platformda.\nAltı klon, farklı yükseklikler.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#  ===    ===      #",
        "#     #        #   #",
        "#  ===#   ===  #   #",
        "#     #        #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        // D1 (id 1): yer + basamak üstü + platform üstü (sol bölme)
        { col: 1,  row: 9, id: 1 },
        { col: 4,  row: 6, id: 1 },   // basamak (row 7 cols 3-5) üstü
        { col: 4,  row: 4, id: 1 },   // platform (row 5 cols 3-5) üstü
        // D2 (id 2): aynı yapı sağ bölmede
        { col: 8,  row: 9, id: 2 },
        { col: 11, row: 6, id: 2 },   // basamak (row 7 cols 10-12) üstü
        { col: 11, row: 4, id: 2 },   // platform (row 5 cols 10-12) üstü
      ],
      doors: [
        { col: 6,  row: 9, id: 1 },
        { col: 15, row: 9, id: 2 },
      ],
    },

    /* ---------- 19. ECHO VI — altı buton aynı kapıya, altı klon ----------
     * Row 7 col 16 da duvar (kapı atlanmasın). */
    {
      name: "Echo VI",
      hint: "Altı buton, hepsi aynı kapıya bağlı.\nKlon kotan: 8. Dört yerde, ikisi yüksek platformlarda.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#  ====     ====   #",
        "#               #  #",
        "#  ====     ====#  #",
        "#               #  #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        { col: 2,  row: 9, id: 1 },
        { col: 3,  row: 4, id: 1 },   // sol kule
        { col: 5,  row: 9, id: 1 },
        { col: 11, row: 9, id: 1 },
        { col: 13, row: 4, id: 1 },   // sağ kule (platform cols 12-15)
        { col: 14, row: 9, id: 1 },
      ],
      doors: [{ col: 16, row: 9, id: 1 }],
    },

    /* ---------- 20. PROTOCOL — final. iki kapı, 3+4 buton (7 klon) ----------
     * Sol bölme (D1): 3 buton. Sağ bölme (D2): 4 buton + bir yüksek.
     * Klon kotan: 8. Tüm öğrendiklerin burada. */
    {
      name: "Protocol",
      hint: "Final. İki kapı, yedi buton.\nYedi klon dizip kapıdan geç — protokol tamamlansın.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#         ====     #",
        "#     #        #   #",
        "#  ===#  ===   #   #",
        "#     #        #   #",
        "#S               G #",
        "####################",
      ],
      buttons: [
        // D1 (id 1): 3 buton — sol bölme (cols 1-5)
        { col: 1,  row: 9, id: 1 },
        { col: 3,  row: 9, id: 1 },
        { col: 4,  row: 6, id: 1 },   // sol basamak üstü (stepping cols 3-5)
        // D2 (id 2): 4 buton — orta+sağ bölme (cols 7-13)
        { col: 7,  row: 9, id: 2 },
        { col: 9,  row: 6, id: 2 },   // orta basamak üstü (stepping cols 9-11)
        { col: 11, row: 4, id: 2 },   // platform cols 10-13 üstü
        { col: 13, row: 9, id: 2 },
      ],
      doors: [
        { col: 6,  row: 9, id: 1 },
        { col: 15, row: 9, id: 2 },
      ],
    },

    /* ---------- 21. SPIRE — merdiven tırmanışı, tepeye buton ----------
     * Tepe platformu cols 11-15 (col 16+ kapı bölgesine taşmasın).
     * Buton platform üstünde (col 13). Auto-extend col 16 duvarı tavana kadar. */
    {
      name: "Spire",
      hint: "Tepedeki butonu basmak için merdiveni tırman.\nR ile sar — yankın yukarıda tutsun, sen aşağıdan kapıdan geç.",
      tiles: [
        "####################",
        "#             B    #",
        "#          =====   #",
        "#         ====     #",
        "#                  #",
        "#     ====         #",
        "#               #  #",
        "#  ====         #  #",
        "#               #  #",
        "#S               G #",
        "####################",
      ],
      buttons: [{ col: 13, row: 1, id: 1 }],   // platform row 2 cols 11-15 üstü
      doors:   [{ col: 16, row: 9, id: 1 }],
    },

    /* ---------- 22. HAZARD — dikenleri zıplayarak geç ----------
     * '^' = ölümcül diken. Dokununca döngü sıfırlanır (klonlar etkilenmez).
     * Klon butonu tutar, sen dikenleri atlayarak goal'a ulaşırsın. */
    {
      name: "Hazard",
      hint: "Pembe dikenler dokununca seni döngünün başına atar.\nButona ulaşıp R, sonra dikenleri tutarlı ritimde atlayarak goal'a koş.",
      tiles: [
        "####################",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#                  #",
        "#               #  #",
        "#               #  #",
        "#S  ^^     ^^^   G #",
        "####################",
      ],
      buttons: [{ col: 7,  row: 9, id: 1 }],
      doors:   [{ col: 16, row: 9, id: 1 }],
    },
  ];


  /* ==========================================================================
   * 3. STATE & STORAGE
   * ----------------------------------------------------------------------- */
  const STATE = Object.freeze({
    TITLE: "title", PLAYING: "playing", PAUSED: "paused",
    LEVEL_DONE: "leveldone", ALL_DONE: "alldone",
  });
  let state = STATE.TITLE;

  // Runtime — startLevel()'de doldurulur
  let level         = null;     // mevcut bölüm tanımı (LEVELS'tan)
  let levelIndex    = 0;
  let spawn         = { x: 0, y: 0 };
  let goal          = { col: 0, row: 0 };
  let walls         = null;     // Set<"col,row"> — durağan duvarlar (her yönden katı)
  let jumpThrough   = null;     // Set<"col,row"> — sadece üstten basılır (Mario platformu)
  let spikes        = null;     // Set<"col,row"> — dokununca döngü sıfırlanır (sadece oyuncuyu öldürür)
  let solids        = null;     // Set<"col,row"> — duvarlar + kapanmış kapılar (frame-by-frame)
  let buttons       = [];       // runtime kopyaları (col, row, id, pressed)
  let doors         = [];       // runtime kopyaları (col, row, id, open)
  let player        = null;
  let clones        = [];
  let playerRec     = [];       // mevcut döngünün oyuncu kaydı
  let loopFrame     = 0;        // mevcut döngüdeki frame sayacı (0..MAX_LOOP_FRAMES)
  let levelStart    = 0;        // performance.now() — toplam süreyi hesaplamak için
  let levelTotalSec = 0;        // bölüm bitiminde dondurulacak
  let levelTotalRew = 0;        // bu bölümde yapılan toplam geri sarma sayısı
  let rewindHoldT   = 0;        // R basılı tutma süresi (sıfırlama için)
  let rewindFlashT  = 0;        // geri sarma flaş efekti
  let hintT         = 0;        // hint görünme zamanlayıcısı

  const MAX_LOOP_FRAMES = Math.round(CONFIG.loopMaxSeconds * 60);

  // localStorage
  const LS = {
    bestTime: (i) => `echo-protocol:best:${i}`,
    muted:    "echo-protocol:muted",
    progress: "echo-protocol:progress",
  };
  const lsGet = (k)    => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const loadBest    = (i) => Number(lsGet(LS.bestTime(i))) || 0;
  const saveBest    = (i, t) => lsSet(LS.bestTime(i), String(t));

  let muted = lsGet(LS.muted) === "1";


  /* ==========================================================================
   * 4. AUDIO — Web Audio API ile prosedürel sesler
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
    const v = vol * 0.16;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + atk);
    g.gain.linearRampToValueAtTime(0, t0 + dur + rel);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + rel + 0.02);
  }
  const sfx = {
    jump:    () => tone({ freq: 520,  freqEnd: 840,  dur: 0.08, type: "triangle", vol: 0.5 }),
    land:    () => tone({ freq: 240,  freqEnd: 160,  dur: 0.05, type: "sine",     vol: 0.3 }),
    btnOn:   () => tone({ freq: 660,  freqEnd: 990,  dur: 0.08, type: "square",   vol: 0.45 }),
    btnOff:  () => tone({ freq: 440,  freqEnd: 280,  dur: 0.06, type: "square",   vol: 0.35 }),
    doorOpen:() => { tone({ freq: 440, freqEnd: 880, dur: 0.14, type: "triangle", vol: 0.5 });
                     tone({ freq: 660, freqEnd: 990, dur: 0.14, type: "triangle", vol: 0.4 }); },
    doorClose:() => tone({ freq: 320, freqEnd: 160, dur: 0.12, type: "sawtooth", vol: 0.4 }),
    rewind:  () => { tone({ freq: 1200, freqEnd: 300, dur: 0.25, type: "sawtooth", vol: 0.5, rel: 0.1 });
                     tone({ freq: 600,  freqEnd: 200, dur: 0.30, type: "triangle", vol: 0.4, rel: 0.1 }); },
    goal:    () => { tone({ freq: 660, dur: 0.12, type: "triangle", vol: 0.55 });
                     tone({ freq: 880, dur: 0.12, type: "triangle", vol: 0.55 });
                     tone({ freq: 1320, dur: 0.28, type: "triangle", vol: 0.55 }); },
    deny:    () => tone({ freq: 220,  freqEnd: 110,  dur: 0.18, type: "sawtooth", vol: 0.5 }),
  };


  /* ==========================================================================
   * 5. CANVAS / RESIZE
   * ----------------------------------------------------------------------- */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const LW = 800, LH = 500;     // mantıksal boyut (CSS aspect-ratio 8/5)
  let dpr = 1;
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(LW * dpr);
    canvas.height = Math.round(LH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);


  /* ==========================================================================
   * 6. LEVEL LOADING & RESET
   * ----------------------------------------------------------------------- */
  function tileKey(c, r) { return c + "," + r; }

  function loadLevel(idx) {
    levelIndex = idx;
    level = LEVELS[idx];

    // Walls + jump-through + spikes + spawn/goal'i parse et
    walls = new Set();
    jumpThrough = new Set();
    spikes = new Set();
    spawn = { x: CONFIG.tile, y: CONFIG.tile };
    goal  = { col: 0, row: 0 };
    for (let r = 0; r < level.tiles.length; r++) {
      const row = level.tiles[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === "#") walls.add(tileKey(c, r));
        else if (ch === "=") jumpThrough.add(tileKey(c, r));
        else if (ch === "^") spikes.add(tileKey(c, r));
        else if (ch === "S") {
          spawn.x = c * CONFIG.tile + 4;
          spawn.y = r * CONFIG.tile;
        } else if (ch === "G") {
          goal.col = c; goal.row = r;
        }
      }
    }

    // Buton/kapı kopyaları
    buttons = (level.buttons || []).map((b) => ({ ...b, pressed: false, prevPressed: false }));
    doors   = (level.doors   || []).map((d) => ({ ...d, open: false, prevOpen: false }));

    // Oyuncu reset
    player = makePlayer();
    clones = [];
    playerRec = [];
    loopFrame = 0;
    levelTotalRew = 0;
    levelStart = performance.now();
    hintT = CONFIG.showHint;

    updateHud();
  }

  function restartLevel() {
    loadLevel(levelIndex);
  }

  function makePlayer() {
    const w = CONFIG.tile - 12, h = CONFIG.tile - 6;
    return {
      x: spawn.x, y: spawn.y,
      w, h,
      vx: 0, vy: 0,
      onGround: false,
      coyote: 0, jumpBuf: 0,
      facing: 1,
    };
  }

  // Sadece oyuncuyu ve döngüyü sıfırla (klonlar korunur, frame 0'a sarılır)
  function resetLoop() {
    player = makePlayer();
    playerRec = [];
    loopFrame = 0;
    for (const c of clones) c.frame = 0;
    for (const b of buttons) { b.pressed = false; b.prevPressed = false; }
    for (const d of doors)   { d.open = false; d.prevOpen = false; }
  }

  // Geri sar: mevcut kaydı klon olarak kaydet, döngüyü sıfırla
  function doRewind() {
    if (!player) return;
    if (clones.length >= CONFIG.maxClones) {
      sfx.deny();
      return;
    }
    // Çok kısa kayıt → spam'ı engelle
    if (playerRec.length < 6) {
      sfx.deny();
      return;
    }
    clones.push({
      recording: playerRec,
      frame: 0,
      w: player.w, h: player.h,
      x: spawn.x, y: spawn.y,
      facing: 1,
    });
    levelTotalRew++;
    rewindFlashT = 0.35;
    sfx.rewind();
    resetLoop();
    updateHud();
  }


  /* ==========================================================================
   * 7. INPUT
   * ----------------------------------------------------------------------- */
  const input = {
    left: false, right: false,
    jumpHeld: false, jumpQueued: false,   // edge-trigger için
    rewindHeld: false,
  };

  function keyDown(e) {
    if (state === STATE.PLAYING) {
      if (e.code === "ArrowLeft"  || e.code === "KeyA") { input.left  = true;  e.preventDefault(); }
      if (e.code === "ArrowRight" || e.code === "KeyD") { input.right = true;  e.preventDefault(); }
      if (e.code === "ArrowUp"    || e.code === "KeyW" || e.code === "Space") {
        if (!input.jumpHeld) input.jumpQueued = true;
        input.jumpHeld = true; e.preventDefault();
      }
      if (e.code === "KeyR") { input.rewindHeld = true; e.preventDefault(); }
      if (e.code === "KeyP" || e.code === "Escape") { pauseGame(); e.preventDefault(); }
      if (e.code === "KeyM") toggleMute();
    } else if (state === STATE.TITLE) {
      if (e.code === "Space" || e.code === "Enter") { startGame(); e.preventDefault(); }
    } else if (state === STATE.PAUSED) {
      if (e.code === "Escape" || e.code === "KeyP") { resumeGame(); e.preventDefault(); }
    } else if (state === STATE.LEVEL_DONE) {
      if (e.code === "Space" || e.code === "Enter") { nextLevel(); e.preventDefault(); }
    } else if (state === STATE.ALL_DONE) {
      if (e.code === "Space" || e.code === "Enter") { startGame(); e.preventDefault(); }
    }
  }
  function keyUp(e) {
    if (e.code === "ArrowLeft"  || e.code === "KeyA") input.left  = false;
    if (e.code === "ArrowRight" || e.code === "KeyD") input.right = false;
    if (e.code === "ArrowUp"    || e.code === "KeyW" || e.code === "Space") input.jumpHeld = false;
    if (e.code === "KeyR") input.rewindHeld = false;
    // Not: rewindHoldT'yi BURADA sıfırlama — updateGame "release" anında doRewind'i tetiklemeli.
  }
  window.addEventListener("keydown", keyDown, { passive: false });
  window.addEventListener("keyup",   keyUp);


  /* ==========================================================================
   * 8. PHYSICS — Tile-vs-AABB collision
   * ----------------------------------------------------------------------- */
  function isSolidTile(c, r) {
    if (c < 0 || c >= CONFIG.cols || r < 0 || r >= CONFIG.rows) return true;
    return solids.has(tileKey(c, r));
  }

  function buildSolids() {
    solids = new Set(walls);
    for (const d of doors) {
      if (d.open) continue;
      solids.add(tileKey(d.col, d.row));
      // Kapı kapalıyken sütun tavana kadar otomatik duvar — yüksek platformdan
      // üstünden uçulamasın. Aynı sütundaki jump-through platformları VE bir üstündeki
      // satırı (oyuncu orada DURUR) atla ki oyuncu içine sıkışmasın.
      const skip = new Set();
      for (let r = 1; r <= d.row; r++) {
        if (jumpThrough.has(tileKey(d.col, r))) {
          skip.add(r);
          skip.add(r - 1);
        }
      }
      for (let r = d.row - 1; r >= 1; r--) {
        if (skip.has(r)) continue;
        if (walls.has(tileKey(d.col, r))) continue;
        solids.add(tileKey(d.col, r));
      }
    }
  }

  function moveX(e, dx) {
    if (dx === 0) return;
    e.x += dx;
    const tile = CONFIG.tile;
    const minR = Math.floor(e.y / tile);
    const maxR = Math.floor((e.y + e.h - 0.001) / tile);
    if (dx > 0) {
      const c = Math.floor((e.x + e.w - 0.001) / tile);
      for (let r = minR; r <= maxR; r++) {
        if (isSolidTile(c, r)) { e.x = c * tile - e.w; e.vx = 0; return; }
      }
    } else {
      const c = Math.floor(e.x / tile);
      for (let r = minR; r <= maxR; r++) {
        if (isSolidTile(c, r)) { e.x = (c + 1) * tile; e.vx = 0; return; }
      }
    }
  }

  function moveY(e, dy) {
    if (dy === 0) return;
    const prevBottom = e.y + e.h;
    e.y += dy;
    const tile = CONFIG.tile;
    const minC = Math.floor(e.x / tile);
    const maxC = Math.floor((e.x + e.w - 0.001) / tile);
    if (dy > 0) {
      // Düşüş: katı tile'lara VE üst kısmındaysan jump-through'a in
      const r = Math.floor((e.y + e.h - 0.001) / tile);
      for (let c = minC; c <= maxC; c++) {
        const tileTop = r * tile;
        const isSolid = isSolidTile(c, r);
        // Jump-through: sadece bir önceki frame'de üstündeysek katı say
        const isJT = !isSolid && jumpThrough.has(tileKey(c, r)) && prevBottom <= tileTop + 0.5;
        if (isSolid || isJT) {
          const justLanded = !e.onGround;
          e.y = tileTop - e.h; e.vy = 0; e.onGround = true;
          if (justLanded) sfx.land();
          return;
        }
      }
    } else {
      // Yükseliş: AABB'nin BÜTÜN satırlarını alttan üste tara (jump-through serbest geçer).
      // Önceden sadece TOP satırı kontrol ediyordu → oyuncu apex'te kafayı duvarın üstünden
      // sıyırınca gövdesi içeride kalıp tunneling oluyordu.
      const minR = Math.floor(e.y / tile);
      const maxR = Math.floor((e.y + e.h - 0.001) / tile);
      for (let r = maxR; r >= minR; r--) {
        for (let c = minC; c <= maxC; c++) {
          if (isSolidTile(c, r)) { e.y = (r + 1) * tile; e.vy = 0; return; }
        }
      }
    }
  }

  function updatePlayer(dt) {
    // Yatay ivme — anlık hız (snappy puzzle hissi)
    let ax = 0;
    if (input.left)  ax -= 1;
    if (input.right) ax += 1;
    player.vx = ax * CONFIG.walkSpeed;
    if (ax !== 0) player.facing = ax;

    // Zıpla buffer + coyote
    if (input.jumpQueued) { player.jumpBuf = CONFIG.jumpBuffer; input.jumpQueued = false; }
    else player.jumpBuf = Math.max(0, player.jumpBuf - dt);
    if (player.onGround) player.coyote = CONFIG.coyoteTime;
    else player.coyote = Math.max(0, player.coyote - dt);

    if (player.jumpBuf > 0 && player.coyote > 0) {
      player.vy = -CONFIG.jumpVel;
      player.jumpBuf = 0; player.coyote = 0;
      player.onGround = false;
      sfx.jump();
    }
    // Not: bilerek variable-height jump YOK. Tahmin edilebilirlik için sabit yükseklik.

    // Yerçekimi
    player.vy += CONFIG.gravity * dt;
    if (player.vy > CONFIG.maxFallSpeed) player.vy = CONFIG.maxFallSpeed;

    // Hareket
    player.onGround = false;
    moveX(player, player.vx * dt);
    moveY(player, player.vy * dt);
  }

  function updateClones() {
    for (const c of clones) {
      if (c.frame < c.recording.length) {
        const snap = c.recording[c.frame];
        c.x = snap.x; c.y = snap.y; c.facing = snap.facing;
        c.frame++;
      }
      // frame buffer'ı geçtiyse son pozisyonda donar (kalıcı buton basışı için)
    }
  }


  /* ==========================================================================
   * 9. BUTTONS / DOORS / GOAL
   * ----------------------------------------------------------------------- */
  function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function entityOnButton(e, b) {
    const t = CONFIG.tile;
    return aabbOverlap(e.x, e.y, e.w, e.h, b.col * t, b.row * t, t, t);
  }

  function updateButtons() {
    for (const b of buttons) {
      b.prevPressed = b.pressed;
      let pressed = entityOnButton(player, b);
      if (!pressed) {
        for (const c of clones) if (entityOnButton(c, b)) { pressed = true; break; }
      }
      b.pressed = pressed;
      if (pressed && !b.prevPressed) sfx.btnOn();
      else if (!pressed && b.prevPressed) sfx.btnOff();
    }
  }

  function updateDoors() {
    for (const d of doors) {
      d.prevOpen = d.open;
      const linked = buttons.filter((b) => b.id === d.id);
      d.open = linked.length > 0 && linked.every((b) => b.pressed);
      if (d.open && !d.prevOpen) sfx.doorOpen();
      else if (!d.open && d.prevOpen) sfx.doorClose();
    }
  }

  function checkGoal() {
    const t = CONFIG.tile;
    if (aabbOverlap(player.x, player.y, player.w, player.h,
                    goal.col * t + 4, goal.row * t + 4, t - 8, t - 8)) {
      completeLevel();
    }
  }


  /* ==========================================================================
   * 10. MAIN UPDATE
   * ----------------------------------------------------------------------- */
  function updateGame(dt) {
    // 1) Rewind tuşu uzun basış → bölüm sıfırla
    if (input.rewindHeld) {
      rewindHoldT += dt;
      if (rewindHoldT >= CONFIG.rewindHoldRestart) {
        rewindHoldT = -999;   // tek tetik
        restartLevel();
        return;
      }
    } else {
      // kısa basıştan kalkış: rewind tetiklenmeli
      if (rewindHoldT > 0 && rewindHoldT < CONFIG.rewindHoldRestart) {
        doRewind();
      }
      rewindHoldT = 0;
    }

    if (rewindFlashT > 0) rewindFlashT = Math.max(0, rewindFlashT - dt);
    if (hintT > 0) hintT = Math.max(0, hintT - dt);

    // 2) Buton/kapı state + solid set
    updateButtons();
    updateDoors();
    buildSolids();

    // 3) Klonlar hareket eder (kaydedilmiş pozisyondan)
    updateClones();

    // 4) Oyuncu fizik + collision
    updatePlayer(dt);

    // 5) Hedef
    checkGoal();
    if (state !== STATE.PLAYING) return;

    // 6) Oyuncu kayıt (her frame, sabit zamanlı)
    playerRec.push({ x: player.x, y: player.y, facing: player.facing });

    // 7a) Diken çarpışması — oyuncu AABB herhangi bir spike tile'ı ile örtüşürse
    // döngü resetlenir (klonlar etkilenmez — onlar kayıttan oynar).
    if (spikes && spikes.size > 0) {
      const t = CONFIG.tile;
      const minC = Math.floor(player.x / t);
      const maxC = Math.floor((player.x + player.w - 0.001) / t);
      const minR = Math.floor(player.y / t);
      const maxR = Math.floor((player.y + player.h - 0.001) / t);
      let dead = false;
      for (let r = minR; r <= maxR && !dead; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (spikes.has(tileKey(c, r))) { dead = true; break; }
        }
      }
      if (dead) {
        rewindFlashT = 0.45;
        sfx.deny();
        resetLoop();
        return;
      }
    }

    // 7) Döngü saati
    loopFrame++;
    if (loopFrame >= MAX_LOOP_FRAMES) {
      // Otomatik geri sar — klon kotası dolu veya kayıt çok kısaysa sadece resetLoop
      if (clones.length < CONFIG.maxClones && playerRec.length > 6) doRewind();
      else resetLoop();
    }

    // 8) HUD canlı sayaç
    if (loopFrame % 6 === 0) updateHudLoopOnly();
  }


  /* ==========================================================================
   * 11. RENDER
   * ----------------------------------------------------------------------- */
  function renderGame() {
    // Arka plan + grid
    ctx.fillStyle = "#05050b";
    ctx.fillRect(0, 0, LW, LH);

    if (!level) return;

    // Subtle grid
    drawGrid();

    // Walls
    drawWalls();

    // Dikenler (ölümcül — pembe/danger renkli üçgenler)
    drawSpikes();

    // Path/door zemini görsel ipucu (kapı tile'ı)
    drawDoors();

    // Buttons (kapı önce, butonlar üstte)
    drawButtons();

    // Goal portal (pulse)
    drawGoal();

    // Klonlar (oyuncudan ÖNCE — oyuncu üstte görünsün)
    for (const c of clones) drawEntity(c, true);

    // Oyuncu
    if (player) drawEntity(player, false);

    // Loop time progress bar (alt kenarda)
    drawLoopBar();

    // Hint metni (ilk birkaç saniye)
    if (hintT > 0 && level.hint) drawHint();

    // Rewind flaş efekti
    if (rewindFlashT > 0) {
      const a = rewindFlashT / 0.35;
      ctx.save();
      ctx.fillStyle = `rgba(34, 211, 238, ${0.35 * a})`;
      ctx.fillRect(0, 0, LW, LH);
      ctx.restore();
    }
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const t = CONFIG.tile;
    for (let r = 0; r < CONFIG.rows; r++) {
      for (let c = 0; c < CONFIG.cols; c++) {
        if (walls.has(tileKey(c, r))) continue;
        ctx.strokeRect(c * t + 0.5, r * t + 0.5, t - 1, t - 1);
      }
    }
  }

  function drawWalls() {
    const t = CONFIG.tile;
    // Katı duvarlar — koyu blok
    ctx.fillStyle = "#13131f";
    for (const key of walls) {
      const [c, r] = key.split(",").map(Number);
      ctx.fillRect(c * t, r * t, t, t);
    }
    // Neon kenarlık (sadece üst yüzler)
    ctx.fillStyle = "rgba(181,55,242,0.55)";
    for (const key of walls) {
      const [c, r] = key.split(",").map(Number);
      if (!walls.has(tileKey(c, r - 1))) {
        ctx.fillRect(c * t, r * t, t, 2);
      }
    }
    // Jump-through platformlar — ince üst çizgi (Mario stili)
    ctx.save();
    ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(34, 211, 238, 0.85)";
    for (const key of jumpThrough) {
      const [c, r] = key.split(",").map(Number);
      ctx.fillRect(c * t, r * t, t, 4);
    }
    ctx.fillStyle = "rgba(34, 211, 238, 0.10)";
    for (const key of jumpThrough) {
      const [c, r] = key.split(",").map(Number);
      ctx.fillRect(c * t, r * t + 4, t, 6);
    }
    ctx.restore();
  }

  function drawSpikes() {
    const t = CONFIG.tile;
    if (!spikes || spikes.size === 0) return;
    ctx.save();
    ctx.shadowColor = "#ff3e8a"; ctx.shadowBlur = 10;
    for (const key of spikes) {
      const [c, r] = key.split(",").map(Number);
      const x = c * t, y = r * t;
      // 3 tane üçgen diken — tile'ın altında oturur, yukarı sivrilir
      ctx.fillStyle = "#ff3e8a";
      const n = 3, sw = t / n;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * sw, y + t);
        ctx.lineTo(x + i * sw + sw / 2, y + 8);
        ctx.lineTo(x + (i + 1) * sw, y + t);
        ctx.closePath();
        ctx.fill();
      }
      // Hafif ışıltı tabanı
      ctx.fillStyle = "rgba(255, 62, 138, 0.15)";
      ctx.fillRect(x, y + t - 4, t, 4);
    }
    ctx.restore();
  }

  function drawDoors() {
    const t = CONFIG.tile;
    for (const d of doors) {
      const x = d.col * t, y = d.row * t;
      if (d.open) {
        // Açık: ince yan çubuklar
        ctx.fillStyle = "rgba(90,255,156,0.18)";
        ctx.fillRect(x + 2, y + 4, 4, t - 8);
        ctx.fillRect(x + t - 6, y + 4, 4, t - 8);
        ctx.shadowColor = "#5aff9c"; ctx.shadowBlur = 10;
        ctx.fillStyle = "rgba(90,255,156,0.7)";
        ctx.fillRect(x + 2, y + 4, 4, 4);
        ctx.fillRect(x + t - 6, y + 4, 4, 4);
        ctx.fillRect(x + 2, y + t - 8, 4, 4);
        ctx.fillRect(x + t - 6, y + t - 8, 4, 4);
        ctx.shadowBlur = 0;
      } else {
        // Kapalı: tam kapı + sütun yukarı doğru duvar (atlanamasın diye görünür)
        ctx.fillStyle = "#16162c";
        ctx.fillRect(x, y, t, t);
        ctx.shadowColor = "#b537f2"; ctx.shadowBlur = 12;
        ctx.strokeStyle = "#b537f2"; ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, t - 6, t - 6);
        ctx.fillStyle = "rgba(181,55,242,0.5)";
        for (let i = 0; i < 3; i++) ctx.fillRect(x + 8 + i * 8, y + 8, 3, t - 16);
        ctx.shadowBlur = 0;

        // Sütun yukarı: auto-extended duvarları çiz (görünür yap)
        for (let r = d.row - 1; r >= 1; r--) {
          const k = tileKey(d.col, r);
          // Sadece auto-extend ile eklenen (solids içinde olup walls/jumpThrough olmayan)
          if (!solids.has(k)) continue;        // bu satır geçilebilir, çizme
          if (walls.has(k)) continue;          // zaten walls çiziyor
          if (jumpThrough.has(k)) continue;    // platform, çizme
          const yy = r * t;
          ctx.fillStyle = "#1a1228";
          ctx.fillRect(x, yy, t, t);
          ctx.strokeStyle = "rgba(181,55,242,0.45)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 4, yy + 4, t - 8, t - 8);
        }
      }
    }
  }

  function drawButtons() {
    const t = CONFIG.tile;
    const now = performance.now() * 0.003;
    for (const b of buttons) {
      const x = b.col * t, y = b.row * t;
      // Tile zemini hafif vurgu
      ctx.fillStyle = b.pressed ? "rgba(90,255,156,0.10)" : "rgba(34,211,238,0.06)";
      ctx.fillRect(x, y, t, t);
      // Pad — tile'ın alt yarısında
      const padW = t - 12, padH = 10;
      const padX = x + 6, padY = y + t - padH - 4;
      const col = b.pressed ? "#5aff9c" : "#22d3ee";
      ctx.shadowColor = col;
      ctx.shadowBlur = b.pressed ? 18 : 10;
      ctx.fillStyle = col;
      ctx.fillRect(padX, padY + (b.pressed ? 4 : 0), padW, padH - (b.pressed ? 4 : 0));
      // Pulse halkası basılı değilken
      if (!b.pressed) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 2 + b.col);
        ctx.globalAlpha = 0.3 * (1 - pulse);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + t / 2, padY + 4, 6 + pulse * 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
    }
  }

  function drawGoal() {
    const t = CONFIG.tile;
    const x = goal.col * t, y = goal.row * t;
    const cx = x + t / 2, cy = y + t / 2;
    const now = performance.now() * 0.003;
    const pulse = 0.6 + 0.4 * Math.sin(now * 2);
    ctx.save();
    ctx.shadowColor = "#5aff9c"; ctx.shadowBlur = 18;
    // dış halka
    ctx.strokeStyle = "rgba(90,255,156,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 14 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    // iç çekirdek
    ctx.fillStyle = "rgba(90,255,156,0.6)";
    ctx.beginPath(); ctx.arc(cx, cy, 5 + pulse * 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEntity(e, isClone) {
    const x = Math.round(e.x), y = Math.round(e.y);
    const w = e.w, h = e.h;
    const color = isClone ? "#b537f2" : "#22d3ee";
    const accent = isClone ? "#e29bff" : "#7af0e0";
    const alpha  = isClone ? 0.55 : 1.0;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = isClone ? 8 : 14;
    // Gövde
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Göz (facing'e göre)
    const eyeY = y + 8;
    const eyeX = e.facing >= 0 ? x + w - 10 : x + 6;
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.fillRect(eyeX, eyeY, 4, 4);

    // Klon ise: tarayıcı çizgileri
    if (isClone) {
      ctx.fillStyle = "rgba(229, 155, 255, 0.25)";
      for (let yy = y + 3; yy < y + h - 3; yy += 4) {
        ctx.fillRect(x + 2, yy, w - 4, 1);
      }
    }
    ctx.restore();
  }

  function drawLoopBar() {
    const w = LW - 24, h = 4;
    const x = 12, y = LH - 10;
    const pct = loopFrame / MAX_LOOP_FRAMES;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x, y, w, h);
    const col = pct > 0.85 ? "#ff3e8a" : pct > 0.6 ? "#f5c542" : "#22d3ee";
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w * pct, h);
    ctx.shadowBlur = 0;
  }

  function drawHint() {
    const alpha = Math.min(1, hintT / 1.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(7,7,13,0.85)";
    const lines = level.hint.split("\n");
    const lineH = 22;
    const boxH = lines.length * lineH + 28;
    const boxW = 520;
    const bx = (LW - boxW) / 2, by = 70;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = "rgba(34,211,238,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    ctx.fillStyle = "#22d3ee";
    ctx.font = "700 11px Orbitron, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`// ${level.name.toUpperCase()}`, bx + 14, by + 18);

    ctx.fillStyle = "#e8e8f5";
    ctx.font = "500 14px system-ui, sans-serif";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + 14, by + 38 + i * lineH);
    }
    ctx.restore();
  }


  /* ==========================================================================
   * 12. UI / STATE TRANSITIONS
   * ----------------------------------------------------------------------- */
  const $ = (s) => document.querySelector(s);
  const screens = {
    title: $("#screen-title"),
    pause: $("#screen-pause"),
    level: $("#screen-level"),
    done:  $("#screen-done"),
  };
  const hudTop = $("#hud-top");
  const mctrls = $("#mctrls");

  function showOnly(name) {
    for (const [k, el] of Object.entries(screens)) el.hidden = (k !== name);
    const playing = name == null;
    hudTop.hidden = !playing;
    mctrls.hidden = !(playing && isTouch());
  }
  function setState(s) {
    state = s;
    if (s === STATE.TITLE)       showOnly("title");
    else if (s === STATE.PLAYING) showOnly(null);
    else if (s === STATE.PAUSED)  { screens.pause.hidden = false; }
    else if (s === STATE.LEVEL_DONE) showOnly("level");
    else if (s === STATE.ALL_DONE)   showOnly("done");
  }

  function startGame() {
    ensureAudio();
    loadLevel(0);
    setState(STATE.PLAYING);
  }
  function pauseGame()  { if (state === STATE.PLAYING) setState(STATE.PAUSED); }
  function resumeGame() { if (state === STATE.PAUSED) setState(STATE.PLAYING); }

  function completeLevel() {
    sfx.goal();
    levelTotalSec = (performance.now() - levelStart) / 1000;
    const best = loadBest(levelIndex);
    const isNewBest = best === 0 || levelTotalSec < best;
    if (isNewBest) saveBest(levelIndex, levelTotalSec);

    $("#level-title").textContent = `BÖLÜM ${levelIndex + 1} — ${level.name.toUpperCase()}`;
    $("#level-time").textContent  = `${levelTotalSec.toFixed(1)}s`;
    $("#level-clones").textContent = String(levelTotalRew);
    const bestNow = loadBest(levelIndex);
    $("#level-best").textContent  = bestNow > 0 ? `${bestNow.toFixed(1)}s` : "—";
    $("#level-newbest").hidden = !isNewBest;
    $("#btn-level-next").hidden = (levelIndex + 1) >= LEVELS.length;

    setState(STATE.LEVEL_DONE);
  }

  function nextLevel() {
    if (levelIndex + 1 >= LEVELS.length) { setState(STATE.ALL_DONE); return; }
    loadLevel(levelIndex + 1);
    setState(STATE.PLAYING);
  }

  function updateHud() {
    $("#stat-level").textContent     = String(levelIndex + 1);
    $("#stat-level-max").textContent = String(LEVELS.length);
    $("#stat-clones").textContent    = String(clones.length);
    $("#stat-clones-max").textContent= String(CONFIG.maxClones);
    updateHudLoopOnly();
  }
  function updateHudLoopOnly() {
    $("#stat-loop").textContent = `${(loopFrame / 60).toFixed(1)}s`;
  }


  /* ==========================================================================
   * 13. INPUT BAĞLAMA (UI butonları)
   * ----------------------------------------------------------------------- */
  $("#btn-start").addEventListener("click", () => { ensureAudio(); startGame(); });
  $("#btn-resume").addEventListener("click", resumeGame);
  $("#btn-pause-restart").addEventListener("click", () => { restartLevel(); resumeGame(); });
  $("#btn-pause-quit").addEventListener("click", () => setState(STATE.TITLE));
  $("#btn-pause").addEventListener("click", pauseGame);
  $("#btn-restart").addEventListener("click", () => restartLevel());
  $("#btn-level-next").addEventListener("click", nextLevel);
  $("#btn-level-retry").addEventListener("click", () => { restartLevel(); setState(STATE.PLAYING); });
  $("#btn-level-quit").addEventListener("click", () => setState(STATE.TITLE));
  $("#btn-done-restart").addEventListener("click", startGame);
  $("#btn-done-quit").addEventListener("click", () => setState(STATE.TITLE));

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


  /* ==========================================================================
   * 14. MOBILE CONTROLS
   * ----------------------------------------------------------------------- */
  function isTouch() {
    return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  }
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
  bindHold($("#mb-rewind"),
    () => { input.rewindHeld = true; },
    () => { input.rewindHeld = false; });

  // Tab arka plana giderse otomatik pause
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === STATE.PLAYING) pauseGame();
  });


  /* ==========================================================================
   * 15. MAIN LOOP — sabit zamanlı update (rec/replay deterministik olsun)
   * ----------------------------------------------------------------------- */
  let lastTime = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1;

    if (state === STATE.PLAYING) {
      acc += dt;
      // Maks 4 alt-step (uzun frame'lerde spiral of death önle)
      let steps = 0;
      while (acc >= STEP && steps < 4) { updateGame(STEP); acc -= STEP; steps++; }
      if (steps === 4) acc = 0;
    } else {
      // Oyun dışı: animasyon (pulse'lar) için sürekli render
      acc = 0;
    }
    renderGame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => { lastTime = t; frame(t); });


  /* ==========================================================================
   * 16. INIT
   * ----------------------------------------------------------------------- */
  // Başlangıçta boş bir level yükle (renderın çökmemesi için)
  loadLevel(0);
  setState(STATE.TITLE);

})();
