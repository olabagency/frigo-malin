/*
 * Frigo Malin — panneau Home Assistant.
 * Un seul fichier, sans dépendance ni étape de build.
 * Les couleurs viennent du thème de Home Assistant (clair ou sombre).
 */

const FM_VERSION = "1.2.1";

const DAY_MS = 86400000;
const SLOT_LABELS = { lunch: "Midi", dinner: "Soir" };
const ABBREV_UNITS = new Set(["kg", "g", "mg", "l", "dl", "cl", "ml", "c. à soupe", "c. à café"]);

/* ------------------------------------------------------------------ outils */

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const safeUrl = (url) => (/^(https?:\/\/|data:image\/)/i.test(String(url || "").trim()) ? String(url).trim() : "");

const isoDate = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parseIso = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, n) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const mondayOf = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return isoDate(d);
};
const todayIso = () => isoDate(new Date());
const fmtDay = (iso, opts = { weekday: "long", day: "numeric", month: "long" }) =>
  parseIso(iso).toLocaleDateString("fr-FR", opts);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

function fmtNumber(value) {
  if (Math.abs(value - Math.round(value)) < 0.01) return String(Math.round(value));
  for (const [den, sym] of [[2, "½"], [4, "¼"], [3, "⅓"]]) {
    if (value < 1 && Math.abs(value - 1 / den) < 0.01) return sym;
  }
  if (value < 1 && Math.abs(value - 0.75) < 0.01) return "¾";
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function fmtUnit(unit, qty) {
  if (!unit || ABBREV_UNITS.has(unit) || qty == null || qty <= 1) return unit || "";
  if (/[sx]$/.test(unit)) return unit;
  if (/eau$/.test(unit)) return unit + "x";
  return unit + "s";
}

function fmtIngredient(ing, factor = 1) {
  const qty = ing.quantity == null ? null : ing.quantity * factor;
  const parts = [];
  if (qty != null) parts.push(fmtNumber(qty));
  if (ing.unit) parts.push(fmtUnit(ing.unit, qty));
  return { amount: parts.join(" "), name: ing.name };
}

function ingredientLine(ing) {
  const parts = [];
  if (ing.quantity != null) parts.push(String(Math.round(ing.quantity * 100) / 100).replace(".", ","));
  if (ing.unit) parts.push(ing.unit);
  parts.push(ing.name);
  return parts.join(" ");
}

function fmtMinutes(min) {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

function totalTime(r) {
  return (r.prep_time || 0) + (r.cook_time || 0);
}

function hashHue(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const EMOJIS = ["🍲", "🥗", "🍝", "🥘", "🍛", "🥧", "🍜", "🥙", "🍳", "🍰"];

/* Logo de l'app : un frigo malin qui sourit (même dessin que l'icône de l'intégration). */
const LOGO_SVG = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#22b8a7"/>
  <path d="M8 18c4-7 11-11 18-12" stroke="#7fe3d6" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
  <rect x="17" y="11" width="30" height="45" rx="8" fill="#fff"/>
  <path d="M17 27h30" stroke="#22b8a7" stroke-width="2.6"/>
  <rect x="21" y="15" width="2.8" height="8" rx="1.4" fill="#22b8a7"/>
  <rect x="21" y="31" width="2.8" height="11" rx="1.4" fill="#22b8a7"/>
  <circle cx="31" cy="40" r="2.3" fill="#1d3557"/>
  <circle cx="40" cy="40" r="2.3" fill="#1d3557"/>
  <circle cx="28.5" cy="45" r="1.9" fill="#ff8fa3" opacity=".8"/>
  <circle cx="42.5" cy="45" r="1.9" fill="#ff8fa3" opacity=".8"/>
  <path d="M31.5 46.5q4 3.6 8 0" stroke="#1d3557" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M42 12c1-4 4-6 8-6-1 4-3 6-8 6z" fill="#7ed957"/>
  <path d="M44 13c3-2 6-2 9 0-3 2-6 2-9 0z" fill="#4caf50"/>
  <path d="M40 9l2 6 3-1z" fill="#ff8c1a"/>
  <path d="M51 22l1.4 3 3 1.4-3 1.4-1.4 3-1.4-3-3-1.4 3-1.4z" fill="#ffd166"/>
</svg>`;

/* Emoji associé à un ingrédient ou à un plat, pour donner un peu de couleur. */
const FOOD_EMOJIS = [
  [/tomate/, "🍅"], [/oeuf/, "🥚"], [/carotte/, "🥕"], [/pomme(s)? de terre|patate/, "🥔"], [/oignon|echalote/, "🧅"],
  [/\bail\b|gousse/, "🧄"], [/champignon|cepe|girolle/, "🍄"], [/courgette|concombre|cornichon/, "🥒"],
  [/poivron/, "🫑"], [/piment/, "🌶️"], [/aubergine/, "🍆"], [/brocoli|chou/, "🥦"], [/laitue|salade|epinard|roquette|mache|poireau|blette/, "🥬"],
  [/mais\b/, "🌽"], [/avocat/, "🥑"], [/citron|lime/, "🍋"], [/orange|clementine|mandarine/, "🍊"], [/banane/, "🍌"],
  [/fraise/, "🍓"], [/framboise|myrtille|cerise|fruits rouges/, "🍒"], [/raisin/, "🍇"], [/peche|abricot|nectarine/, "🍑"],
  [/poire/, "🍐"], [/pomme/, "🍎"], [/ananas/, "🍍"], [/mangue/, "🥭"], [/kiwi/, "🥝"], [/noix de coco|coco/, "🥥"],
  [/fromage blanc|lait|creme|yaourt|yogourt/, "🥛"],
  [/fromage|emmental|gruyere|comte|mozzarella|parmesan|chevre|feta|camembert|raclette|ricotta|mascarpone/, "🧀"],
  [/beurre/, "🧈"], [/jambon|lardon|bacon|chorizo|saucisson/, "🥓"],
  [/poulet|dinde|volaille|canard/, "🍗"], [/boeuf|steak|veau|agneau|porc|viande|hache/, "🥩"], [/saucisse|merguez/, "🌭"],
  [/crevette|gambas/, "🦐"], [/saumon|thon|cabillaud|poisson|truite|sardine|maquereau|colin/, "🐟"], [/moule|huitre|coquillage/, "🦪"],
  [/pain|baguette|brioche/, "🥖"], [/riz|risotto/, "🍚"], [/pate|spaghetti|tagliatelle|penne|lasagne|nouille|coquillette/, "🍝"],
  [/farine|semoule|ble|avoine|quinoa|boulgour/, "🌾"], [/sucre|miel|sirop/, "🍯"], [/chocolat|cacao/, "🍫"],
  [/huile|olive/, "🫒"], [/persil|basilic|coriandre|menthe|ciboulette|thym|romarin|herbe|aneth|estragon|laurier/, "🌿"],
  [/\bsel\b|poivre|epice|cumin|curry|paprika|cannelle|muscade/, "🧂"], [/\bvin\b|biere/, "🍷"], [/\beau\b|bouillon/, "💧"],
  [/haricot|lentille|pois|feve/, "🫘"], [/noix|noisette|amande|cacahuete|pistache/, "🥜"], [/gingembre/, "🫚"],
  [/pizza/, "🍕"], [/burger/, "🍔"], [/soupe|veloute|potage/, "🍲"], [/tajine|couscous/, "🍛"],
  [/gateau|cake|fondant|moelleux|cheesecake/, "🍰"], [/tarte|quiche|tourte/, "🥧"], [/crepe|pancake|gaufre/, "🥞"],
  [/omelette/, "🍳"], [/gratin|cocotte|mijote|ragout|bourguignon|blanquette|hachis/, "🥘"], [/wrap|burrito/, "🌯"],
  [/cafe\b/, "☕"], [/\bthe\b|infusion|tisane/, "🍵"], [/papier toilette|mouchoir|sopalin|essuie/, "🧻"],
  [/lessive|adoucissant/, "🧺"], [/savon|gel douche|shampo/, "🧼"], [/eponge|vaisselle|nettoyant/, "🧽"],
  [/dentifrice|brosse a dent/, "🪥"], [/couche/, "👶"], [/jus\b/, "🧃"], [/soda|coca|limonade/, "🥤"],
  [/cereale/, "🥣"], [/clementine|mandarine/, "🍊"],
  [/taco/, "🌮"], [/sushi|maki/, "🍣"], [/cookie|biscuit|sable/, "🍪"], [/glace|sorbet/, "🍨"], [/sandwich|croque/, "🥪"],
];
/* Mots qui désignent un plat : prioritaires sur les ingrédients pour l'image d'une recette. */
const DISH_FIRST = /pizza|burger|soupe|veloute|potage|tajine|couscous|gateau|cake|fondant|moelleux|tarte|quiche|tourte|crepe|pancake|gaufre|omelette|gratin|cocotte|ragout|bourguignon|blanquette|hachis|wrap|burrito|taco|sushi|cookie|glace|sorbet|sandwich|croque|salade|risotto|curry/;

const foldText = (text) =>
  String(text || "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "");

function foodEmoji(text) {
  const t = foldText(text);
  for (const [re, emoji] of FOOD_EMOJIS) if (re.test(t)) return emoji;
  return "";
}

function dishEmoji(title) {
  const t = foldText(title);
  const dish = t.match(DISH_FIRST);
  if (dish) return { salade: "🥗", curry: "🍛", risotto: "🍚" }[dish[0]] || foodEmoji(dish[0]);
  return foodEmoji(t);
}

const emojiFor = (title) => dishEmoji(title) || EMOJIS[hashHue(title) % EMOJIS.length];
const ingEmoji = (name) => foodEmoji(name) || "🥄";

/* Rayons du magasin, dans l'ordre où on les parcourt habituellement. */
const AISLES = [
  { key: "fruits", label: "Fruits et légumes", emoji: "🥦" },
  { key: "pain", label: "Boulangerie", emoji: "🥖" },
  { key: "viande", label: "Boucherie et poissonnerie", emoji: "🥩" },
  { key: "frais", label: "Crèmerie et frais", emoji: "🧀" },
  { key: "epicerie", label: "Épicerie", emoji: "🥫" },
  { key: "surgeles", label: "Surgelés", emoji: "🧊" },
  { key: "boissons", label: "Boissons", emoji: "🧃" },
  { key: "maison", label: "Maison et hygiène", emoji: "🧴" },
  { key: "autres", label: "Autres", emoji: "🛒" },
];
/* Règles testées dans cet ordre (les cas particuliers d'abord). */
const AISLE_RULES = [
  ["maison", /papier|sopalin|essuie|lessive|vaisselle|eponge|savon|shampo|dentifrice|gel douche|poubelle|deodorant|coton|mouchoir|couche|nettoyant|javel|film alimentaire|aluminium|cuisson|piles?\b|ampoule|adoucissant|rasoir|serviette/],
  ["surgeles", /surgele|glace|sorbet|frites|congel|\bbatonnets? de poisson/],
  ["boissons", /\beau\b|\bjus\b|soda|\bvin\b|biere|cidre|limonade|\bcoca\b|\bthe glace|sirop/],
  ["epicerie", /lait de coco|en boite|pois chiche|haricots? (rouges?|blancs?)|concentre|coulis|sauce tomate|pelees|concassees|cornichon|olive|capre|thon\b(?! frais)/],
  ["pain", /\bpain|baguette|brioche|croissant|viennoiserie|biscotte|tortilla|\bwrap/],
  ["frais", /\blait\b|creme|yaourt|yogourt|fromage|emmental|gruyere|comte|mozzarella|parmesan|chevre|feta|camembert|raclette|ricotta|mascarpone|beurre|\boeuf|margarine|skyr|petits? suisses?|pate (brisee|feuilletee|sablee|a pizza)|gnocchi|tofu|houmous|traiteur/],
  ["viande", /poulet|dinde|volaille|canard|boeuf|steak|veau|agneau|porc|viande|hache|saucisse|merguez|jambon|lardon|bacon|chorizo|saucisson|crevette|gambas|saumon|cabillaud|poisson|truite|sardine|maquereau|colin|moule|huitre|escalope|\broti|\bcote|cuisse|thon frais|lapin/],
  ["fruits", /tomate|carotte|pomme|patate|oignon|echalote|\bail\b|champignon|courgette|concombre|poivron|piment|aubergine|brocoli|\bchou|salade|laitue|epinard|roquette|mache|poireau|blette|\bmais\b|avocat|citron|orange|clementine|mandarine|banane|fraise|framboise|myrtille|cerise|raisin|peche|abricot|nectarine|poire|ananas|mangue|kiwi|melon|pasteque|legume|fruit|persil|basilic|coriandre|menthe|ciboulette|thym|romarin|aneth|gingembre|radis|navet|celeri|fenouil|asperge|haricots? verts?|petits? pois|courge|potiron|butternut|betterave|artichaut|figue|prune|grenade|endive/],
  ["epicerie", /farine|sucre|\bsel\b|poivre|huile|vinaigre|\briz\b|pates?\b|spaghetti|tagliatelle|penne|lasagne|nouille|coquillette|semoule|quinoa|boulgour|lentille|haricot|conserve|sauce|moutarde|ketchup|mayonnaise|epice|cumin|curry|paprika|cannelle|muscade|bouillon|chocolat|cacao|cafe|\bthe\b|cereale|biscuit|miel|confiture|levure|maizena|fecule|noix|noisette|amande|cacahuete|pistache|chips|compote|puree|soupe|vanille|herbes de provence/],
];

function aisleOf(text) {
  const t = foldText(String(text || "").replace(/\(.*?\)/g, " "));
  for (const [key, re] of AISLE_RULES) if (re.test(t)) return key;
  return "autres";
}

/* Réglages du foyer (mêmes clés que household.py). */
const HH = {
  ages: { adult: ["Adulte", "🧑"], teen: ["Ado", "🧑‍🎓"], child: ["Enfant", "🧒"], toddler: ["Tout-petit", "👶"] },
  diets: {
    omnivore: "Mange de tout", flexitarian: "Flexitarien", vegetarian: "Végétarien", vegan: "Vegan",
    pescetarian: "Pescétarien", no_pork: "Sans porc", halal: "Halal",
  },
  allergens: {
    gluten: "Gluten", milk: "Lait / lactose", eggs: "Œufs", peanuts: "Arachides", nuts: "Fruits à coque",
    fish: "Poisson", crustaceans: "Crustacés", molluscs: "Mollusques", soy: "Soja", sesame: "Sésame",
    celery: "Céleri", mustard: "Moutarde", sulphites: "Sulfites", lupin: "Lupin",
  },
  spice: { mild: "Doux 🙂", medium: "Un peu 🌶️", hot: "Relevé 🔥" },
  equipment: {
    oven: "Four", microwave: "Micro-ondes", airfryer: "Airfryer", multicooker: "Robot cuiseur",
    pressure_cooker: "Autocuiseur", slow_cooker: "Mijoteuse", bbq: "Barbecue / plancha", steamer: "Cuiseur vapeur",
  },
  cuisines: {
    french: "🇫🇷 Française", italian: "🇮🇹 Italienne", asian: "🥢 Asiatique", mediterranean: "🫒 Méditerranéenne",
    mexican: "🌮 Mexicaine", indian: "🍛 Indienne", middle_eastern: "🧆 Orientale", comfort: "🫕 Réconfortante",
  },
  goals: {
    balanced: "⚖️ Équilibré", light: "🥗 Léger", protein: "💪 Protéiné", budget: "💶 Petit budget",
    quick: "⚡ Rapide", seasonal: "🍂 De saison", zero_waste: "♻️ Anti-gaspi",
  },
};
const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const PLAN_LOADING = [
  "J'épluche le calendrier…", "Je fais le tour des produits de saison…", "Je vérifie les allergies du foyer…",
  "J'organise les restes pour ne rien jeter…", "Je compte les euros…", "Je dresse la table…",
];
const clone = (o) => JSON.parse(JSON.stringify(o));

const DEFAULT_QUICK = ["Lait", "Pain", "Œufs", "Beurre", "Bananes", "Pommes", "Yaourts", "Café", "Fromage râpé", "Papier toilette"];

async function resizeImage(file, maxSide = 1568, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image illisible"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const icon = (name) => `<ha-icon icon="mdi:${name}"></ha-icon>`;
/* Icône dans une pastille colorée, pour les titres de section. */
const bubble = (name, color) => `<span class="bubble" style="--c:${color}">${icon(name)}</span>`;
const COLORS = {
  green: "#43a047", orange: "#fb8c00", purple: "#8e24aa", blue: "#1e88e5", teal: "#22b8a7",
  pink: "#e91e63", amber: "#f9a825", indigo: "#5c6bc0", red: "#e53935",
};

/* ------------------------------------------------------------------ styles */

const STYLES = `
:host {
  --fm-primary: var(--primary-color, #03a9f4);
  --fm-on-primary: var(--text-primary-color, #fff);
  --fm-bg: var(--primary-background-color, #fafafa);
  --fm-card: var(--card-background-color, var(--ha-card-background, #fff));
  --fm-text: var(--primary-text-color, #212121);
  --fm-text2: var(--secondary-text-color, #727272);
  --fm-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
  --fm-header-bg: var(--app-header-background-color, var(--fm-primary));
  --fm-header-text: var(--app-header-text-color, var(--fm-on-primary));
  --fm-error: var(--error-color, #db4437);
  --fm-success: var(--success-color, #43a047);
  --fm-warning: var(--warning-color, #ffa600);
  --fm-radius: var(--ha-card-border-radius, 12px);
  --fm-soft: color-mix(in srgb, var(--fm-primary) 12%, transparent);
  --fm-nav-h: 64px;
  display: block;
  height: 100%;
  background: var(--fm-bg);
  color: var(--fm-text);
  font-family: var(--paper-font-body1_-_font-family, var(--ha-font-family-body, Roboto, "Helvetica Neue", sans-serif));
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
ha-icon { --mdc-icon-size: 22px; display: inline-flex; }
button { font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
input, textarea, select { font: inherit; color: var(--fm-text); }

.app { position: relative; display: flex; flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden; }
.toolbar {
  display: flex; align-items: center; gap: 4px;
  height: var(--header-height, 56px); padding: 0 8px 0 4px; flex-shrink: 0;
  background: var(--fm-header-bg); color: var(--fm-header-text);
  padding-top: env(safe-area-inset-top);
  box-sizing: content-box;
  border-bottom: var(--app-header-border-bottom, none);
}
.toolbar .title { font-size: 20px; font-weight: 400; margin-left: 12px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn {
  width: 44px; height: 44px; border-radius: 50%; border: 0; background: transparent;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.icon-btn:hover { background: color-mix(in srgb, currentColor 10%, transparent); }

main { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.page { max-width: 760px; margin: 0 auto; padding: 16px 16px 32px; }

nav.tabs {
  flex-shrink: 0; z-index: 5;
  display: flex; justify-content: center;
  background: var(--fm-card); border-top: 1px solid var(--fm-divider);
  padding-bottom: env(safe-area-inset-bottom);
}
nav.tabs .inner { display: flex; width: 100%; max-width: 520px; }
nav.tabs button {
  flex: 1; height: var(--fm-nav-h); border: 0; background: none; color: var(--fm-text2);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: 12px; font-weight: 500;
}
nav.tabs button .pill { display: inline-flex; padding: 4px 18px; border-radius: 16px; transition: background .2s; }
nav.tabs button.active { color: var(--fm-primary); }
nav.tabs button.active .pill { background: var(--fm-soft); }
nav.tabs .pill { position: relative; }
.badge {
  position: absolute; top: -4px; right: 2px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: var(--fm-error); color: #fff; font-size: 11px; font-weight: 600; line-height: 18px; text-align: center;
}
.toolbar .icon-btn.cart { position: relative; }
.toolbar .icon-btn.cart .badge { top: 4px; right: 2px; }

/* Réglages, planification, photo */
.set-sec { margin: 22px 0 8px; display: flex; align-items: center; gap: 10px; }
.set-sec h3 { margin: 0; flex: 1; }
.member { display: flex; align-items: center; gap: 12px; padding: 10px 12px; width: 100%; text-align: left; margin-bottom: 8px;
  background: var(--fm-card); border: 1px solid var(--fm-divider); border-radius: var(--fm-radius); }
.member .av { font-size: 28px; width: 40px; text-align: center; }
.member .m { font-size: 13px; color: var(--fm-text2); }
.switch { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.switch .grow { font-size: 15px; }
.switch .sub { font-size: 12px; color: var(--fm-text2); }
.toggle { width: 48px; height: 28px; border-radius: 14px; border: 0; background: var(--fm-divider); position: relative; flex-shrink: 0; padding: 0; }
.toggle::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.toggle.on { background: var(--fm-primary); }
.toggle.on::after { left: 23px; }
select.input { appearance: auto; }
.aisle-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--fm-divider); }
.aisle-row:first-child { border-top: 0; }
.aisle-row .n { width: 22px; color: var(--fm-text2); font-size: 13px; text-align: center; }
.aisle-row .icon-btn { width: 36px; height: 36px; }
.plan-day { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--fm-divider); }
.plan-day:first-child { border-top: 0; }
.plan-day .d { width: 76px; font-weight: 500; }
.plan-day .chip { min-height: 36px; }
.plan-day .chip.taken { opacity: .5; text-decoration: line-through; }
.pmeal { display: flex; gap: 12px; align-items: flex-start; }
.pmeal .thumb { width: 52px; height: 52px; font-size: 26px; }
.pmeal .when { font-size: 12px; color: var(--fm-text2); text-transform: uppercase; letter-spacing: .04em; }
.pmeal .t { font-weight: 500; font-size: 16px; margin: 2px 0; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.badges .tag.alt { background: color-mix(in srgb, var(--fm-success) 15%, transparent); color: var(--fm-success); }
.badges .tag.gold { background: color-mix(in srgb, var(--fm-warning) 18%, transparent); color: color-mix(in srgb, var(--fm-warning) 80%, var(--fm-text)); }
.meal .note { flex-basis: 100%; font-size: 12px; color: var(--fm-success); padding: 0 8px 4px 0; }
.pages { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; margin: 12px 0; }
.pages .pg { position: relative; aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden; border: 1px solid var(--fm-divider); }
.pages .pg img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pages .pg .icon-btn { position: absolute; top: 4px; right: 4px; width: 32px; height: 32px; background: rgba(0,0,0,.55); color: #fff; }
.pages .pg .num { position: absolute; left: 6px; bottom: 6px; background: rgba(0,0,0,.55); color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 10px; }
.hh-hint { font-size: 13px; color: var(--fm-text2); display: flex; align-items: center; gap: 6px; margin: 4px 0 12px; }
.hh-hint ha-icon { --mdc-icon-size: 18px; color: var(--fm-success); }
.store-pick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0 4px; }
.store-pick .lbl { font-size: 13px; color: var(--fm-text2); display: inline-flex; align-items: center; gap: 4px; }

/* Courses */
.quickbox .row { margin-bottom: 10px; }
.chip.add { border-style: dashed; }
.chip.add ha-icon { --mdc-icon-size: 16px; }
.aisle { padding: 4px 14px 6px; }
.aisle-title { display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 14px; color: var(--fm-text2); padding: 10px 0 4px; }
.aisle-title .n { margin-left: auto; font-size: 12px; }
.li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--fm-divider); }
.aisle-title + .li { border-top: 0; }
.li .tick {
  width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--fm-divider); background: none; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center; color: transparent; padding: 0;
}
.li .tick ha-icon { --mdc-icon-size: 18px; }
.li.done .tick { background: var(--fm-success); border-color: var(--fm-success); color: #fff; }
.li .txt { flex: 1; min-width: 0; cursor: pointer; }
.li .txt .d { font-size: 12px; color: var(--fm-text2); }
.li.done .txt > div:first-child { text-decoration: line-through; color: var(--fm-text2); }
.li .icon-btn { width: 36px; height: 36px; color: var(--fm-text2); }
.li .icon-btn ha-icon { --mdc-icon-size: 20px; }
.list-head { display: flex; align-items: center; gap: 8px; margin: 18px 0 10px; }
.list-head h3 { margin: 0; flex: 1; }
.menu-card .row { justify-content: space-between; }
.menu-card .stat { font-size: 14px; }

h2 { font-size: 22px; font-weight: 500; margin: 4px 0 4px; }
h3 { font-size: 17px; font-weight: 500; margin: 20px 0 8px; }
p.muted, .muted { color: var(--fm-text2); }
.small { font-size: 13px; }

.card {
  background: var(--fm-card); border-radius: var(--fm-radius);
  box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.08));
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--fm-divider));
  padding: 16px; margin-bottom: 12px;
}

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 22px; border: 0;
  background: var(--fm-primary); color: var(--fm-on-primary); font-weight: 500; font-size: 15px;
}
.btn:disabled { opacity: .5; cursor: default; }
.btn.block { width: 100%; }
.btn.big { min-height: 56px; font-size: 16px; border-radius: 28px; }
.btn.tonal { background: var(--fm-soft); color: var(--fm-primary); }
.btn.outline { background: transparent; color: var(--fm-primary); border: 1px solid var(--fm-divider); }
.btn.text { background: transparent; color: var(--fm-primary); padding: 0 12px; }
.btn.danger { background: transparent; color: var(--fm-error); border: 1px solid var(--fm-divider); }
.btn.danger.armed { background: var(--fm-error); color: #fff; border-color: var(--fm-error); }
.row { display: flex; gap: 8px; align-items: center; }
.row.wrap { flex-wrap: wrap; }
.row.end { justify-content: flex-end; }
.grow { flex: 1; min-width: 0; }
.stack > * + * { margin-top: 10px; }

.field { display: block; margin-bottom: 14px; }
.field > span { display: block; font-size: 13px; color: var(--fm-text2); margin-bottom: 6px; }
.input, textarea.input {
  width: 100%; min-height: 48px; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--fm-divider); background: var(--fm-bg); outline: none; font-size: 16px;
}
textarea.input { min-height: 120px; resize: vertical; line-height: 1.45; }
.input:focus { border-color: var(--fm-primary); box-shadow: 0 0 0 1px var(--fm-primary); }

.segmented { display: flex; background: var(--fm-bg); border: 1px solid var(--fm-divider); border-radius: 22px; padding: 3px; }
.segmented button { flex: 1; min-height: 38px; border: 0; border-radius: 19px; background: transparent; color: var(--fm-text2); font-weight: 500; }
.segmented button.on { background: var(--fm-primary); color: var(--fm-on-primary); }

.stepper { display: inline-flex; align-items: center; border: 1px solid var(--fm-divider); border-radius: 22px; }
.stepper button { width: 40px; height: 40px; border: 0; background: none; color: var(--fm-primary); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
.stepper .val { min-width: 64px; text-align: center; font-weight: 500; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 4px; min-height: 34px; padding: 0 14px; border-radius: 17px;
  border: 1px solid var(--fm-divider); background: var(--fm-card); font-size: 14px; color: var(--fm-text);
}
.chip.on { background: var(--fm-soft); border-color: transparent; color: var(--fm-primary); font-weight: 500; }
.tag { display: inline-block; font-size: 12px; padding: 3px 10px; border-radius: 12px; background: var(--fm-soft); color: var(--fm-primary); }

.logo { width: 34px; height: 34px; flex-shrink: 0; display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.15)); }
.bubble {
  display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c);
}
.bubble ha-icon { --mdc-icon-size: 19px; }
.sec { display: flex; align-items: center; gap: 10px; margin: 22px 0 10px; }
.sec h3 { margin: 0; flex: 1; }
.ico { color: var(--c, currentColor); display: inline-flex; }
.ing-emoji { width: 28px; text-align: center; font-size: 20px; flex-shrink: 0; }
.field > span ha-icon, .muted.row ha-icon { --mdc-icon-size: 18px; vertical-align: -4px; }
.version { text-align: center; font-size: 12px; color: var(--fm-text2); margin-top: 18px; display: flex; align-items: center; justify-content: center; gap: 6px; }
.version ha-icon { --mdc-icon-size: 16px; }
.update {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin-bottom: 12px; border-radius: var(--fm-radius); flex-wrap: wrap;
  background: color-mix(in srgb, #22b8a7 14%, var(--fm-card)); border: 1px solid color-mix(in srgb, #22b8a7 40%, transparent);
}
.update .grow { font-size: 14px; min-width: 160px; }
.update b { display: block; }
.toast { display: flex; align-items: center; gap: 10px; }
.toast ha-icon { --mdc-icon-size: 20px; flex-shrink: 0; }
@keyframes wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-6deg); } 75% { transform: rotate(6deg); } }

/* Écran Frigo */
.hero { text-align: center; padding: 28px 20px; }
.hero .emoji { font-size: 64px; line-height: 1; }
.hero .logo { width: 96px; height: 96px; margin: 0 auto; animation: wiggle 2.4s ease-in-out .4s 2; }
.hero .perks { display: flex; justify-content: center; gap: 12px; margin: -4px 0 20px; flex-wrap: wrap; }
.hero .perks > span { display: inline-flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: var(--fm-text2); width: 84px; }
.hero h2 { margin-top: 12px; }
.hero p { margin: 8px auto 20px; max-width: 420px; }
.hidden-input { display: none; }
.photo { width: 100%; max-height: 260px; object-fit: cover; border-radius: var(--fm-radius); display: block; }
.photo-wrap { position: relative; margin-bottom: 12px; }
.photo-wrap .scan {
  position: absolute; inset: 0; border-radius: var(--fm-radius); background: rgba(0,0,0,.45); color: #fff;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 16px;
}
.spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid color-mix(in srgb, currentColor 25%, transparent); border-top-color: currentColor; animation: spin .9s linear infinite; }
.spinner.sm { width: 18px; height: 18px; border-width: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }

.ing-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid var(--fm-divider); }
.ing-row:last-child { border-bottom: 0; }
.ing-row input { flex: 1; min-width: 0; border: 0; background: transparent; min-height: 40px; font-size: 16px; outline: none; padding: 0 4px; }
.ing-row input.amount { flex: 0 0 96px; color: var(--fm-text2); font-size: 14px; text-align: right; }
.ing-row .icon-btn { width: 36px; height: 36px; color: var(--fm-text2); }

.result { cursor: pointer; }
.result .head { display: flex; gap: 12px; align-items: flex-start; }
.result h4 { margin: 0 0 4px; font-size: 17px; font-weight: 500; }
.result .uses { font-size: 13px; margin-top: 8px; }
.result .uses b { font-weight: 500; }
.ok { color: var(--fm-success); }
.warn { color: var(--fm-warning); }

/* Carnet */
.search { position: relative; margin-bottom: 12px; }
.search ha-icon { position: absolute; left: 12px; top: 13px; color: var(--fm-text2); }
.search .input { padding-left: 44px; }
.list-item {
  display: flex; gap: 12px; align-items: center; padding: 10px; margin-bottom: 8px; width: 100%; text-align: left;
  background: var(--fm-card); border: 1px solid var(--fm-divider); border-radius: var(--fm-radius);
}
.thumb {
  width: 64px; height: 64px; border-radius: 10px; flex-shrink: 0; object-fit: cover;
  display: flex; align-items: center; justify-content: center; font-size: 30px;
}
.list-item .t { font-weight: 500; font-size: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.list-item .m { font-size: 13px; color: var(--fm-text2); margin-top: 2px; }
.star { color: var(--fm-warning); }
.empty { text-align: center; padding: 40px 16px; color: var(--fm-text2); }
.empty .emoji { font-size: 48px; }

/* Semaine */
.week-nav { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; }
.week-nav .label { flex: 1; text-align: center; font-weight: 500; }
.day { padding: 12px 14px; }
.day.today { border-color: var(--fm-primary); box-shadow: 0 0 0 1px var(--fm-primary); }
.day .dname { font-weight: 500; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
.day .dname .now { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: var(--fm-primary); color: var(--fm-on-primary); }
.slot { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; }
.slot + .slot { border-top: 1px dashed var(--fm-divider); }
.slot .sl { width: 44px; flex-shrink: 0; font-size: 11px; color: var(--fm-text2); padding-top: 4px; text-transform: uppercase; letter-spacing: .04em; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.slot .sl ha-icon { --mdc-icon-size: 20px; }
.slot .meals { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.meal { display: flex; flex-wrap: wrap; align-items: center; gap: 0 4px; background: var(--fm-soft); border-radius: 10px; padding: 2px 2px 2px 12px; }
.meal .name { flex: 1 1 100%; min-width: 0; border: 0; background: none; text-align: left; padding: 8px 8px 0 0; font-weight: 500; line-height: 1.3; }
.meal .ctrls { flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
.meal .ctrls .incart { margin-right: auto; display: inline-flex; align-items: center; gap: 4px; }
.meal .pers { font-size: 12px; color: var(--fm-text2); white-space: nowrap; }
.meal .icon-btn { width: 34px; height: 34px; color: var(--fm-text2); }
.add-meal { align-self: flex-start; border: 1px dashed var(--fm-divider); background: none; color: var(--fm-text2); border-radius: 10px; min-height: 38px; padding: 0 12px; display: inline-flex; align-items: center; gap: 4px; font-size: 14px; }

/* Feuilles plein écran */
.sheet {
  position: absolute; inset: 0; z-index: 10; background: var(--fm-bg); display: flex; flex-direction: column;
  animation: up .2s ease-out;
}
#overlay.same .sheet { animation: none; }
@keyframes up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.sheet .toolbar { background: var(--fm-card); color: var(--fm-text); border-bottom: 1px solid var(--fm-divider); }
.sheet .body { flex: 1; overflow-y: auto; }
.sheet .body .page { padding-bottom: 120px; }
.sheet .footer {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: var(--fm-card); border-top: 1px solid var(--fm-divider);
  display: flex; gap: 8px; justify-content: center;
}
.sheet .footer .inner { display: flex; gap: 8px; width: 100%; max-width: 728px; }

.cover { width: 100%; max-height: 280px; object-fit: cover; border-radius: var(--fm-radius); display: block; margin-bottom: 12px; }
.meta { display: flex; flex-wrap: wrap; gap: 16px; color: var(--fm-text2); font-size: 14px; margin: 10px 0; }
.meta span { display: inline-flex; align-items: center; gap: 4px; }
.meta ha-icon { --mdc-icon-size: 18px; }
ul.ings { list-style: none; padding: 0; margin: 0; }
ul.ings li { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--fm-divider); }
ul.ings li:last-child { border-bottom: 0; }
ul.ings .q { min-width: 92px; color: var(--fm-primary); font-weight: 500; }
ol.steps { padding: 0; margin: 0; list-style: none; counter-reset: s; }
ol.steps li { counter-increment: s; display: flex; gap: 12px; padding: 10px 0; line-height: 1.5; }
ol.steps li::before {
  content: counter(s); flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; background: var(--fm-soft); color: var(--fm-primary);
  display: inline-flex; align-items: center; justify-content: center; font-weight: 500; font-size: 14px;
}
.actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
a.src { color: var(--fm-primary); word-break: break-all; font-size: 13px; }

/* Mode cuisine */
.cook { background: var(--fm-card); }
.cook .progress { height: 4px; background: var(--fm-divider); }
.cook .progress div { height: 100%; background: var(--fm-primary); transition: width .25s; }
.cook .stepbox { flex: 1; overflow-y: auto; display: flex; flex-direction: column; justify-content: center; padding: 24px 24px; max-width: 820px; margin: 0 auto; width: 100%; }
.cook .num { color: var(--fm-primary); font-weight: 500; font-size: 15px; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 12px; }
.cook .txt { font-size: clamp(22px, 5.4vw, 34px); line-height: 1.4; }
.cook .done { text-align: center; }
.cook .done .emoji { font-size: 72px; }
.cook .nav { display: flex; gap: 12px; padding: 12px 16px calc(16px + env(safe-area-inset-bottom)); max-width: 820px; margin: 0 auto; width: 100%; }
.cook .nav .btn { flex: 1; min-height: 64px; font-size: 18px; border-radius: 32px; }
.cook .ingpanel { border-bottom: 1px solid var(--fm-divider); max-height: 40vh; overflow-y: auto; padding: 4px 24px; }

.check { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--fm-divider); }
.check input { width: 22px; height: 22px; accent-color: var(--fm-primary); flex-shrink: 0; }
.check .sub { font-size: 12px; color: var(--fm-text2); }

.toast {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--fm-nav-h) + 16px + env(safe-area-inset-bottom)); z-index: 20;
  background: var(--fm-text); color: var(--fm-card); padding: 12px 18px; border-radius: 10px; max-width: calc(100% - 32px); width: max-content;
  box-shadow: 0 4px 16px rgba(0,0,0,.25); font-size: 14px; animation: up .2s ease-out;
}
.toast.error { background: var(--fm-error); color: #fff; }
.alert { padding: 12px 14px; border-radius: 10px; background: color-mix(in srgb, var(--fm-error) 12%, transparent); color: var(--fm-error); margin-bottom: 12px; font-size: 14px; }
.info { padding: 12px 14px; border-radius: 10px; background: var(--fm-soft); font-size: 14px; margin-bottom: 12px; }

@media (min-width: 870px) {
  .page { padding-top: 24px; }
}
`;

/* ------------------------------------------------------------------ panneau */

class FrigoMalinPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._narrow = false;
    this.s = {
      tab: "fridge",
      config: null,
      recipes: [],
      loaded: false,
      search: "",
      filter: "all",
      fridge: this._freshFridge(),
      week: { start: mondayOf(new Date()), entries: [], loading: false },
      list: { items: [], loaded: false, error: null, quick: "", showDone: false, menuWeek: "this", menu: null },
      suggestions: [],
      stack: [],
      toast: null,
    };
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("input", (ev) => this._onInput(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => this._onKey(ev));
    this.shadowRoot.addEventListener("touchstart", (ev) => (this._touchX = ev.touches[0].clientX), { passive: true });
    this.shadowRoot.addEventListener("touchend", (ev) => this._onSwipe(ev), { passive: true });
  }

  _freshFridge(servings) {
    return {
      step: "start",
      photo: null,
      ingredients: [],
      newIng: "",
      style: "classic",
      servings: servings || this.s?.config?.default_servings || 4,
      count: 3,
      notes: "",
      results: [],
      error: null,
    };
  }

  /* ---------------- propriétés données par Home Assistant */

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init();
  }
  get hass() {
    return this._hass;
  }
  set narrow(value) {
    const changed = this._narrow !== value;
    this._narrow = value;
    if (changed && this._hass) this._render();
  }
  set panel(_) {}
  set route(_) {}

  connectedCallback() {
    if (this._hass && !this.shadowRoot.firstChild) this._render();
    if (this._hass && this.s.config) {
      this._subscribeList();
      if (!this._onLocation) {
        this._onLocation = () => setTimeout(() => this._applyRoute(), 0);
        window.addEventListener("location-changed", this._onLocation);
      }
      this._applyRoute();
    }
  }

  disconnectedCallback() {
    this._releaseWakeLock();
    this._unsubscribeList();
    if (this._onLocation) {
      window.removeEventListener("location-changed", this._onLocation);
      this._onLocation = null;
    }
  }

  async _init() {
    this._render();
    try {
      const [config, list] = await Promise.all([this._ws("config"), this._ws("recipes/list")]);
      this.s.config = config;
      this.s.recipes = list.recipes;
      this.s.fridge.servings = config.default_servings;
    } catch (err) {
      this._toast(this._err(err), true);
    }
    this.s.loaded = true;
    try {
      this.s.list.storeId = localStorage.getItem("frigo-malin-store") || null;
    } catch (_) {
      /* stockage local indisponible */
    }
    this._render();
    this._subscribeList();
    this._loadSuggestions();
    this._applyRoute();
    if (!this._onLocation) {
      this._onLocation = () => setTimeout(() => this._applyRoute(), 0);
      window.addEventListener("location-changed", this._onLocation);
    }
  }

  /* Liens directs : /frigo-malin?tab=shopping&store=…, ?recipe=…&cook=1 (notifications, carte du tableau de bord). */
  _applyRoute() {
    if (!this.s.loaded || !this.isConnected) return;
    const params = new URLSearchParams(window.location.search);
    if (![...params.keys()].length) return;
    const s = this.s;
    const tab = params.get("tab");
    if (["fridge", "recipes", "week", "shopping"].includes(tab)) {
      s.stack = [];
      s.tab = tab;
      if (tab === "week") this._loadWeek();
      if (tab === "shopping") this._loadMenuInfo();
    }
    const store = params.get("store");
    if (store && (this.settings.stores || []).some((x) => x.id === store)) this._pickStore(store);
    const recipe = this._recipe(params.get("recipe"));
    if (recipe) {
      const servings = Number(params.get("servings")) || recipe.servings || 4;
      s.stack = [{ type: "recipe", id: recipe.id, servings, confirmDelete: false }];
      if (params.get("cook") === "1") {
        s.stack.push({ type: "cook", id: recipe.id, servings, step: 0, showIng: false });
        this._requestWakeLock();
      }
    }
    history.replaceState(history.state, "", window.location.pathname);
    this._render();
  }

  get settings() {
    return (this.s.config && this.s.config.settings) || { members: [], stores: [], plan_slots: {} };
  }

  _pickStore(id) {
    this.s.list.storeId = id || null;
    try {
      if (id) localStorage.setItem("frigo-malin-store", id);
      else localStorage.removeItem("frigo-malin-store");
    } catch (_) {
      /* stockage local indisponible */
    }
  }

  /* ---------------- liste de courses de Home Assistant, en direct */

  get listEntity() {
    return this.s.config && this.s.config.shopping_list && this.s.config.shopping_list.entity_id;
  }

  async _subscribeList() {
    const entity_id = this.listEntity;
    if (!entity_id || this._listUnsub || this._listSubscribing) return;
    this._listSubscribing = true;
    try {
      this._listUnsub = await this._hass.connection.subscribeMessage(
        (msg) => {
          this.s.list.items = msg.items || [];
          this.s.list.loaded = true;
          this.s.list.error = null;
          this._renderListParts();
        },
        { type: "todo/item/subscribe", entity_id }
      );
    } catch (err) {
      this.s.list.error = this._err(err);
      this.s.list.loaded = true;
      this._renderListParts();
    }
    this._listSubscribing = false;
  }

  _unsubscribeList() {
    if (this._listUnsub) {
      try {
        this._listUnsub();
      } catch (_) {
        /* déjà fermé */
      }
      this._listUnsub = null;
    }
  }

  async _loadSuggestions() {
    try {
      const res = await this._ws("shopping/suggestions", { limit: 16 });
      this.s.suggestions = res.suggestions.map((x) => x.name);
    } catch (_) {
      this.s.suggestions = [];
    }
    this._renderListParts();
  }

  _todo(service, data) {
    return this._hass.callService("todo", service, data, { entity_id: this.listEntity });
  }

  get pendingItems() {
    return this.s.list.items.filter((i) => i.status !== "completed");
  }

  /* Met à jour les morceaux qui dépendent de la liste sans toucher aux champs en cours de saisie. */
  _renderListParts() {
    const root = this.shadowRoot;
    const nav = root.getElementById("nav");
    if (nav) nav.innerHTML = this._tplNav();
    const header = root.getElementById("header");
    if (header) header.innerHTML = this._tplHeader();
    const list = root.getElementById("shop-list");
    if (list) list.innerHTML = this._tplShopList();
    root.querySelectorAll(".quick-sugg").forEach((el) => (el.innerHTML = this._tplQuickChips()));
    const count = root.getElementById("quick-count");
    if (count) count.innerHTML = this._tplQuickCount();
  }

  async _quickAdd(texts) {
    const items = texts.flatMap((t) => String(t).split(/[,;\n]/)).map((t) => t.trim()).filter(Boolean);
    if (!items.length) return;
    if (!this.listEntity) {
      this._toast("Aucune liste de courses : choisissez-en une dans les options de Frigo Malin.", true);
      return;
    }
    try {
      const res = await this._ws("shopping/add", { items, quick: true });
      const parts = [];
      if (res.new.length) parts.push(`${res.new.join(", ")} ajouté${res.new.length > 1 ? "s" : ""}`);
      if (res.updated.length) parts.push(`${res.updated.join(", ")} mis à jour`);
      if (res.skipped.length) parts.push(`${res.skipped.join(", ")} déjà sur la liste`);
      this._toast(parts.join(" · ") || "Rien à ajouter");
      this._loadSuggestions();
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _loadMenuInfo() {
    const l = this.s.list;
    const start = l.menuWeek === "next" ? addDays(mondayOf(new Date()), 7) : mondayOf(new Date());
    try {
      const res = await this._ws("plan/list", { start, end: addDays(start, 6) });
      l.menu = { start, meals: res.entries.length, pending: res.entries.filter((e) => !e.in_shopping_list).length };
    } catch (err) {
      l.menu = { start, meals: 0, pending: 0, error: this._err(err) };
    }
    if (this.s.tab === "shopping") {
      const el = this.shadowRoot.getElementById("shop-menu");
      if (el) el.innerHTML = this._tplMenuCard();
    }
  }

  _ws(type, payload = {}) {
    return this._hass.callWS({ type: `frigo_malin/${type}`, ...payload });
  }

  _err(err) {
    return (err && (err.message || err.code)) || "Une erreur est survenue";
  }

  _toast(message, error = false) {
    clearTimeout(this._toastTimer);
    this.s.toast = { message, error };
    this._renderToast();
    this._toastTimer = setTimeout(() => {
      this.s.toast = null;
      this._renderToast();
    }, error ? 6000 : 4000);
  }

  /* ---------------- état lié aux champs */

  get top() {
    return this.s.stack[this.s.stack.length - 1];
  }

  _setPath(path, value) {
    const keys = path.split(".");
    let obj = keys[0] === "top" ? this.top : this.s;
    if (keys[0] === "top") keys.shift();
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
  }

  _onInput(ev) {
    const el = ev.target;
    const path = el.dataset && el.dataset.model;
    if (!path) return;
    const value = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
    this._setPath(path, value);
    if (el.dataset.live === "recipes") this._renderRecipeList();
    if (el.dataset.live === "pick") this._renderPickList();
  }

  async _onChange(ev) {
    const el = ev.target;
    const kind = el.dataset && el.dataset.change;
    if (kind === "book-photo" && el.files && el.files.length) {
      const files = [...el.files];
      el.value = "";
      for (const file of files) {
        if (this.top.pages.length >= 4) break;
        try {
          this.top.pages.push(await resizeImage(file, 2000, 0.85));
        } catch (_) {
          this._toast("Impossible de lire cette image", true);
        }
      }
      this._renderOverlay();
      return;
    }
    if (kind === "photo" && el.files && el.files[0]) {
      const file = el.files[0];
      el.value = "";
      await this._analysePhoto(file);
    } else if (kind === "notes-save") {
      const recipe = this._overlayRecipe();
      if (recipe && recipe.id) {
        try {
          const res = await this._ws("recipes/patch", { recipe_id: recipe.id, notes: el.value });
          this._replaceRecipe(res.recipe);
          this._toast("Notes enregistrées");
        } catch (err) {
          this._toast(this._err(err), true);
        }
      }
    } else if (kind === "shop-check") {
      this.top.items[Number(el.dataset.i)].checked = el.checked;
      this._renderOverlay();
    }
  }

  _onKey(ev) {
    if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.enter) {
      ev.preventDefault();
      this._dispatch(ev.target.dataset.enter, ev.target, ev);
    }
    if (ev.key === "Escape" && this.s.stack.length) this._dispatch("close");
  }

  _onSwipe(ev) {
    const top = this.top;
    if (!top || top.type !== "cook" || this._touchX == null) return;
    const dx = ev.changedTouches[0].clientX - this._touchX;
    this._touchX = null;
    if (Math.abs(dx) < 60) return;
    this._dispatch(dx < 0 ? "cook-next" : "cook-prev");
  }

  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset && n.dataset.action);
    if (!el || el.disabled) return;
    ev.preventDefault();
    this._dispatch(el.dataset.action, el, ev);
  }

  /* ---------------- actions */

  async _dispatch(action, el, ev) {
    const d = (el && el.dataset) || {};
    const s = this.s;
    switch (action) {
      case "menu":
        this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
        return;
      case "reload":
        window.location.reload();
        return;
      case "tab":
        s.tab = d.tab;
        if (s.tab === "week") this._loadWeek();
        if (s.tab === "shopping") {
          this._loadMenuInfo();
          this._subscribeList();
        }
        this._render();
        this.shadowRoot.querySelector("main")?.scrollTo(0, 0);
        return;
      case "close":
        if (this.top && this.top.type === "cook") this._releaseWakeLock();
        s.stack.pop();
        this._renderOverlay();
        return;

      /* Frigo */
      case "pick-photo":
        this.shadowRoot.getElementById(d.input).click();
        return;
      case "manual-list":
        s.fridge.step = "review";
        s.fridge.photo = null;
        this._render();
        return;
      case "ing-remove":
        s.fridge.ingredients.splice(Number(d.i), 1);
        this._render();
        return;
      case "ing-add": {
        const names = String(s.fridge.newIng || "").split(",").map((x) => x.trim()).filter(Boolean);
        if (!names.length) return;
        for (const name of names) s.fridge.ingredients.push({ name, amount: "" });
        s.fridge.newIng = "";
        this._render();
        this.shadowRoot.getElementById("new-ing")?.focus();
        return;
      }
      case "quick-open":
        s.stack.push({ type: "quick" });
        this._renderOverlay();
        this.shadowRoot.getElementById("quick-input-sheet")?.focus();
        return;
      case "quick-add": {
        const text = s.list.quick;
        s.list.quick = "";
        this.shadowRoot.querySelectorAll(".quick-input").forEach((input) => (input.value = ""));
        await this._quickAdd([text]);
        return;
      }
      case "quick-chip":
        await this._quickAdd([d.name]);
        return;
      case "list-toggle": {
        const item = s.list.items.find((i) => i.uid === d.uid);
        if (!item) return;
        const status = item.status === "completed" ? "needs_action" : "completed";
        item.status = status;
        this._renderListParts();
        this._todo("update_item", { item: d.uid, status }).catch((err) => this._toast(this._err(err), true));
        return;
      }
      case "list-remove":
        s.list.items = s.list.items.filter((i) => i.uid !== d.uid);
        this._renderListParts();
        this._todo("remove_item", { item: [d.uid] }).catch((err) => this._toast(this._err(err), true));
        return;
      case "list-show-done":
        s.list.showDone = !s.list.showDone;
        this._renderListParts();
        return;
      case "list-clear-done":
        this._todo("remove_completed_items", {})
          .then(() => this._toast("Panier vidé"))
          .catch((err) => this._toast(this._err(err), true));
        return;
      /* Réglages du foyer */
      case "settings-open":
        s.stack.push({ type: "settings", draft: clone(this.settings) });
        this._renderOverlay();
        return;
      case "settings-save":
        this._saveSettings();
        return;
      case "toggle-in": {
        const list = this._getPath(d.path) || [];
        const i = list.indexOf(d.value);
        if (i >= 0) list.splice(i, 1);
        else list.push(d.value);
        this._setPath(d.path, list);
        this._renderOverlay();
        return;
      }
      case "toggle-bool":
        this._setPath(d.path, !this._getPath(d.path));
        if (d.path.startsWith("top")) this._renderOverlay();
        else this._render();
        return;
      case "member-add":
        s.stack.push({ type: "member", index: -1, draft: { name: "", age: "adult", diet: "omnivore", allergies: [], dislikes: "", spice: "medium" } });
        this._renderOverlay();
        this.shadowRoot.getElementById("member-name")?.focus();
        return;
      case "member-edit":
        s.stack.push({ type: "member", index: Number(d.i), draft: clone(this.top.draft.members[Number(d.i)]) });
        this._renderOverlay();
        return;
      case "member-save": {
        const top = s.stack.pop();
        const members = this.top.draft.members;
        if (!String(top.draft.name).trim()) top.draft.name = HH.ages[top.draft.age][0];
        if (top.index >= 0) members[top.index] = top.draft;
        else members.push(top.draft);
        this._renderOverlay();
        return;
      }
      case "member-delete": {
        const top = s.stack.pop();
        if (top.index >= 0) this.top.draft.members.splice(top.index, 1);
        this._renderOverlay();
        return;
      }
      case "store-add":
        s.stack.push({ type: "store", index: -1, draft: { name: "", zone: "", aisles: AISLES.map((a) => a.key) } });
        this._renderOverlay();
        this.shadowRoot.getElementById("store-name")?.focus();
        return;
      case "store-edit":
        s.stack.push({ type: "store", index: Number(d.i), draft: clone(this.top.draft.stores[Number(d.i)]) });
        this._renderOverlay();
        return;
      case "store-save": {
        const top = s.stack.pop();
        const stores = this.top.draft.stores;
        if (!String(top.draft.name).trim()) top.draft.name = "Mon magasin";
        if (top.index >= 0) stores[top.index] = top.draft;
        else stores.push(top.draft);
        this._renderOverlay();
        return;
      }
      case "store-delete": {
        const top = s.stack.pop();
        if (top.index >= 0) this.top.draft.stores.splice(top.index, 1);
        this._renderOverlay();
        return;
      }
      case "aisle-move": {
        const list = this.top.draft.aisles;
        const i = Number(d.i);
        const j = i + Number(d.delta);
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        this._renderOverlay();
        return;
      }
      case "store-pick":
        this._pickStore(d.id);
        this._renderListParts();
        return;

      /* Photo d'une page de livre */
      case "book-open":
        s.stack.push({ type: "book", pages: [], loading: false, error: null });
        this._renderOverlay();
        return;
      case "book-remove":
        this.top.pages.splice(Number(d.i), 1);
        this._renderOverlay();
        return;
      case "book-read":
        this._readBook();
        return;

      /* Planifier la semaine */
      case "weekplan-open":
        this._openWeekPlan();
        return;
      case "weekplan-slot": {
        const key = `${d.date}|${d.slot}`;
        this.top.slots[key] = !this.top.slots[key];
        this._renderOverlay();
        return;
      }
      case "weekplan-generate":
        this._generateWeek();
        return;
      case "weekplan-remove":
        this.top.proposal.meals.splice(Number(d.i), 1);
        this._renderOverlay();
        return;
      case "weekplan-back":
        this.top.step = "form";
        this._renderOverlay();
        return;
      case "weekplan-apply":
        this._applyWeek();
        return;

      case "go-shopping":
        s.stack = [];
        s.tab = "shopping";
        this._loadMenuInfo();
        this._render();
        return;
      case "menu-week":
        s.list.menuWeek = d.value;
        s.list.menu = null;
        this._render();
        this._loadMenuInfo();
        return;
      case "menu-add":
        this._shoppingPreview(s.list.menu ? s.list.menu.start : mondayOf(new Date()));
        return;
      case "set":
        if (d.path === "top.onlyNew" && this.top && this.top.type === "shopping") {
          this.top.onlyNew = false;
          this._loadShopping(this.top);
          return;
        }
        this._setPath(d.path, d.value);
        if (d.path.startsWith("top.")) this._renderOverlay();
        else this._render();
        return;
      case "step":
        this._step(d.path, Number(d.delta), Number(d.min || 1), Number(d.max || 30));
        return;
      case "suggest":
        this._suggest();
        return;
      case "fridge-reset":
        s.fridge = this._freshFridge();
        this._render();
        return;
      case "fridge-back":
        s.fridge.step = "review";
        this._render();
        return;
      case "open-result":
        s.stack.push({ type: "recipe", draft: { ...s.fridge.results[Number(d.i)], origin: "ai" }, servings: s.fridge.results[Number(d.i)].servings || s.fridge.servings });
        this._renderOverlay();
        return;

      /* Carnet */
      case "filter":
        s.filter = d.value;
        this._render();
        return;
      case "open-recipe": {
        const r = this._recipe(d.id);
        if (!r) return;
        s.stack.push({ type: "recipe", id: r.id, servings: r.servings || 4, confirmDelete: false });
        this._renderOverlay();
        return;
      }
      case "new-recipe":
        s.stack.push({ type: "editor", draft: this._toDraft({ servings: s.config?.default_servings || 4 }) });
        this._renderOverlay();
        return;
      case "import-open":
        s.stack.push({ type: "import", url: "", loading: false, error: null });
        this._renderOverlay();
        this.shadowRoot.getElementById("import-url")?.focus();
        return;
      case "import":
        this._import();
        return;
      case "edit-recipe": {
        const r = this._overlayRecipe();
        s.stack.push({ type: "editor", draft: this._toDraft(r) });
        this._renderOverlay();
        return;
      }
      case "save-editor":
        this._saveEditor();
        return;
      case "favorite":
        this._toggleFavorite();
        return;
      case "delete-recipe":
        this._deleteRecipe();
        return;
      case "save-draft":
        await this._saveDraft();
        return;

      /* Mode cuisine */
      case "cook": {
        const top = this.top;
        s.stack.push({ type: "cook", id: top.id, draft: top.draft, servings: top.servings, step: 0, showIng: false });
        this._requestWakeLock();
        this._renderOverlay();
        return;
      }
      case "cook-next":
      case "cook-prev": {
        const top = this.top;
        if (!top || top.type !== "cook") return;
        const total = (this._overlayRecipe()?.steps || []).length;
        top.step = Math.max(0, Math.min(total, top.step + (action === "cook-next" ? 1 : -1)));
        this._renderOverlay();
        return;
      }
      case "cook-ing":
        this.top.showIng = !this.top.showIng;
        this._renderOverlay();
        return;

      /* Menu de la semaine */
      case "plan-open":
        await this._openPlan();
        return;
      case "plan-confirm":
        this._planConfirm();
        return;
      case "week-shift":
        s.week.start = addDays(s.week.start, 7 * Number(d.delta));
        this._loadWeek();
        return;
      case "week-today":
        s.week.start = mondayOf(new Date());
        this._loadWeek();
        return;
      case "slot-add":
        s.stack.push({ type: "pick", date: d.date, slot: d.slot, query: "" });
        this._renderOverlay();
        return;
      case "pick-recipe":
        this._pickRecipe(d.id);
        return;
      case "meal-open": {
        const entry = s.week.entries.find((e) => e.id === d.id);
        const r = entry && this._recipe(entry.recipe_id);
        if (r) {
          s.stack.push({ type: "recipe", id: r.id, servings: entry.servings, confirmDelete: false });
          this._renderOverlay();
        }
        return;
      }
      case "meal-remove":
        this._removeMeal(d.id);
        return;
      case "meal-servings":
        this._mealServings(d.id, Number(d.delta));
        return;
      case "shop-preview":
        this._shoppingPreview(s.week.start);
        return;
      case "shop-add":
        this._shoppingAdd();
        return;
      case "shop-toggle-all": {
        const all = this.top.items.every((i) => i.checked);
        this.top.items.forEach((i) => (i.checked = !all));
        this._renderOverlay();
        return;
      }
      default:
    }
  }

  _getPath(path) {
    const keys = path.split(".");
    let obj = keys[0] === "top" ? this.top : this.s;
    if (keys[0] === "top") keys.shift();
    for (const k of keys) obj = obj == null ? undefined : obj[k];
    return obj;
  }

  async _saveSettings() {
    const top = this.top;
    try {
      const res = await this._ws("settings/save", { settings: top.draft });
      this.s.config.settings = res.settings;
      this.s.config.default_servings = res.default_servings;
      this.s.fridge.servings = res.default_servings;
      if (this.s.list.storeId && !res.settings.stores.some((x) => x.id === this.s.list.storeId)) this._pickStore(null);
      this.s.stack.pop();
      this._toast("Réglages enregistrés");
      this._render();
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _readBook() {
    const top = this.top;
    if (!top.pages.length) return;
    top.loading = true;
    top.error = null;
    this._renderOverlay();
    try {
      const res = await this._ws("recipes/from_photo", {
        images: top.pages.map((p) => ({ image: p.split(",")[1], mime: "image/jpeg" })),
      });
      this.s.stack.pop();
      this.s.stack.push({ type: "editor", draft: this._toDraft(res.recipe), imported: "photo" });
    } catch (err) {
      top.loading = false;
      top.error = this._err(err);
    }
    this._renderOverlay();
  }

  async _openWeekPlan() {
    const settings = this.settings;
    const today = todayIso();
    // Si la semaine affichée est déjà bien entamée (à partir de vendredi), on propose la suivante.
    let start = this.s.week.start;
    if (addDays(start, 4) < today) start = addDays(start, 7);
    let entries = this.s.week.entries;
    if (start !== this.s.week.start) {
      try {
        entries = (await this._ws("plan/list", { start, end: addDays(start, 6) })).entries;
      } catch (_) {
        entries = [];
      }
    }
    const taken = new Set(entries.map((e) => `${e.date}|${e.slot}`));
    const slots = {};
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const weekend = i >= 5;
      for (const slot of ["lunch", "dinner"]) {
        const key = `${date}|${slot}`;
        const wanted = settings.plan_slots[`${slot}_${weekend ? "weekend" : "weekday"}`];
        slots[key] = Boolean(wanted) && date >= today && !taken.has(key);
      }
    }
    this.s.stack.push({
      type: "weekplan",
      step: "form",
      start,
      slots,
      taken: [...taken],
      useCarnet: this.s.recipes.length > 0,
      leftovers: true,
      budget: settings.budget_week || "",
      servings: this.s.config.default_servings || 4,
      notes: "",
      proposal: null,
      error: null,
    });
    this._renderOverlay();
  }

  async _generateWeek() {
    const top = this.top;
    const slots = Object.entries(top.slots)
      .filter(([, on]) => on)
      .map(([key]) => {
        const [date, slot] = key.split("|");
        return { date, slot };
      });
    if (!slots.length) {
      this._toast("Choisissez au moins un repas à planifier", true);
      return;
    }
    top.step = "loading";
    top.error = null;
    top.loadingMsg = 0;
    this._renderOverlay();
    const timer = setInterval(() => {
      if (top.step !== "loading") return clearInterval(timer);
      top.loadingMsg = (top.loadingMsg + 1) % PLAN_LOADING.length;
      if (this.top === top) this._renderOverlay();
    }, 3500);
    try {
      const payload = { slots, use_carnet: top.useCarnet, leftovers: top.leftovers, notes: top.notes || "", servings: Number(top.servings) || 4 };
      if (top.budget !== "" && Number(top.budget) > 0) payload.budget = Number(top.budget);
      top.proposal = await this._ws("plan/generate", payload);
      top.step = "preview";
    } catch (err) {
      top.step = "form";
      top.error = this._err(err);
    }
    clearInterval(timer);
    this._renderOverlay();
  }

  async _applyWeek() {
    const top = this.top;
    if (!top.proposal || !top.proposal.meals.length) return;
    top.step = "applying";
    this._renderOverlay();
    try {
      const res = await this._ws("plan/apply", { meals: top.proposal.meals, servings: Number(top.servings) || 4 });
      const list = await this._ws("recipes/list");
      this.s.recipes = list.recipes;
      this.s.stack.pop();
      this.s.week.start = top.start;
      this.s.tab = "week";
      await this._loadWeek();
      let msg = `${res.entries.length} repas ajoutés au menu`;
      if (res.added && res.added.length) msg += ` · ${res.added.length} ingrédients dans « ${res.list_name} »`;
      this._toast(msg);
      if (res.shopping_error) setTimeout(() => this._toast(res.shopping_error, true), 4200);
    } catch (err) {
      top.step = "preview";
      this._renderOverlay();
      this._toast(this._err(err), true);
    }
  }

  _step(path, delta, min, max) {
    const keys = path.split(".");
    let obj = keys[0] === "top" ? this.top : this.s;
    if (keys[0] === "top") keys.shift();
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    const key = keys[keys.length - 1];
    obj[key] = Math.max(min, Math.min(max, Number(obj[key] || min) + delta));
    if (path.startsWith("top")) this._renderOverlay();
    else this._render();
  }

  /* ---------------- recettes : utilitaires */

  _recipe(id) {
    return this.s.recipes.find((r) => r.id === id);
  }

  _overlayRecipe() {
    for (let i = this.s.stack.length - 1; i >= 0; i--) {
      const item = this.s.stack[i];
      if (item.type === "recipe" || item.type === "cook") return item.id ? this._recipe(item.id) : item.draft;
    }
    return null;
  }

  _replaceRecipe(recipe) {
    const i = this.s.recipes.findIndex((r) => r.id === recipe.id);
    if (i >= 0) this.s.recipes[i] = recipe;
    else this.s.recipes.push(recipe);
    this.s.recipes.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  }

  _toDraft(r = {}) {
    return {
      id: r.id || null,
      title: r.title || "",
      description: r.description || "",
      servings: r.servings || 4,
      prep_time: r.prep_time || "",
      cook_time: r.cook_time || "",
      image: r.image || "",
      tags: (r.tags || []).join(", "),
      ingredients: (r.ingredients || []).map(ingredientLine).join("\n"),
      steps: (r.steps || []).join("\n"),
      source_url: r.source_url || "",
      origin: r.origin || "manual",
    };
  }

  async _saveEditor() {
    const draft = this.top.draft;
    if (!String(draft.title).trim()) {
      this._toast("Donnez un nom à la recette", true);
      return;
    }
    const recipe = {
      ...draft,
      tags: String(draft.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      ingredients: String(draft.ingredients || "").split("\n").filter((l) => l.trim()),
      steps: String(draft.steps || "").split("\n").filter((l) => l.trim()),
    };
    if (!recipe.id) delete recipe.id;
    try {
      const res = await this._ws("recipes/save", { recipe });
      this._replaceRecipe(res.recipe);
      this.s.stack.pop();
      const below = this.top;
      if (below && below.type === "recipe" && below.id === res.recipe.id) {
        below.servings = res.recipe.servings;
      } else {
        this.s.stack.push({ type: "recipe", id: res.recipe.id, servings: res.recipe.servings, confirmDelete: false });
      }
      this._toast("Recette enregistrée");
      this._render();
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _saveDraft() {
    const top = this.top;
    if (!top || !top.draft) return top && top.id;
    const { uses, missing, ...recipe } = top.draft;
    try {
      const res = await this._ws("recipes/save", { recipe: { ...recipe, origin: recipe.origin || "ai" } });
      this._replaceRecipe(res.recipe);
      top.id = res.recipe.id;
      top.draft = null;
      top.confirmDelete = false;
      this._toast("Ajoutée au carnet de recettes");
      this._render();
      return res.recipe.id;
    } catch (err) {
      this._toast(this._err(err), true);
      return null;
    }
  }

  async _toggleFavorite() {
    const r = this._overlayRecipe();
    if (!r || !r.id) return;
    try {
      const res = await this._ws("recipes/patch", { recipe_id: r.id, favorite: !r.favorite });
      this._replaceRecipe(res.recipe);
      this._render();
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _deleteRecipe() {
    const top = this.top;
    if (!top.confirmDelete) {
      top.confirmDelete = true;
      this._renderOverlay();
      return;
    }
    try {
      await this._ws("recipes/delete", { recipe_id: top.id });
      this.s.recipes = this.s.recipes.filter((r) => r.id !== top.id);
      this.s.week.entries = this.s.week.entries.filter((e) => e.recipe_id !== top.id);
      this.s.stack.pop();
      this._toast("Recette supprimée");
      this._render();
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _import() {
    const top = this.top;
    if (!String(top.url).trim()) return;
    top.loading = true;
    top.error = null;
    this._renderOverlay();
    try {
      const res = await this._ws("recipes/import", { url: String(top.url).trim() });
      this.s.stack.pop();
      this.s.stack.push({ type: "editor", draft: this._toDraft(res.recipe), imported: true });
    } catch (err) {
      top.loading = false;
      top.error = this._err(err);
    }
    this._renderOverlay();
  }

  /* ---------------- frigo */

  async _analysePhoto(file) {
    const f = this.s.fridge;
    f.error = null;
    try {
      f.photo = await resizeImage(file);
    } catch (err) {
      this._toast("Impossible de lire cette image", true);
      return;
    }
    f.step = "detecting";
    this._render();
    try {
      const res = await this._ws("fridge/detect", { image: f.photo.split(",")[1], mime: "image/jpeg" });
      const known = new Set(f.ingredients.map((i) => i.name.toLowerCase()));
      for (const ing of res.ingredients) if (!known.has(ing.name.toLowerCase())) f.ingredients.push(ing);
      if (!res.ingredients.length) f.error = "Je n'ai rien reconnu sur cette photo. Ajoutez les ingrédients à la main ou reprenez une photo plus nette.";
    } catch (err) {
      f.error = this._err(err);
    }
    f.step = "review";
    this._render();
  }

  async _suggest() {
    const f = this.s.fridge;
    if (f.newIng && String(f.newIng).trim()) await this._dispatch("ing-add");
    const ingredients = f.ingredients.map((i) => i.name.trim()).filter(Boolean);
    if (!ingredients.length) {
      this._toast("Ajoutez au moins un ingrédient", true);
      return;
    }
    f.step = "suggesting";
    f.error = null;
    this._render();
    try {
      const res = await this._ws("fridge/suggest", {
        ingredients,
        style: f.style,
        count: Number(f.count) || 3,
        servings: Number(f.servings) || 4,
        notes: f.notes || "",
      });
      f.results = res.recipes;
      f.step = "results";
      if (!res.recipes.length) {
        f.step = "review";
        f.error = "Aucune recette proposée. Réessayez ou changez la liste.";
      }
    } catch (err) {
      f.step = "review";
      f.error = this._err(err);
    }
    this._render();
    this.shadowRoot.querySelector("main")?.scrollTo(0, 0);
  }

  /* ---------------- menu de la semaine */

  async _loadWeek() {
    const w = this.s.week;
    w.loading = true;
    this._render();
    try {
      const res = await this._ws("plan/list", { start: w.start, end: addDays(w.start, 6) });
      w.entries = res.entries;
    } catch (err) {
      this._toast(this._err(err), true);
    }
    w.loading = false;
    this._render();
  }

  async _openPlan() {
    let id = this.top.id;
    if (!id) id = await this._saveDraft();
    if (!id) return;
    const r = this._recipe(id);
    const hour = new Date().getHours();
    this.s.stack.push({
      type: "plan",
      id,
      date: todayIso(),
      slot: hour < 14 ? "lunch" : "dinner",
      servings: this.top.servings || r.servings || 4,
    });
    this._renderOverlay();
  }

  async _planConfirm() {
    const top = this.top;
    try {
      const res = await this._ws("plan/add", {
        date: top.date,
        slot: top.slot,
        recipe_id: top.id,
        servings: Number(top.servings),
      });
      this.s.stack.pop();
      this._afterPlanAdd(res, top.date);
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  _afterPlanAdd(res, date) {
    const w = this.s.week;
    if (date >= w.start && date <= addDays(w.start, 6)) w.entries.push(res.entry);
    let msg = `Ajouté au menu du ${fmtDay(date, { weekday: "long", day: "numeric" })}`;
    if (res.added && res.added.length) msg += ` · ${res.added.length} ingrédient${res.added.length > 1 ? "s" : ""} dans « ${res.list_name} »`;
    this._toast(msg);
    if (res.shopping_error) setTimeout(() => this._toast(res.shopping_error, true), 4200);
    this._render();
  }

  async _pickRecipe(id) {
    const top = this.top;
    const r = this._recipe(id);
    try {
      const res = await this._ws("plan/add", { date: top.date, slot: top.slot, recipe_id: id, servings: r.servings || this.s.config?.default_servings || 4 });
      this.s.stack.pop();
      this._afterPlanAdd(res, top.date);
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _removeMeal(id) {
    try {
      await this._ws("plan/delete", { entry_id: id });
      this.s.week.entries = this.s.week.entries.filter((e) => e.id !== id);
      this._render();
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _mealServings(id, delta) {
    const entry = this.s.week.entries.find((e) => e.id === id);
    if (!entry) return;
    const servings = Math.max(1, Math.min(30, entry.servings + delta));
    try {
      const res = await this._ws("plan/update", { entry_id: id, servings });
      Object.assign(entry, res.entry);
      this._render();
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _shoppingPreview(start = this.s.week.start) {
    const item = { type: "shopping", start, loading: true, items: [], entry_ids: [], list_name: null, onlyNew: true };
    this.s.stack.push(item);
    this._renderOverlay();
    await this._loadShopping(item);
  }

  async _loadShopping(item) {
    item.loading = true;
    this._renderOverlay();
    try {
      const res = await this._ws("shopping/preview", { start: item.start, end: addDays(item.start, 6), only_new: item.onlyNew });
      item.items = res.items.map((i) => ({ ...i, checked: true }));
      item.entry_ids = res.entry_ids;
      item.list_name = res.list_name;
    } catch (err) {
      this._toast(this._err(err), true);
    }
    item.loading = false;
    this._renderOverlay();
  }

  async _shoppingAdd() {
    const top = this.top;
    const texts = top.items.filter((i) => i.checked).map((i) => i.text);
    if (!texts.length) return;
    top.loading = true;
    this._renderOverlay();
    try {
      const res = await this._ws("shopping/add", { items: texts, entry_ids: top.entry_ids });
      this.s.stack.pop();
      for (const e of this.s.week.entries) if (top.entry_ids.includes(e.id)) e.in_shopping_list = true;
      this._toast(`${res.added} article${res.added > 1 ? "s" : ""} ajouté${res.added > 1 ? "s" : ""} à « ${res.list_name} »`);
      this._render();
      if (this.s.tab === "shopping") this._loadMenuInfo();
    } catch (err) {
      top.loading = false;
      this._renderOverlay();
      this._toast(this._err(err), true);
    }
  }

  /* ---------------- écran allumé en mode cuisine */

  async _requestWakeLock() {
    try {
      if ("wakeLock" in navigator) this._wakeLock = await navigator.wakeLock.request("screen");
    } catch (_) {
      /* pas grave */
    }
  }

  _releaseWakeLock() {
    if (this._wakeLock) {
      this._wakeLock.release().catch(() => {});
      this._wakeLock = null;
    }
  }

  /* ================================================================== rendu */

  _render() {
    const root = this.shadowRoot;
    if (!root.querySelector(".app")) {
      root.innerHTML = `<style>${STYLES}</style><div class="app"><div id="header"></div><main id="main"></main><nav class="tabs" id="nav"></nav><div id="overlay"></div><div id="toast"></div></div>`;
    }
    const main = root.getElementById("main");
    const scroll = main.scrollTop;
    root.getElementById("header").innerHTML = this._tplHeader();
    main.innerHTML = `<div class="page">${this._tplTab()}</div>`;
    main.scrollTop = scroll;
    root.getElementById("nav").innerHTML = this._tplNav();
    this._renderOverlay();
    this._renderToast();
  }

  _renderOverlay() {
    const host = this.shadowRoot.getElementById("overlay");
    if (!host) return;
    const top = this.top;
    const prevBody = host.querySelector(".body");
    const prevKey = host.dataset.key;
    const scroll = prevBody ? prevBody.scrollTop : 0;
    const key = top ? `${this.s.stack.length}:${top.type}` : "";
    // Même fenêtre redessinée : pas d'animation d'ouverture (sinon elle clignote et laisse voir l'onglet dessous).
    // L'animation ne joue qu'à l'ouverture d'une nouvelle fenêtre, pas au retour en arrière.
    const prevDepth = Number(host.dataset.depth || 0);
    host.classList.toggle("same", this.s.stack.length <= prevDepth);
    host.dataset.depth = String(this.s.stack.length);
    host.innerHTML = top ? this._tplOverlay(top) : "";
    host.dataset.key = key;
    const body = host.querySelector(".body");
    if (body && key === prevKey) body.scrollTop = scroll;
  }

  _renderToast() {
    const host = this.shadowRoot.getElementById("toast");
    if (!host) return;
    const t = this.s.toast;
    host.innerHTML = t
      ? `<div class="toast ${t.error ? "error" : ""}" role="status">${icon(t.error ? "alert-circle-outline" : "check-circle-outline")}<span>${esc(t.message)}</span></div>`
      : "";
  }

  _renderRecipeList() {
    const el = this.shadowRoot.getElementById("recipe-list");
    if (el) el.innerHTML = this._tplRecipeItems();
  }

  _renderPickList() {
    const el = this.shadowRoot.getElementById("pick-list");
    if (el) el.innerHTML = this._tplPickItems();
  }

  _tplHeader() {
    return `<div class="toolbar">
      ${this._narrow ? `<button class="icon-btn" data-action="menu" aria-label="Menu">${icon("menu")}</button>` : `<span style="width:12px"></span>`}
      ${LOGO_SVG}
      <div class="title" style="margin-left:10px">Frigo Malin</div>
      ${this.listEntity ? `<button class="icon-btn cart" data-action="quick-open" aria-label="Ajout rapide à la liste de courses" title="Ajout rapide">${icon("cart-plus")}</button>` : ""}
      ${this.s.config ? `<button class="icon-btn" data-action="settings-open" aria-label="Réglages du foyer" title="Réglages du foyer">${icon("cog-outline")}</button>` : ""}
    </div>`;
  }

  _tplNav() {
    const tabs = [
      ["fridge", "fridge-outline", "fridge", "Frigo"],
      ["recipes", "book-open-page-variant-outline", "book-open-page-variant", "Recettes"],
      ["week", "calendar-week-outline", "calendar-week", "Semaine"],
      ["shopping", "cart-outline", "cart", "Courses"],
    ];
    const pending = this.pendingItems.length;
    return `<div class="inner">${tabs
      .map(
        ([key, ic, icActive, label]) =>
          `<button class="${this.s.tab === key ? "active" : ""}" data-action="tab" data-tab="${key}" aria-label="${label}"><span class="pill">${icon(this.s.tab === key ? icActive : ic)}${key === "shopping" && pending ? `<span class="badge">${pending > 99 ? "99+" : pending}</span>` : ""}</span>${label}</button>`
      )
      .join("")}</div>`;
  }

  _tplVersion() {
    return `<div class="version">${icon("tag-outline")} Frigo Malin v${esc(FM_VERSION)}</div>`;
  }

  /* Le serveur a été mis à jour mais le navigateur garde l'ancien panneau en cache. */
  _tplUpdateBanner() {
    const server = this.s.config && this.s.config.version;
    if (!server || server === FM_VERSION) return "";
    return `<div class="update">
      ${bubble("rocket-launch-outline", COLORS.teal)}
      <div class="grow"><b>Nouvelle version installée (v${esc(server)})</b>Rechargez pour en profiter.</div>
      <button class="btn" data-action="reload">${icon("refresh")} Recharger</button>
    </div>`;
  }

  _tplTab() {
    if (!this.s.loaded) return `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
    return this._tplUpdateBanner() + this._tplTabContent();
  }

  _tplTabContent() {
    if (this.s.tab === "recipes") return this._tplRecipes();
    if (this.s.tab === "week") return this._tplWeek();
    if (this.s.tab === "shopping") return this._tplShopping();
    return this._tplFridge();
  }

  /* ---------------- onglet Frigo */

  _tplFridge() {
    const f = this.s.fridge;
    const inputs = `
      <input class="hidden-input" id="cam" type="file" accept="image/*" capture="environment" data-change="photo">
      <input class="hidden-input" id="gallery" type="file" accept="image/*" data-change="photo">`;

    if (f.step === "start") {
      return `${inputs}
        <div class="card hero">
          ${LOGO_SVG}
          <h2>Qu'y a-t-il dans votre frigo ?</h2>
          <p class="muted">Prenez une photo : je reconnais les ingrédients, vous corrigez la liste, et je vous propose des recettes.</p>
          <div class="perks">
            <span>${bubble("camera-outline", COLORS.teal)}Photo</span>
            <span>${bubble("format-list-checks", COLORS.blue)}Ingrédients</span>
            <span>${bubble("chef-hat", COLORS.orange)}Recettes</span>
          </div>
          <div class="stack">
            <button class="btn big block" data-action="pick-photo" data-input="cam">${icon("camera")} Prendre une photo</button>
            <button class="btn tonal block" data-action="pick-photo" data-input="gallery">${icon("image-outline")} Choisir une image</button>
            <button class="btn text block" data-action="manual-list">${icon("pencil-outline")} Saisir les ingrédients à la main</button>
          </div>
        </div>
        ${this._tplVersion()}`;
    }

    if (f.step === "detecting") {
      return `${inputs}
        <div class="photo-wrap">
          <img class="photo" src="${esc(f.photo)}" alt="">
          <div class="scan"><div class="spinner"></div><div>Je regarde ce qu'il y a dans votre frigo…</div></div>
        </div>`;
    }

    if (f.step === "suggesting") {
      return `<div class="card hero">
          <div class="emoji" style="font-size:48px">${f.style === "creative" ? "✨" : "👩‍🍳"}</div>
          <div class="spinner" style="margin: 12px auto 16px; color: var(--fm-primary)"></div>
          <h2>Je cherche des idées…</h2>
          <p class="muted">${f.style === "creative" ? "Des recettes créatives" : "Des recettes classiques"} avec ${f.ingredients.length} ingrédient${f.ingredients.length > 1 ? "s" : ""}. Ça prend souvent une trentaine de secondes.</p>
        </div>`;
    }

    if (f.step === "results") {
      return `
        <div class="row" style="margin-bottom:12px">
          <button class="icon-btn" data-action="fridge-back" aria-label="Retour">${icon("arrow-left")}</button>
          <h2 class="grow" style="margin:0">Idées de recettes 💡</h2>
        </div>
        ${f.results.map((r, i) => this._tplResult(r, i)).join("")}
        <div class="stack" style="margin-top:16px">
          <button class="btn tonal block" data-action="suggest">${icon("refresh")} D'autres idées</button>
          <button class="btn text block" data-action="fridge-reset">${icon("camera-retake-outline")} Nouvelle photo</button>
        </div>`;
    }

    // review
    return `${inputs}
      ${f.error ? `<div class="alert">${esc(f.error)}</div>` : ""}
      ${f.photo ? `<div class="photo-wrap"><img class="photo" src="${esc(f.photo)}" alt="Photo du frigo"></div>` : ""}
      <div class="card">
        <div class="row" style="margin-bottom:4px">
          ${bubble("basket-outline", COLORS.green)}
          <h3 class="grow" style="margin:0 0 0 6px">Ingrédients (${f.ingredients.length})</h3>
          <button class="icon-btn" data-action="pick-photo" data-input="cam" aria-label="Ajouter une photo" title="Ajouter une photo">${icon("camera-plus-outline")}</button>
        </div>
        <p class="muted small" style="margin:0 0 8px">Corrigez, supprimez ou ajoutez ce qui manque.</p>
        <div>
          ${f.ingredients
            .map(
              (ing, i) => `<div class="ing-row">
                <span class="ing-emoji">${ingEmoji(ing.name)}</span>
                <input value="${esc(ing.name)}" data-model="fridge.ingredients.${i}.name" aria-label="Ingrédient">
                ${ing.amount ? `<input class="amount" value="${esc(ing.amount)}" data-model="fridge.ingredients.${i}.amount" aria-label="Quantité">` : ""}
                <button class="icon-btn" data-action="ing-remove" data-i="${i}" aria-label="Retirer">${icon("close")}</button>
              </div>`
            )
            .join("")}
        </div>
        <div class="row" style="margin-top:10px">
          <input class="input grow" id="new-ing" placeholder="Ajouter (ex. : œufs, crème)" value="${esc(f.newIng)}" data-model="fridge.newIng" data-enter="ing-add" enterkeyhint="done">
          <button class="btn tonal" data-action="ing-add" aria-label="Ajouter">${icon("plus")}</button>
        </div>
      </div>

      <div class="card">
        <div class="field">
          <span>${icon("palette-outline")} Style de recettes</span>
          <div class="segmented">
            <button class="${f.style === "classic" ? "on" : ""}" data-action="set" data-path="fridge.style" data-value="classic">🍲 Classiques</button>
            <button class="${f.style === "creative" ? "on" : ""}" data-action="set" data-path="fridge.style" data-value="creative">Créatives ✨</button>
          </div>
        </div>
        <div class="row wrap" style="justify-content:space-between; margin-bottom:14px">
          <span class="muted small row">${icon("account-group-outline")} Pour combien de personnes ?</span>
          ${this._tplStepper("fridge.servings", f.servings, "pers.")}
        </div>
        <div class="row wrap" style="justify-content:space-between; margin-bottom:14px">
          <span class="muted small row">${icon("lightbulb-on-outline")} Nombre d'idées</span>
          ${this._tplStepper("fridge.count", f.count, "", 1, 6)}
        </div>
        ${this.settings.members.length ? `<p class="hh-hint">${icon("check-circle")} Adapté à votre foyer : ${this.settings.members.length} personne${this.settings.members.length > 1 ? "s" : ""}${this._allergySummary()}.</p>` : ""}
        <label class="field" style="margin-bottom:0">
          <span>${icon("heart-outline")} Envies ou contraintes (facultatif)</span>
          <input class="input" placeholder="Végétarien, sans gluten, moins de 30 min…" value="${esc(f.notes)}" data-model="fridge.notes">
        </label>
      </div>

      <button class="btn big block" data-action="suggest" ${f.ingredients.length ? "" : "disabled"}>${icon("chef-hat")} Trouver des recettes</button>
      <button class="btn text block" style="margin-top:8px" data-action="fridge-reset">${icon("restart")} Tout recommencer</button>`;
  }

  /* ---------------- onglet Courses */

  _tplQuickInput(id) {
    return `<div class="row">
      <input class="input grow quick-input" id="${id}" placeholder="Ex. : 2 kg de pommes, lait" value="${esc(this.s.list.quick)}" data-model="list.quick" data-enter="quick-add" enterkeyhint="send" autocomplete="off">
      <button class="btn" data-action="quick-add" aria-label="Ajouter">${icon("plus")}</button>
    </div>`;
  }

  _quickNames() {
    const onList = new Set(this.pendingItems.map((i) => foldText(i.summary.replace(/\(.*?\)/g, "")).trim().replace(/s$/, "")));
    const seen = new Set();
    const names = [];
    for (const name of [...this.s.suggestions, ...DEFAULT_QUICK]) {
      const key = foldText(name).trim().replace(/s$/, "");
      if (seen.has(key) || onList.has(key)) continue;
      seen.add(key);
      names.push(name);
      if (names.length >= 10) break;
    }
    return names;
  }

  _tplQuickChips() {
    return this._quickNames()
      .map((name) => `<button class="chip add" data-action="quick-chip" data-name="${esc(name)}">${ingEmoji(name) === "🥄" ? icon("plus") : ingEmoji(name)} ${esc(name)}</button>`)
      .join("");
  }

  _tplQuickCount() {
    const n = this.pendingItems.length;
    const name = this.s.config && this.s.config.shopping_list && this.s.config.shopping_list.name;
    return `${icon("cart-outline")} ${n} article${n > 1 ? "s" : ""} à acheter${name ? ` dans « ${esc(name)} »` : ""}`;
  }

  _tplMenuCard() {
    const l = this.s.list;
    const m = l.menu;
    let stat = `<span class="spinner sm"></span>`;
    if (m && m.error) stat = esc(m.error);
    else if (m && !m.meals) stat = "Aucun repas planifié.";
    else if (m) stat = m.pending ? `<b>${m.pending}</b> repas sur ${m.meals} pas encore dans la liste.` : `Les ${m.meals} repas sont déjà dans la liste ✓`;
    return `
      <div class="row" style="margin-bottom:10px">
        <div class="row">${bubble("calendar-week", COLORS.indigo)}<h3 style="margin:0">Depuis le menu</h3></div>
      </div>
      <div class="chips" style="margin-bottom:10px">
        <button class="chip ${l.menuWeek === "this" ? "on" : ""}" data-action="menu-week" data-value="this">Cette semaine</button>
        <button class="chip ${l.menuWeek === "next" ? "on" : ""}" data-action="menu-week" data-value="next">Semaine prochaine</button>
      </div>
      <p class="stat muted" style="margin:0 0 12px">${stat}</p>
      <button class="btn tonal block" data-action="menu-add" ${m && m.meals ? "" : "disabled"}>${icon("cart-arrow-down")} Ajouter les ingrédients des recettes</button>`;
  }

  _tplShopList() {
    const l = this.s.list;
    if (!this.listEntity) {
      return `<div class="alert">Aucune liste de courses trouvée. Ajoutez l'intégration « Liste de courses » de Home Assistant, ou choisissez une liste dans les options de Frigo Malin.</div>`;
    }
    if (l.error) return `<div class="alert">${esc(l.error)}</div>`;
    if (!l.loaded) return `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
    const pending = this.pendingItems;
    const done = l.items.filter((i) => i.status === "completed");
    const row = (item) => `<div class="li ${item.status === "completed" ? "done" : ""}">
        <button class="tick" data-action="list-toggle" data-uid="${esc(item.uid)}" aria-label="${item.status === "completed" ? "Remettre dans la liste" : "Dans le panier"}">${icon("check")}</button>
        <span class="ing-emoji">${ingEmoji(item.summary)}</span>
        <div class="txt" data-action="list-toggle" data-uid="${esc(item.uid)}"><div>${esc(item.summary)}</div>${item.description ? `<div class="d">${esc(item.description)}</div>` : ""}</div>
        <button class="icon-btn" data-action="list-remove" data-uid="${esc(item.uid)}" aria-label="Supprimer">${icon("close")}</button>
      </div>`;

    let html = `<div class="list-head">${bubble("format-list-checks", COLORS.green)}<h3>À acheter</h3><span class="muted small">${pending.length}</span></div>`;
    if (!pending.length) {
      html += `<div class="empty" style="padding:20px 16px"><div class="emoji">🛒</div><p>La liste est vide. Ajoutez un article ci-dessus ou les ingrédients de votre menu.</p></div>`;
    } else {
      const groups = {};
      for (const item of pending) (groups[aisleOf(item.summary)] = groups[aisleOf(item.summary)] || []).push(item);
      const stores = this.settings.stores || [];
      const store = stores.find((x) => x.id === l.storeId);
      const byKey = Object.fromEntries(AISLES.map((a) => [a.key, a]));
      const order = store ? store.aisles.map((k) => byKey[k]).filter(Boolean) : AISLES;
      html += `<div class="store-pick">
        <span class="lbl">${icon("store-outline")} Rayons :</span>
        <button class="chip ${store ? "" : "on"}" data-action="store-pick" data-id="">Standard</button>
        ${stores.map((x) => `<button class="chip ${store && store.id === x.id ? "on" : ""}" data-action="store-pick" data-id="${esc(x.id)}">🏪 ${esc(x.name)}</button>`).join("")}
        <button class="chip add" data-action="settings-open">${icon(stores.length ? "cog-outline" : "store-plus-outline")}${stores.length ? "" : " Mon magasin"}</button>
      </div>`;
      for (const aisle of order) {
        const items = groups[aisle.key];
        if (!items) continue;
        html += `<div class="card aisle">
          <div class="aisle-title"><span>${aisle.emoji}</span>${aisle.label}<span class="n">${items.length}</span></div>
          ${items.map(row).join("")}
        </div>`;
      }
    }
    if (done.length) {
      html += `<div class="list-head">
          ${bubble("cart-check", COLORS.teal)}<h3>Dans le panier (${done.length})</h3>
          <button class="btn text" data-action="list-show-done">${icon(l.showDone ? "chevron-up" : "chevron-down")} ${l.showDone ? "Masquer" : "Voir"}</button>
        </div>
        ${l.showDone ? `<div class="card aisle">${done.map(row).join("")}</div>` : ""}
        <button class="btn danger block" data-action="list-clear-done">${icon("broom")} Vider le panier</button>`;
    }
    return html;
  }

  _tplShopping() {
    return `
      <div class="card quickbox">
        <div class="row" style="margin-bottom:10px">${bubble("lightning-bolt", COLORS.amber)}<h3 style="margin:0">Ajout rapide</h3></div>
        ${this._tplQuickInput("quick-input")}
        <div class="chips quick-sugg">${this._tplQuickChips()}</div>
      </div>
      <div class="card menu-card" id="shop-menu">${this._tplMenuCard()}</div>
      <div id="shop-list">${this._tplShopList()}</div>`;
  }

  /* ---------------- réglages du foyer */

  _tplSwitch(path, on, label, sub = "") {
    return `<div class="switch"><div class="grow">${label}${sub ? `<div class="sub">${sub}</div>` : ""}</div>
      <button class="toggle ${on ? "on" : ""}" data-action="toggle-bool" data-path="${path}" role="switch" aria-checked="${on}" aria-label="${esc(label)}"></button></div>`;
  }

  _tplMulti(path, values, options) {
    return `<div class="chips">${Object.entries(options)
      .map(([key, label]) => `<button class="chip ${values.includes(key) ? "on" : ""}" data-action="toggle-in" data-path="${path}" data-value="${key}">${values.includes(key) ? icon("check") : ""}${esc(label)}</button>`)
      .join("")}</div>`;
  }

  _memberSummary(m) {
    const parts = [HH.ages[m.age][0], HH.diets[m.diet]];
    if (m.allergies.length) parts.push("⚠️ " + m.allergies.map((a) => HH.allergens[a]).join(", "));
    return parts.join(" · ");
  }

  _tplSettings(top) {
    const d = top.draft;
    const portions = d.members.reduce((t, m) => t + ({ adult: 1, teen: 1, child: 0.5, toddler: 0.25 })[m.age], 0);
    const zones = Object.keys(this._hass.states).filter((id) => id.startsWith("zone."));
    const zoneName = (id) => (this._hass.states[id] ? this._hass.states[id].attributes.friendly_name || id : id);
    const body = `
      <p class="muted" style="margin-top:0">Ces informations guident toutes les propositions de l'IA : idées du frigo et menus de la semaine.</p>

      <div class="set-sec">${bubble("account-group-outline", COLORS.blue)}<h3>Le foyer</h3></div>
      ${d.members
        .map((m, i) => `<button class="member" data-action="member-edit" data-i="${i}">
          <span class="av">${HH.ages[m.age][1]}</span>
          <div class="grow"><div>${esc(m.name)}</div><div class="m">${esc(this._memberSummary(m))}</div></div>
          ${icon("chevron-right")}
        </button>`)
        .join("")}
      <button class="btn tonal block" data-action="member-add">${icon("account-plus-outline")} Ajouter une personne</button>
      ${d.members.length ? `<p class="hh-hint">${icon("silverware-fork-knife")} Portions calculées : ${fmtNumber(portions)} → ${Math.max(1, Math.ceil(portions - 0.01))} par repas (un enfant compte pour ½).</p>` : ""}

      <div class="set-sec">${bubble("timer-outline", COLORS.orange)}<h3>Temps et budget</h3></div>
      <div class="row wrap" style="justify-content:space-between;margin-bottom:12px">
        <span class="muted small">En semaine (prépa + cuisson)</span>${this._tplStepper("top.draft.time_weekday", d.time_weekday, "min", 10, 240, 5)}
      </div>
      <div class="row wrap" style="justify-content:space-between;margin-bottom:12px">
        <span class="muted small">Le week-end</span>${this._tplStepper("top.draft.time_weekend", d.time_weekend, "min", 10, 360, 15)}
      </div>
      <label class="field"><span>${icon("cash")} Budget courses par semaine (facultatif)</span>
        <input class="input" type="number" min="0" inputmode="numeric" placeholder="Ex. : 80 €" value="${esc(d.budget_week ?? "")}" data-model="top.draft.budget_week"></label>
      <div class="field"><span>Repas à planifier par défaut</span>
        ${this._tplSwitch("top.draft.plan_slots.lunch_weekday", d.plan_slots.lunch_weekday, "☀️ Midi en semaine")}
        ${this._tplSwitch("top.draft.plan_slots.dinner_weekday", d.plan_slots.dinner_weekday, "🌙 Soir en semaine")}
        ${this._tplSwitch("top.draft.plan_slots.lunch_weekend", d.plan_slots.lunch_weekend, "☀️ Midi le week-end")}
        ${this._tplSwitch("top.draft.plan_slots.dinner_weekend", d.plan_slots.dinner_weekend, "🌙 Soir le week-end")}
      </div>

      <div class="set-sec">${bubble("chef-hat", COLORS.red)}<h3>Cuisine</h3></div>
      <div class="field"><span>Équipement</span>${this._tplMulti("top.draft.equipment", d.equipment, HH.equipment)}</div>
      <div class="field"><span>Cuisines préférées</span>${this._tplMulti("top.draft.cuisines", d.cuisines, HH.cuisines)}</div>
      <div class="field"><span>Objectifs</span>${this._tplMulti("top.draft.goals", d.goals, HH.goals)}</div>
      <label class="field"><span>Autres consignes pour l'IA</span>
        <textarea class="input" rows="3" placeholder="Ex. : pas de coriandre, poisson le vendredi, plats qui se réchauffent pour le midi…" data-model="top.draft.notes">${esc(d.notes)}</textarea></label>

      <div class="set-sec">${bubble("store-outline", COLORS.teal)}<h3>Magasins</h3></div>
      <p class="muted small" style="margin-top:0">Rangez les rayons dans l'ordre de votre magasin. Reliez-le à une zone de Home Assistant pour recevoir la liste sur votre téléphone en arrivant.</p>
      ${d.stores
        .map((st, i) => `<button class="member" data-action="store-edit" data-i="${i}">
          <span class="av">🏪</span>
          <div class="grow"><div>${esc(st.name)}</div><div class="m">${st.zone ? `📍 ${esc(zoneName(st.zone))}` : "Pas de zone : pas de rappel"}</div></div>
          ${icon("chevron-right")}
        </button>`)
        .join("")}
      <button class="btn tonal block" data-action="store-add">${icon("store-plus-outline")} Ajouter un magasin</button>
      ${this._tplSwitch("top.draft.store_reminder", d.store_reminder, "🔔 Rappel en arrivant au magasin", zones.length ? "Notification sur le téléphone de la personne qui arrive, si la liste n'est pas vide." : "Créez d'abord une zone pour votre magasin dans Paramètres → Zones.")}`;
    const footer = `<button class="btn grow big" data-action="settings-save">${icon("content-save-outline")} Enregistrer</button>`;
    return this._tplSheet("Réglages du foyer", body, footer);
  }

  _tplMember(top) {
    const m = top.draft;
    const body = `
      <label class="field"><span>Prénom</span><input class="input" id="member-name" value="${esc(m.name)}" data-model="top.draft.name" placeholder="Ex. : Léa"></label>
      <div class="field"><span>Âge</span><div class="chips">${Object.entries(HH.ages)
        .map(([k, [label, emoji]]) => `<button class="chip ${m.age === k ? "on" : ""}" data-action="set" data-path="top.draft.age" data-value="${k}">${emoji} ${label}</button>`)
        .join("")}</div></div>
      <div class="field"><span>Régime</span><div class="chips">${Object.entries(HH.diets)
        .map(([k, label]) => `<button class="chip ${m.diet === k ? "on" : ""}" data-action="set" data-path="top.draft.diet" data-value="${k}">${esc(label)}</button>`)
        .join("")}</div></div>
      <div class="field"><span>⚠️ Allergies et intolérances</span>${this._tplMulti("top.draft.allergies", m.allergies, HH.allergens)}</div>
      <div class="field"><span>Épices</span><div class="segmented">${Object.entries(HH.spice)
        .map(([k, label]) => `<button class="${m.spice === k ? "on" : ""}" data-action="set" data-path="top.draft.spice" data-value="${k}">${label}</button>`)
        .join("")}</div></div>
      <label class="field"><span>N'aime pas</span><input class="input" value="${esc(m.dislikes)}" data-model="top.draft.dislikes" placeholder="Ex. : épinards, champignons"></label>
      ${top.index >= 0 ? `<button class="btn danger block" data-action="member-delete">${icon("account-remove-outline")} Retirer du foyer</button>` : ""}`;
    const footer = `<button class="btn grow big" data-action="member-save">${icon("check")} Valider</button>`;
    return this._tplSheet(top.index >= 0 ? m.name || "Personne" : "Nouvelle personne", body, footer);
  }

  _tplStore(top) {
    const st = top.draft;
    const zones = Object.keys(this._hass.states).filter((id) => id.startsWith("zone.") && id !== "zone.home");
    const byKey = Object.fromEntries(AISLES.map((a) => [a.key, a]));
    const body = `
      <label class="field"><span>Nom</span><input class="input" id="store-name" value="${esc(st.name)}" data-model="top.draft.name" placeholder="Ex. : Leclerc Saint-Jean"></label>
      <label class="field"><span>📍 Zone Home Assistant (pour le rappel)</span>
        <select class="input" data-model="top.draft.zone">
          <option value="">Aucune</option>
          ${zones.map((id) => `<option value="${esc(id)}" ${st.zone === id ? "selected" : ""}>${esc(this._hass.states[id].attributes.friendly_name || id)}</option>`).join("")}
        </select></label>
      ${zones.length ? "" : `<p class="muted small" style="margin-top:-6px">Aucune zone trouvée : créez-en une autour du magasin dans Paramètres → Zones.</p>`}
      <div class="field"><span>Ordre des rayons dans ce magasin</span>
        <div class="card" style="padding:4px 12px">
          ${st.aisles
            .map((key, i) => `<div class="aisle-row">
              <span class="n">${i + 1}</span><span style="font-size:20px">${byKey[key].emoji}</span><span class="grow">${byKey[key].label}</span>
              <button class="icon-btn" data-action="aisle-move" data-i="${i}" data-delta="-1" aria-label="Monter" ${i === 0 ? "disabled" : ""}>${icon("arrow-up")}</button>
              <button class="icon-btn" data-action="aisle-move" data-i="${i}" data-delta="1" aria-label="Descendre" ${i === st.aisles.length - 1 ? "disabled" : ""}>${icon("arrow-down")}</button>
            </div>`)
            .join("")}
        </div>
      </div>
      ${top.index >= 0 ? `<button class="btn danger block" data-action="store-delete">${icon("delete-outline")} Supprimer ce magasin</button>` : ""}`;
    const footer = `<button class="btn grow big" data-action="store-save">${icon("check")} Valider</button>`;
    return this._tplSheet(top.index >= 0 ? st.name || "Magasin" : "Nouveau magasin", body, footer);
  }

  /* ---------------- photo d'une page de livre */

  _tplBook(top) {
    const full = top.pages.length >= 4;
    const body = `
      <input class="hidden-input" id="book-cam" type="file" accept="image/*" capture="environment" data-change="book-photo">
      <input class="hidden-input" id="book-gallery" type="file" accept="image/*" multiple data-change="book-photo">
      <div class="hero" style="padding:8px 0 4px;text-align:center">
        <div class="emoji" style="font-size:56px">📖</div>
        <p class="muted" style="margin:8px auto 0;max-width:440px">Photographiez une page de livre, de magazine ou la fiche de mamie, bien à plat et à la lumière. Une recette sur plusieurs pages ? Ajoutez-les toutes (4 maximum).</p>
      </div>
      ${top.error ? `<div class="alert">${esc(top.error)}</div>` : ""}
      ${top.pages.length
        ? `<div class="pages">${top.pages
            .map((p, i) => `<div class="pg"><img src="${esc(p)}" alt="Page ${i + 1}"><span class="num">Page ${i + 1}</span>
              ${top.loading ? "" : `<button class="icon-btn" data-action="book-remove" data-i="${i}" aria-label="Retirer">${icon("close")}</button>`}</div>`)
            .join("")}</div>`
        : ""}
      ${top.loading
        ? `<div class="empty" style="padding:16px"><div class="spinner" style="margin:0 auto 12px;color:var(--fm-primary)"></div>Je lis la recette… même l'écriture de mamie 😉</div>`
        : `<div class="stack">
            <button class="btn ${top.pages.length ? "tonal" : "big"} block" data-action="pick-photo" data-input="book-cam" ${full ? "disabled" : ""}>${icon("camera")} ${top.pages.length ? "Ajouter une page" : "Prendre la photo"}</button>
            <button class="btn text block" data-action="pick-photo" data-input="book-gallery" ${full ? "disabled" : ""}>${icon("image-multiple-outline")} Choisir dans la galerie</button>
          </div>`}`;
    const footer = top.pages.length
      ? `<button class="btn grow big" data-action="book-read" ${top.loading ? "disabled" : ""}>${icon("text-recognition")} Lire la recette${top.pages.length > 1 ? ` (${top.pages.length} pages)` : ""}</button>`
      : "";
    return this._tplSheet("Recette en photo", body, footer);
  }

  /* ---------------- planifier la semaine */

  _tplWeekPlan(top) {
    if (top.step === "loading" || top.step === "applying") {
      const msg = top.step === "applying" ? "J'ajoute tout au menu et à la liste de courses…" : PLAN_LOADING[top.loadingMsg || 0];
      return this._tplSheet("Planifier ma semaine", `<div class="card hero">
        <div class="emoji" style="font-size:56px">✨</div>
        <div class="spinner" style="margin:16px auto;color:var(--fm-primary)"></div>
        <h2>${esc(msg)}</h2>
        <p class="muted">Un menu complet prend environ une à deux minutes.</p>
      </div>`);
    }
    if (top.step === "preview") return this._tplWeekPreview(top);

    const today = todayIso();
    const taken = new Set(top.taken);
    const count = Object.values(top.slots).filter(Boolean).length;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(top.start, i);
      const past = date < today;
      const chip = (slot) => {
        const key = `${date}|${slot}`;
        if (taken.has(key)) return `<span class="chip taken">${slot === "lunch" ? "☀️ Midi" : "🌙 Soir"}</span>`;
        return `<button class="chip ${top.slots[key] ? "on" : ""}" data-action="weekplan-slot" data-date="${date}" data-slot="${slot}" ${past ? "disabled" : ""}>${slot === "lunch" ? "☀️ Midi" : "🌙 Soir"}</button>`;
      };
      days.push(`<div class="plan-day"><span class="d">${DAY_SHORT[i]} ${parseIso(date).getDate()}</span>${chip("lunch")}${chip("dinner")}</div>`);
    }
    const hh = this.settings.members.length;
    const body = `
      <p class="muted" style="margin-top:0">Semaine du ${esc(fmtDay(top.start, { day: "numeric", month: "long" }))}. Choisissez les repas à préparer : l'IA compose un menu équilibré, de saison, adapté à votre foyer et à votre temps.</p>
      ${top.error ? `<div class="alert">${esc(top.error)}</div>` : ""}
      <div class="card" style="padding:6px 14px">${days.join("")}</div>
      <div class="row wrap" style="justify-content:space-between;margin:14px 0">
        <span class="muted small row">${icon("account-group-outline")} Personnes</span>${this._tplStepper("top.servings", top.servings, "pers.")}
      </div>
      <label class="field"><span>${icon("cash")} Budget pour ces repas (facultatif)</span>
        <input class="input" type="number" min="0" inputmode="numeric" placeholder="Ex. : 60 €" value="${esc(top.budget)}" data-model="top.budget"></label>
      ${this._tplSwitch("top.leftovers", top.leftovers, "♻️ Cuisine des restes", "Un plat cuisiné en double se transforme en un autre repas : moins de courses, rien ne se perd.")}
      ${this._tplSwitch("top.useCarnet", top.useCarnet, "📖 Reprendre des recettes du carnet", "Vos favoris peuvent revenir dans le menu.")}
      <label class="field" style="margin-top:8px"><span>${icon("heart-outline")} Envies pour cette semaine (facultatif)</span>
        <input class="input" placeholder="Ex. : du poisson, un plat mexicain, soupe le lundi" value="${esc(top.notes)}" data-model="top.notes"></label>
      ${hh ? `<p class="hh-hint">${icon("check-circle")} Profil du foyer pris en compte (${hh} personne${hh > 1 ? "s" : ""}).</p>` : `<p class="hh-hint" style="color:var(--fm-text2)">Astuce : décrivez votre foyer dans les réglages ⚙️ (allergies, enfants, régimes) pour des menus sur mesure.</p>`}`;
    const footer = `<button class="btn grow big" data-action="weekplan-generate" ${count ? "" : "disabled"}>${icon("creation")} Proposer ${count} repas</button>`;
    return this._tplSheet("Planifier ma semaine", body, footer);
  }

  _tplWeekPreview(top) {
    const p = top.proposal;
    const total = p.meals.reduce((t, m) => t + (m.estimated_cost || 0), 0);
    const over = p.budget && total > p.budget;
    const label = (m) => `${cap(fmtDay(m.date, { weekday: "long", day: "numeric" }))} · ${m.slot === "lunch" ? "midi" : "soir"}`;
    const body = `
      ${p.summary ? `<div class="info">✨ ${esc(p.summary)}</div>` : ""}
      ${total ? `<p class="row small ${over ? "warn" : "muted"}" style="margin:0 0 12px">${icon("cash")} Coût estimé : <b>${fmtNumber(total)} €</b>${p.budget ? ` pour un budget de ${p.budget} €` : ""}</p>` : ""}
      ${p.meals
        .map((m, i) => `<div class="card pmeal">
          <div class="thumb" style="background:hsl(${hashHue(m.title)} 60% 50% / .15)">${emojiFor(m.title)}</div>
          <div class="grow">
            <div class="when">${esc(label(m))}</div>
            <div class="t">${esc(m.title)}</div>
            <div class="badges">
              ${m.time ? `<span class="tag">⏱️ ${fmtMinutes(m.time)}</span>` : ""}
              ${m.estimated_cost ? `<span class="tag gold">${fmtNumber(m.estimated_cost)} €</span>` : ""}
              ${m.recipe_id ? `<span class="tag">📖 Du carnet</span>` : ""}
              ${m.leftovers_from ? `<span class="tag alt">♻️ Restes</span>` : ""}
            </div>
            ${m.note ? `<div class="muted small" style="margin-top:6px">${esc(m.note)}</div>` : ""}
          </div>
          <button class="icon-btn" data-action="weekplan-remove" data-i="${i}" aria-label="Retirer ce repas">${icon("close")}</button>
        </div>`)
        .join("")}
      <button class="btn text block" data-action="weekplan-back">${icon("tune-variant")} Changer les réglages et recommencer</button>`;
    const footer = `<button class="btn tonal" data-action="weekplan-generate">${icon("refresh")}</button>
      <button class="btn grow big" data-action="weekplan-apply" ${p.meals.length ? "" : "disabled"}>${icon("calendar-check")} Ajouter ${p.meals.length} repas au menu</button>`;
    return this._tplSheet("Votre menu", body, footer);
  }

  _tplQuickSheet() {
    const body = `
      <p class="muted small row" id="quick-count" style="margin-top:0">${this._tplQuickCount()}</p>
      ${this._tplQuickInput("quick-input-sheet")}
      <p class="muted small" style="margin:14px 0 8px">Vos habitués — un appui suffit :</p>
      <div class="chips quick-sugg">${this._tplQuickChips()}</div>
      <p class="muted small" style="margin-top:18px">Astuce : séparez plusieurs articles par des virgules. Les quantités d'un même article s'additionnent.</p>`;
    const footer = `<button class="btn tonal grow" data-action="close">${icon("check")} Terminé</button>
      <button class="btn grow" data-action="go-shopping">${icon("cart")} Voir la liste</button>`;
    return this._tplSheet("Ajout rapide", body, footer);
  }

  _allergySummary() {
    const all = [...new Set(this.settings.members.flatMap((m) => m.allergies))];
    return all.length ? `, sans ${all.map((a) => HH.allergens[a].toLowerCase()).join(", ")}` : "";
  }

  _tplStepper(path, value, suffix = "", min = 1, max = 30, stepBy = 1) {
    return `<div class="stepper">
      <button data-action="step" data-path="${path}" data-delta="-${stepBy}" data-min="${min}" data-max="${max}" aria-label="Moins">${icon("minus")}</button>
      <span class="val">${esc(value)}${suffix ? " " + suffix : ""}</span>
      <button data-action="step" data-path="${path}" data-delta="${stepBy}" data-min="${min}" data-max="${max}" aria-label="Plus">${icon("plus")}</button>
    </div>`;
  }

  _tplResult(r, i) {
    const time = totalTime(r);
    return `<div class="card result" data-action="open-result" data-i="${i}" role="button" tabindex="0">
      <div class="head">
        <div class="thumb" style="background:hsl(${hashHue(r.title)} 60% 50% / .15)">${emojiFor(r.title)}</div>
        <div class="grow">
          <h4>${esc(r.title)}</h4>
          <div class="muted small">${esc(r.description)}</div>
        </div>
      </div>
      <div class="meta" style="margin-bottom:0">
        ${time ? `<span><span class="ico" style="--c:${COLORS.orange}">${icon("timer-outline")}</span> ${fmtMinutes(time)}</span>` : ""}
        ${r.servings ? `<span><span class="ico" style="--c:${COLORS.blue}">${icon("account-group-outline")}</span> ${r.servings} pers.</span>` : ""}
      </div>
      ${r.uses && r.uses.length ? `<div class="uses"><b class="ok">✓ Utilise :</b> ${esc(r.uses.join(", "))}</div>` : ""}
      ${r.missing && r.missing.length ? `<div class="uses"><b class="warn">+ À acheter :</b> ${esc(r.missing.join(", "))}</div>` : `<div class="uses ok">Rien à acheter 🎉</div>`}
    </div>`;
  }

  /* ---------------- onglet Recettes */

  _filteredRecipes() {
    const q = String(this.s.search || "").trim().toLowerCase();
    return this.s.recipes.filter((r) => {
      if (this.s.filter === "fav" && !r.favorite) return false;
      if (this.s.filter.startsWith("tag:") && !(r.tags || []).includes(this.s.filter.slice(4))) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }

  _tplRecipes() {
    const tagCount = {};
    for (const r of this.s.recipes) for (const t of r.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
    const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
    const f = this.s.filter;
    return `
      <div class="row" style="margin-bottom:12px">
        <button class="btn grow" data-action="new-recipe">${icon("plus")} Nouvelle</button>
        <button class="btn tonal grow" data-action="import-open">${icon("link-variant")} Lien</button>
        <button class="btn tonal grow" data-action="book-open">${icon("book-open-variant")} Photo</button>
      </div>
      <div class="search">
        ${icon("magnify")}
        <input class="input" type="search" placeholder="Chercher une recette, un ingrédient…" value="${esc(this.s.search)}" data-model="search" data-live="recipes">
      </div>
      <div class="chips" style="margin-bottom:14px">
        <button class="chip ${f === "all" ? "on" : ""}" data-action="filter" data-value="all">${icon("bookshelf")} Toutes</button>
        <button class="chip ${f === "fav" ? "on" : ""}" data-action="filter" data-value="fav">${icon("star")} Favoris</button>
        ${tags.map((t) => `<button class="chip ${f === "tag:" + t ? "on" : ""}" data-action="filter" data-value="tag:${esc(t)}">${icon("tag-outline")} ${esc(t)}</button>`).join("")}
      </div>
      <div id="recipe-list">${this._tplRecipeItems()}</div>
      ${this._tplVersion()}`;
  }

  _tplThumb(r) {
    const img = safeUrl(r.image);
    return img
      ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="thumb" style="background:hsl(${hashHue(r.title)} 60% 50% / .15)">${emojiFor(r.title)}</div>`;
  }

  _tplRecipeItems() {
    if (!this.s.recipes.length) {
      return `<div class="empty"><div class="emoji">📖</div><p>Votre carnet est vide.<br>Ajoutez une recette, importez un lien Marmiton, ou partez d'une photo du frigo.</p></div>`;
    }
    const list = this._filteredRecipes();
    if (!list.length) return `<div class="empty"><p>Aucune recette ne correspond.</p></div>`;
    return list
      .map((r) => {
        const time = totalTime(r);
        const meta = [time ? fmtMinutes(time) : "", r.servings ? `${r.servings} pers.` : "", `${r.ingredients.length} ingrédients`].filter(Boolean).join(" · ");
        return `<button class="list-item" data-action="open-recipe" data-id="${esc(r.id)}">
          ${this._tplThumb(r)}
          <div class="grow"><div class="t">${esc(r.title)}</div><div class="m">${esc(meta)}</div></div>
          ${r.favorite ? `<span class="star">${icon("star")}</span>` : ""}
        </button>`;
      })
      .join("");
  }

  /* ---------------- onglet Semaine */

  _tplWeek() {
    const w = this.s.week;
    const today = todayIso();
    const end = addDays(w.start, 6);
    const label = `${fmtDay(w.start, { day: "numeric", month: "short" })} – ${fmtDay(end, { day: "numeric", month: "short" })}`;
    const isCurrent = today >= w.start && today <= end;
    const pending = w.entries.filter((e) => !e.in_shopping_list).length;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(w.start, i);
      days.push(`<div class="card day ${date === today ? "today" : ""}">
        <div class="dname">${cap(fmtDay(date, { weekday: "long", day: "numeric" }))}${date === today ? `<span class="now">Aujourd'hui</span>` : ""}</div>
        ${["lunch", "dinner"].map((slot) => this._tplSlot(date, slot)).join("")}
      </div>`);
    }
    return `
      <div class="week-nav">
        <button class="icon-btn" data-action="week-shift" data-delta="-1" aria-label="Semaine précédente">${icon("chevron-left")}</button>
        <div class="label">${esc(label)}${w.loading ? ` <span class="spinner sm" style="display:inline-block;vertical-align:middle"></span>` : ""}</div>
        <button class="icon-btn" data-action="week-shift" data-delta="1" aria-label="Semaine suivante">${icon("chevron-right")}</button>
      </div>
      ${isCurrent ? "" : `<div style="text-align:center;margin:-6px 0 10px"><button class="btn text" data-action="week-today">${icon("calendar-today")} Revenir à cette semaine</button></div>`}
      <button class="btn tonal block" style="margin-bottom:12px" data-action="weekplan-open">${icon("creation")} Planifier ma semaine avec l'IA</button>
      ${days.join("")}
      <button class="btn big block" data-action="shop-preview" ${w.entries.length ? "" : "disabled"}>${icon("cart-outline")} Liste de courses de la semaine${pending ? ` (${pending} repas)` : ""}</button>`;
  }

  _tplSlot(date, slot) {
    const meals = this.s.week.entries.filter((e) => e.date === date && e.slot === slot);
    return `<div class="slot">
      <div class="sl"><span class="ico" style="--c:${slot === "lunch" ? COLORS.amber : COLORS.indigo}">${icon(slot === "lunch" ? "weather-sunny" : "weather-night")}</span>${SLOT_LABELS[slot]}</div>
      <div class="meals">
        ${meals
          .map((e) => {
            const r = this._recipe(e.recipe_id);
            return `<div class="meal">
              <button class="name" data-action="meal-open" data-id="${esc(e.id)}">${r ? emojiFor(r.title) + " " : ""}${esc(r ? r.title : "Recette supprimée")}</button>
              ${e.note ? `<div class="note">${/reste/i.test(e.note) ? "♻️" : "📝"} ${esc(e.note)}</div>` : ""}
              <div class="ctrls">
                ${e.in_shopping_list ? `<span class="pers incart">${icon("cart-check")} Dans la liste</span>` : ""}
                <button class="icon-btn" data-action="meal-servings" data-id="${esc(e.id)}" data-delta="-1" aria-label="Une portion de moins">${icon("minus")}</button>
                <span class="pers">${e.servings} pers.</span>
                <button class="icon-btn" data-action="meal-servings" data-id="${esc(e.id)}" data-delta="1" aria-label="Une portion de plus">${icon("plus")}</button>
                <button class="icon-btn" data-action="meal-remove" data-id="${esc(e.id)}" aria-label="Retirer du menu">${icon("delete-outline")}</button>
              </div>
            </div>`;
          })
          .join("")}
        <button class="add-meal" data-action="slot-add" data-date="${date}" data-slot="${slot}">${icon("plus")} Ajouter</button>
      </div>
    </div>`;
  }

  /* ---------------- feuilles */

  _tplSheet(title, body, footer = "", extraHead = "") {
    return `<div class="sheet">
      <div class="toolbar">
        <button class="icon-btn" data-action="close" aria-label="Fermer">${icon("arrow-left")}</button>
        <div class="title">${esc(title)}</div>${extraHead}
      </div>
      <div class="body"><div class="page">${body}</div></div>
      ${footer ? `<div class="footer"><div class="inner">${footer}</div></div>` : ""}
    </div>`;
  }

  _tplOverlay(top) {
    switch (top.type) {
      case "recipe":
        return this._tplRecipeSheet(top);
      case "cook":
        return this._tplCook(top);
      case "editor":
        return this._tplEditor(top);
      case "import":
        return this._tplImport(top);
      case "plan":
        return this._tplPlan(top);
      case "pick":
        return this._tplPick(top);
      case "shopping":
        return this._tplShoppingSheet(top);
      case "quick":
        return this._tplQuickSheet();
      case "settings":
        return this._tplSettings(top);
      case "member":
        return this._tplMember(top);
      case "store":
        return this._tplStore(top);
      case "book":
        return this._tplBook(top);
      case "weekplan":
        return this._tplWeekPlan(top);
      default:
        return "";
    }
  }

  _tplRecipeSheet(top) {
    const r = top.id ? this._recipe(top.id) : top.draft;
    if (!r) return "";
    const base = r.servings || top.servings || 4;
    const factor = (top.servings || base) / base;
    const img = safeUrl(r.image);
    const saved = Boolean(top.id);
    const star = saved
      ? `<button class="icon-btn" data-action="favorite" aria-label="Favori">${icon(r.favorite ? "star" : "star-outline")}</button>`
      : "";
    const body = `
      ${img ? `<img class="cover" src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : ""}
      <h2>${esc(r.title)}</h2>
      ${r.description ? `<p class="muted" style="margin:6px 0">${esc(r.description)}</p>` : ""}
      <div class="meta">
        ${r.prep_time ? `<span><span class="ico" style="--c:${COLORS.green}">${icon("knife")}</span> Préparation ${fmtMinutes(r.prep_time)}</span>` : ""}
        ${r.cook_time ? `<span><span class="ico" style="--c:${COLORS.red}">${icon("stove")}</span> Cuisson ${fmtMinutes(r.cook_time)}</span>` : ""}
      </div>
      ${r.tags && r.tags.length ? `<div class="chips" style="margin-bottom:8px">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      ${!saved && r.missing && r.missing.length ? `<div class="info"><b>À acheter :</b> ${esc(r.missing.join(", "))}</div>` : ""}

      <div class="sec">
        ${bubble("basket-outline", COLORS.green)}
        <h3>Ingrédients</h3>
        ${this._tplStepper("top.servings", top.servings || base, "pers.")}
      </div>
      <ul class="ings">
        ${r.ingredients
          .map((ing) => {
            const f = fmtIngredient(ing, factor);
            return `<li><span class="ing-emoji">${ingEmoji(ing.name)}</span><span class="q">${esc(f.amount)}</span><span>${esc(cap(f.name))}</span></li>`;
          })
          .join("")}
      </ul>

      <div class="sec">${bubble("chef-hat", COLORS.orange)}<h3>Préparation</h3></div>
      <ol class="steps">${r.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join("")}</ol>

      ${saved
        ? `<div class="sec">${bubble("notebook-edit-outline", COLORS.purple)}<h3>Mes notes</h3></div>
           <textarea class="input" placeholder="Astuces, variantes, avis de la famille…" data-change="notes-save">${esc(r.notes)}</textarea>
           <p class="muted small">Enregistrées automatiquement quand vous quittez le champ.</p>`
        : ""}
      ${safeUrl(r.source_url) ? `<p class="small">Source : <a class="src" href="${esc(safeUrl(r.source_url))}" target="_blank" rel="noopener noreferrer">${esc(r.source_url)}</a></p>` : ""}

      ${saved
        ? `<div class="actions-grid">
            <button class="btn outline" data-action="edit-recipe">${icon("pencil-outline")} Modifier</button>
            <button class="btn danger ${top.confirmDelete ? "armed" : ""}" data-action="delete-recipe">${icon("delete-outline")} ${top.confirmDelete ? "Confirmer" : "Supprimer"}</button>
          </div>`
        : `<button class="btn tonal block" style="margin-top:16px" data-action="save-draft">${icon("book-plus-outline")} Enregistrer dans le carnet</button>`}
    `;
    const footer = `
      <button class="btn tonal grow" data-action="plan-open">${icon("calendar-plus")} Planifier</button>
      <button class="btn grow" data-action="cook" ${r.steps.length ? "" : "disabled"}>${icon("chef-hat")} Cuisiner</button>`;
    return this._tplSheet(saved ? "Recette" : "Idée de recette", body, footer, star);
  }

  _tplCook(top) {
    const r = this._overlayRecipe();
    if (!r) return "";
    const total = r.steps.length;
    const base = r.servings || top.servings || 4;
    const factor = (top.servings || base) / base;
    const done = top.step >= total;
    const pct = total ? Math.round((Math.min(top.step + 1, total) / total) * 100) : 100;
    return `<div class="sheet cook">
      <div class="toolbar">
        <button class="icon-btn" data-action="close" aria-label="Quitter le mode cuisine">${icon("close")}</button>
        <div class="title">${esc(r.title)}</div>
        <button class="icon-btn" data-action="cook-ing" aria-label="Ingrédients">${icon(top.showIng ? "format-list-checks" : "format-list-bulleted")}</button>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      ${top.showIng
        ? `<div class="ingpanel"><ul class="ings">${r.ingredients
            .map((ing) => {
              const f = fmtIngredient(ing, factor);
              return `<li><span class="ing-emoji">${ingEmoji(ing.name)}</span><span class="q">${esc(f.amount)}</span><span>${esc(cap(f.name))}</span></li>`;
            })
            .join("")}</ul></div>`
        : ""}
      <div class="stepbox">
        ${done
          ? `<div class="done"><div class="emoji">🍽️</div><div class="txt">Bon appétit !</div></div>`
          : `<div class="num">Étape ${top.step + 1} sur ${total}</div><div class="txt">${esc(r.steps[top.step])}</div>`}
      </div>
      <div class="nav">
        <button class="btn tonal" data-action="cook-prev" ${top.step === 0 ? "disabled" : ""}>${icon("chevron-left")} Précédent</button>
        ${done
          ? `<button class="btn" data-action="close">Terminer</button>`
          : `<button class="btn" data-action="cook-next">${top.step + 1 === total ? "Terminé" : "Suivant"} ${icon("chevron-right")}</button>`}
      </div>
    </div>`;
  }

  _tplEditor(top) {
    const d = top.draft;
    const body = `
      ${top.imported === "photo" ? `<div class="info">📖 Recette lue sur la photo. Relisez-la (surtout les quantités), puis enregistrez.</div>` : top.imported ? `<div class="info">Recette importée. Vérifiez-la, puis enregistrez.</div>` : ""}
      <label class="field"><span>Nom de la recette *</span><input class="input" value="${esc(d.title)}" data-model="top.draft.title" placeholder="Gratin dauphinois"></label>
      <label class="field"><span>Description</span><input class="input" value="${esc(d.description)}" data-model="top.draft.description"></label>
      <div class="row">
        <label class="field grow"><span>Portions</span><input class="input" type="number" min="1" inputmode="numeric" value="${esc(d.servings)}" data-model="top.draft.servings"></label>
        <label class="field grow"><span>Préparation (min)</span><input class="input" type="number" min="0" inputmode="numeric" value="${esc(d.prep_time)}" data-model="top.draft.prep_time"></label>
        <label class="field grow"><span>Cuisson (min)</span><input class="input" type="number" min="0" inputmode="numeric" value="${esc(d.cook_time)}" data-model="top.draft.cook_time"></label>
      </div>
      <label class="field"><span>Ingrédients — un par ligne (ex. : 200 g de farine)</span><textarea class="input" rows="8" data-model="top.draft.ingredients">${esc(d.ingredients)}</textarea></label>
      <label class="field"><span>Étapes — une par ligne</span><textarea class="input" rows="10" data-model="top.draft.steps">${esc(d.steps)}</textarea></label>
      <label class="field"><span>Mots-clés, séparés par des virgules</span><input class="input" value="${esc(d.tags)}" data-model="top.draft.tags" placeholder="plat, végétarien, rapide"></label>
      <label class="field"><span>Adresse d'une photo (facultatif)</span><input class="input" type="url" value="${esc(d.image)}" data-model="top.draft.image"></label>
      <label class="field"><span>Source (facultatif)</span><input class="input" type="url" value="${esc(d.source_url)}" data-model="top.draft.source_url"></label>`;
    const footer = `<button class="btn grow big" data-action="save-editor">${icon("content-save-outline")} Enregistrer</button>`;
    return this._tplSheet(d.id ? "Modifier la recette" : "Nouvelle recette", body, footer);
  }

  _tplImport(top) {
    const body = `
      <p class="muted">Collez l'adresse d'une recette (Marmiton, 750g, Cuisine AZ, un blog…). Je récupère les ingrédients et les étapes.</p>
      ${top.error ? `<div class="alert">${esc(top.error)}</div>` : ""}
      <label class="field"><span>Adresse de la recette</span>
        <input class="input" id="import-url" type="url" inputmode="url" placeholder="https://www.marmiton.org/recettes/…" value="${esc(top.url)}" data-model="top.url" data-enter="import" ${top.loading ? "disabled" : ""}>
      </label>`;
    const footer = `<button class="btn grow big" data-action="import" ${top.loading ? "disabled" : ""}>${top.loading ? `<span class="spinner sm"></span> Import en cours…` : `${icon("download")} Importer`}</button>`;
    return this._tplSheet("Importer une recette", body, footer);
  }

  _tplPlan(top) {
    const r = this._recipe(top.id);
    const days = [];
    for (let i = 0; i < 14; i++) {
      const date = addDays(todayIso(), i);
      const label = i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : cap(fmtDay(date, { weekday: "short", day: "numeric" }));
      days.push(`<button class="chip ${top.date === date ? "on" : ""}" data-action="set" data-path="top.date" data-value="${date}">${esc(label)}</button>`);
    }
    const auto = this.s.config && this.s.config.auto_shopping;
    const listName = this.s.config && this.s.config.shopping_list && this.s.config.shopping_list.name;
    const body = `
      <h2 style="margin-bottom:16px">${esc(r ? r.title : "")}</h2>
      <div class="field"><span>Quel jour ?</span><div class="chips">${days.join("")}</div></div>
      <div class="field"><span>Quel repas ?</span>
        <div class="segmented">
          <button class="${top.slot === "lunch" ? "on" : ""}" data-action="set" data-path="top.slot" data-value="lunch">Midi</button>
          <button class="${top.slot === "dinner" ? "on" : ""}" data-action="set" data-path="top.slot" data-value="dinner">Soir</button>
        </div>
      </div>
      <div class="row" style="justify-content:space-between">
        <span class="muted small">Pour combien de personnes ?</span>
        ${this._tplStepper("top.servings", top.servings, "pers.")}
      </div>
      ${auto
        ? `<div class="info" style="margin-top:20px">${icon("cart-arrow-down")} Les ingrédients seront ajoutés à ${listName ? `« ${esc(listName)} »` : "votre liste de courses"}.</div>`
        : ""}`;
    const footer = `<button class="btn grow big" data-action="plan-confirm">${icon("calendar-check")} Ajouter au menu</button>`;
    return this._tplSheet("Planifier", body, footer);
  }

  _tplPick(top) {
    const body = `
      <p class="muted" style="margin-top:0">${esc(cap(fmtDay(top.date)))} · ${SLOT_LABELS[top.slot].toLowerCase()}</p>
      <div class="search">
        ${icon("magnify")}
        <input class="input" type="search" placeholder="Chercher dans le carnet…" value="${esc(top.query)}" data-model="top.query" data-live="pick">
      </div>
      <div id="pick-list">${this._tplPickItems()}</div>`;
    return this._tplSheet("Choisir une recette", body);
  }

  _tplPickItems() {
    const top = this.top;
    if (!top || top.type !== "pick") return "";
    if (!this.s.recipes.length) {
      return `<div class="empty"><div class="emoji">📖</div><p>Le carnet est vide. Ajoutez d'abord des recettes depuis l'onglet Recettes ou Frigo.</p></div>`;
    }
    const q = String(top.query || "").trim().toLowerCase();
    const list = this.s.recipes
      .filter((r) => !q || r.title.toLowerCase().includes(q) || (r.tags || []).some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite));
    if (!list.length) return `<div class="empty"><p>Aucune recette ne correspond.</p></div>`;
    return list
      .map(
        (r) => `<button class="list-item" data-action="pick-recipe" data-id="${esc(r.id)}">
          ${this._tplThumb(r)}
          <div class="grow"><div class="t">${esc(r.title)}</div><div class="m">${r.servings ? `${r.servings} pers.` : ""}${totalTime(r) ? " · " + fmtMinutes(totalTime(r)) : ""}</div></div>
          ${r.favorite ? `<span class="star">${icon("star")}</span>` : ""}
        </button>`
      )
      .join("");
  }

  _tplShoppingSheet(top) {
    let body;
    if (top.loading && !top.items.length) {
      body = `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`;
    } else if (!top.items.length) {
      body = `<div class="empty"><div class="emoji">🛒</div><p>${top.onlyNew ? "Tous les repas de la semaine sont déjà dans la liste de courses." : "Aucun ingrédient pour cette semaine."}</p></div>
        ${top.onlyNew ? `<button class="btn tonal block" data-action="set" data-path="top.onlyNew" data-value="">Tout reprendre quand même</button>` : ""}`;
    } else {
      const count = top.items.filter((i) => i.checked).length;
      body = `
        <p class="muted" style="margin-top:0">${top.onlyNew ? "Repas pas encore ajoutés" : "Tous les repas de la semaine"}. Décochez ce que vous avez déjà.</p>
        ${top.list_name ? "" : `<div class="alert">Aucune liste de courses trouvée. Ajoutez l'intégration « Liste de courses » de Home Assistant ou choisissez une liste dans les options de Frigo Malin.</div>`}
        <div class="row" style="justify-content:space-between">
          <span class="small muted">${count} / ${top.items.length} sélectionnés</span>
          <button class="btn text" data-action="shop-toggle-all">${icon(top.items.every((i) => i.checked) ? "checkbox-multiple-blank-outline" : "checkbox-multiple-marked-outline")} ${top.items.every((i) => i.checked) ? "Tout décocher" : "Tout cocher"}</button>
        </div>
        <div class="card" style="padding:4px 16px">
          ${top.items
            .map(
              (item, i) => `<label class="check">
                <input type="checkbox" ${item.checked ? "checked" : ""} data-change="shop-check" data-i="${i}">
                <span class="ing-emoji">${ingEmoji(item.text)}</span>
                <div class="grow"><div>${esc(item.text)}</div><div class="sub">${esc(item.recipes.join(", "))}</div></div>
              </label>`
            )
            .join("")}
        </div>
        ${top.onlyNew ? `<button class="btn text block" data-action="set" data-path="top.onlyNew" data-value="">Inclure aussi les repas déjà ajoutés</button>` : ""}`;
    }
    const n = top.items.filter((i) => i.checked).length;
    const footer = top.items.length
      ? `<button class="btn grow big" data-action="shop-add" ${n && !top.loading ? "" : "disabled"}>${top.loading ? `<span class="spinner sm"></span>` : icon("cart-plus")} Ajouter ${n} article${n > 1 ? "s" : ""}${top.list_name ? ` à « ${esc(top.list_name)} »` : ""}</button>`
      : "";
    return this._tplSheet("Liste de courses", body, footer);
  }
}

if (!customElements.get("frigo-malin-panel")) {
  customElements.define("frigo-malin-panel", FrigoMalinPanel);
}
console.info(`%c FRIGO MALIN %c ${FM_VERSION} `, "background:#43a047;color:#fff;border-radius:3px 0 0 3px", "background:#555;color:#fff;border-radius:0 3px 3px 0");
