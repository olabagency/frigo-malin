/*
 * Frigo Malin — panneau Home Assistant.
 * Un seul fichier, sans dépendance ni étape de build.
 * Les couleurs viennent du thème de Home Assistant (clair ou sombre).
 */

const FM_VERSION = "1.0.2";

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
  }

  disconnectedCallback() {
    this._releaseWakeLock();
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
    this._render();
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
      case "set":
        if (d.path === "top.onlyNew" && this.top && this.top.type === "shopping") {
          this.top.onlyNew = false;
          this._loadShopping(this.top);
          return;
        }
        this._setPath(d.path, d.value);
        this._render();
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
        this._shoppingPreview();
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

  async _shoppingPreview() {
    const w = this.s.week;
    const item = { type: "shopping", loading: true, items: [], entry_ids: [], list_name: null, onlyNew: true };
    this.s.stack.push(item);
    this._renderOverlay();
    await this._loadShopping(item, w);
  }

  async _loadShopping(item, w = this.s.week) {
    item.loading = true;
    this._renderOverlay();
    try {
      const res = await this._ws("shopping/preview", { start: w.start, end: addDays(w.start, 6), only_new: item.onlyNew });
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
    host.innerHTML = top ? this._tplOverlay(top) : "";
    const key = top ? `${this.s.stack.length}:${top.type}` : "";
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
    </div>`;
  }

  _tplNav() {
    const tabs = [
      ["fridge", "fridge-outline", "fridge", "Frigo"],
      ["recipes", "book-open-page-variant-outline", "book-open-page-variant", "Recettes"],
      ["week", "calendar-week-outline", "calendar-week", "Semaine"],
    ];
    return `<div class="inner">${tabs
      .map(
        ([key, ic, icActive, label]) =>
          `<button class="${this.s.tab === key ? "active" : ""}" data-action="tab" data-tab="${key}" aria-label="${label}"><span class="pill">${icon(this.s.tab === key ? icActive : ic)}</span>${label}</button>`
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
        <label class="field" style="margin-bottom:0">
          <span>${icon("heart-outline")} Envies ou contraintes (facultatif)</span>
          <input class="input" placeholder="Végétarien, sans gluten, moins de 30 min…" value="${esc(f.notes)}" data-model="fridge.notes">
        </label>
      </div>

      <button class="btn big block" data-action="suggest" ${f.ingredients.length ? "" : "disabled"}>${icon("chef-hat")} Trouver des recettes</button>
      <button class="btn text block" style="margin-top:8px" data-action="fridge-reset">${icon("restart")} Tout recommencer</button>`;
  }

  _tplStepper(path, value, suffix = "", min = 1, max = 30) {
    return `<div class="stepper">
      <button data-action="step" data-path="${path}" data-delta="-1" data-min="${min}" data-max="${max}" aria-label="Moins">${icon("minus")}</button>
      <span class="val">${esc(value)}${suffix ? " " + suffix : ""}</span>
      <button data-action="step" data-path="${path}" data-delta="1" data-min="${min}" data-max="${max}" aria-label="Plus">${icon("plus")}</button>
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
        <button class="btn tonal grow" data-action="import-open">${icon("link-variant")} Importer un lien</button>
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
        return this._tplShopping(top);
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
      ${top.imported ? `<div class="info">Recette importée. Vérifiez-la, puis enregistrez.</div>` : ""}
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

  _tplShopping(top) {
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
