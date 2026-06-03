/* ============================================================================
 * FATALSTROKE — Site Verisi
 * ----------------------------------------------------------------------------
 * Bu dosya sitenin tüm "düzenlenebilir" verisini tutar:
 *   1) GAMES        → oyunlar bölümünde gösterilen kartlar
 *   2) RANK_CONFIG  → Ironclad Arena rank hesaplayıcısının formülü ve eşikleri
 *
 * Yeni bir oyun eklemek, bir rank eşiğini değiştirmek veya hesaplama
 * ağırlığını ayarlamak için SADECE bu dosyaya dokunman yeterli.
 * ========================================================================= */


/* ----------------------------------------------------------------------------
 * 1) OYUNLAR
 * ----------------------------------------------------------------------------
 * Her oyun bir nesnedir. Yeni oyun eklemek için diziye yeni bir nesne ekle.
 *
 * Alanlar:
 *   id           → benzersiz kısa kimlik (modal ile eşleşme için)
 *   title        → oyun adı (karta büyük yazılır)
 *   genre        → tür (kartta etiket olarak gösterilir)
 *   tags         → ek etiketler (dizi)
 *   short        → kısa açıklama (kartta görünür, 1-2 cümle)
 *   long         → detay modalındaki uzun açıklama (paragraf)
 *   features     → modaldaki özellik listesi (madde madde)
 *   screenshots  → modaldaki ekran görüntüsü PLACEHOLDER sayısı (henüz görsel yok)
 *   cover        → kart kapağı için neon gradient rengi (palette'den seç:
 *                  "purple", "cyan", "magenta-cyan", "purple-cyan")
 *   playable     → (opsiyonel) true ise modal'da "Oyna" butonu çıkar
 *   playUrl      → (opsiyonel) tıklayınca açılan oynanabilir oyun URL'i
 * ------------------------------------------------------------------------- */
const GAMES = [
  {
    id: "neon-drift",
    title: "Neon Drift",
    genre: "Arcade Yarış",
    tags: ["Synthwave", "Arcade", "Yarış"],
    short:
      "Neon ışıklı şehirde drift yaparak puan topladığın hızlı arcade yarış oyunu.",
    long:
      "Neon Drift, 80'lerin synthwave estetiğini modern arcade yarış mekaniğiyle " +
      "birleştiren bir sürüş deneyimi. Şehrin neon caddelerinde keskin virajlarda " +
      "drift kombosunu zincirleyerek puanını katlıyorsun. Her parça farklı bir " +
      "müzik temasına ve görsel paletine sahip.",
    features: [
      "Time-trial modu ile saniye saniye kendine karşı yarış",
      "Drift kombo sistemi — kombonu kırmadan yüksek skor topla",
      "Online skor tablosu ve haftalık etkinlikler",
      "8 araç, 12 farklı pist ve özelleştirilebilir görsel",
    ],
    screenshots: 3,
    cover: "magenta-cyan",
    playable: true,
    playUrl: "games/neon-drift/index.html",
  },
  {
    id: "voidbreaker",
    title: "Voidbreaker",
    genre: "Roguelike Nişancı",
    tags: ["Roguelike", "Top-down", "Aksiyon"],
    short:
      "Her ölümde değişen zindanlarda hayatta kalmaya çalıştığın, yükseltme temelli roguelike nişancı.",
    long:
      "Voidbreaker, her seferinde yeniden üretilen zindanlarda hızlı tempolu " +
      "top-down nişancılık ve roguelike ilerlemeyi birleştirir. Ölüm bir son " +
      "değil; her koşuda kalıcı yükseltmeler açıyor, sonraki denemende daha " +
      "güçlü başlıyorsun.",
    features: [
      "Prosedürel olarak üretilen haritalar",
      "30'dan fazla silah ve aktif/pasif yetenek",
      "Kalıcı ilerleme ağacı — koşular arasında güçlen",
      "Boss savaşları ve gizli odalar",
    ],
    screenshots: 4,
    cover: "purple",
    playable: true,
    playUrl: "games/voidbreaker/index.html",
  },
  {
    id: "pixel-siege",
    title: "Pixel Siege",
    genre: "Tower Defense",
    tags: ["Strateji", "Pixel Art", "TD"],
    short:
      "Piksel sanat tarzında, dalgalar halinde gelen düşmanlara karşı kuleler dizdiğin strateji oyunu.",
    long:
      "Pixel Siege, klasik tower defense formülüne derin bir yükseltme ağacı ve " +
      "modern denge tasarımı getiriyor. Her seviye farklı bir harita ve düşman " +
      "kompozisyonu sunuyor; aynı kuleyi farklı şekillerde dallandırarak " +
      "stratejini her oyunda yeniden kurabiliyorsun.",
    features: [
      "20'den fazla el yapımı seviye",
      "Dallanan kule yükseltme ağacı",
      "3 zorluk modu ve sonsuz dalga modu",
      "Pixel art tarzında özgün görsel ve müzik",
    ],
    screenshots: 3,
    cover: "cyan",
    playable: true,
    playUrl: "games/pixel-siege/index.html",
  },
  {
    id: "echo-protocol",
    title: "Echo Protocol",
    genre: "Puzzle / Platform",
    tags: ["Puzzle", "Platform", "Hikaye"],
    short:
      "Geçmiş hareketlerinin 'yankısıyla' birlikte bulmaca çözdüğün, zaman temelli platform oyunu.",
    long:
      "Echo Protocol'de hareketlerin kayıt altına alınır ve bir sonraki denemende " +
      "bir 'klon' olarak geri oynanır. Bulmacaları kendi geçmişinle iş birliği " +
      "yaparak çözüyorsun: bir butona basıp aynı anda farklı bir kapıdan geçmek " +
      "için kendine pas atıyorsun. Minimal ama derin bir hikaye eşliğinde.",
    features: [
      "Klon (yankı) mekaniği — kendinle iş birliği yap",
      "El yapımı, özgün tasarımlı bölümler",
      "Atmosferik müzik ve minimal hikaye anlatımı",
      "Zorluk artırma yerine derinleşen bulmacalar",
    ],
    screenshots: 4,
    cover: "purple-cyan",
    playable: true,
    playUrl: "games/echo-protocol/index.html",
  },
  {
    id: "ironclad-arena",
    title: "Ironclad Arena",
    genre: "Dövüş / PvP",
    tags: ["Dövüş", "PvP", "Rekabetçi"],
    short:
      "Mekanik savaşçıların çarpıştığı, rekabetçi 1v1 dövüş oyunu. Aşağıdaki Rank Tracker bu oyuna aittir.",
    long:
      "Ironclad Arena, mekanik savaşçıların kapıştığı rekabetçi bir 1v1 dövüş " +
      "oyunu. Her karakter kendi silah setine, hareket listesine ve sezona göre " +
      "değişen meta dengelerine sahip. Sıralı maç sistemi ile sezon boyunca " +
      "Demir'den Efsane'ye uzanan bir tırmanış seni bekliyor.",
    features: [
      "Sıralı maç sistemi ve sezonluk rütbe sıfırlama",
      "12 oynanabilir karakter, her biri özgün hareket setiyle",
      "Antrenman modu, frame data ve hitbox görüntüleme",
      "Rekabetçi rank tracker entegrasyonu (aşağıda)",
    ],
    screenshots: 5,
    cover: "magenta-cyan",
    playable: true,
    playUrl: "games/ironclad-arena/index.html",
  },
];


/* ----------------------------------------------------------------------------
 * 2) RANK HESAPLAYICI — Ironclad Arena
 * ----------------------------------------------------------------------------
 * Formül (calcRating fonksiyonunda uygulanır):
 *
 *     rating = mmr
 *            + (wins   * winWeight)
 *            - (losses * lossWeight)
 *            + (streak * streakBonus)
 *
 * Sonra "rating" değeri TIERS dizisindeki minRating eşiklerine göre bir
 * rütbeye eşlenir.
 *
 * Bir rütbenin renk/eşik bilgisini değiştirmek istersen sadece TIERS'i
 * düzenle. Ağırlıkları değiştirmek istersen WEIGHTS'i düzenle.
 * ------------------------------------------------------------------------- */

const WEIGHTS = {
  // MMR girdisi tabandır (1:1 katkı). Aşağıdaki ağırlıklar buna eklenir.
  winWeight:    12,   // her galibiyet kaç rating ekler
  lossWeight:    8,   // her mağlubiyet kaç rating düşürür
  streakBonus:  15,   // her bir kazanma serisi maçı kaç ekstra rating ekler
  minRating:     0,   // rating'in düşebileceği taban (negatif olamaz)
};

// Rütbeler DÜŞÜKTEN YÜKSEĞE sıralı olmalıdır.
// "color" tier rozetinin ana neon rengidir; "glow" ise yumuşak ışıma rengidir.
const TIERS = [
  { name: "Demir",   minRating: 0,    color: "#8a8a99", glow: "#bdbdc9" },
  { name: "Bronz",   minRating: 800,  color: "#c97a3a", glow: "#ffb27a" },
  { name: "Gümüş",   minRating: 1600, color: "#c9d1dc", glow: "#ffffff" },
  { name: "Altın",   minRating: 2400, color: "#f5c542", glow: "#ffe27a" },
  { name: "Platin",  minRating: 3200, color: "#3ad6c2", glow: "#7af0e0" },
  { name: "Elmas",   minRating: 4000, color: "#5aa9ff", glow: "#a8d4ff" },
  { name: "Usta",    minRating: 4800, color: "#b537f2", glow: "#e29bff" },
  { name: "Efsane",  minRating: 5800, color: "#ff3e8a", glow: "#ff9ec4" },
];

const RANK_CONFIG = { WEIGHTS, TIERS };
