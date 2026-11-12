/*
 * Frigo Malin — panneau Home Assistant.
 * Un seul fichier, sans dépendance ni étape de build.
 * Les couleurs viennent du thème de Home Assistant (clair ou sombre).
 */

const FM_VERSION = "1.20.1";

const DAY_MS = 86400000;
const SLOT_LABELS = { lunch: "Midi", dinner: "Soir" };
const ABBREV_UNITS = new Set(["kg", "g", "mg", "cm", "l", "dl", "cl", "ml", "c. à soupe", "c. à café"]);

/* ------------------------------------------------------------------ outils */

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Adresses d'images acceptées : web, données intégrées, ou photos fournies avec Frigo Malin.
const safeUrl = (url) =>
  /^(https?:\/\/|data:image\/|\/frigo_malin_static\/)/i.test(String(url || "").trim()) ? String(url).trim() : "";

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
  let qty = ing.quantity == null ? null : ing.quantity * factor;
  let unit = ing.unit;
  // « 0,5 kg » se lit mieux « 500 g », « 0,25 l » mieux « 25 cl ».
  if (qty != null && qty < 1 && unit === "kg") [qty, unit] = [qty * 1000, "g"];
  else if (qty != null && qty < 1 && unit === "l") [qty, unit] = [qty * 100, "cl"];
  ing = { ...ing, unit };
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
  [/poulet|dinde|volaille|canard/, "🍗"], [/boeuf|steak|veau|agneau|porc|viande|tartare/, "🥩"], [/capre/, "🫒"], [/saucisse|merguez/, "🌭"],
  [/crevette|gambas/, "🦐"], [/saumon|thon|cabillaud|poisson|truite|sardine|maquereau|colin/, "🐟"], [/moule|huitre|coquillage/, "🦪"],
  [/pain|baguette|brioche/, "🥖"], [/riz|risotto/, "🍚"], [/pate|spaghetti|tagliatelle|penne|lasagne|nouille|coquillette/, "🍝"],
  [/farine|semoule|ble|avoine|quinoa|boulgour/, "🌾"], [/sucre|miel|sirop/, "🍯"], [/moutarde/, "🟡"], [/ketchup|sauce worcester|worcestershire|tabasco/, "🫙"], [/chocolat|cacao/, "🍫"],
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
  const t = foldText(String(text || "").replace(/\([^)]*\)/g, " "));
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
  ["viande", /poulet|dinde|volaille|canard|boeuf|steak|veau|agneau|porc|viande|saucisse|merguez|jambon|lardon|bacon|chorizo|saucisson|crevette|gambas|saumon|cabillaud|poisson|truite|sardine|maquereau|colin|moule|huitre|escalope|\broti|\bcote|cuisse|thon frais|lapin/],
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

/* Mode cuisine : un emoji selon l'action principale de l'étape. */
const STEP_EMOJIS = [
  [/prechauff|enfourn|\bau four\b|gratin|rotir|roti\b/, "♨️"],
  [/mixe|blender|hache.*robot|robot/, "🌀"],
  [/sauce|vinaigrette|marinade/, "🥣"],
  [/rap(e|ez|er)\b|zeste/, "🧀"],
  [/epluch|emince|coupe|taill|hach|cisel|detaill|tranch|decoup|epepin|evide/, "🔪"],
  [/egoutt|rince|lave|essor/, "💧"],
  [/casse.*oeuf|bat(tez|tre)? les oeufs|fouett|monte.*neige/, "🥚"],
  [/mijot|laisse.*cuire|couvr|frem/, "🫕"],
  [/fait(es)? (les |la |le |l')?(revenir|dorer|sauter|fondre|griller)|saisi|poele|wok|sauter|dore/, "🍳"],
  [/bouill|ebullition|eau salee|cuire.*eau|plonge/, "♨️"],
  [/cuire|cuisson|cuit/, "🔥"],
  [/melang|remu|incorpor|ajout|verse|delay|enrob|fouet/, "🥄"],
  [/sale|poivr|assaisonn|epice|rectifi/, "🧂"],
  [/reserv|refrigerat|au frais|frigo|refroidi/, "❄️"],
  [/attend|repos|laisse (gonfler|reposer|mariner)|marin/, "⏳"],
  [/etal|abaiss|garni|dispos|repart|forme|faconn|roule/, "🫓"],
  [/sert|servez|dress|parsem|decor|deguste/, "🍽️"],
];
function stepEmoji(text) {
  const t = foldText(text);
  // Le verbe en tête de phrase décrit l'action principale (« Servez… », « Faites revenir… ») : il passe d'abord.
  const head = t.split(/[^a-z']+/).filter(Boolean).slice(0, 3).join(" ");
  for (const [re, e] of STEP_EMOJIS) if (re.test(head)) return e;
  for (const [re, e] of STEP_EMOJIS) if (re.test(t)) return e;
  return "👩‍🍳";
}

/* Durée citée dans une étape : « 20 minutes », « 5 à 8 min », « 1 h 30 », « 1 heure ». Renvoie des secondes. */
function stepDuration(text) {
  const t = foldText(text);
  let m = t.match(/(\d+)\s*h(?:eures?)?\s*(\d{1,2})?(?!\w)/);
  if (m && !/\d+\s*h(?:eures?)?\s*(de|d')/.test(t.slice(m.index, m.index + 12))) {
    const sec = Number(m[1]) * 3600 + Number(m[2] || 0) * 60;
    if (sec > 0 && sec <= 12 * 3600) return { seconds: sec, label: m[2] ? `${m[1]} h ${m[2]}` : `${m[1]} h` };
  }
  m = t.match(/(\d+)(?:\s*(?:a|-|ou)\s*(\d+))?\s*(min|minutes?|mn)\b/);
  if (m) {
    const lo = Number(m[1]);
    if (lo > 0 && lo <= 600) return { seconds: lo * 60, label: m[2] ? `${lo} à ${m[2]} min` : `${lo} min` };
  }
  m = t.match(/(\d+)\s*(secondes?|sec)\b/);
  if (m && Number(m[1]) > 0) return { seconds: Number(m[1]), label: `${m[1]} s` };
  return null;
}

/* Ingrédients de la recette cités dans le texte d'une étape. */
function stepIngredients(text, ingredients) {
  const t = " " + foldText(text).replace(/[^a-z0-9 ]+/g, " ") + " ";
  return ingredients.filter((ing) => {
    const words = foldText(ing.name).replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((w) => w.length >= 4);
    const key = words[0];
    if (!key) return false;
    const stem = key.replace(/(es|s|x)$/, "");
    return t.includes(" " + stem);
  });
}

/* Frigo mémorisé : jours restants avant qu'un aliment se perde. */
function daysLeft(expires) {
  if (!expires) return null;
  return Math.round((parseIso(expires) - parseIso(todayIso())) / DAY_MS);
}
function expiryLabel(expires) {
  const d = daysLeft(expires);
  if (d == null) return "";
  if (d < 0) return "⚠️ à jeter ?";
  if (d === 0) return "⚠️ aujourd'hui";
  if (d === 1) return "⚠️ demain";
  return `⏳ ${d} j`;
}
/* Où ranger un aliment sans emplacement connu (ajout à la main, ancienne photo). */
function guessPlace(name) {
  const n = ` ${foldText(name)} `;
  if (/ (lait|jus|eau|boisson|soda|biere|vin|sauce|ketchup|moutarde|mayonnaise|confiture|oeufs?|beurre|cornichons?|vinaigre|sirop|kefir|boire|compotes?|coca|limonade|smoothie)[ s]/.test(n)) return "porte";
  if (/ (salade|laitue|roquette|tomates?|carottes?|courgettes?|poivrons?|concombres?|legumes?|fruits?|pommes?|poires?|citrons?|oranges?|brocolis?|choux?|poireaux?|radis|champignons?|aubergines?|herbes?|persil|coriandre|basilic|menthe|ciboulette|fraises?|raisins?|avocats?|epinards?|celeri|fenouil|betteraves?|kiwis?|peches?|abricots?|melons?|oignons?|echalotes?|ail|gingembre|clementines?|mandarines?|bananes?)[ s]/.test(n)) return "bac";
  return "etagere";
}

/* Le frigo comme il est rangé : étagères du haut vers le bas, bac à légumes, porte. */
function fridgeSections(items) {
  const shelves = new Map();
  const other = { bac: [], porte: [], congelateur: [], placard: [] };
  const loose = [];
  items.forEach((item, index) => {
    const place = item.place || guessPlace(item.name);
    if (place === "etagere") {
      if (item.shelf) {
        if (!shelves.has(item.shelf)) shelves.set(item.shelf, []);
        shelves.get(item.shelf).push(item);
      } else loose.push(item);
    } else other[place].push(item);
  });
  const nums = [...shelves.keys()].sort((a, b) => a - b);
  const sections = nums.map((n, i) => ({
    key: `shelf-${n}`,
    label: nums.length === 1 ? "Étagère" : i === 0 ? "Étagère du haut" : i === nums.length - 1 && !loose.length ? "Étagère du bas" : `Étagère ${i + 1}`,
    items: shelves.get(n),
  }));
  if (loose.length) sections.push({ key: "shelf-x", label: nums.length ? "Autres étagères" : "Étagères", items: loose });
  if (other.bac.length) sections.push({ key: "bac", label: "🥬 Bac à légumes", items: other.bac });
  return {
    body: sections,
    door: other.porte,
    extra: [
      other.congelateur.length ? { key: "congelateur", label: "❄️ Congélateur", items: other.congelateur } : null,
      other.placard.length ? { key: "placard", label: "🗄️ Placard", items: other.placard } : null,
    ].filter(Boolean),
  };
}

const KEEP_OPTIONS = [["", "—"], [0, "Aujourd'hui"], [1, "1 jour"], [2, "2 jours"], [3, "3 jours"], [5, "5 jours"], [7, "1 semaine"], [14, "2 semaines"], [30, "1 mois"]];

const TAG_EMOJI = {
  "Plat principal": "🍽️", "Entrée": "🥗", "Dessert": "🍰", "Apéritif": "🥂", "Petit-déjeuner": "🥐", "Goûter": "🍪",
  Accompagnement: "🥔", Soupe: "🍲", Salade: "🥬", Sauce: "🫙", Boisson: "🥤", "Végétarien": "🌱", Vegan: "🌿",
  Rapide: "⚡", "Sans gluten": "🌾", "Léger": "🪶",
};

/* Promesse abandonnée au bout de `ms` (réseau qui ne répond plus). */
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject({ code: "timeout", message: "timeout" }), ms))]);
const isNetworkError = (err) =>
  !err || err.code === 3 || err.code === "timeout" || /connect|lost|network|fetch|timeout|socket|offline/i.test(String((err && (err.message || err.code)) || ""));

/* Blocs gris animés pendant un chargement. */
function skel(kind, n = 3) {
  const line = (w, h = 14) => `<span class="skel" style="width:${w};height:${h}px"></span>`;
  const rows = Array.from({ length: n });
  if (kind === "grid") return `<div class="rgrid">${rows.map(() => `<div class="rcard skel-card"><span class="skel fill"></span></div>`).join("")}</div>`;
  if (kind === "cards")
    return rows.map(() => `<div class="list-item skel-row"><span class="skel" style="width:64px;height:64px;border-radius:12px;flex-shrink:0"></span><div class="grow">${line("70%", 16)}${line("45%")}</div></div>`).join("");
  if (kind === "lines") return `<div class="card">${rows.map((_, i) => `<div class="skel-line">${line("26px", 26)}${line(`${60 - (i % 3) * 12}%`)}</div>`).join("")}</div>`;
  return `<div class="skel-block">${line("40%", 13)}${line("80%", 20)}${line("55%")}</div>`;
}

/* Macronutriments par portion (calculés par le serveur). */
// Glucides : jaune plus soutenu sur fond clair (lisibilité), jaune vif en thème sombre.
const NUT_COLORS = { protein: "#e53935", carbs: "var(--fm-carbs)", fat: "#1e88e5", fiber: "#43a047" };
function nutBadge(r) {
  const n = r && r.nutrition;
  if (!n || !n.kcal) return "";
  return `🔥 ${n.kcal} kcal · 💪 ${fmtNumber(n.protein)} g prot.`;
}

const fmtClock = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s2 = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s2}` : `${m}:${s2}`;
};

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
:host([dark]) { --fm-carbs: #f9a825; }
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
  --fm-carbs: #e08a00;
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

/* Hauteur = écran moins ce qui est au-dessus du panneau (barre d'état gérée par l'app Home Assistant).
   --fm-top est mesuré en JavaScript. */
.app {
  position: relative; display: flex; flex-direction: column; overflow: hidden;
  height: calc(100vh - var(--fm-top, 0px)); height: calc(100dvh - var(--fm-top, 0px));
}
.toolbar {
  display: flex; align-items: center; gap: 4px;
  height: var(--header-height, 56px); padding: 0 8px 0 4px; flex-shrink: 0;
  background: var(--fm-header-bg); color: var(--fm-header-text);
  box-sizing: content-box;
  border-bottom: var(--app-header-border-bottom, none);
}
.toolbar .app-title { line-height: 1.05; }
.toolbar .app-title small { display: block; font-size: 12px; opacity: .75; font-weight: 400; letter-spacing: .02em; }
.toolbar .title { font-size: 20px; font-weight: 400; margin-left: 12px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn {
  width: 44px; height: 44px; border-radius: 50%; border: 0; background: transparent;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.icon-btn:hover { background: color-mix(in srgb, currentColor 10%, transparent); }

main { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
/* L'en-tête et la barre du bas ne doivent jamais bouger avec le doigt : seul le contenu défile. */
.app { overscroll-behavior: none; }
#header, nav.tabs, .sheet > .toolbar, .sheet .footer, .cook .nav { touch-action: none; flex-shrink: 0; }
.sheet .body { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
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
.pmeal { display: flex; gap: 12px; align-items: flex-start; transition: opacity .2s; }
.pmeal.locked { border-color: var(--fm-success); box-shadow: 0 0 0 1px var(--fm-success); }
.pmeal.busy { opacity: .55; }
.pm-actions { display: flex; flex-direction: column; gap: 2px; margin: -6px -8px -6px 0; }
.pm-actions .icon-btn { width: 38px; height: 38px; color: var(--fm-text2); }
.pm-actions .icon-btn.on { color: var(--fm-success); }
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

.lib-card { display: flex; gap: 12px; align-items: center; padding: 10px; margin-bottom: 8px; width: 100%; text-align: left;
  background: var(--fm-card); border: 1px solid var(--fm-divider); border-radius: var(--fm-radius); }
.lib-card .thumb { font-size: 32px; }
.lib-card .t { font-weight: 500; font-size: 16px; }
.lib-card .m { font-size: 13px; color: var(--fm-text2); margin-top: 2px; }
.lib-card .badges { margin-top: 6px; }
.lib-card .in { color: var(--fm-success); flex-shrink: 0; }
.tag.warn { background: color-mix(in srgb, var(--fm-error) 14%, transparent); color: var(--fm-error); }
.tag.season { background: color-mix(in srgb, #fb8c00 16%, transparent); color: #e65100; }
.benefits { background: color-mix(in srgb, var(--fm-success) 10%, var(--fm-card)); border-radius: var(--fm-radius); padding: 12px 14px; margin: 12px 0; }
.benefits b { display: block; margin-bottom: 6px; color: var(--fm-success); }
.benefits ul { margin: 0; padding-left: 18px; }
.benefits li { margin: 2px 0; }
.chips.scroll { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.chips.scroll::-webkit-scrollbar { display: none; }
.chips.scroll .chip { flex-shrink: 0; }

/* Courses : barre d'ajout rapide compacte, qui reste en haut pendant le défilement */
.quickbar { position: sticky; top: -16px; z-index: 3; margin: -16px -16px 6px; padding: 12px 16px 8px; background: var(--fm-bg); border-bottom: 1px solid var(--fm-divider); }
.qb-field { display: flex; align-items: center; gap: 6px; height: 46px; padding: 0 4px 0 14px; border-radius: 23px; background: var(--fm-card); border: 1px solid var(--fm-divider); }
.qb-field:focus-within { border-color: var(--fm-primary); box-shadow: 0 0 0 1px var(--fm-primary); }
.qb-field > ha-icon { color: var(--fm-text2); --mdc-icon-size: 20px; }
.qb-field input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 16px; color: var(--fm-text); height: 100%; }
.qb-add { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--fm-primary); color: var(--fm-on-primary); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.quickbar .chips { margin-top: 8px; gap: 6px; }
.quickbar .chip { min-height: 30px; padding: 0 10px; font-size: 13px; }
.quickbar + #shop-list .list-head:first-child { margin-top: 8px; }

/* Courses */
.quickbox .row { margin-bottom: 10px; }
.chip.add { border-style: dashed; }
.chip.add ha-icon { --mdc-icon-size: 16px; }
.aisle { padding: 4px 14px 6px; }
.aisle-title { display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 14px; color: var(--fm-text2); padding: 10px 0 4px; }
.aisle-title .n { margin-left: auto; font-size: 12px; }
.li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--fm-divider); }
.aisle-title + .li-wrap .li { border-top: 0; }
.li-wrap { position: relative; overflow: hidden; touch-action: pan-y; }
.li-wrap .li { position: relative; background: var(--fm-card); transition: transform .2s ease; }
.li-wrap.dragging .li { transition: none; }
.li-bg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; color: #fff; font-size: 14px; font-weight: 600; opacity: 0; }
.li-bg span { display: inline-flex; align-items: center; gap: 6px; }
.li-wrap.right .li-bg { opacity: 1; background: var(--fm-success, #2e9e5b); }
.li-wrap.left .li-bg { opacity: 1; background: var(--fm-error); }
.li-wrap.right .li-bg .del, .li-wrap.left .li-bg .ok { visibility: hidden; }
.li-wrap.armed .li-bg span { transform: scale(1.08); }
.li.offline .txt > div:first-child::after { content: " ⏳"; }
.offline-bar { margin: 0 0 10px; padding: 8px 12px; border-radius: 10px; font-size: 13px; background: color-mix(in srgb, var(--fm-warning) 18%, transparent); }
.list-head .sm-open { margin-left: auto; min-height: 34px; padding: 0 12px; font-size: 14px; }
.toast-act { margin-left: 6px; border: 0; background: none; color: var(--fm-primary-light, #7fd3ff); font: inherit; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; padding: 4px 6px; cursor: pointer; }
.toast.error .toast-act { color: #fff; }

/* Mode cuisine mains libres */
.icon-btn.on { color: var(--fm-primary); background: var(--fm-soft); }
.voice-hint { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0 16px 8px; padding: 6px 12px; border-radius: 14px; font-size: 13px; color: var(--fm-text2); background: var(--fm-soft); }
.mic-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--fm-error); animation: pulse 1.2s ease-in-out infinite; }

/* Mode magasin */
.sm-progress { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 14px; color: var(--fm-text2); }
.sm-progress .bar { flex: 1; height: 10px; border-radius: 6px; background: var(--fm-divider); overflow: hidden; }
.sm-progress .bar i { display: block; height: 100%; background: var(--fm-success, #2e9e5b); transition: width .3s ease; }
.sm-aisle { margin-bottom: 14px; border-radius: 16px; overflow: hidden; background: var(--fm-card); border: 1px solid var(--fm-divider); }
.sm-aisle-t { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-weight: 700; font-size: 15px; border-bottom: 1px solid var(--fm-divider); }
.sm-aisle-t span { margin-left: auto; font-weight: 500; color: var(--fm-text2); font-size: 13px; }
.sm-row { width: 100%; display: flex; align-items: center; gap: 14px; padding: 14px; border: 0; border-top: 1px solid var(--fm-divider); text-align: left; font: inherit; color: var(--fm-text); cursor: pointer; }
.sm-aisle-t + .li-wrap .sm-row { border-top: 0; }
.sm-row .tick { width: 36px; height: 36px; border-radius: 50%; border: 2.5px solid var(--fm-divider); display: inline-flex; align-items: center; justify-content: center; color: transparent; flex-shrink: 0; }
.sm-row .tick ha-icon { --mdc-icon-size: 22px; }
.sm-row .ing-emoji { font-size: 24px; width: 32px; }
.sm-row .txt { flex: 1; font-size: 19px; font-weight: 500; line-height: 1.25; }
.sm-row .txt small { display: block; font-size: 13px; font-weight: 400; color: var(--fm-text2); }
.sm-row.done .tick { background: var(--fm-success, #2e9e5b); border-color: var(--fm-success, #2e9e5b); color: #fff; }
.sm-row.done .txt { text-decoration: line-through; color: var(--fm-text2); }
.sm-basket { opacity: .75; }
.sm-done { text-align: center; padding: 24px 18px; }
.sm-done .emoji { font-size: 56px; }
.li .tick {
  width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--fm-divider); background: none; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center; color: transparent; padding: 0;
}
.li .tick ha-icon { --mdc-icon-size: 18px; }
.li.done .tick { background: var(--fm-success); border-color: var(--fm-success); color: #fff; }
.li .txt { flex: 1; min-width: 0; cursor: text; }
.li .li-edit { min-height: 40px; padding: 8px 10px; font-size: 16px; }
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
.btn ha-icon, .chip ha-icon { flex-shrink: 0; }
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

/* Jow : filtres et pages */
.jow-filters { margin-bottom: 8px; }
.jow-filters .chip { min-height: 34px; padding: 0 12px; font-size: 14px; }
.jow-filters .chip .n { font-size: 12px; color: var(--fm-text2); margin-left: 2px; }
.jow-filters .chip.on .n { color: inherit; opacity: .8; }
.jow-filters.opts .chip { min-height: 30px; font-size: 13px; }
.jow-filters .chip ha-icon { --mdc-icon-size: 16px; }
.jow-sum { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0 8px; font-size: 13px; color: var(--fm-text2); }
.jow-sum .btn.text { min-height: 30px; padding: 0 6px; font-size: 13px; }
.jow-list.loading { opacity: .45; pointer-events: none; transition: opacity .15s; }
.jow-badges { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.jow-badges .tag.ok { background: color-mix(in srgb, var(--fm-success, #2e9e5b) 16%, transparent); color: var(--fm-success, #2e9e5b); }
.jow-badges .em { font-size: 14px; letter-spacing: 2px; }
.pager { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 14px 0 6px; flex-wrap: wrap; }
.pager button { min-width: 38px; height: 38px; padding: 0 8px; border-radius: 19px; border: 1px solid var(--fm-divider); background: var(--fm-card); color: var(--fm-text); font: inherit; font-size: 15px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.pager button.on { background: var(--fm-primary); border-color: var(--fm-primary); color: var(--fm-on-primary, #fff); font-weight: 600; }
.pager button:disabled { opacity: .35; cursor: default; }
.pager .gap { color: var(--fm-text2); padding: 0 2px; }

/* Jow */
.jow-card .m { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.jow-card > ha-icon { color: var(--fm-primary); }
.chips.filters .chip { min-height: 34px; }

/* Valeurs nutritionnelles */
.nut { padding: 14px 16px; }
.nut-kcal { font-size: 15px; color: var(--fm-text2); display: flex; align-items: center; gap: 8px; }
.nut-kcal b { font-size: 28px; color: var(--fm-text); }
.nut-kcal.sm b { font-size: 20px; }
.nut-bar { display: flex; height: 10px; border-radius: 6px; overflow: hidden; margin: 10px 0 12px; background: var(--fm-divider); }
.nut-bar i { display: block; height: 100%; }
.nut-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; }
.nut-grid > div { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 13px; color: var(--fm-text2); }
.nut-grid b { font-size: 16px; color: var(--fm-text); }
.nut-grid small { font-size: 11px; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.nut-details { margin-top: 12px; border-top: 1px solid var(--fm-divider); padding-top: 8px; }
.nut-details summary { cursor: pointer; font-size: 14px; color: var(--fm-primary); padding: 4px 0; }
.nut-line { display: grid; grid-template-columns: 1fr auto 76px; gap: 8px; font-size: 14px; padding: 5px 0; border-bottom: 1px solid var(--fm-divider); }
.nut-line:last-child { border-bottom: 0; }
.nut-line b { text-align: right; font-weight: 600; }
.nut-day { margin-left: auto; font-size: 12px; font-weight: 400; color: var(--fm-text2); white-space: nowrap; }
.week-nut { padding: 12px 14px; }
.week-nut .nut-bar { margin: 10px 0 8px; height: 8px; }

/* Bouton + central */
nav.tabs .plus-slot { flex: 1; display: flex; align-items: center; justify-content: center; }
nav.tabs button.plus { flex: 0 0 auto; width: 56px; height: 56px; margin-top: -22px; border-radius: 50%; gap: 0; color: var(--fm-on-primary, #fff); background: var(--fm-primary); box-shadow: 0 6px 18px color-mix(in srgb, var(--fm-primary) 45%, transparent), 0 0 0 5px var(--fm-card); transition: transform .25s ease; }
nav.tabs button.plus ha-icon { --mdc-icon-size: 30px; }
nav.tabs button.plus.open { transform: rotate(45deg); }
.plus-backdrop { position: absolute; inset: 0; z-index: 8; background: rgba(0,0,0,.28); animation: fade .15s ease-out; }
.plus-menu { position: absolute; z-index: 9; left: 50%; transform: translateX(-50%); bottom: calc(var(--fm-nav-h) + 18px + env(safe-area-inset-bottom)); width: min(340px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 8px; animation: plusUp .2s ease-out; }
.plus-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 0; border-radius: 18px; background: var(--fm-card); color: var(--fm-text); text-align: left; font: inherit; box-shadow: 0 8px 24px rgba(0,0,0,.18); cursor: pointer; }
.plus-item b { display: block; font-size: 16px; }
.plus-item small { color: var(--fm-text2); font-size: 13px; }
@keyframes plusUp { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* Animations : arrivée sur un onglet, squelettes de chargement */
.page.tab-enter { animation: tabIn .22s ease-out; }
@keyframes tabIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.skel { display: block; border-radius: 8px; margin: 6px 0; background: linear-gradient(90deg, var(--fm-divider) 25%, color-mix(in srgb, var(--fm-divider) 40%, var(--fm-card)) 50%, var(--fm-divider) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
.skel.fill { position: absolute; inset: 0; margin: 0; border-radius: 0; }
.skel-row { pointer-events: none; }
.skel-line { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
.skel-line .skel:first-child { border-radius: 50%; flex-shrink: 0; }
.skel-block { padding: 4px 0; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.btn:active, .chip:active, .home-tile:active, .rcard-open:active, .plus-item:active { transform: scale(.97); }
.btn, .chip, .home-tile, .rcard-open, .plus-item { transition: transform .12s ease; }
@media (prefers-reduced-motion: reduce) {
  .page.tab-enter, .skel, .plus-menu, .plus-backdrop { animation: none; }
  .btn, .chip, .home-tile, .rcard-open, .plus-item, nav.tabs button.plus { transition: none; }
}

/* Carnet en grille de photos */
.search-row { gap: 8px; align-items: center; margin-bottom: 0; }
.search-row .search { margin-bottom: 12px; }
.layout-btn { flex-shrink: 0; margin-bottom: 12px; border: 1px solid var(--fm-divider); background: var(--fm-card); }
.rgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 640px) { .rgrid { grid-template-columns: repeat(3, 1fr); } }
.rcard { position: relative; aspect-ratio: 4 / 5; border-radius: 18px; overflow: hidden; background: var(--fm-divider); }
.rcard-open { position: absolute; inset: 0; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; display: block; text-align: left; }
.rcard img, .rcard-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rcard-bg { display: flex; align-items: center; justify-content: center; }
.rcard-bg span { font-size: 56px; transform: translateY(-14px) rotate(-6deg); }
.rcard-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.78) 100%); }
.rcard-text { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 12px 12px; color: #fff; display: flex; flex-direction: column; gap: 4px; }
.rcard-text .t { font-weight: 700; font-size: 15px; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-shadow: 0 1px 6px rgba(0,0,0,.4); }
.rcard-text .m { font-size: 12px; opacity: .9; }
.rcard-fav { position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; border-radius: 50%; border: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.32); color: #fff; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); cursor: pointer; }
.rcard-fav.on { color: #ffc107; }
.rcard-fav ha-icon { --mdc-icon-size: 20px; }
.skel-card { pointer-events: none; }

/* Accueil */
.home-hello { margin: 4px 2px 14px; }
.home-hello h2 { margin: 0; }
.home-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.home-tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px 10px; border-radius: 16px; border: 1px solid var(--fm-divider); background: var(--fm-card); color: var(--fm-text); font: inherit; font-size: 12px; line-height: 1.2; text-align: center; cursor: pointer; }
.home-tile:active { transform: scale(.97); }
.home-tile.on { border-color: var(--fm-primary); background: var(--fm-soft); }
.home-quick { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .28s ease, opacity .2s ease; }
.home-quick.open { grid-template-rows: 1fr; opacity: 1; }
.home-quick > .inner { overflow: hidden; min-height: 0; }
.home-quick .card { margin-bottom: 14px; }
.home-quick .chip { min-height: 32px; padding: 0 10px; font-size: 13px; }
/* Frigo et courses côte à côte */
.home-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; align-items: stretch; }
.home-duo.single { grid-template-columns: 1fr; }
.home-duo > .card.duo { margin: 0; padding: 14px; display: flex; flex-direction: column; min-width: 0; }
.duo-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 0; margin-bottom: 10px; border: 0; background: none; color: var(--fm-text); font: inherit; text-align: left; cursor: pointer; }
.duo-head h3 { margin: 0; flex: 1; font-size: 16px; white-space: nowrap; }
.duo-head .bubble { width: 34px; height: 34px; }
.duo-head > ha-icon { color: var(--fm-text2); --mdc-icon-size: 18px; }
.duo-big { font-size: 30px; font-weight: 700; line-height: 1.1; }
.duo-big small { font-size: 13px; font-weight: 500; color: var(--fm-text2); margin-left: 6px; }
.duo-alert { margin: 6px 0 10px; padding: 6px 8px; border-radius: 10px; font-size: 13px; line-height: 1.35; background: color-mix(in srgb, var(--fm-warning) 16%, transparent); }
.duo-ok { margin: 6px 0 10px; font-size: 13px; color: var(--fm-text2); }
.duo-text { margin: 0 0 10px; }
.duo-list { list-style: none; margin: 6px 0 10px; padding: 0; font-size: 13px; }
.duo-list li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 2px 0; }
.duo-btn { margin-top: auto; min-height: 40px; font-size: 14px; padding: 0 8px; }
@media (max-width: 330px) { .home-duo { grid-template-columns: 1fr; } }
/* Statistiques (accueil) */
.stats-card .home-head { margin-bottom: 8px; }
.stats-periods { margin-bottom: 14px; }
.stats-periods .chip { min-height: 32px; padding: 0 12px; font-size: 13px; }
.stats-empty { text-align: center; padding: 6px 0 4px; }
.stats-empty .emoji { font-size: 34px; }
.sc { display: flex; gap: 6px; height: 150px; }
.sc-y { display: flex; flex-direction: column; justify-content: space-between; font-size: 10px; color: var(--fm-text2); padding-bottom: 18px; text-align: right; min-width: 28px; transform: translateY(-5px); }
.sc-plot { position: relative; flex: 1; display: flex; align-items: stretch; gap: 6px; min-width: 0; }
.sc-plot.month { gap: 2px; }
.sc-plot.year { gap: 4px; }
.sc-grid { position: absolute; inset: 0 0 18px 0; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.sc-grid i { display: block; border-top: 1px solid var(--fm-divider); }
.sc-grid i:last-child { border-top-color: color-mix(in srgb, var(--fm-text2) 50%, transparent); }
.sc-avg { position: absolute; left: 0; right: 0; border-top: 1.5px dashed var(--fm-text2); pointer-events: none; z-index: 2; margin-bottom: 18px; height: 0; }
.sc-plot .sc-avg { bottom: 0; }
.sc-avg span { position: absolute; right: 0; top: -17px; font-size: 10px; color: var(--fm-text2); background: var(--fm-card); padding: 0 4px; border-radius: 4px; }
.sc-col { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0; border: 0; background: none; cursor: pointer; font: inherit; color: var(--fm-text2); z-index: 1; }
.sc-col::before { content: ""; position: absolute; inset: 0 -2px 16px; border-radius: 6px; background: transparent; transition: background .15s; }
.sc-col.sel::before, .sc-col:hover::before { background: var(--fm-soft); }
.sc-bar { position: relative; width: 100%; max-width: 30px; display: flex; flex-direction: column; gap: 2px; border-radius: 4px 4px 0 0; overflow: hidden; margin-bottom: 18px; transition: height .35s ease; }
.sc-plot.month .sc-bar { gap: 1px; border-radius: 2px 2px 0 0; }
.sc-bar i { display: block; min-height: 0; flex-basis: 0; }
.sc-bar.planned { opacity: .38; }
.sc-x { position: absolute; bottom: 0; height: 16px; font-size: 11px; line-height: 16px; white-space: nowrap; }
.sc-plot.year .sc-x { font-size: 10px; }
.sc-col.today .sc-x { color: var(--fm-primary); font-weight: 700; }
.sc-col.sel .sc-x { color: var(--fm-text); font-weight: 600; }
.sc-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; margin: 8px 0 0 34px; color: var(--fm-text); }
.sc-legend > span { display: inline-flex; align-items: center; gap: 4px; }
.dot.planned { background: var(--fm-text2); opacity: .38; }
.sc-detail { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 10px 0 4px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--fm-text) 4%, transparent); font-size: 14px; min-height: 42px; }
.sc-detail .big { font-size: 18px; }
.sc-macros { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; font-size: 13px; }
.sc-macros > span { display: inline-flex; align-items: center; gap: 4px; }
.sc-tag { font-size: 11px; padding: 1px 6px; border-radius: 8px; background: var(--fm-soft); color: var(--fm-primary); }
.st-title { font-weight: 600; margin: 16px 0 8px; }
.st-tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.st-tile { display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: 12px; border: 1px solid var(--fm-divider); min-width: 0; }
.st-tile .lbl { font-size: 11px; color: var(--fm-text2); display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-tile b { font-size: 18px; line-height: 1.2; }
.st-tile b small { font-size: 11px; font-weight: 500; color: var(--fm-text2); }
.st-tile > small { font-size: 11px; }
@media (max-width: 560px) { .stats-card .st-tiles { grid-template-columns: repeat(4, 1fr); } .stats-card .st-tile:first-child { grid-column: span 4; flex-direction: row; align-items: baseline; gap: 8px; } }
.st-sub { font-size: 12px; font-weight: 600; color: var(--fm-text2); text-transform: uppercase; letter-spacing: .04em; margin: 2px 0 6px; }
.ph-tiles { grid-template-columns: repeat(4, 1fr); margin-bottom: 14px; }
@media (max-width: 420px) { .ph-tiles { grid-template-columns: repeat(2, 1fr); } }
.st-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 560px) { .st-cols { grid-template-columns: 1fr; } }
.st-top { display: flex; flex-direction: column; gap: 4px; }
.st-meal { display: flex; align-items: center; gap: 10px; padding: 4px; border: 0; border-radius: 10px; background: none; font: inherit; color: var(--fm-text); text-align: left; cursor: pointer; }
.st-meal:hover { background: var(--fm-soft); }
.st-meal .thumb { width: 38px; height: 38px; border-radius: 10px; font-size: 18px; flex-shrink: 0; }
.st-meal .grow { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.st-meal .rank { width: 16px; font-size: 12px; font-weight: 700; color: var(--fm-text2); text-align: center; }
.cnt { font-size: 13px; font-weight: 600; color: var(--fm-text2); min-width: 24px; text-align: right; }
.st-foods { display: flex; flex-direction: column; gap: 6px; }
.st-food { display: grid; grid-template-columns: minmax(0, 1.2fr) 1fr auto; align-items: center; gap: 8px; font-size: 14px; }
.st-food .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-food .track { height: 8px; border-radius: 4px; background: var(--fm-divider); overflow: hidden; }
.st-food .track i { display: block; height: 100%; border-radius: 4px; background: var(--fm-primary); }
.stats-hist { margin-top: 12px; }
/* Historique des courses */
.hist-open { margin-left: auto; }
.list-head .hist-open + .sm-open { margin-left: 0; }
.ph-card { padding: 12px 14px; }
.ph-card .st-title { margin-top: 0; }
.ph-habit { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--fm-divider); }
.ph-habit:first-of-type { border-top: 0; }
.ph-habit .nm { font-weight: 500; }
.ph-gauge { display: block; height: 4px; border-radius: 2px; background: var(--fm-divider); margin-top: 6px; overflow: hidden; }
.ph-gauge i { display: block; height: 100%; background: var(--fm-text2); border-radius: 2px; }
.ph-habit.due .ph-gauge i { background: var(--fm-primary); }
.badge-due, .badge-soon { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 8px; margin-left: 4px; vertical-align: 1px; }
.badge-due { background: var(--fm-primary); color: var(--fm-on-primary); }
.badge-soon { background: var(--fm-soft); color: var(--fm-primary); }
.ph-add { color: var(--fm-primary); }
.ph-there { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; --mdc-icon-size: 16px; }
.ph-day { margin-bottom: 14px; }
.ph-date { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
.ph-items { display: flex; flex-wrap: wrap; gap: 6px; }
.ph-item { display: inline-flex; align-items: center; gap: 6px; padding: 4px 4px 4px 10px; border-radius: 16px; background: var(--fm-card); border: 1px solid var(--fm-divider); font-size: 14px; }
.ph-item small { color: var(--fm-text2); font-size: 11px; }
.ph-del { display: inline-flex; border: 0; background: none; padding: 2px; border-radius: 50%; color: var(--fm-text2); cursor: pointer; --mdc-icon-size: 16px; }
.ph-del:hover { background: var(--fm-soft); }
.chip.due { border-color: color-mix(in srgb, var(--fm-primary) 55%, transparent); }
.due-mark { font-size: 11px; }


.home-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.home-head h3 { margin: 0; flex: 1; }
.home-head .btn.text { min-height: 32px; padding: 0 6px; font-size: 14px; }
.home-head .count { font-size: 14px; color: var(--fm-text2); }
.home-next { display: flex; gap: 12px; align-items: center; }
.home-next .thumb { width: 72px; height: 72px; border-radius: 14px; flex-shrink: 0; object-fit: cover; display: flex; align-items: center; justify-content: center; font-size: 34px; }
.home-next .when { font-size: 13px; font-weight: 600; color: var(--fm-primary); text-transform: uppercase; letter-spacing: .03em; }
.home-next .what { font-size: 18px; font-weight: 600; margin: 2px 0 4px; }
.home-next .when .date { text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--fm-text2); }
.home-free { margin-top: 12px; padding: 12px; border-radius: 12px; background: var(--fm-soft); font-size: 14px; }
.home-free .btn { margin-top: 10px; }
.home-later { margin-top: 14px; border-top: 1px solid var(--fm-divider); }
.home-line { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 0; border: 0; border-bottom: 1px solid var(--fm-divider); background: none; color: var(--fm-text); font: inherit; text-align: left; cursor: pointer; }
.home-line:last-child { border-bottom: 0; }
.home-line .d { flex: 0 0 104px; font-size: 13px; color: var(--fm-text2); }
.home-line .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-line ha-icon { color: var(--fm-text2); --mdc-icon-size: 18px; }

/* Réglages par thèmes */
.set-list { padding: 4px 0; }
.set-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 0; border-bottom: 1px solid var(--fm-divider); background: none; color: var(--fm-text); font: inherit; text-align: left; cursor: pointer; }
.set-row:last-child { border-bottom: 0; }
.set-row .t { font-weight: 600; }
.set-row .m { font-size: 13px; color: var(--fm-text2); margin-top: 2px; }
.set-row > ha-icon { color: var(--fm-text2); transition: transform .25s ease; }
.acc { border-bottom: 1px solid var(--fm-divider); }
.acc:last-child { border-bottom: 0; }
.acc .set-row { border-bottom: 0; }
.acc.open > .set-row > ha-icon { transform: rotate(180deg); }
.acc-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s ease; }
.acc.open > .acc-body { grid-template-rows: 1fr; }
.acc-body > .inner { overflow: hidden; min-height: 0; }
.acc:not(.open) > .acc-body > .inner { visibility: hidden; transition: visibility 0s .3s; }
.acc-content { padding: 2px 14px 16px; }
.acc-content > .set-sec:first-child { margin-top: 4px; }
.save-state { font-size: 13px; color: var(--fm-text2); display: inline-flex; align-items: center; gap: 4px; padding-right: 8px; white-space: nowrap; }
.save-state.saved { color: var(--fm-success, #2e9e5b); }
.save-state.error { color: var(--fm-error); }
.set-page-intro { margin-top: 0; }

/* Frigo dessiné : modification et photo */
.chip.removable { border-style: dashed; }
.chip.removable ha-icon { --mdc-icon-size: 16px; color: var(--fm-error); margin-left: 2px; }
.fz-add { display: flex; gap: 6px; align-items: center; margin: 0 0 12px; }
.fz-add .input { min-width: 0; flex: 1 1 auto; }
.fz-add select.input { flex: 0 0 112px; width: 112px; padding: 0 4px 0 10px; }
.linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--fm-primary); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.icon-btn.on { color: var(--fm-primary); background: var(--fm-soft); }
/* Visionneuse plein écran */
.lightbox { position: absolute; inset: 0; z-index: 30; background: #000; display: flex; flex-direction: column; animation: fade .15s ease-out; }
.lb-close { position: absolute; top: calc(10px + env(safe-area-inset-top)); right: 12px; z-index: 2; width: 46px; height: 46px; border-radius: 50%; border: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); cursor: pointer; }
.lb-close ha-icon { --mdc-icon-size: 26px; }
.lb-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: zoom-in; }
.lb-stage img { max-width: 100%; max-height: 100%; object-fit: contain; user-select: none; -webkit-user-select: none; }
.lb-stage.zoom { display: block; overflow: auto; cursor: zoom-out; -webkit-overflow-scrolling: touch; }
.lb-stage.zoom img { max-width: none; max-height: none; width: 250%; }
.lb-stage .spinner { border-color: rgba(255,255,255,.25); border-top-color: #fff; }
.lb-msg { color: #fff; padding: 24px; text-align: center; }
.lb-foot { padding: 10px 16px calc(14px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.lb-dots { display: flex; gap: 8px; }
.lb-dots button { border: 1px solid rgba(255,255,255,.4); background: none; color: #fff; border-radius: 16px; padding: 6px 14px; font: inherit; font-size: 14px; cursor: pointer; }
.lb-dots button.on { background: #fff; color: #000; }
.lb-hint { color: rgba(255,255,255,.65); font-size: 13px; }
.mem-thumb { position: relative; flex-shrink: 0; width: 56px; height: 56px; padding: 0; border: 0; border-radius: 14px; overflow: hidden; background: var(--fm-soft); color: var(--fm-primary); display: flex; align-items: center; justify-content: center; cursor: zoom-in; }
.mem-thumb img { width: 100%; height: 100%; object-fit: cover; }
.mem-thumb-zoom { position: absolute; right: 3px; bottom: 3px; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.5); color: #fff; }
.mem-thumb-zoom ha-icon { --mdc-icon-size: 13px; }
.photo-wrap { position: relative; }
.photo-wrap .photo { cursor: zoom-in; }
.photo-zoom { position: absolute; right: 10px; bottom: 10px; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.45); color: #fff; pointer-events: none; }
.photo-zoom ha-icon { --mdc-icon-size: 18px; }

/* Frigo dessiné */
.fridge-box { margin: 12px 0; border: 2px solid var(--fm-divider); border-radius: 18px; overflow: hidden; background: color-mix(in srgb, #22b8a7 4%, var(--fm-card)); }
.fz-body { padding: 4px 12px; }
.fz-shelf { padding: 10px 0 12px; border-bottom: 3px solid color-mix(in srgb, #22b8a7 22%, var(--fm-divider)); }
.fz-shelf:last-child { border-bottom: 0; }
.fz-shelf.fz-bac { margin: 0 -12px; padding: 10px 12px 12px; background: color-mix(in srgb, #43a047 8%, transparent); border-top: 1px solid var(--fm-divider); }
.fz-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--fm-text2); margin-bottom: 6px; }
.fz-door { padding: 10px 12px 12px; border-top: 2px dashed var(--fm-divider); background: color-mix(in srgb, #1e88e5 6%, var(--fm-card)); }
.fridge-box .chip { min-height: 32px; padding: 0 10px; font-size: 14px; }
.fridge-box .chips { gap: 6px; }
.fz-extra { padding: 0 12px; }

/* Frigo mémorisé */
.memory { border-color: color-mix(in srgb, #22b8a7 45%, var(--fm-divider)); }
.urgent { margin-top: 10px; padding: 8px 12px; border-radius: 10px; font-size: 14px; background: color-mix(in srgb, var(--fm-warning) 16%, transparent); }
.chip.urgent-chip { border-color: var(--fm-warning); background: color-mix(in srgb, var(--fm-warning) 14%, transparent); }
.hero.compact { padding: 18px 20px; }
.hero.compact .logo { width: 56px; height: 56px; }
.hero.compact .perks { display: none; }
select.keep { flex: 0 0 auto; max-width: 104px; border: 1px solid var(--fm-divider); border-radius: 14px; background: var(--fm-bg); color: var(--fm-text2); font-size: 13px; padding: 4px 6px; min-height: 30px; }
select.keep.soon { border-color: var(--fm-warning); color: var(--fm-text); }
select.keep.danger { border-color: var(--fm-error); color: var(--fm-error); font-weight: 600; }

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
.ing-group { margin-bottom: 10px; }
.ing-group-head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--fm-text2); padding: 8px 0 2px; border-bottom: 2px solid var(--fm-divider); }
.ing-group-head span { font-weight: 500; font-size: 12px; padding: 0 7px; border-radius: 9px; background: var(--fm-soft); color: var(--fm-primary); }
.ing-row input { flex: 1; min-width: 0; border: 0; background: transparent; min-height: 40px; font-size: 16px; outline: none; padding: 0 4px; }
.ing-row input.amount { flex: 0 0 96px; color: var(--fm-text2); font-size: 14px; text-align: right; }
.ing-row.mem .ing-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ing-row.mem .ing-main input { flex: none; width: 100%; min-height: 30px; }
.ing-row.mem .ing-main input.amount { text-align: left; font-size: 13px; min-height: 22px; margin-top: -4px; }
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
/* Glisser une recette vers la gauche : favori ou suppression. */
.swipe { position: relative; margin-bottom: 8px; border-radius: var(--fm-radius); overflow: hidden; }
.swipe .list-item { margin-bottom: 0; position: relative; z-index: 1; transition: transform .2s ease; touch-action: pan-y; }
.swipe.dragging .list-item { transition: none; }
.swipe-actions { position: absolute; inset: 0 0 0 auto; display: flex; z-index: 0; }
.swipe-actions button { width: 76px; border: 0; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 500; }
.swipe-actions .fav { background: var(--fm-warning); }
.swipe-actions .del { background: var(--fm-error); }
.swipe-hint { text-align: center; font-size: 12px; color: var(--fm-text2); margin: 4px 0 10px; }
/* Fenêtre de confirmation. */
.dialog-backdrop { position: absolute; inset: 0; z-index: 30; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; padding: 24px; animation: fade .15s ease-out; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
.dialog { background: var(--fm-card); color: var(--fm-text); border-radius: 18px; padding: 22px 20px 16px; width: 100%; max-width: 360px; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
.dialog h3 { margin: 0 0 8px; }
.dialog p { margin: 0 0 18px; color: var(--fm-text2); }
.dialog .row { justify-content: flex-end; }
.dialog-list { list-style: none; margin: -8px 0 16px; padding: 10px 12px; border-radius: 12px; background: var(--fm-bg); max-height: 30vh; overflow-y: auto; font-size: 14px; }
.dialog-list li { padding: 3px 0; }
.btn.danger-fill { background: var(--fm-error); color: #fff; }
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
.meal { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.meal.lifting { opacity: .35; }
.meal .grip { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 34px; margin: 6px 0 0 -10px; color: var(--fm-text2); touch-action: none; cursor: grab; }
.meal .grip ha-icon { --mdc-icon-size: 20px; }
.meal .name { flex-basis: calc(100% - 30px); }
.slot.drop { background: var(--fm-soft); border-radius: 12px; box-shadow: inset 0 0 0 2px var(--fm-primary); }
.drag-ghost {
  position: absolute; z-index: 40; pointer-events: none; transform: translate(-50%, -60%) rotate(-2deg);
  background: var(--fm-card); color: var(--fm-text); border: 2px solid var(--fm-primary); border-radius: 14px;
  padding: 10px 14px; font-weight: 500; box-shadow: 0 10px 30px rgba(0,0,0,.35); max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.week-actions { display: flex; gap: 8px; margin-bottom: 12px; }
.week-actions .btn { flex: 1; }
.drag-hint { text-align: center; font-size: 12px; color: var(--fm-text2); margin: -4px 0 10px; }
.copy-meal { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 4px; border: 0; border-bottom: 1px solid var(--fm-divider); background: none; text-align: left; }
.copy-meal:last-child { border-bottom: 0; }
.copy-meal .box { width: 26px; height: 26px; border-radius: 8px; border: 2px solid var(--fm-divider); display: inline-flex; align-items: center; justify-content: center; color: transparent; flex-shrink: 0; }
.copy-meal.on .box { background: var(--fm-primary); border-color: var(--fm-primary); color: var(--fm-on-primary); }
.copy-meal .w { font-size: 12px; color: var(--fm-text2); }
.add-meal { align-self: flex-start; border: 1px dashed var(--fm-divider); background: none; color: var(--fm-text2); border-radius: 10px; min-height: 38px; padding: 0 12px; display: inline-flex; align-items: center; gap: 4px; font-size: 14px; }

/* Feuilles plein écran */
.sheet {
  position: absolute; inset: 0; z-index: 10; background: var(--fm-bg); display: flex; flex-direction: column;
  animation: up .2s ease-out;
}
#overlay.same .sheet { animation: none; }
/* Une fenêtre ouverte par-dessus une autre : le fond reste opaque, seul le contenu apparaît (on ne voit plus l'onglet dessous). */
#overlay.stacked:not(.same) .sheet { animation: none; }
#overlay.stacked:not(.same) .sheet > .body, #overlay.stacked:not(.same) .sheet > .footer { animation: up .22s ease; }
@keyframes up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.sheet .toolbar { background: var(--fm-card); color: var(--fm-text); border-bottom: 1px solid var(--fm-divider); }
.sheet .body { flex: 1; overflow-y: auto; }
.sheet .body .page { padding-bottom: 120px; }
.sheet .footer {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: var(--fm-card); border-top: 1px solid var(--fm-divider);
  display: flex; gap: 8px; justify-content: center;
}
.sheet .footer .inner { display: flex; gap: 8px; width: 100%; max-width: 728px; }

/* En-tête photo des recettes */
.rhero { position: relative; margin: -16px -16px 14px; min-height: 250px; display: flex; align-items: flex-end; background-color: #444; background-size: cover; background-position: center; color: #fff; overflow: hidden; }
.rhero::before { content: var(--hero-emoji, ""); position: absolute; top: 14px; left: 18px; font-size: 64px; opacity: .95; transform: rotate(-8deg); }
.hero-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 25%, rgba(0,0,0,.35) 55%, rgba(0,0,0,.82) 100%); }
.hero-text { position: relative; width: 100%; padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 6px; }
.hero-badge { align-self: flex-start; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 12px; background: rgba(255,255,255,.22); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.hero-title { margin: 0; font-size: 28px; line-height: 1.15; font-weight: 700; letter-spacing: -.01em; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,.35); }
.hero-desc { margin: 0; font-size: 15px; color: rgba(255,255,255,.88); text-shadow: 0 1px 6px rgba(0,0,0,.35); }
.rhero.edit textarea.hero-title, .rhero.edit input.hero-desc { font-family: inherit; background: transparent; border: 0; border-bottom: 1px dashed rgba(255,255,255,.45); border-radius: 0; padding: 2px 0 4px; outline: none; width: 100%; resize: none; }
.rhero.edit textarea.hero-title { overflow: hidden; }
.rhero.edit textarea.hero-title:focus, .rhero.edit input.hero-desc:focus { border-bottom: 2px solid #fff; }
.rhero.edit ::placeholder { color: rgba(255,255,255,.6); }
.rhero p.hero-desc { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.hero-photo { position: absolute; top: 12px; right: 12px; z-index: 1; width: 40px; height: 40px; border-radius: 50%; border: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); color: #fff; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); cursor: pointer; }
.hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
.hero-stats label { display: flex; flex-direction: column; gap: 2px; padding: 8px 12px; border-radius: 14px; background: var(--fm-card); border: 1px solid var(--fm-divider); font-size: 12px; color: var(--fm-text2); position: relative; }
.hero-stats input { border: 0; background: transparent; font: inherit; font-size: 20px; font-weight: 600; color: var(--fm-text); width: 100%; padding: 0; outline: none; }
.hero-stats em { position: absolute; right: 12px; bottom: 11px; font-style: normal; font-size: 12px; }
@media (min-width: 792px) { .rhero { margin: 0 0 14px; border-radius: var(--fm-radius); } }

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
.cook { background: var(--fm-bg); }
.cook .toolbar { background: var(--fm-card); }
.cook .dots { display: flex; gap: 4px; padding: 10px 16px 6px; max-width: 820px; margin: 0 auto; width: 100%; flex-shrink: 0; }
.cook .dots button { flex: 1; height: 6px; border-radius: 3px; border: 0; padding: 0; background: var(--fm-divider); }
.cook .dots button.on { background: var(--fm-primary); }
.cook .dots button.cur { background: var(--fm-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--fm-primary) 35%, transparent); }
.cook .timers { display: flex; gap: 8px; overflow-x: auto; padding: 4px 16px 6px; max-width: 820px; margin: 0 auto; width: 100%; flex-shrink: 0; scrollbar-width: none; }
.cook .timer { display: inline-flex; align-items: center; gap: 8px; padding: 6px 6px 6px 12px; border-radius: 20px; background: var(--fm-card); border: 1px solid var(--fm-divider); font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.cook .timer.ring { background: var(--fm-error); color: #fff; border-color: transparent; animation: pulse 1s infinite; }
.cook .timer .lbl { font-weight: 400; font-size: 12px; opacity: .8; }
.cook .timer .icon-btn { width: 30px; height: 30px; }
@keyframes pulse { 50% { transform: scale(1.05); } }
.cook .stepbox { flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: 8px 16px 16px; max-width: 820px; margin: 0 auto; width: 100%; }
.cook .stepcard { background: var(--fm-card); border-radius: 22px; padding: 22px 20px; margin: auto 0; box-shadow: var(--ha-card-box-shadow, 0 2px 10px rgba(0,0,0,.08)); }
.cook .stephead { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.cook .bigemoji { width: 64px; height: 64px; border-radius: 50%; background: var(--fm-soft); display: flex; align-items: center; justify-content: center; font-size: 36px; flex-shrink: 0; }
.cook .num { color: var(--fm-primary); font-weight: 600; font-size: 14px; letter-spacing: .05em; text-transform: uppercase; }
.cook .num small { display: block; color: var(--fm-text2); font-weight: 400; letter-spacing: 0; text-transform: none; font-size: 13px; margin-top: 2px; }
.cook .txt { font-size: clamp(21px, 5.2vw, 32px); line-height: 1.45; }
.cook.big .txt { font-size: clamp(27px, 7vw, 42px); }
.cook .usechips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.cook .usechips .chip { min-height: 38px; font-size: 15px; }
.cook .usechips .chip b { color: var(--fm-primary); font-weight: 600; }
.cook .timerbtn { margin-top: 18px; width: 100%; min-height: 54px; font-size: 17px; border-radius: 27px; }
.cook .nav { display: flex; gap: 12px; padding: 12px 16px calc(16px + env(safe-area-inset-bottom)); max-width: 820px; margin: 0 auto; width: 100%; background: var(--fm-bg); }
.cook .nav .btn { flex: 1; min-height: 64px; font-size: 18px; border-radius: 32px; }
.cook .nav .btn.prev { flex: 0 0 64px; padding: 0; }
.cook .ingpanel { background: var(--fm-card); border-bottom: 1px solid var(--fm-divider); max-height: 45vh; overflow-y: auto; padding: 4px 20px; flex-shrink: 0; }
.cook .mise h2 { margin: 6px 0 2px; }
.cook .mise .ready { font-size: 14px; color: var(--fm-text2); margin-bottom: 8px; }
.cook .mise .metas { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; }
.cook .tick-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 4px; border: 0; border-bottom: 1px solid var(--fm-divider); background: none; text-align: left; font-size: 17px; }
.cook .tick-row:last-child { border-bottom: 0; }
.cook .tick-row .box { width: 28px; height: 28px; border-radius: 8px; border: 2px solid var(--fm-divider); display: inline-flex; align-items: center; justify-content: center; color: transparent; flex-shrink: 0; }
.cook .tick-row.on .box { background: var(--fm-success); border-color: var(--fm-success); color: #fff; }
.cook .tick-row.on .nm { text-decoration: line-through; color: var(--fm-text2); }
.cook .tick-row .q { color: var(--fm-primary); font-weight: 600; min-width: 74px; }
.cook .done { text-align: center; }
.cook .done .emoji { font-size: 80px; animation: wiggle 1.6s ease-in-out 2; }
.cook .done .txt { margin: 8px 0 6px; }
.cook .done .stack { max-width: 360px; margin: 22px auto 0; }

.check { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--fm-divider); }
.check input { width: 22px; height: 22px; accent-color: var(--fm-primary); flex-shrink: 0; }
.check .sub { font-size: 12px; color: var(--fm-text2); }

.toast {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--fm-nav-h) + 16px + env(safe-area-inset-bottom)); z-index: 20;
  background: var(--fm-text); color: var(--fm-card); padding: 12px 18px; border-radius: 10px; max-width: calc(100% - 32px); width: max-content;
  box-shadow: 0 4px 16px rgba(0,0,0,.25); font-size: 14px; animation: up .2s ease-out;
}
.toast.error { background: var(--fm-error); color: #fff; }
/* Au-dessus des boutons du bas des fenêtres (mode cuisine, réglages…). */
.toast.high { bottom: calc(100px + env(safe-area-inset-bottom)); }
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
      tab: "home",
      config: null,
      home: { entries: [], loaded: false, quick: false },
      recipes: [],
      loaded: false,
      search: "",
      filter: "all",
      fridge: this._freshFridge(),
      week: { start: mondayOf(new Date()), entries: [], loading: false },
      list: { items: [], loaded: false, error: null, quick: "", showDone: false, menuWeek: "this", menu: null },
      suggestions: [],
      dueNames: new Set(),
      stats: { period: "week", data: null, loading: false, sel: null },
      fridgeMemory: { items: [], updated: null, days: 5 },
      stack: [],
      toast: null,
    };
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("input", (ev) => this._onInput(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => this._onKey(ev));
    this.shadowRoot.addEventListener("touchstart", (ev) => this._onTouchStart(ev), { passive: true });
    this.shadowRoot.addEventListener("touchmove", (ev) => this._onTouchMove(ev), { passive: false });
    this.shadowRoot.addEventListener("touchend", (ev) => this._onTouchEnd(ev), { passive: true });
    this.shadowRoot.addEventListener("focusout", (ev) => this._onFocusOut(ev));
    // Glisser un repas à la souris (ordinateur).
    this.shadowRoot.addEventListener("mousedown", (ev) => {
      if (ev.button === 0) this._mealPressStart(ev, ev.clientX, ev.clientY);
    });
    window.addEventListener("mousemove", (ev) => {
      if (this._mealDrag) this._moveMealDrag(ev.clientX, ev.clientY);
      else if (this._press && Math.hypot(ev.clientX - this._press.x, ev.clientY - this._press.y) > 6) this._startMealDrag();
    });
    window.addEventListener("mouseup", () => {
      if (this._mealDrag || this._press) this._endMealDrag();
    });
    // L'iPhone coupe le maintien de l'écran allumé à chaque mise en veille : on le redemande au retour.
    document.addEventListener("visibilitychange", () => this._onVisibility());
    window.addEventListener("online", () => {
      this._flushOps();
      this._renderListParts();
    });
    window.addEventListener("offline", () => this._renderListParts());
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
    const wasConnected = this._hass ? this._hass.connected !== false : true;
    this._hass = hass;
    this.toggleAttribute("dark", !!(hass.themes && hass.themes.darkMode));
    if (first) this._init();
    else if (hass.connected !== false && !wasConnected) {
      // Retour du réseau : on envoie les changements de la liste faits hors connexion.
      this._flushOps();
      this._renderListParts();
    } else if (hass.connected === false && wasConnected) this._renderListParts();
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
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
      window.removeEventListener("orientationchange", this._onResize);
      this._onResize = null;
    }
    this._unsubscribeList();
    if (this._onLocation) {
      window.removeEventListener("location-changed", this._onLocation);
      this._onLocation = null;
    }
  }

  async _init() {
    this._restoreCache();
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
    if (this._loadOps().length) this._flushOps();
    this._loadSuggestions();
    this._loadFridgeMemory();
    this._loadHome();
    this._completeNutrition();
    if (this._restoreCookSession()) this._render();
    this._applyRoute();
    if (!this._onLocation) {
      this._onLocation = () => setTimeout(() => this._applyRoute(), 0);
      window.addEventListener("location-changed", this._onLocation);
    }
  }

  /* ---------------- démarrage instantané : les dernières données connues, gardées sur l'appareil */

  _restoreCache() {
    let cache = null;
    try {
      cache = JSON.parse(localStorage.getItem("frigo-malin-cache") || "null");
    } catch (_) {
      return;
    }
    if (!cache || cache.v !== 1 || !cache.config) return;
    const s = this.s;
    // La version vient toujours du serveur (sinon l'annonce de mise à jour s'afficherait à tort).
    s.config = { ...cache.config, version: FM_VERSION };
    s.recipes = cache.recipes || [];
    s.fridge.servings = s.config.default_servings || 4;
    if (cache.home) {
      s.home.entries = cache.home;
      s.home.loaded = true;
    }
    if (cache.fridge) s.fridgeMemory = cache.fridge;
    if (cache.week && cache.week.start === s.week.start) s.week.entries = cache.week.entries || [];
    if (cache.list) {
      s.list.items = cache.list;
      s.list.loaded = true;
      for (const op of this._loadOps()) this._applyListOp(op);
    }
    s.loaded = true;
  }

  _saveCache() {
    clearTimeout(this._cacheTimer);
    this._cacheTimer = setTimeout(() => {
      const s = this.s;
      if (!s.config || !s.loaded) return;
      try {
        localStorage.setItem(
          "frigo-malin-cache",
          JSON.stringify({
            v: 1,
            config: s.config,
            recipes: s.recipes,
            home: s.home.loaded ? s.home.entries : null,
            fridge: s.fridgeMemory,
            week: { start: s.week.start, entries: s.week.entries },
            list: s.list.loaded && !s.list.error ? s.list.items.filter((i) => !String(i.uid).startsWith("tmp-")) : null,
          })
        );
      } catch (_) {
        /* stockage plein ou indisponible : pas grave */
      }
    }, 1500);
  }

  /* ---------------- courses : changements appliqués tout de suite, envoyés à Home Assistant, gardés hors connexion */

  get _online() {
    return navigator.onLine !== false && !(this._hass && this._hass.connected === false);
  }

  _loadOps() {
    if (!this._ops) {
      try {
        // Changements restés en attente lors d'une visite précédente : à renvoyer.
        this._ops = JSON.parse(localStorage.getItem("frigo-malin-ops") || "[]").map((op) => ({ ...op, failed: true }));
      } catch (_) {
        this._ops = [];
      }
    }
    return this._ops;
  }

  _persistOps() {
    try {
      localStorage.setItem("frigo-malin-ops", JSON.stringify(this._ops.map(({ sending, timer, ...op }) => op)));
    } catch (_) {
      /* stockage indisponible */
    }
  }

  _applyListOp(op) {
    const l = this.s.list;
    const item = op.uid ? l.items.find((i) => i.uid === op.uid) : null;
    if (op.type === "status" && item) item.status = op.status;
    else if (op.type === "rename" && item) item.summary = op.text;
    else if (op.type === "remove") l.items = l.items.filter((i) => i.uid !== op.uid);
    else if (op.type === "add" && !item) l.items.push({ uid: op.uid, summary: op.text, status: "needs_action", offline: true });
  }

  _listOp(op, delay = 0) {
    this._loadOps();
    op.id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (delay) op.due = Date.now() + delay;
    // Article ajouté hors connexion, pas encore envoyé : on modifie directement l'ajout en attente.
    const pendingAdd = op.uid && String(op.uid).startsWith("tmp-") ? this._ops.find((o) => o.type === "add" && o.uid === op.uid) : null;
    if (pendingAdd && op.type !== "add") {
      if (op.type === "remove" || (op.type === "status" && op.status === "completed")) this._ops = this._ops.filter((o) => o !== pendingAdd);
      else if (op.type === "rename") pendingAdd.text = op.text;
      this._applyListOp(op);
      this._persistOps();
      this._renderListParts();
      return op;
    }
    this._applyListOp(op);
    this._ops.push(op);
    this._persistOps();
    this._renderListParts();
    this._sendOp(op);
    return op;
  }

  _sendRequest(op) {
    if (op.type === "status") return this._todo("update_item", { item: op.uid, status: op.status });
    if (op.type === "remove") return this._todo("remove_item", { item: [op.uid] });
    if (op.type === "rename") return this._todo("update_item", { item: op.uid, rename: op.text });
    if (op.type === "add") return this._ws("shopping/add", { items: [op.text], quick: true });
    return Promise.resolve();
  }

  async _sendOp(op) {
    if (op.sending || !this._ops.includes(op)) return;
    if (op.due && op.due > Date.now()) {
      clearTimeout(op.timer);
      op.timer = setTimeout(() => this._sendOp(op), op.due - Date.now() + 20);
      return;
    }
    if (!this._online) {
      this._offlineNotice();
      this._scheduleFlush();
      return;
    }
    op.sending = true;
    try {
      await withTimeout(this._sendRequest(op), 15000);
      this._ops = this._ops.filter((o) => o !== op);
      this._persistOps();
      if (op.type === "add") this._loadSuggestions();
    } catch (err) {
      op.sending = false;
      if (!this._online || isNetworkError(err)) {
        op.failed = true;
        this._offlineNotice();
        this._scheduleFlush();
      } else {
        this._ops = this._ops.filter((o) => o !== op);
        this._persistOps();
        this._toast(this._err(err), true);
      }
    }
    this._renderListParts();
  }

  _flushOps() {
    for (const op of [...this._loadOps()]) this._sendOp(op);
  }

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => {
      if (!this._loadOps().length) {
        clearInterval(this._flushTimer);
        this._flushTimer = null;
        this._renderListParts();
        return;
      }
      if (this._online) this._flushOps();
    }, 15000);
  }

  _offlineNotice() {
    if (this._offlineToastAt && Date.now() - this._offlineToastAt < 60000) return;
    this._offlineToastAt = Date.now();
    this._toast("📴 Hors connexion : c'est noté, la liste sera mise à jour au retour du réseau.");
  }

  /* Supprimer un article : retiré tout de suite, envoyé après 5 s, sauf si on annule. */
  _removeListItem(uid) {
    const items = this.s.list.items;
    const index = items.findIndex((i) => i.uid === uid);
    if (index < 0) return;
    const item = { ...items[index] };
    const op = this._listOp({ type: "remove", uid }, 5000);
    this._toast(`🗑️ ${item.summary} supprimé`, false, { label: "Annuler", run: () => this._undoRemove(op, item, index) });
  }

  _undoRemove(op, item, index) {
    this._loadOps();
    if (this._ops.includes(op) && !op.sending) {
      clearTimeout(op.timer);
      this._ops = this._ops.filter((o) => o !== op);
      this._persistOps();
      if (!this.s.list.items.some((i) => i.uid === item.uid)) this.s.list.items.splice(Math.min(index, this.s.list.items.length), 0, item);
      this._renderListParts();
    } else {
      // Déjà parti chez Home Assistant : on le remet dans la liste.
      this._quickAdd([item.summary]);
    }
    this._toast(`↩️ ${item.summary} remis dans la liste`);
  }

  _tplOfflineBanner() {
    const waiting = this._loadOps().filter((o) => !o.due || o.due <= Date.now());
    const n = waiting.length;
    // Envoi normal (quelques dixièmes de seconde) : pas de bandeau.
    if (this._online && !waiting.some((o) => o.failed)) return "";
    return `<div class="offline-bar">📴 ${this._online ? "Envoi en cours…" : "Hors connexion"}${n ? ` · ${n} changement${n > 1 ? "s" : ""} en attente` : " · la liste reste utilisable"}</div>`;
  }

  /* Liens directs : /frigo-malin?tab=shopping&store=…, ?recipe=…&cook=1 (notifications, carte du tableau de bord). */
  _applyRoute() {
    if (!this.s.loaded || !this.isConnected) return;
    const params = new URLSearchParams(window.location.search);
    if (![...params.keys()].length) return;
    const s = this.s;
    const tab = params.get("tab");
    if (["home", "fridge", "recipes", "week", "shopping"].includes(tab)) {
      s.stack = [];
      s.tab = tab;
      if (tab === "week") this._loadWeek();
      if (tab === "shopping") this._loadMenuInfo();
    }
    const store = params.get("store");
    if (store && (this.settings.stores || []).some((x) => x.id === store)) this._pickStore(store);
    if (params.get("resume") === "cook" && !s.stack.some((x) => x.type === "cook")) this._restoreCookSession();
    if (params.get("mode") === "store" && this.listEntity) {
      s.stack = [{ type: "store-mode" }];
      this._requestWakeLock();
    }
    const recipe = this._recipe(params.get("recipe"));
    if (recipe) {
      const servings = Number(params.get("servings")) || recipe.servings || 4;
      s.stack = [{ type: "recipe", id: recipe.id, servings, confirmDelete: false }];
      if (params.get("cook") === "1") {
        s.stack.push({ type: "cook", id: recipe.id, servings, step: -1, showIng: false, checked: [] });
        this._requestWakeLock();
      }
    }
    history.replaceState(history.state, "", window.location.pathname);
    this._render();
  }

  /* Nombre de personnes proposé par défaut (réglage du foyer). */
  get defaultServings() {
    return (this.s.config && this.s.config.default_servings) || 4;
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
          for (const op of this._loadOps()) this._applyListOp(op);
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
      this.s.dueNames = new Set(res.suggestions.filter((x) => x.due).map((x) => foldText(x.name).trim()));
    } catch (_) {
      this.s.suggestions = [];
      this.s.dueNames = new Set();
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
    const editingInput = root.querySelector(".li-edit");
    if (list && !(editingInput && this.s.list.editing && root.activeElement === editingInput)) list.innerHTML = this._tplShopList();
    root.querySelectorAll(".quick-sugg").forEach((el) => (el.innerHTML = this._tplQuickChips()));
    root.querySelectorAll(".quick-count").forEach((el) => (el.innerHTML = this._tplQuickCount()));
    const home = root.getElementById("home-shopping");
    if (home) home.innerHTML = this._tplHomeShopping();
    const storeList = root.getElementById("store-list");
    if (storeList) storeList.innerHTML = this._tplStoreList();
    const progress = root.getElementById("sm-progress");
    if (progress) progress.innerHTML = this._tplStoreProgress();
    this._saveCache();
  }

  /* Enregistre le texte modifié d'un article (Entrée ou sortie du champ). */
  _saveListEdit(input) {
    if (!input || input.dataset.saving) return;
    input.dataset.saving = "1";
    const uid = input.dataset.uid;
    const value = String(input.value || "").trim();
    const item = this.s.list.items.find((i) => i.uid === uid);
    this.s.list.editing = null;
    if (item && value && value !== item.summary) this._listOp({ type: "rename", uid, text: value });
    else this._renderListParts();
  }

  _onFocusOut(ev) {
    const el = ev.target;
    if (el && el.dataset && el.dataset.edit === "list") this._saveListEdit(el);
  }

  async _quickAdd(texts) {
    const items = texts.flatMap((t) => String(t).split(/[,;\n]/)).map((t) => t.trim()).filter(Boolean);
    if (!items.length) return;
    if (!this.listEntity) {
      this._toast("Aucune liste de courses : choisissez-en une dans ⚙️ Réglages du foyer.", true);
      return;
    }
    if (!this._online) {
      for (const text of items) this._listOp({ type: "add", uid: `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: cap(text) });
      this._offlineToastAt = 0;
      this._offlineNotice();
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

  _toast(message, error = false, action = null) {
    clearTimeout(this._toastTimer);
    this.s.toast = { message, error, action };
    this._renderToast();
    this._toastTimer = setTimeout(() => {
      this.s.toast = null;
      this._renderToast();
    }, error ? 6000 : action ? 5000 : 4000);
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
    if (el.dataset.live === "jow") {
      if (this.top && this.top.type === "import") this.top.jowPage = 1;
      clearTimeout(this._jowTimer);
      this._jowTimer = setTimeout(() => this._jowSearch(), 300);
    }
    if (path.startsWith("fridge.ingredients.")) this._syncFridgeMemory();
    if (path.startsWith("top.draft.")) this._settingsDirtyCheck();
    if (el.dataset.heroTitle !== undefined) {
      if (/\n/.test(el.value)) {
        el.value = el.value.replace(/\s*\n\s*/g, " ");
        this._setPath(path, el.value);
      }
      this._fitTitle(el);
    }
    if (path === "top.draft.image" || path === "top.draft.title") {
      const hero = this.shadowRoot.getElementById("editor-hero");
      if (hero && this.top && this.top.draft) hero.setAttribute("style", this._heroBg(this.top.draft));
    }
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
      this.s.tab = "fridge";
      await this._analysePhoto(file);
    } else if (kind === "ing-days") {
      const ing = this.s.fridge.ingredients[Number(el.dataset.i)];
      if (ing) {
        ing.expires = el.value === "" ? null : addDays(todayIso(), Number(el.value));
        this._syncFridgeMemory();
        this._render();
      }
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
    if (ev.key === "Escape" && this._confirmResolve) return this._closeDialog(null);
    if (ev.key === "Escape" && this._lightbox) return this._closeLightbox();
    if (ev.key === "Escape" && this.s.home.quick) return this._setHomeQuick(false);
    if (ev.key === "Escape" && this.s.list.editing) {
      this.s.list.editing = null;
      this._renderListParts();
      return;
    }
    if (ev.key === "Escape" && this.s.stack.length) this._dispatch("close");
  }

  /* ---------------- gestes tactiles */

  static get SWIPE_WIDTH() {
    return 152;
  }

  /* --- déplacer un repas du menu : appui long, puis glisser --- */

  _mealPressStart(ev, x, y) {
    const meal = ev.composedPath().find((n) => n.dataset && n.dataset.meal);
    if (!meal || ev.composedPath().some((n) => n.tagName === "BUTTON" && n.classList && n.classList.contains("icon-btn"))) return;
    clearTimeout(this._pressTimer);
    this._press = { meal, x, y };
    // La poignée ⋮⋮ saisit le repas tout de suite (elle ne fait jamais défiler la page) ;
    // ailleurs sur le repas, il faut un appui long.
    if (ev.composedPath().some((n) => n.dataset && n.dataset.grip !== undefined)) {
      if (ev.cancelable) ev.preventDefault();
      this._startMealDrag();
      return;
    }
    this._pressTimer = setTimeout(() => this._startMealDrag(), 450);
  }

  _startMealDrag() {
    const press = this._press;
    if (!press) return;
    const entry = this.s.week.entries.find((e) => e.id === press.meal.dataset.meal);
    if (!entry) return;
    const recipe = this._recipe(entry.recipe_id);
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = `${recipe ? emojiFor(recipe.title) + " " + recipe.title : "Repas"}`;
    this.shadowRoot.querySelector(".app").appendChild(ghost);
    press.meal.classList.add("lifting");
    this._mealDrag = { id: entry.id, ghost, el: press.meal, target: null };
    // Pendant le déplacement, la page ne défile plus au doigt (seulement aux bords, par le code).
    const main = this.shadowRoot.getElementById("main");
    if (main) main.style.overflowY = "hidden";
    if (navigator.vibrate) navigator.vibrate(25);
    this._moveMealDrag(press.x, press.y);
  }

  _dropTargetAt(x, y) {
    const drag = this._mealDrag;
    const under = this.shadowRoot.elementFromPoint(x, y);
    const slot = under && under.closest ? under.closest("[data-drop-slot]") : null;
    if (slot !== drag.target) {
      if (drag.target) drag.target.classList.remove("drop");
      if (slot) slot.classList.add("drop");
      drag.target = slot;
    }
  }

  _moveMealDrag(x, y) {
    const drag = this._mealDrag;
    if (!drag) return;
    const app = this.shadowRoot.querySelector(".app").getBoundingClientRect();
    drag.ghost.style.left = `${x - app.left}px`;
    drag.ghost.style.top = `${y - app.top}px`;
    drag.x = x;
    drag.y = y;
    if (drag.startY == null) drag.startY = y;
    this._dropTargetAt(x, y);
    // Défilement automatique près des bords, seulement une fois le geste vraiment commencé.
    const main = this.shadowRoot.getElementById("main");
    const box = main.getBoundingClientRect();
    clearInterval(this._dragScroll);
    if (Math.abs(y - drag.startY) < 24) return;
    const edge = 44;
    const over = y < box.top + edge ? y - (box.top + edge) : y > box.bottom - edge ? y - (box.bottom - edge) : 0;
    const speed = Math.max(-14, Math.min(14, Math.round(over / 3)));
    if (speed) {
      this._dragScroll = setInterval(() => {
        main.scrollTop += speed;
        // La page bouge sous le doigt : on recalcule le créneau visé.
        this._dropTargetAt(drag.x, drag.y);
      }, 16);
    }
  }

  async _endMealDrag(cancel = false) {
    clearTimeout(this._pressTimer);
    this._press = null;
    const drag = this._mealDrag;
    if (!drag) return false;
    this._mealDrag = null;
    clearInterval(this._dragScroll);
    const main = this.shadowRoot.getElementById("main");
    if (main) main.style.overflowY = "";
    drag.ghost.remove();
    drag.el.classList.remove("lifting");
    if (drag.target) drag.target.classList.remove("drop");
    this._swipeJustMoved = true;
    setTimeout(() => (this._swipeJustMoved = false), 350);
    if (cancel || !drag.target) return true;
    const date = drag.target.dataset.dropDate;
    const slot = drag.target.dataset.dropSlot;
    const entry = this.s.week.entries.find((e) => e.id === drag.id);
    if (!entry || (entry.date === date && entry.slot === slot)) return true;
    try {
      const res = await this._ws("plan/move", { entry_id: drag.id, date, slot });
      for (const changed of res.changed) {
        const local = this.s.week.entries.find((e) => e.id === changed.id);
        if (local) Object.assign(local, changed);
      }
      this._toast(res.changed.length > 1 ? "🔁 Repas échangés" : `📅 Déplacé au ${fmtDay(date, { weekday: "long" })} ${slot === "lunch" ? "midi" : "soir"}`);
    } catch (err) {
      this._toast(this._err(err), true);
    }
    this._render();
    return true;
  }

  _onTouchStart(ev) {
    this._mealPressStart(ev, ev.touches[0].clientX, ev.touches[0].clientY);
    // Article de la liste de courses : balayer à droite = cocher, à gauche = supprimer.
    const lrow = ev.composedPath().find((n) => n.dataset && n.dataset.lswipe);
    const inField = ev.composedPath().some((n) => n.tagName === "INPUT");
    this._ls = lrow && !inField ? { row: lrow, x: ev.touches[0].clientX, y: ev.touches[0].clientY, dir: null, dx: 0 } : null;
    const t = ev.touches[0];
    this._touchX = t.clientX;
    this._touchY = t.clientY;
    this._swipeDir = null;
    const row = ev.composedPath().find((n) => n.dataset && n.dataset.swipe);
    // Toucher ailleurs referme la recette ouverte.
    if (this._openSwipe && this._openSwipe !== row) this._closeSwipe();
    this._swipeRow = row || null;
    this._swipeBase = row && row === this._openSwipe ? -FrigoMalinPanel.SWIPE_WIDTH : 0;
  }

  _onTouchMove(ev) {
    const t0 = ev.touches[0];
    if (this._mealDrag) {
      ev.preventDefault();
      this._moveMealDrag(t0.clientX, t0.clientY);
      return;
    }
    if (this._ls) {
      const ls = this._ls;
      const dx = t0.clientX - ls.x;
      const dy = t0.clientY - ls.y;
      if (!ls.dir) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        ls.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
      }
      if (ls.dir !== "h") return;
      if (ev.cancelable) ev.preventDefault();
      ls.dx = dx;
      ls.row.classList.add("dragging");
      ls.row.classList.toggle("right", dx > 0);
      ls.row.classList.toggle("left", dx < 0);
      ls.row.classList.toggle("armed", Math.abs(dx) > 90);
      const front = ls.row.querySelector(".li");
      if (front) front.style.transform = `translateX(${dx}px)`;
      return;
    }
    // Le doigt bouge avant l'appui long : c'est un défilement, pas un déplacement.
    if (this._press && Math.hypot(t0.clientX - this._press.x, t0.clientY - this._press.y) > 10) {
      clearTimeout(this._pressTimer);
      this._press = null;
    }
    const row = this._swipeRow;
    if (!row || this._touchX == null) return;
    const t = ev.touches[0];
    const dx = t.clientX - this._touchX;
    const dy = t.clientY - this._touchY;
    if (!this._swipeDir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      this._swipeDir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (this._swipeDir !== "h") return;
    ev.preventDefault();
    row.classList.add("dragging");
    const x = Math.max(-FrigoMalinPanel.SWIPE_WIDTH - 20, Math.min(0, this._swipeBase + dx));
    row.querySelector(".list-item").style.transform = `translateX(${x}px)`;
  }

  _onTouchEnd(ev) {
    if (this._ls) {
      const { row, dir, dx } = this._ls;
      this._ls = null;
      if (dir === "h") {
        this._swipeJustMoved = true;
        setTimeout(() => (this._swipeJustMoved = false), 350);
        row.classList.remove("dragging");
        const front = row.querySelector(".li");
        const uid = row.dataset.lswipe;
        if (Math.abs(dx) > 90) {
          if (front) front.style.transform = `translateX(${dx > 0 ? "" : "-"}110%)`;
          if (navigator.vibrate) navigator.vibrate(15);
          setTimeout(() => {
            if (dx > 0) {
              const item = this.s.list.items.find((i) => i.uid === uid);
              if (item) this._listOp({ type: "status", uid, status: item.status === "completed" ? "needs_action" : "completed" });
            } else this._removeListItem(uid);
          }, 170);
        } else {
          if (front) front.style.transform = "";
          setTimeout(() => row.classList.remove("left", "right", "armed"), 220);
        }
        return;
      }
    }
    if (this._mealDrag || this._press) {
      const wasDragging = Boolean(this._mealDrag);
      this._endMealDrag();
      if (wasDragging) {
        this._touchX = null;
        return;
      }
    }
    const dx = this._touchX == null ? 0 : ev.changedTouches[0].clientX - this._touchX;
    const row = this._swipeRow;
    if (row && this._swipeDir === "h") {
      row.classList.remove("dragging");
      const x = this._swipeBase + dx;
      if (x < -60) this._openSwipeRow(row);
      else this._closeSwipe(row);
      this._swipeJustMoved = true;
      setTimeout(() => (this._swipeJustMoved = false), 350);
    } else if (this.top && this.top.type === "cook" && Math.abs(dx) >= 60 && this._touchX != null) {
      this._dispatch(dx < 0 ? "cook-next" : "cook-prev");
    }
    this._touchX = null;
    this._swipeRow = null;
    this._swipeDir = null;
  }

  _openSwipeRow(row) {
    if (this._openSwipe && this._openSwipe !== row) this._closeSwipe();
    row.querySelector(".list-item").style.transform = `translateX(-${FrigoMalinPanel.SWIPE_WIDTH}px)`;
    this._openSwipe = row;
  }

  _closeSwipe(row = this._openSwipe) {
    if (row) {
      const front = row.querySelector(".list-item");
      if (front) front.style.transform = "";
    }
    if (row === this._openSwipe) this._openSwipe = null;
  }

  /* Fenêtre de confirmation : renvoie une promesse résolue à true / false. */
  _confirm({ title, message, confirm = "Confirmer", danger = true }) {
    return this._ask({ title, message, buttons: [{ label: confirm, value: true, style: danger ? "danger-fill" : "" }] }).then((v) => v === true);
  }

  /* Question avec plusieurs réponses ; « Annuler » (ou toucher à côté) renvoie null. */
  _ask({ title, message, buttons, details = [] }) {
    return new Promise((resolve) => {
      this._confirmResolve = resolve;
      this._askButtons = buttons;
      const host = this.shadowRoot.getElementById("dialog");
      host.innerHTML = `<div class="dialog-backdrop" data-action="dialog-no">
        <div class="dialog" role="alertdialog" aria-modal="true" data-action="dialog-noop">
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
          ${details.length ? `<ul class="dialog-list">${details.map((d) => `<li>${ingEmoji(d)} ${esc(d)}</li>`).join("")}</ul>` : ""}
          <div class="row wrap">
            <button class="btn text" data-action="dialog-no">Annuler</button>
            ${buttons.map((b, i) => `<button class="btn ${b.style || ""}" data-action="dialog-pick" data-i="${i}">${esc(b.label)}</button>`).join("")}
          </div>
        </div>
      </div>`;
      const last = host.querySelectorAll('[data-action="dialog-pick"]');
      if (last.length) last[last.length - 1].focus();
    });
  }

  _closeDialog(answer = null) {
    const host = this.shadowRoot.getElementById("dialog");
    if (host) host.innerHTML = "";
    if (this._confirmResolve) {
      this._confirmResolve(answer);
      this._confirmResolve = null;
    }
  }

  async _deleteRecipeConfirmed(id) {
    const r = this._recipe(id);
    if (!r) return false;
    const ok = await this._confirm({
      title: "Supprimer la recette ?",
      message: `« ${r.title} » sera retirée du carnet et du menu. Cette action est définitive.`,
      confirm: "Supprimer",
    });
    if (!ok) return false;
    try {
      await this._ws("recipes/delete", { recipe_id: id });
      this.s.recipes = this.s.recipes.filter((x) => x.id !== id);
      this.s.week.entries = this.s.week.entries.filter((e) => e.recipe_id !== id);
      this._toast("Recette supprimée");
      return true;
    } catch (err) {
      this._toast(this._err(err), true);
      return false;
    }
  }

  _onClick(ev) {
    if (this._swipeJustMoved) {
      ev.preventDefault();
      return;
    }
    const path = ev.composedPath();
    if (this.s.home.quick && !path.some((n) => n.id === "home-quick" || n.id === "home-quick-tile")) this._setHomeQuick(false);
    const el = path.find((n) => n.dataset && n.dataset.action);
    // Une recette ouverte par glissement se referme au lieu de s'ouvrir.
    if (this._openSwipe && el && el.dataset.action === "open-recipe") {
      ev.preventDefault();
      this._closeSwipe();
      return;
    }
    if (!el || el.disabled) return;
    ev.preventDefault();
    Promise.resolve(this._dispatch(el.dataset.action, el, ev)).finally(() => this._settingsDirtyCheck());
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
        if (s.plusOpen) this._setPlus(false);
        this._tabAnim = s.tab !== d.tab;
        s.tab = d.tab;
        s.home.quick = false;
        if (s.tab === "home") this._loadHome();
        if (s.tab === "week") this._loadWeek();
        if (s.tab === "shopping") {
          this._loadMenuInfo();
          this._subscribeList();
        }
        this._render();
        this.shadowRoot.querySelector("main")?.scrollTo(0, 0);
        return;
      case "close":
        if (this.top && (this.top.type === "cook" || this.top.type === "store-mode")) this._releaseWakeLock();
        if (this.top && this.top.type === "cook") {
          this._stopListening();
          if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        }
        s.stack.pop();
        this._renderOverlay();
        this._saveCookSession();
        return;

      /* Frigo */
      case "pick-photo":
        this.shadowRoot.getElementById(d.input).click();
        return;
      case "home-cook": {
        const entry = s.home.entries.find((e) => e.id === d.id);
        const r = entry && this._recipe(entry.recipe_id);
        if (!r) return;
        s.stack.push({ type: "recipe", id: r.id, servings: entry.servings, confirmDelete: false });
        s.stack.push({ type: "cook", id: r.id, servings: entry.servings, step: -1, showIng: false, checked: [] });
        this._requestWakeLock();
        this._renderOverlay();
        return;
      }
      case "home-quick":
        this._setHomeQuick(!s.home.quick);
        return;
      case "editor-image": {
        const input = this.shadowRoot.getElementById("editor-image");
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus({ preventScroll: true });
        return;
      }
      case "plus-toggle":
        this._setPlus(!s.plusOpen);
        return;
      case "plus-photo":
        // Le sélecteur de photo doit s'ouvrir pendant l'appui (sinon l'iPhone le bloque).
        this.shadowRoot.getElementById("plus-cam")?.click();
        this._setPlus(false);
        return;
      case "plus-quick":
        this._setPlus(false);
        this._dispatch("quick-open", { dataset: {} });
        return;
      case "home-jow":
        this._dispatch("tab", { dataset: { tab: "recipes" } });
        this._dispatch("import-open", { dataset: {} });
        return;
      case "home-go":
        if (d.store) this._pickStore(d.store);
        this._dispatch("tab", { dataset: { tab: d.tab } });
        return;
      case "memory-photo":
        this._showFridgePhoto(d.i != null ? Number(d.i) : null);
        return;
      case "lightbox-close":
        this._closeLightbox();
        return;
      case "lightbox-open":
        this._openImage(s.fridge.photo);
        return;
      case "lightbox-zoom": {
        const box = this._lightbox;
        if (!box || !box.image) return;
        // Zoom à l'endroit touché, puis on se déplace en faisant glisser la photo.
        const rect = el.getBoundingClientRect();
        const fx = ev && ev.clientX != null ? (ev.clientX - rect.left) / rect.width : 0.5;
        const fy = ev && ev.clientY != null ? (ev.clientY - rect.top) / rect.height : 0.5;
        box.zoom = !box.zoom;
        this._renderLightbox();
        if (box.zoom) {
          const stage = this.shadowRoot.querySelector(".lb-stage");
          const img = stage && stage.querySelector("img");
          const center = () => {
            stage.scrollLeft = fx * stage.scrollWidth - stage.clientWidth / 2;
            stage.scrollTop = fy * stage.scrollHeight - stage.clientHeight / 2;
          };
          if (img && img.complete) center();
          else if (img) img.onload = center;
        }
        return;
      }
      case "memory-edit":
        s.fridgeEdit = !s.fridgeEdit;
        this._render();
        if (s.fridgeEdit) this.shadowRoot.getElementById("memory-new")?.focus({ preventScroll: true });
        return;
      case "memory-remove": {
        const items = s.fridgeMemory.items.filter((i) => i.name !== d.name);
        s.fridgeMemory.items = items;
        this._render();
        this._saveFridgeItems(items);
        return;
      }
      case "memory-add": {
        const names = String(s.fridgeNew || "").split(/[,;\n]/).map((n) => n.trim()).filter(Boolean);
        if (!names.length) return;
        const place = s.fridgeNewPlace || "etagere";
        const known = new Set(s.fridgeMemory.items.map((i) => foldText(i.name)));
        const added = names.filter((n) => !known.has(foldText(n))).map((name) => ({ name, amount: "", expires: null, place, shelf: null }));
        s.fridgeNew = "";
        s.fridgeMemory.items = [...s.fridgeMemory.items, ...added];
        this._render();
        this.shadowRoot.getElementById("memory-new")?.focus({ preventScroll: true });
        this._saveFridgeItems(s.fridgeMemory.items);
        return;
      }
      case "memory-use":
        this._useFridgeMemory();
        return;
      case "memory-clear": {
        const ok = await this._confirm({ title: "Oublier le frigo ?", message: "Les aliments mémorisés seront effacés. Vous pourrez reprendre une photo.", confirm: "Oublier" });
        if (!ok) return;
        this.s.fridgeMemory = await this._ws("fridge/memory/clear");
        s.fridgeEdit = false;
        if (s.fridge.fromMemory) s.fridge = this._freshFridge();
        this._toast("🧊 Frigo oublié");
        this._render();
        this._renderOverlay();
        return;
      }
      case "set-fridge-days":
        this.top.draft.fridge_days = Number(d.value);
        this._renderOverlay();
        return;
      case "manual-list":
        s.fridge.step = "review";
        s.fridge.photo = null;
        this._render();
        return;
      case "ing-remove":
        s.fridge.ingredients.splice(Number(d.i), 1);
        this._syncFridgeMemory();
        this._render();
        return;
      case "ing-add": {
        const names = String(s.fridge.newIng || "").split(",").map((x) => x.trim()).filter(Boolean);
        if (!names.length) return;
        for (const name of names) s.fridge.ingredients.push({ name, amount: "", expires: null });
        s.fridge.newIng = "";
        this._syncFridgeMemory();
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
        if (this.top && this.top.type === "purchases") this._renderOverlay();
        return;
      case "stats-period":
        s.stats.period = d.value;
        s.stats.sel = null;
        this._loadStats();
        return;
      case "stats-day":
        s.stats.sel = Number(d.i);
        this._renderStats();
        return;
      case "purchases-open":
        s.stack.push({ type: "purchases", days: 30, data: null, loading: true });
        this._renderOverlay();
        this._loadPurchases();
        return;
      case "purchases-days":
        this.top.days = d.value ? Number(d.value) : null;
        this.top.loading = true;
        this._renderOverlay();
        this._loadPurchases();
        return;
      case "purchase-delete": {
        const top = this.top;
        try {
          await this._ws("shopping/purchase/delete", { name: d.name, at: d.at });
        } catch (err) {
          this._toast(this._err(err), true);
          return;
        }
        this._toast("Achat retiré de l'historique");
        if (top && top.type === "purchases") this._loadPurchases();
        this._loadSuggestions();
        return;
      }
      case "list-toggle": {
        const item = s.list.items.find((i) => i.uid === d.uid);
        if (!item) return;
        if (navigator.vibrate && item.status !== "completed") navigator.vibrate(10);
        // Un article coché devient un achat (enregistré par le serveur) : on met à jour l'ajout rapide.
        if (item.status !== "completed") {
          clearTimeout(this._suggTimer);
          this._suggTimer = setTimeout(() => this._loadSuggestions(), 4000);
        }
        this._listOp({ type: "status", uid: d.uid, status: item.status === "completed" ? "needs_action" : "completed" });
        return;
      }
      case "list-edit":
        s.list.editing = d.uid;
        this._renderListParts();
        {
          const input = this.shadowRoot.querySelector(".li-edit");
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        }
        return;
      case "list-rename":
        this._saveListEdit(el);
        return;
      case "list-remove":
        this._removeListItem(d.uid);
        return;
      case "toast-action": {
        const action = s.toast && s.toast.action;
        clearTimeout(this._toastTimer);
        s.toast = null;
        this._renderToast();
        if (action) action.run();
        return;
      }
      case "store-mode":
        if (d.store) this._pickStore(d.store);
        if (!s.stack.some((x) => x.type === "store-mode")) s.stack.push({ type: "store-mode" });
        this._requestWakeLock();
        this._renderOverlay();
        return;
      case "store-finish": {
        const done = s.list.items.filter((i) => i.status === "completed");
        for (const item of done) this._listOp({ type: "remove", uid: item.uid });
        s.stack = s.stack.filter((x) => x.type !== "store-mode");
        this._releaseWakeLock();
        this._renderOverlay();
        this._toast("🎉 Courses terminées, panier vidé");
        return;
      }
      case "list-show-done":
        s.list.showDone = !s.list.showDone;
        this._renderListParts();
        return;
      case "list-clear-done":
        if (!this._online) {
          for (const item of s.list.items.filter((i) => i.status === "completed")) this._listOp({ type: "remove", uid: item.uid });
          return;
        }
        this._todo("remove_completed_items", {})
          .then(() => this._toast("Panier vidé"))
          .catch((err) => this._toast(this._err(err), true));
        return;
      /* Réglages du foyer */
      case "settings-open":
        s.stack.push({ type: "settings", draft: clone(this.settings) });
        this._settingsDraft = this.top.draft;
        this._saveState = null;
        this._settingsSaved = JSON.stringify(this.top.draft);
        this._renderOverlay();
        // Dépense IA à jour.
        this._ws("config")
          .then((cfg) => {
            s.config.usage = cfg.usage;
            const el = this.shadowRoot.getElementById("ai-usage");
            if (el) el.innerHTML = this._tplUsage();
          })
          .catch(() => {});
        return;
      case "set-servings":
        this.top.draft.servings = d.value ? Number(d.value) : null;
        this._renderOverlay();
        return;
      case "settings-acc": {
        // Accordéon : une seule section ouverte à la fois, dépliée sur place.
        const top = this.top;
        top.open = top.open === d.page ? null : d.page;
        const root = this.shadowRoot;
        root.querySelectorAll("#overlay .acc").forEach((acc) => {
          const open = acc.dataset.acc === top.open;
          acc.classList.toggle("open", open);
          acc.querySelector(".set-row").setAttribute("aria-expanded", String(open));
        });
        if (top.open) {
          const acc = root.querySelector(`#overlay .acc[data-acc="${top.open}"]`);
          const body = root.querySelector("#overlay .sheet .body");
          setTimeout(() => {
            if (!acc || !body) return;
            const delta = acc.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
            body.scrollBy({ top: delta, behavior: "smooth" });
          }, 320);
        }
        return;
      }
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
        if (this.top && this.top.type === "store-mode") this._renderOverlay();
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
      case "copy-open":
        this._openCopy();
        return;
      case "copy-week":
        this.top.source = addDays(this.top.source, 7 * Number(d.delta));
        this._loadCopySource();
        return;
      case "copy-toggle": {
        const m = this.top.meals[Number(d.i)];
        m.on = !m.on;
        this._renderOverlay();
        return;
      }
      case "copy-apply":
        this._applyCopy();
        return;
      case "weekplan-open":
        this._openWeekPlan(d.rolling === "1");
        return;
      case "weekplan-slot": {
        const key = `${d.date}|${d.slot}`;
        this.top.slots[key] = !this.top.slots[key];
        this._renderOverlay();
        return;
      }
      case "weekplan-generate":
        if (this.top.step === "preview") this._redoWeek();
        else this._generateWeek();
        return;
      case "weekplan-lock": {
        const meal = this.top.proposal.meals[Number(d.i)];
        meal.locked = !meal.locked;
        this._renderOverlay();
        return;
      }
      case "weekplan-replace":
        this._replaceMeal(Number(d.i));
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
      case "dialog-pick":
        this._closeDialog(this._askButtons[Number(d.i)].value);
        return;
      case "dialog-no":
        this._closeDialog(null);
        return;
      case "dialog-noop":
        return;
      case "swipe-fav": {
        const r = this._recipe(d.id);
        this._closeSwipe();
        if (!r) return;
        try {
          const res = await this._ws("recipes/patch", { recipe_id: r.id, favorite: !r.favorite });
          this._replaceRecipe(res.recipe);
          this._toast(res.recipe.favorite ? "⭐ Ajoutée aux favoris" : "Retirée des favoris");
          this._renderRecipeList();
        } catch (err) {
          this._toast(this._err(err), true);
        }
        return;
      }
      case "swipe-delete": {
        const deleted = await this._deleteRecipeConfirmed(d.id);
        this._closeSwipe();
        if (deleted) this._render();
        return;
      }
      case "recipes-layout":
        this._layout = this.recipesLayout === "grid" ? "list" : "grid";
        try {
          localStorage.setItem("frigo-malin-layout", this._layout);
        } catch (_) {
          /* stockage local indisponible */
        }
        this._render();
        return;
      case "filter":
        s.filter = d.value;
        this._render();
        return;
      case "open-recipe": {
        const r = this._recipe(d.id);
        if (!r) return;
        s.stack.push({ type: "recipe", id: r.id, servings: this.defaultServings, confirmDelete: false });
        this._renderOverlay();
        return;
      }
      case "new-recipe":
        s.stack.push({ type: "editor", draft: this._toDraft({ servings: s.config?.default_servings || 4 }) });
        this._renderOverlay();
        return;
      case "import-open":
        s.stack.push({ type: "import", mode: "jow", url: "", loading: false, error: null, jowQuery: "", jowDish: "", jowOptions: [], jowPage: 1, jow: null, jowLoading: false });
        this._renderOverlay();
        this._jowSearch();
        return;
      case "import-mode":
        this.top.mode = d.value;
        this.top.error = null;
        this._renderOverlay();
        if (d.value === "url") this.shadowRoot.getElementById("import-url")?.focus();
        else if (!this.top.jow) this._jowSearch();
        return;
      case "jow-dish":
        this.top.jowDish = this.top.jowDish === d.key ? "" : d.key;
        this.top.jowPage = 1;
        this._jowSearch();
        return;
      case "jow-option": {
        const list = this.top.jowOptions;
        const i = list.indexOf(d.key);
        if (i >= 0) list.splice(i, 1);
        else list.push(d.key);
        this.top.jowPage = 1;
        this._jowSearch();
        return;
      }
      case "jow-clear":
        this.top.jowDish = "";
        this.top.jowOptions = [];
        this.top.jowPage = 1;
        this._jowSearch();
        return;
      case "jow-page":
        this.top.jowPage = Number(d.page);
        this._jowSearch(true);
        return;
      case "jow-import":
        this.top.url = d.url;
        this.top.importing = d.url;
        this._import();
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
        // On commence par la mise en place (étape -1).
        s.stack.push({ type: "cook", id: top.id, draft: top.draft, servings: top.servings, step: -1, showIng: false, checked: [] });
        this._requestWakeLock();
        this._renderOverlay();
        return;
      }
      case "cook-next":
      case "cook-prev": {
        const top = this.top;
        if (!top || top.type !== "cook") return;
        const total = (this._overlayRecipe()?.steps || []).length;
        top.step = Math.max(-1, Math.min(total, top.step + (action === "cook-next" ? 1 : -1)));
        top.showIng = false;
        if (top.step === total && !top.consumed) {
          top.consumed = true;
          this._consumeAfterCook(this._overlayRecipe());
        }
        this._renderOverlay();
        this._afterCookStep();
        return;
      }
      case "cook-goto":
        this.top.step = Number(d.step);
        this._renderOverlay();
        this._afterCookStep();
        return;
      case "cook-speak":
        this._voice.speak = !this._voice.speak;
        try {
          localStorage.setItem("frigo-malin-cook-speak", this._voice.speak ? "1" : "");
        } catch (_) {
          /* stockage indisponible */
        }
        if (this._voice.speak) this._speak(this._cookText());
        else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        this._renderOverlay();
        return;
      case "cook-listen":
        if (this._voice.listen) this._stopListening();
        else if (this._startListening()) {
          this._voice.listen = true;
          this._toast("🎙️ Dites « suivant » pour passer à l'étape suivante");
        }
        this._renderOverlay();
        return;
      case "cook-ing":
        this.top.showIng = !this.top.showIng;
        this._renderOverlay();
        return;
      case "cook-big":
        this.top.big = !this.top.big;
        this._renderOverlay();
        return;
      case "cook-check": {
        const list = this.top.checked;
        const i = list.indexOf(Number(d.i));
        if (i >= 0) list.splice(i, 1);
        else list.push(Number(d.i));
        this._renderOverlay();
        return;
      }
      case "cook-check-all": {
        const r = this._overlayRecipe();
        this.top.checked = this.top.checked.length === r.ingredients.length ? [] : r.ingredients.map((_, i) => i);
        this._renderOverlay();
        return;
      }
      case "timer-start":
        this._startTimer(Number(d.seconds), d.label);
        return;
      case "timer-stop":
        this._stopTimer(d.id);
        return;
      case "timer-add":
        this._addToTimer(d.id, 60);
        return;
      case "cook-favorite": {
        const r = this._overlayRecipe();
        if (r && r.id && !r.favorite) {
          const res = await this._ws("recipes/patch", { recipe_id: r.id, favorite: true });
          this._replaceRecipe(res.recipe);
          this._toast("⭐ Ajoutée aux favoris");
          this._renderOverlay();
        }
        return;
      }

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
        const entry = [...s.week.entries, ...s.home.entries].find((e) => e.id === d.id);
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

  /* ---------------- reprendre un menu */

  _openCopy() {
    this.s.stack.push({ type: "copy", source: addDays(this.s.week.start, -7), target: this.s.week.start, meals: [], loading: true });
    this._renderOverlay();
    this._loadCopySource();
  }

  async _loadCopySource() {
    const top = this.top;
    top.loading = true;
    this._renderOverlay();
    try {
      const [src, dst] = await Promise.all([
        this._ws("plan/list", { start: top.source, end: addDays(top.source, 6) }),
        this._ws("plan/list", { start: top.target, end: addDays(top.target, 6) }),
      ]);
      const taken = new Set(dst.entries.map((e) => `${e.date}|${e.slot}`));
      top.meals = src.entries
        .filter((e) => this._recipe(e.recipe_id))
        .map((e) => {
          const offset = Math.round((parseIso(e.date) - parseIso(top.source)) / DAY_MS);
          const date = addDays(top.target, offset);
          const busy = taken.has(`${date}|${e.slot}`);
          return { ...e, targetDate: date, busy, on: !busy };
        });
    } catch (err) {
      this._toast(this._err(err), true);
    }
    top.loading = false;
    this._renderOverlay();
  }

  async _applyCopy() {
    const top = this.top;
    const chosen = top.meals.filter((m) => m.on);
    if (!chosen.length) return;
    top.loading = true;
    this._renderOverlay();
    try {
      const res = await this._ws("plan/copy", {
        meals: chosen.map((m) => ({ recipe_id: m.recipe_id, date: m.targetDate, slot: m.slot, servings: m.servings, note: m.note || "" })),
      });
      this.s.stack.pop();
      await this._loadWeek();
      let msg = `🔁 ${res.entries.length} repas repris`;
      if (res.added && res.added.length) msg += ` · ${res.added.length} ingrédients dans « ${res.list_name} »`;
      this._toast(msg);
      if (res.shopping_error) setTimeout(() => this._toast(res.shopping_error, true), 4200);
    } catch (err) {
      top.loading = false;
      this._renderOverlay();
      this._toast(this._err(err), true);
    }
  }

  _tplCopy(top) {
    const label = (start) => `${fmtDay(start, { day: "numeric", month: "short" })} – ${fmtDay(addDays(start, 6), { day: "numeric", month: "short" })}`;
    const n = top.meals.filter((m) => m.on).length;
    const body = `
      <p class="muted" style="margin-top:0">Choisissez les repas à refaire. Ils seront placés aux mêmes jours de la semaine du <b>${esc(label(top.target))}</b>, et leurs ingrédients ajoutés à la liste de courses.</p>
      <div class="week-nav">
        <button class="icon-btn" data-action="copy-week" data-delta="-1" aria-label="Semaine précédente">${icon("chevron-left")}</button>
        <div class="label">Menu du ${esc(label(top.source))}</div>
        <button class="icon-btn" data-action="copy-week" data-delta="1" aria-label="Semaine suivante" ${addDays(top.source, 7) >= top.target ? "disabled" : ""}>${icon("chevron-right")}</button>
      </div>
      ${top.loading
        ? `<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>`
        : top.meals.length
          ? `<div class="card" style="padding:4px 14px">${top.meals
              .map((m, i) => {
                const r = this._recipe(m.recipe_id);
                return `<button class="copy-meal ${m.on ? "on" : ""}" data-action="copy-toggle" data-i="${i}">
                  <span class="box">${icon("check")}</span>
                  <span class="ing-emoji">${emojiFor(r.title)}</span>
                  <span class="grow"><span>${esc(r.title)}</span><br><span class="w">${esc(cap(fmtDay(m.targetDate, { weekday: "long", day: "numeric" })))} · ${m.slot === "lunch" ? "midi" : "soir"} · ${m.servings} pers.${m.busy ? " · ⚠️ déjà un repas prévu" : ""}</span></span>
                </button>`;
              })
              .join("")}</div>`
          : `<div class="empty"><div class="emoji">🗓️</div><p>Aucun repas cette semaine-là. Remontez plus loin avec ‹.</p></div>`}`;
    const footer = `<button class="btn grow big" data-action="copy-apply" ${n && !top.loading ? "" : "disabled"}>${icon("content-copy")} Reprendre ${n} repas</button>`;
    return this._tplSheet("Reprendre un menu", body, footer);
  }

  _getPath(path) {
    const keys = path.split(".");
    let obj = keys[0] === "top" ? this.top : this.s;
    if (keys[0] === "top") keys.shift();
    for (const k of keys) obj = obj == null ? undefined : obj[k];
    return obj;
  }

  /* Réglages : enregistrés automatiquement, peu après chaque changement (ou dès la fermeture). */
  _settingsDirtyCheck() {
    const open = this.s.stack.find((x) => x.type === "settings");
    const draft = open ? open.draft : this._settingsDraft;
    if (!draft) return;
    if (JSON.stringify(draft) === this._settingsSaved) {
      if (!open) this._settingsDraft = null;
      return;
    }
    this._settingsDraft = draft;
    clearTimeout(this._settingsTimer);
    if (!open) {
      this._autosaveSettings();
      return;
    }
    this._setSaveState("pending");
    this._settingsTimer = setTimeout(() => this._autosaveSettings(), 700);
  }

  async _autosaveSettings() {
    clearTimeout(this._settingsTimer);
    const draft = this._settingsDraft;
    if (!draft) return;
    const json = JSON.stringify(draft);
    this._settingsSaved = json;
    this._setSaveState("saving");
    try {
      const res = await this._ws("settings/save", { settings: JSON.parse(json) });
      this.s.config.settings = res.settings;
      this.s.config.default_servings = res.default_servings;
      if (this.s.fridge.step === "start") this.s.fridge.servings = res.default_servings;
      const before = this.listEntity;
      if (res.shopping_list !== undefined) this.s.config.shopping_list = res.shopping_list;
      if (this.listEntity !== before) {
        this._unsubscribeList();
        this.s.list.items = [];
        this.s.list.loaded = false;
        this._subscribeList();
      }
      if (this.s.list.storeId && this.s.list.storeId !== "standard" && !res.settings.stores.some((x) => x.id === this.s.list.storeId)) this._pickStore(null);
      this._loadFridgeMemory();
      this._setSaveState(JSON.stringify(draft) === json ? "saved" : "pending");
      this._renderBehind();
    } catch (err) {
      this._settingsSaved = null;
      this._setSaveState("error");
      this._toast(this._err(err), true);
    }
    if (!this.s.stack.some((x) => x.type === "settings") && JSON.stringify(draft) === this._settingsSaved) this._settingsDraft = null;
  }

  /* Redessine l'app sous les fenêtres ouvertes, sans toucher au champ en cours de saisie. */
  _renderBehind() {
    const root = this.shadowRoot;
    const main = root.getElementById("main");
    if (!main) return;
    const scroll = main.scrollTop;
    root.getElementById("header").innerHTML = this._tplHeader();
    main.innerHTML = `<div class="page">${this._tplTab()}</div>`;
    main.scrollTop = scroll;
    root.getElementById("nav").innerHTML = this._tplNav();
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

  /* rolling : les 7 prochains jours à partir d'aujourd'hui (depuis l'accueil) au lieu de la semaine du lundi. */
  async _openWeekPlan(rolling = false) {
    const settings = this.settings;
    const today = todayIso();
    let start = this.s.week.start;
    if (rolling) start = today;
    // Si la semaine affichée est déjà bien entamée (à partir de vendredi), on propose la suivante.
    else if (addDays(start, 4) < today) start = addDays(start, 7);
    // Toujours relire le menu : l'onglet Semaine n'a peut-être pas encore été ouvert.
    let entries = [];
    try {
      entries = (await this._ws("plan/list", { start, end: addDays(start, 6) })).entries;
    } catch (_) {
      entries = start === this.s.week.start ? this.s.week.entries : [];
    }
    const taken = new Set(entries.map((e) => `${e.date}|${e.slot}`));
    // Le midi d'aujourd'hui est passé l'après-midi : on ne le propose pas.
    const lunchGone = new Date().getHours() >= 14;
    const slots = {};
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const weekend = [0, 6].includes(parseIso(date).getDay());
      for (const slot of ["lunch", "dinner"]) {
        const key = `${date}|${slot}`;
        const wanted = settings.plan_slots[`${slot}_${weekend ? "weekend" : "weekday"}`];
        slots[key] = Boolean(wanted) && date >= today && !taken.has(key) && !(date === today && slot === "lunch" && lunchGone);
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
      top.proposal = await this._ws("plan/generate", this._planPayload(top, slots));
      top.step = "preview";
    } catch (err) {
      top.step = "form";
      top.error = this._err(err);
    }
    clearInterval(timer);
    this._renderOverlay();
  }

  _planPayload(top, slots, extra = {}) {
    const payload = { slots, use_carnet: top.useCarnet, leftovers: top.leftovers, notes: top.notes || "", servings: Number(top.servings) || 4, ...extra };
    if (top.budget !== "" && Number(top.budget) > 0) payload.budget = Number(top.budget);
    return payload;
  }

  /* Refaire : seuls les repas non gardés (🔒) sont reproposés. */
  async _redoWeek() {
    const top = this.top;
    const meals = top.proposal.meals;
    const keep = meals.filter((m) => m.locked);
    const redo = meals.filter((m) => !m.locked);
    if (!redo.length) {
      this._toast("Tous les repas sont gardés 🔒 : rien à refaire.");
      return;
    }
    redo.forEach((m) => (m.replacing = true));
    this._renderOverlay();
    try {
      const res = await this._ws(
        "plan/generate",
        this._planPayload(top, redo.map((m) => ({ date: m.date, slot: m.slot })), {
          locked: keep.map((m) => ({ date: m.date, slot: m.slot, title: m.title })),
          avoid: redo.map((m) => m.title),
        })
      );
      top.proposal.meals = [...keep, ...res.meals].sort((a, b) => (a.date + (a.slot === "lunch" ? 0 : 1)).localeCompare(b.date + (b.slot === "lunch" ? 0 : 1)));
      if (res.summary) top.proposal.summary = res.summary;
    } catch (err) {
      redo.forEach((m) => (m.replacing = false));
      this._toast(this._err(err), true);
    }
    this._renderOverlay();
  }

  /* ↻ Remplacer un seul repas. */
  async _replaceMeal(i) {
    const top = this.top;
    const meal = top.proposal.meals[i];
    if (!meal || meal.replacing) return;
    meal.replacing = true;
    this._renderOverlay();
    try {
      const others = top.proposal.meals.filter((m) => m !== meal);
      const res = await this._ws(
        "plan/generate",
        this._planPayload(top, [{ date: meal.date, slot: meal.slot }], {
          locked: others.map((m) => ({ date: m.date, slot: m.slot, title: m.title })),
          avoid: [meal.title],
        })
      );
      const fresh = res.meals[0];
      const idx = top.proposal.meals.indexOf(meal);
      if (fresh && idx >= 0) top.proposal.meals[idx] = fresh;
      else meal.replacing = false;
    } catch (err) {
      meal.replacing = false;
      this._toast(this._err(err), true);
    }
    this._renderOverlay();
  }

  async _applyWeek() {
    const top = this.top;
    if (!top.proposal || !top.proposal.meals.length) return;
    top.step = "applying";
    this._renderOverlay();
    try {
      const res = await this._ws("plan/apply", { meals: top.proposal.meals.map(({ locked, replacing, ...m }) => m), servings: Number(top.servings) || 4 });
      const list = await this._ws("recipes/list");
      this.s.recipes = list.recipes;
      this._completeNutrition();
      this.s.stack.pop();
      this.s.week.start = mondayOf(parseIso(top.start));
      this.s.tab = "week";
      this._loadHome();
      await this._loadWeek();
      let msg = `${res.entries.length} repas ajoutés au menu`;
      if (res.added && res.added.length) msg += ` · ${res.added.length} ingrédients dans « ${res.list_name} »`;
      this._toast(msg);
      if (res.shopping_error) setTimeout(() => this._toast(res.shopping_error, true), 4200);
      if (res.failed && res.failed.length) setTimeout(() => this._toast(`Recette non écrite : ${res.failed.join(", ")}. Réessayez pour ce repas.`, true), 4200);
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
      notes: r.notes || "",
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
    const { uses, missing, id, themes, allergens, months, type, emoji, ...recipe } = top.draft;
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
    if (await this._deleteRecipeConfirmed(top.id)) {
      this.s.stack.pop();
      this._render();
    }
  }

  async _jowSearch(toTop = false) {
    const top = this.top;
    if (!top || top.type !== "import") return;
    const ticket = (this._jowTicket = (this._jowTicket || 0) + 1);
    top.jowLoading = true;
    this._renderJowResults();
    try {
      const res = await this._ws("jow/search", {
        query: top.jowQuery || "",
        dish: top.jowDish || "",
        options: top.jowOptions || [],
        page: top.jowPage || 1,
      });
      // Une réponse plus ancienne qu'une autre recherche est ignorée.
      if (this.top !== top || ticket !== this._jowTicket) return;
      top.jow = res;
      top.jowPage = res.page;
      top.error = null;
    } catch (err) {
      if (ticket !== this._jowTicket) return;
      top.error = this._err(err);
    }
    top.jowLoading = false;
    this._renderJowResults();
    if (toTop) {
      // Nouvelle page : on remonte en haut des résultats.
      const body = this.shadowRoot.querySelector("#overlay .sheet .body");
      const el = this.shadowRoot.getElementById("jow-results");
      if (body && el) body.scrollBy({ top: el.getBoundingClientRect().top - body.getBoundingClientRect().top - 8 });
    }
  }

  _renderJowResults() {
    const el = this.shadowRoot.getElementById("jow-results");
    if (el && this.top && this.top.type === "import") el.innerHTML = this._tplJowResults(this.top);
  }

  _tplJowResults(top) {
    if (top.error) return `<div class="alert">${esc(top.error)}</div>`;
    if (!top.jow) return skel("cards", 5);
    const res = top.jow;
    const dishes = res.dishes || [];
    const options = res.options || [];
    const optionEmoji = Object.fromEntries(options.map((o) => [o.key, o.emoji]));
    const inCarnet = new Set(this.s.recipes.map((r) => r.source_url).filter(Boolean));
    const filtered = Boolean(top.jowDish || (top.jowOptions || []).length);
    const filters = `
      <div class="chips scroll jow-filters">
        <button class="chip ${!top.jowDish ? "on" : ""}" data-action="jow-dish" data-key="${esc(top.jowDish || "")}">Tout</button>
        ${dishes
          .filter((x) => x.count || x.key === top.jowDish)
          .map((x) => `<button class="chip ${top.jowDish === x.key ? "on" : ""}" data-action="jow-dish" data-key="${x.key}">${x.emoji} ${esc(x.label)} <span class="n">${x.count}</span></button>`)
          .join("")}
      </div>
      <div class="chips scroll jow-filters opts">
        ${options
          .filter((x) => x.count || (top.jowOptions || []).includes(x.key))
          .map((x) => {
            const on = (top.jowOptions || []).includes(x.key);
            return `<button class="chip ${on ? "on" : ""}" data-action="jow-option" data-key="${x.key}">${on ? icon("check") : x.emoji} ${esc(x.label)}</button>`;
          })
          .join("")}
      </div>`;
    const summary = `<div class="jow-sum"><span>${res.total} recette${res.total > 1 ? "s" : ""}${res.pages > 1 ? ` · page ${res.page} / ${res.pages}` : ""}</span>
      ${filtered ? `<button class="btn text" data-action="jow-clear">${icon("filter-remove-outline")} Effacer les filtres</button>` : ""}</div>`;
    if (!res.recipes.length) {
      return `${filters}${summary}<div class="empty"><div class="emoji">🔍</div><p>Aucune recette Jow ne correspond${filtered ? " à ces filtres" : ""}.</p></div>`;
    }
    const cards = res.recipes
      .map((r) => {
        const badges = (r.cats || []).filter((c) => optionEmoji[c] && ["veggie", "kids", "airfryer", "onepan", "healthy"].includes(c)).map((c) => optionEmoji[c]).join(" ");
        return `<button class="lib-card jow-card" data-action="jow-import" data-url="${esc(r.url)}" ${top.loading ? "disabled" : ""}>
            ${safeUrl(r.image) ? `<img class="thumb" src="${esc(safeUrl(r.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="thumb">${emojiFor(r.title)}</div>`}
            <div class="grow"><div class="t">${esc(r.title)}</div><div class="m">${esc(r.description)}</div>
              ${badges || inCarnet.has(r.url) ? `<div class="jow-badges">${inCarnet.has(r.url) ? `<span class="tag ok">✓ Dans le carnet</span>` : ""}${badges ? `<span class="em">${badges}</span>` : ""}</div>` : ""}</div>
            ${top.loading && top.importing === r.url ? `<span class="spinner sm"></span>` : icon("download")}
          </button>`;
      })
      .join("");
    return `${filters}${summary}<div class="jow-list ${top.jowLoading ? "loading" : ""}">${cards}</div>${this._tplPager(res.page, res.pages)}`;
  }

  /* Pages : ‹ 1 … 4 5 6 … 21 › */
  _tplPager(page, pages) {
    if (pages <= 1) return "";
    const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
    const sorted = [...nums].sort((a, b) => a - b);
    let html = "";
    let last = 0;
    for (const n of sorted) {
      if (n - last > 1) html += `<span class="gap">…</span>`;
      html += `<button class="${n === page ? "on" : ""}" data-action="jow-page" data-page="${n}" ${n === page ? 'aria-current="page"' : ""}>${n}</button>`;
      last = n;
    }
    return `<nav class="pager" aria-label="Pages">
      <button class="arrow" data-action="jow-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="Page précédente">${icon("chevron-left")}</button>
      ${html}
      <button class="arrow" data-action="jow-page" data-page="${page + 1}" ${page >= pages ? "disabled" : ""} aria-label="Page suivante">${icon("chevron-right")}</button>
    </nav>`;
  }

  async _import() {
    const top = this.top;
    if (!String(top.url).trim()) return;
    top.loading = true;
    top.error = null;
    this._renderOverlay();
    try {
      const res = await this._ws("recipes/import", { url: String(top.url).trim() });
      if (top.mode === "jow") {
        // La recherche Jow reste dessous : la flèche retour y ramène, au même endroit.
        top.loading = false;
        top.importing = null;
        const body = this.shadowRoot.querySelector("#overlay .body");
        top.scroll = body ? body.scrollTop : 0;
      } else {
        this.s.stack.pop();
      }
      this.s.stack.push({ type: "editor", draft: this._toDraft(res.recipe), imported: true });
    } catch (err) {
      top.loading = false;
      top.error = this._err(err);
      // Depuis la liste Jow : on garde la liste et on montre l'erreur en bas.
      if (top.mode === "jow") {
        this._toast(top.error, true);
        top.error = null;
      }
    }
    this._renderOverlay();
  }

  /* ---------------- frigo */

  /* ---------------- valeurs nutritionnelles */

  /* Aliments absents de la table : demandés une seule fois à l'IA, puis gardés par le serveur. */
  async _completeNutrition() {
    this._nutAsked = this._nutAsked || new Set();
    const names = [];
    for (const r of this.s.recipes) for (const n of (r.nutrition && r.nutrition.unknown) || []) if (!this._nutAsked.has(foldText(n))) names.push(n);
    if (!names.length) return;
    names.forEach((n) => this._nutAsked.add(foldText(n)));
    try {
      const res = await this._ws("nutrition/complete", { names: [...new Set(names)].slice(0, 40) });
      if (res.added) {
        this.s.recipes = (await this._ws("recipes/list")).recipes;
        this._renderBehind();
        this._renderOverlay();
      }
    } catch (_) {
      /* les chiffres restent partiels */
    }
  }

  async _completeRecipeNutrition(r) {
    this._nutAsked = this._nutAsked || new Set();
    const names = ((r.nutrition && r.nutrition.unknown) || []).filter((n) => !this._nutAsked.has(foldText(n)));
    if (!names.length) return;
    names.forEach((n) => this._nutAsked.add(foldText(n)));
    r.nutritionLoading = true;
    try {
      const res = await this._ws("nutrition/complete", { names, ingredients: r.ingredients, servings: r.servings || 4 });
      if (res.nutrition) r.nutrition = res.nutrition;
    } catch (_) {
      /* les chiffres restent partiels */
    }
    r.nutritionLoading = false;
    this._renderOverlay();
    this._renderBehind();
  }

  _tplNutrition(r) {
    const n = r.nutrition;
    if (!n) return "";
    if (n.unknown && n.unknown.length && !r.nutritionLoading) queueMicrotask(() => this._completeRecipeNutrition(r));
    if (!n.kcal && !(n.unknown && n.unknown.length)) return "";
    const energy = n.protein * 4 + n.carbs * 4 + n.fat * 9 || 1;
    const pct = (g, k) => Math.round((g * k * 100) / energy);
    const parts = [
      ["protein", "Protéines", n.protein, pct(n.protein, 4)],
      ["carbs", "Glucides", n.carbs, pct(n.carbs, 4)],
      ["fat", "Lipides", n.fat, pct(n.fat, 9)],
    ];
    return `<div class="sec">${bubble("nutrition", COLORS.green)}<h3>Valeurs nutritionnelles</h3><span class="muted small">par portion</span></div>
      <div class="nut card">
        <div class="nut-kcal"><b>${n.kcal}</b> kcal ${r.nutritionLoading ? `<span class="spinner sm"></span>` : ""}</div>
        <div class="nut-bar">${parts.map(([k, , , p]) => `<i style="width:${p}%;background:${NUT_COLORS[k]}"></i>`).join("")}</div>
        <div class="nut-grid">
          ${parts.map(([k, label, g, p]) => `<div><span class="dot" style="background:${NUT_COLORS[k]}"></span><b>${fmtNumber(g)} g</b><span>${label}</span><small>${p} %</small></div>`).join("")}
          <div><span class="dot" style="background:${NUT_COLORS.fiber}"></span><b>${fmtNumber(n.fiber)} g</b><span>Fibres</span><small>&nbsp;</small></div>
        </div>
        ${n.details && n.details.length ? `<details class="nut-details"><summary>🔎 Détail par ingrédient</summary>
          ${n.details.map((x) => `<div class="nut-line"><span>${ingEmoji(x.name)} ${esc(cap(x.name))}</span><span class="muted">${x.grams} g</span><b>${x.kcal} kcal</b></div>`).join("")}
        </details>` : ""}
        <p class="muted small" style="margin:10px 0 0">≈ Estimation d'après les ingrédients et leurs quantités (valeurs moyennes, type table Ciqual).${n.ai ? " ✨ Certains aliments estimés par l'IA." : ""}${n.unknown && n.unknown.length && !r.nutritionLoading ? ` Non compté : ${esc(n.unknown.join(", "))}.` : ""}</p>
      </div>`;
  }

  /* ---------------- accueil */

  async _loadHome() {
    const today = todayIso();
    this._loadStats();
    try {
      const res = await this._ws("plan/list", { start: today, end: addDays(today, 6) });
      this.s.home.entries = res.entries;
    } catch (_) {
      /* l'accueil reste utilisable sans le menu */
    }
    this.s.home.loaded = true;
    if (this.s.tab === "home") this._render();
  }

  /* Repas à venir, dans l'ordre : on saute le midi d'aujourd'hui une fois l'après-midi commencée. */
  _upcomingMeals() {
    const today = todayIso();
    const afternoon = new Date().getHours() >= 15;
    const order = { lunch: 0, dinner: 1 };
    return this.s.home.entries
      .filter((e) => e.date > today || (e.date === today && !(afternoon && e.slot === "lunch")))
      .sort((a, b) => a.date.localeCompare(b.date) || order[a.slot] - order[b.slot]);
  }

  /* Repas habituels (réglages) encore libres dans les 7 prochains jours. */
  _freeSlots() {
    const today = todayIso();
    const lunchGone = new Date().getHours() >= 14;
    const wanted = this.settings.plan_slots || {};
    const taken = new Set(this.s.home.entries.map((e) => `${e.date}|${e.slot}`));
    const free = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const weekend = [0, 6].includes(parseIso(date).getDay());
      for (const slot of ["lunch", "dinner"]) {
        if (!wanted[`${slot}_${weekend ? "weekend" : "weekday"}`]) continue;
        if (date === today && slot === "lunch" && lunchGone) continue;
        if (!taken.has(`${date}|${slot}`)) free.push({ date, slot });
      }
    }
    return free;
  }

  _mealWhen(e) {
    const today = todayIso();
    const slot = e.slot === "lunch" ? "midi" : "soir";
    if (e.date === today) return e.slot === "lunch" ? "Ce midi" : "Ce soir";
    if (e.date === addDays(today, 1)) return `Demain ${slot}`;
    return `${cap(fmtDay(e.date, { weekday: "long" }))} ${slot}`;
  }

  /* ---------------- frigo mémorisé */

  async _loadFridgeMemory() {
    try {
      this.s.fridgeMemory = await this._ws("fridge/memory");
    } catch (_) {
      /* pas grave */
    }
    if (this.s.tab === "home" || (this.s.tab === "fridge" && this.s.fridge.step === "start")) this._render();
  }

  _fridgeItemsForSave() {
    return this.s.fridge.ingredients.map((i) => ({ name: i.name, amount: i.amount || "", expires: i.expires || null, place: i.place || null, shelf: i.shelf || null }));
  }

  /* Les modifications de la liste (aliment retiré, ajouté, date) sont enregistrées dans la mémoire du frigo. */
  _syncFridgeMemory() {
    if (!this.s.fridge.fromMemory) return;
    clearTimeout(this._fridgeSync);
    this._fridgeSync = setTimeout(async () => {
      try {
        this.s.fridgeMemory = await this._ws("fridge/memory/save", { items: this._fridgeItemsForSave(), mode: "replace" });
      } catch (_) {
        /* pas grave */
      }
    }, 600);
  }

  _useFridgeMemory() {
    const f = this.s.fridge;
    f.ingredients = this.s.fridgeMemory.items.map((i) => ({ ...i }));
    f.fromMemory = true;
    f.photo = null;
    f.error = null;
    f.step = "review";
    this.s.tab = "fridge";
    this._render();
    this.shadowRoot.querySelector("main")?.scrollTo(0, 0);
  }

  async _consumeAfterCook(recipe) {
    if (!recipe || !this.s.fridgeMemory.items.length) return;
    try {
      const res = await this._ws("fridge/memory/consume", { names: recipe.ingredients.map((i) => i.name) });
      this.s.fridgeMemory = res;
      if (res.removed.length) {
        setTimeout(() => this._toast(`🧊 Retiré du frigo : ${res.removed.join(", ")}`), 1500);
      }
    } catch (_) {
      /* pas grave */
    }
  }

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
      if (!res.ingredients.length) {
        f.error = "Je n'ai rien reconnu sur cette photo. Ajoutez les ingrédients à la main ou reprenez une photo plus nette.";
      } else {
        // Un frigo est déjà mémorisé : on demande s'il faut le compléter ou le remplacer.
        let mode = "replace";
        if (this.s.fridgeMemory.items.length) {
          f.step = "review";
          this._render();
          mode = await this._ask({
            title: "🧊 Mettre à jour mon frigo",
            message: `Vous avez déjà ${this.s.fridgeMemory.items.length} aliments mémorisés. Cette photo les complète (frigo + placard, par exemple) ou les remplace ?`,
            buttons: [
              { label: "➕ Compléter", value: "merge", style: "tonal" },
              { label: "🔄 Remplacer", value: "replace" },
            ],
          });
        }
        if (mode) {
          const keep = f.fromMemory || mode === "merge" ? [] : f.ingredients.filter((i) => !i.expires);
          const memory = await this._ws("fridge/memory/save", { items: res.ingredients, mode, photo: f.photo ? f.photo.split(",")[1] : undefined });
          this.s.fridgeMemory = memory;
          const names = new Set(memory.items.map((i) => foldText(i.name)));
          f.ingredients = [...memory.items.map((i) => ({ ...i })), ...keep.filter((i) => !names.has(foldText(i.name)))];
          f.fromMemory = true;
        } else {
          // Annulé : on garde ce qui est reconnu pour cette fois, sans toucher à la mémoire.
          const known = new Set(f.ingredients.map((i) => foldText(i.name)));
          for (const ing of res.ingredients) if (!known.has(foldText(ing.name))) f.ingredients.push(ing);
        }
      }
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
      const priority = f.ingredients.filter((i) => i.expires && daysLeft(i.expires) <= 2).map((i) => i.name);
      const res = await this._ws("fridge/suggest", {
        ingredients,
        priority,
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
    // Le premier repas habituel encore libre, sinon aujourd'hui.
    const free = this._freeSlots()[0];
    this.s.stack.push({
      type: "plan",
      id,
      date: free ? free.date : todayIso(),
      slot: free ? free.slot : hour < 14 ? "lunch" : "dinner",
      servings: this.top.servings || r.servings || 4,
    });
    this._renderOverlay();
  }

  async _planConfirm() {
    const top = this.top;
    setTimeout(() => this._loadHome(), 800);
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
      const res = await this._ws("plan/add", { date: top.date, slot: top.slot, recipe_id: id, servings: this.defaultServings });
      this.s.stack.pop();
      this._afterPlanAdd(res, top.date);
    } catch (err) {
      this._toast(this._err(err), true);
    }
  }

  async _removeMeal(id) {
    const entry = this.s.week.entries.find((e) => e.id === id);
    const recipe = entry && this._recipe(entry.recipe_id);
    let removeShopping = false;
    try {
      if (entry && entry.in_shopping_list) {
        const impact = await this._ws("plan/shopping_impact", { entry_id: id });
        if (impact.count) {
          const answer = await this._ask({
            title: "Retirer le repas ?",
            message: `${recipe ? `« ${recipe.title} » est retiré du menu. ` : ""}Retirer aussi ${impact.count > 1 ? `ses ${impact.count} ingrédients` : "son ingrédient"} de la liste de courses ?`,
            details: impact.items,
            buttons: [
              { label: "Garder les courses", value: "keep", style: "tonal" },
              { label: "Retirer aussi", value: "remove", style: "danger-fill" },
            ],
          });
          if (!answer) return;
          removeShopping = answer === "remove";
        }
      }
      const res = await this._ws("plan/delete", { entry_id: id, remove_shopping: removeShopping });
      this.s.week.entries = this.s.week.entries.filter((e) => e.id !== id);
      this._render();
      const n = res.removed.length + res.updated.length;
      this._toast(n ? `Repas retiré · ${n} article${n > 1 ? "s" : ""} retiré${n > 1 ? "s" : ""} de la liste` : "Repas retiré du menu");
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

  /* ---------------- minuteurs du mode cuisine */

  _audio() {
    // Le son doit être « débloqué » par un geste (iPhone) : on crée le contexte au lancement d'un minuteur.
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._audioCtx.state === "suspended") this._audioCtx.resume();
    } catch (_) {
      this._audioCtx = null;
    }
    return this._audioCtx;
  }

  _beep() {
    const ctx = this._audio();
    if (!ctx) return;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.45;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  }

  async _startTimer(seconds, label) {
    this._audio();
    this._timers = this._timers || [];
    const recipe = this._overlayRecipe();
    const timer = {
      id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      label: label || fmtClock(seconds),
      recipe: recipe ? recipe.title : "",
      end: Date.now() + seconds * 1000,
      ringing: false,
    };
    this._timers.push(timer);
    this._ensureTick();
    this._renderTimers();
    this._saveCookSession();
    // Home Assistant prévient aussi le téléphone à la fin, même verrouillé.
    let phone = false;
    try {
      const res = await this._ws("timer/start", { timer_id: timer.id, seconds, label: timer.label, recipe: timer.recipe });
      phone = res.notify.length > 0;
    } catch (_) {
      /* le minuteur local suffit */
    }
    this._toast(`⏲️ Minuteur lancé : ${timer.label}${phone ? " · 📱 vous serez prévenu sur le téléphone" : ""}`);
  }

  _ensureTick() {
    if ((this._timers || []).length && !this._timerTick) this._timerTick = setInterval(() => this._tickTimers(), 1000);
  }

  _stopTimer(id) {
    this._timers = (this._timers || []).filter((t) => t.id !== id);
    if (!this._timers.length && this._timerTick) {
      clearInterval(this._timerTick);
      this._timerTick = null;
    }
    this._ws("timer/cancel", { timer_id: id }).catch(() => {});
    this._renderTimers();
    this._saveCookSession();
  }

  _addToTimer(id, seconds) {
    const t = (this._timers || []).find((x) => x.id === id);
    if (!t) return;
    t.end = Math.max(Date.now(), t.end) + seconds * 1000;
    t.ringing = false;
    this._ws("timer/start", { timer_id: t.id, seconds: Math.round((t.end - Date.now()) / 1000), label: t.label, recipe: t.recipe }).catch(() => {});
    this._renderTimers();
    this._saveCookSession();
  }

  /* ---------------- session de cuisine : survit à la mise en veille de l'iPhone */

  _saveCookSession() {
    const cook = this.s.stack.find((x) => x.type === "cook");
    try {
      if (!cook) {
        localStorage.removeItem("frigo-malin-cook");
        return;
      }
      const session = {
        id: cook.id || null,
        draft: cook.id ? null : cook.draft,
        servings: cook.servings,
        step: cook.step,
        checked: cook.checked || [],
        big: Boolean(cook.big),
        timers: (this._timers || []).map(({ id, label, recipe, end }) => ({ id, label, recipe, end })),
        saved: Date.now(),
      };
      localStorage.setItem("frigo-malin-cook", JSON.stringify(session));
    } catch (_) {
      /* stockage indisponible : tant pis */
    }
  }

  /* Rouvre la recette en cours si l'app a été rechargée (veille, retour sur l'app, notification). */
  _restoreCookSession() {
    let session = null;
    try {
      session = JSON.parse(localStorage.getItem("frigo-malin-cook") || "null");
    } catch (_) {
      session = null;
    }
    if (!session || Date.now() - session.saved > 12 * 3600 * 1000) return false;
    const recipe = session.id ? this._recipe(session.id) : session.draft;
    if (!recipe) return false;
    const base = session.id
      ? { type: "recipe", id: session.id, servings: session.servings, confirmDelete: false }
      : { type: "recipe", draft: session.draft, servings: session.servings };
    this.s.stack = [
      base,
      { type: "cook", id: session.id, draft: session.draft, servings: session.servings, step: session.step, checked: session.checked, big: session.big, showIng: false },
    ];
    this._timers = (session.timers || []).map((t) => ({ ...t, ringing: false }));
    this._ensureTick();
    this._requestWakeLock();
    return true;
  }

  _tickTimers() {
    const now = Date.now();
    for (const t of this._timers || []) {
      if (!t.ringing && t.end <= now) {
        t.ringing = true;
        this._beep();
        if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
        this._toast(`⏰ C'est prêt ! Minuteur « ${t.label} » terminé`);
      } else if (t.ringing && (now - t.end) % 10000 < 1000) {
        this._beep();
      }
    }
    this._renderTimers();
  }

  _tplTimers() {
    const now = Date.now();
    return (this._timers || [])
      .map((t) => `<span class="timer ${t.ringing ? "ring" : ""}">
          ${t.ringing ? "⏰" : "⏲️"} ${t.ringing ? "Prêt !" : fmtClock((t.end - now) / 1000)} <span class="lbl">${esc(t.label)}</span>
          <button class="icon-btn" data-action="timer-add" data-id="${t.id}" aria-label="Une minute de plus" title="+1 min">${icon("plus")}</button>
          <button class="icon-btn" data-action="timer-stop" data-id="${t.id}" aria-label="Arrêter le minuteur">${icon("close")}</button>
        </span>`)
      .join("");
  }

  _renderTimers() {
    const el = this.shadowRoot.getElementById("cook-timers");
    if (el) {
      el.innerHTML = this._tplTimers();
      el.style.display = (this._timers || []).length ? "" : "none";
    }
  }

  /* ---------------- écran allumé en mode cuisine */

  _onVisibility() {
    if (document.visibilityState !== "visible") return;
    if (this.s.stack.some((x) => x.type === "cook")) {
      this._requestWakeLock();
      this._tickTimers();
    }
    if (this.s.stack.some((x) => x.type === "store-mode")) this._requestWakeLock();
    if (this._loadOps().length) this._flushOps();
  }

  /* ---------------- mode cuisine mains libres : lecture à voix haute et commandes vocales */

  get _voice() {
    if (!this._voiceState) {
      let speak = false;
      try {
        speak = localStorage.getItem("frigo-malin-cook-speak") === "1";
      } catch (_) {
        /* stockage indisponible */
      }
      this._voiceState = { speak, listen: false };
    }
    return this._voiceState;
  }

  /* Ce qu'on lit pour l'étape affichée. */
  _cookText(top = this.top) {
    const r = this._overlayRecipe();
    if (!r || !top || top.type !== "cook") return "";
    const total = r.steps.length;
    const base = r.servings || top.servings || 4;
    const factor = (top.servings || base) / base;
    const spoken = (text) =>
      String(text)
        .replace(/\bc\. à soupe\b/g, "cuillère à soupe")
        .replace(/\bc\. à café\b/g, "cuillère à café")
        .replace(/(\d)\s*g\b/g, "$1 grammes")
        .replace(/(\d)\s*kg\b/g, "$1 kilos")
        .replace(/(\d)\s*cl\b/g, "$1 centilitres")
        .replace(/(\d)\s*ml\b/g, "$1 millilitres")
        .replace(/(\d)\s*min\b/g, "$1 minutes");
    if (top.step < 0) {
      const ings = r.ingredients.map((ing) => {
        const f = fmtIngredient(ing, factor);
        return `${f.amount} ${f.name}`.trim();
      });
      return spoken(`Mise en place pour ${r.title}. Il vous faut : ${ings.join(", ")}.`);
    }
    if (top.step >= total) return "C'est prêt ! Bon appétit.";
    return spoken(`Étape ${top.step + 1}${top.step + 1 === total ? ", la dernière" : ""}. ${r.steps[top.step]}`);
  }

  _speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const say = new SpeechSynthesisUtterance(text);
    say.lang = "fr-FR";
    const voice = synth.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("fr"));
    if (voice) say.voice = voice;
    // Pendant la lecture, le micro ignore ce qu'il entend (sinon « étape suivante » relancerait la suivante).
    this._speakingUntil = Date.now() + 120000;
    say.onend = say.onerror = () => {
      this._speakingUntil = Date.now() + 800;
    };
    synth.speak(say);
  }

  _afterCookStep() {
    if (this._voice.speak && this.top && this.top.type === "cook") this._speak(this._cookText());
  }

  _startListening() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      this._toast("La commande vocale n'est pas disponible ici. Elle marche dans Safari ou Chrome (ouvrez Home Assistant dans le navigateur).", true);
      return false;
    }
    const rec = new Recognition();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) this._voiceCommand(ev.results[i][0].transcript);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        this._stopListening();
        this._toast("Micro refusé : autorisez-le pour piloter la recette à la voix.", true);
        this._renderOverlay();
      }
    };
    // Le navigateur coupe l'écoute de temps en temps : on la relance tant que le mode cuisine est ouvert.
    rec.onend = () => {
      if (this._voice.listen && this._rec === rec && this.s.stack.some((x) => x.type === "cook")) {
        try {
          rec.start();
        } catch (_) {
          /* déjà relancée */
        }
      }
    };
    try {
      rec.start();
    } catch (_) {
      return false;
    }
    this._rec = rec;
    return true;
  }

  _stopListening() {
    this._voice.listen = false;
    const rec = this._rec;
    this._rec = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.stop();
      } catch (_) {
        /* déjà arrêtée */
      }
    }
  }

  _voiceCommand(raw) {
    if (Date.now() < (this._speakingUntil || 0)) return;
    const top = this.top;
    if (!top || top.type !== "cook") return;
    const t = ` ${foldText(raw)} `;
    const r = this._overlayRecipe();
    if (/ (suivant|suivante|ensuite|apres|continue|continuer|c est bon|next) /.test(t)) this._dispatch("cook-next", { dataset: {} });
    else if (/ (precedent|precedente|retour|recule|reviens) /.test(t)) this._dispatch("cook-prev", { dataset: {} });
    else if (/ (repete|repeter|encore|redis|relis|quoi) /.test(t)) this._speak(this._cookText());
    else if (/ (minuteur|chrono|chronometre|timer) /.test(t)) {
      const dur = r && top.step >= 0 && r.steps[top.step] ? stepDuration(r.steps[top.step]) : null;
      if (dur) {
        this._startTimer(dur.seconds, `Étape ${top.step + 1} · ${dur.label}`);
        this._speak(`Minuteur de ${dur.label} lancé.`);
      } else this._speak("Pas de minuteur pour cette étape.");
    } else if (/ (ingredient|ingredients) /.test(t)) this._speak(this._cookText({ ...top, step: -1 }));
    else if (/ (stop|silence|arrete|tais toi) /.test(t) && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

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

  /* Mesure la place réellement disponible : Home Assistant place déjà le panneau sous la barre d'état. */
  _fitHeight() {
    const top = Math.max(0, Math.round(this.getBoundingClientRect().top));
    if (top !== this._fmTop) {
      this._fmTop = top;
      this.style.setProperty("--fm-top", `${top}px`);
    }
  }

  _render() {
    const root = this.shadowRoot;
    if (!this._onResize) {
      this._onResize = () => this._fitHeight();
      window.addEventListener("resize", this._onResize);
      window.addEventListener("orientationchange", this._onResize);
    }
    requestAnimationFrame(() => this._fitHeight());
    if (!root.querySelector(".app")) {
      root.innerHTML = `<style>${STYLES}</style><div class="app"><div id="header"></div><main id="main"></main><nav class="tabs" id="nav"></nav><div id="plus"></div><input class="hidden-input" id="plus-cam" type="file" accept="image/*" capture="environment" data-change="photo"><div id="overlay"></div><div id="lightbox"></div><div id="toast"></div><div id="dialog"></div></div>`;
    }
    const main = root.getElementById("main");
    const scroll = main.scrollTop;
    root.getElementById("header").innerHTML = this._tplHeader();
    main.innerHTML = `<div class="page ${this._tabAnim ? "tab-enter" : ""}">${this._tplTab()}</div>`;
    main.scrollTop = this._tabAnim ? 0 : scroll;
    this._tabAnim = false;
    root.getElementById("nav").innerHTML = this._tplNav();
    this._renderOverlay();
    this._renderToast();
    this._saveCache();
  }

  _renderOverlay() {
    const host = this.shadowRoot.getElementById("overlay");
    if (!host) return;
    if (this.top && this.top.type === "cook") this._saveCookSession();
    const top = this.top;
    const prevBody = host.querySelector(".body");
    const prevKey = host.dataset.key;
    const scroll = prevBody ? prevBody.scrollTop : 0;
    const key = top ? `${this.s.stack.length}:${top.type}` : "";
    // Même fenêtre redessinée : pas d'animation d'ouverture (sinon elle clignote et laisse voir l'onglet dessous).
    // L'animation ne joue qu'à l'ouverture d'une nouvelle fenêtre, pas au retour en arrière.
    const prevDepth = Number(host.dataset.depth || 0);
    host.classList.toggle("same", this.s.stack.length <= prevDepth);
    host.classList.toggle("stacked", this.s.stack.length > 1);
    host.dataset.depth = String(this.s.stack.length);
    host.innerHTML = top ? this._tplOverlay(top) : "";
    host.dataset.key = key;
    const body = host.querySelector(".body");
    if (body && key === prevKey) body.scrollTop = scroll;
    // Retour sur une fenêtre quittée plus tôt (ex. la recherche Jow) : même position qu'avant.
    else if (body && top && top.scroll != null) body.scrollTop = top.scroll;
    host.querySelectorAll("textarea.hero-title").forEach((t) => this._fitTitle(t));
  }

  /* Le titre sur la photo prend juste la hauteur de son texte (1, 2 ou 3 lignes). */
  _fitTitle(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  _renderToast() {
    const host = this.shadowRoot.getElementById("toast");
    if (!host) return;
    const t = this.s.toast;
    host.innerHTML = t
      ? `<div class="toast ${t.error ? "error" : ""} ${this.s.stack.length ? "high" : ""}" role="status">${icon(t.error ? "alert-circle-outline" : "check-circle-outline")}<span>${esc(t.message)}</span>${t.action ? `<button class="toast-act" data-action="toast-action">${esc(t.action.label)}</button>` : ""}</div>`
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
      <div class="title app-title" style="margin-left:10px">Frigo Malin<small>par Adri</small></div>
      ${this.s.config ? `<button class="icon-btn" data-action="settings-open" aria-label="Réglages du foyer" title="Réglages du foyer">${icon("cog-outline")}</button>` : ""}
    </div>`;
  }

  _tplNav() {
    const tabs = [
      ["home", "home-outline", "home", "Accueil"],
      ["recipes", "book-open-page-variant-outline", "book-open-page-variant", "Recettes"],
      ["plus"],
      ["week", "calendar-week-outline", "calendar-week", "Semaine"],
      ["shopping", "cart-outline", "cart", "Courses"],
    ];
    const pending = this.pendingItems.length;
    // Le frigo est une sous-page de l'accueil.
    const current = this.s.tab === "fridge" ? "home" : this.s.tab;
    return `<div class="inner">${tabs
      .map(([key, ic, icActive, label]) =>
        key === "plus"
          ? `<div class="plus-slot"><button class="plus ${this.s.plusOpen ? "open" : ""}" data-action="plus-toggle" aria-label="Ajouter" aria-expanded="${Boolean(this.s.plusOpen)}">${icon("plus")}</button></div>`
          : `<button class="${current === key ? "active" : ""}" data-action="tab" data-tab="${key}" aria-label="${label}"><span class="pill">${icon(current === key ? icActive : ic)}${key === "shopping" && pending ? `<span class="badge">${pending > 99 ? "99+" : pending}</span>` : ""}</span>${label}</button>`
      )
      .join("")}</div>`;
  }

  /* Menu du bouton + : deux raccourcis, au-dessus de la barre du bas. */
  _tplPlusMenu() {
    if (!this.s.plusOpen) return "";
    return `<div class="plus-backdrop" data-action="plus-toggle"></div>
      <div class="plus-menu" role="menu">
        <button class="plus-item" data-action="plus-photo" role="menuitem">${bubble("camera-outline", COLORS.teal)}<span><b>Photo du frigo</b><small>Je reconnais ce qu'il contient</small></span></button>
        <button class="plus-item" data-action="plus-quick" role="menuitem">${bubble("cart-plus", COLORS.green)}<span><b>Ajout rapide</b><small>Un article pour les courses</small></span></button>
      </div>`;
  }

  _setPlus(open) {
    this.s.plusOpen = open;
    const host = this.shadowRoot.getElementById("plus");
    if (host) host.innerHTML = this._tplPlusMenu();
    const nav = this.shadowRoot.getElementById("nav");
    if (nav) nav.innerHTML = this._tplNav();
  }

  _tplVersion() {
    return `<div class="version">${icon("tag-outline")} Frigo Malin par Adri · v${esc(FM_VERSION)}</div>`;
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
    if (this.s.tab === "home") return this._tplHome();
    if (this.s.tab === "recipes") return this._tplRecipes();
    if (this.s.tab === "week") return this._tplWeek();
    if (this.s.tab === "shopping") return this._tplShopping();
    return this._tplFridge();
  }

  /* ---------------- onglet Frigo */

  _tplHome() {
    const hour = new Date().getHours();
    const hello = hour < 5 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
    const user = this._hass && this._hass.user && this._hass.user.name;
    const first = user ? cap(String(user).trim().split(/\s+/)[0]) : "";
    const upcoming = this._upcomingMeals();
    const next = upcoming[0];
    const r = next && this._recipe(next.recipe_id);
    const later = upcoming.slice(1, 6);
    const free = this.s.home.loaded ? this._freeSlots() : [];
    const freeNames = free.map((x) => this._mealWhen(x).toLowerCase());
    const freeBlock = free.length
      ? `<div class="home-free">
          <div>📅 <b>Pas encore de repas</b> : ${esc(freeNames.slice(0, 4).join(", "))}${free.length > 4 ? ` et ${free.length - 4} autre${free.length - 4 > 1 ? "s" : ""}` : ""}.</div>
          <button class="btn tonal block" data-action="weekplan-open" data-rolling="1">${icon("creation")} Planifier ${free.length > 1 ? `ces ${free.length} repas` : "ce repas"} avec l'IA</button>
        </div>`
      : "";

    const tiles = [
      ["camera-outline", COLORS.teal, "Photo du frigo", `data-action="pick-photo" data-input="home-cam"`],
      ["creation", COLORS.indigo, "Planifier la semaine", `data-action="weekplan-open" data-rolling="1"`],
      ["cart-plus", COLORS.green, "Ajout rapide", this.listEntity ? `data-action="home-quick" id="home-quick-tile"` : `data-action="home-go" data-tab="shopping"`],
      ["download", COLORS.orange, "Recettes Jow", `data-action="home-jow"`],
    ];

    const meal = next
      ? `<div class="home-next">
          ${r ? this._tplThumb(r) : `<div class="thumb">🍽️</div>`}
          <div class="grow">
            <div class="when">${esc(this._mealWhen(next))}<span class="date"> · ${esc(fmtDay(next.date, { weekday: "short", day: "numeric", month: "short" }))}</span></div>
            <div class="what">${esc(r ? r.title : "Recette supprimée")}</div>
            <div class="muted small">${r && (r.prep_time || r.cook_time) ? `⏱️ ${(r.prep_time || 0) + (r.cook_time || 0)} min · ` : ""}👥 ${next.servings} pers.</div>
            ${nutBadge(r) ? `<div class="muted small">${esc(nutBadge(r))} / pers.</div>` : ""}
          </div>
        </div>
        ${r ? `<div class="row" style="gap:8px;margin-top:12px">
          <button class="btn grow" data-action="home-cook" data-id="${esc(next.id)}">${icon("chef-hat")} Cuisiner</button>
          <button class="btn tonal grow" data-action="meal-open" data-id="${esc(next.id)}">${icon("book-open-variant")} La recette</button>
        </div>` : ""}
        ${later.length
          ? `<div class="home-later">${later
              .map((e) => {
                const lr = this._recipe(e.recipe_id);
                return `<button class="home-line" data-action="meal-open" data-id="${esc(e.id)}"><span class="d">${esc(this._mealWhen(e))}</span><span class="t">${lr ? emojiFor(lr.title) + " " + esc(lr.title) : "Recette supprimée"}</span>${icon("chevron-right")}</button>`;
              })
              .join("")}</div>`
          : ""}
        ${freeBlock}`
      : `<p class="muted" style="margin:4px 0 12px">Rien de prévu pour les prochains jours.</p>
        <div class="row" style="gap:8px">
          <button class="btn grow" data-action="weekplan-open" data-rolling="1">${icon("creation")} Planifier avec l'IA</button>
          <button class="btn tonal grow" data-action="home-go" data-tab="week">${icon("plus")} Choisir</button>
        </div>`;

    const mem = this.s.fridgeMemory;
    const urgent = mem.items.filter((i) => i.expires && daysLeft(i.expires) <= 2);
    // Carte compacte (moitié de largeur, à côté des courses).
    const fridge = mem.items.length
      ? `<div class="duo-big">${mem.items.length}<small>aliment${mem.items.length > 1 ? "s" : ""}</small></div>
        ${urgent.length
          ? `<div class="duo-alert">⚠️ À consommer vite :<br><b>${urgent.slice(0, 3).map((i) => esc(i.name)).join(", ")}</b>${urgent.length > 3 ? ` +${urgent.length - 3}` : ""}</div>`
          : `<div class="duo-ok">✅ Rien ne presse</div>`}
        <button class="btn tonal block duo-btn" data-action="memory-use">💡 Des idées</button>`
      : `<div class="duo-big">🧊</div><p class="muted small duo-text">Prenez-le en photo : je vous dis quoi cuisiner.</p>
        <button class="btn tonal block duo-btn" data-action="pick-photo" data-input="home-cam">${icon("camera")} Photo</button>`;


    return `
      <input class="hidden-input" id="home-cam" type="file" accept="image/*" capture="environment" data-change="photo">
      <div class="home-hello"><h2>${hello}${first ? ` ${esc(first)}` : ""} 👋</h2><div class="muted">${esc(cap(fmtDay(todayIso())))}</div></div>
      <div class="home-tiles">${tiles
        .map(([ic, color, label, attrs]) => `<button class="home-tile ${attrs.includes("home-quick") && this.s.home.quick ? "on" : ""}" ${attrs}>${bubble(ic, color)}<span>${label}</span></button>`)
        .join("")}</div>
      ${this.listEntity ? this._tplHomeQuick() : ""}
      <div class="card">
        <div class="home-head">${bubble("silverware-fork-knife", COLORS.orange)}<h3>Au menu</h3>
          <button class="btn text" data-action="home-go" data-tab="week">Semaine ${icon("chevron-right")}</button></div>
        ${this.s.home.loaded ? meal : skel("block")}
      </div>
      <div class="home-duo ${this.listEntity ? "" : "single"}">
        <div class="card duo ${urgent.length ? "memory" : ""}">
          <button class="duo-head" data-action="home-go" data-tab="fridge">${bubble("fridge-outline", COLORS.teal)}<h3>Mon frigo</h3>${icon("chevron-right")}</button>
          ${fridge}
        </div>
        ${this.listEntity ? `<div class="card duo" id="home-shopping">${this._tplHomeShopping()}</div>` : ""}
      </div>
      <div class="card stats-card" id="home-stats">${this._tplStats()}</div>
      ${this._tplVersion()}`;
  }

  /* ---------------- statistiques des repas (accueil) */

  async _loadStats() {
    const st = this.s.stats;
    const period = st.period;
    st.loading = true;
    if (!st.data || st.data.period !== period) this._renderStats();
    try {
      const data = await this._ws("stats/meals", { period });
      if (st.period !== period) return;
      st.data = data;
    } catch (_) {
      if (st.period === period) st.data = { period, error: true, bars: [] };
    }
    st.loading = false;
    this._renderStats();
  }

  _renderStats() {
    const el = this.shadowRoot && this.shadowRoot.getElementById("home-stats");
    if (el) el.innerHTML = this._tplStats();
  }

  _tplStats() {
    const st = this.s.stats;
    const periods = [["week", "Semaine"], ["month", "30 jours"], ["year", "12 mois"]];
    const head = `<div class="home-head">${bubble("chart-bar", COLORS.indigo)}<h3>Statistiques</h3></div>
      <div class="chips stats-periods">${periods.map(([k, l]) => `<button class="chip ${st.period === k ? "on" : ""}" data-action="stats-period" data-value="${k}">${l}</button>`).join("")}</div>`;
    const data = st.data && st.data.period === st.period ? st.data : null;
    if (!data) return head + skel("block");
    if (data.error) return head + `<p class="muted">Statistiques indisponibles pour le moment.</p>`;
    const anything = data.bars.some((b) => b.state !== "empty");
    if (!anything)
      return head + `<div class="stats-empty"><div class="emoji">📊</div><p class="muted">Planifiez vos repas dans la semaine : les calories et macronutriments se calculent au fil des jours.</p>
        <button class="btn tonal" data-action="home-go" data-tab="week">${icon("calendar-week")} Voir la semaine</button></div>`;
    return head + this._tplStatsChart(data) + this._tplStatsAverages(data) + this._tplStatsTops(data) +
      (this.listEntity ? `<button class="btn text block stats-hist" data-action="purchases-open">${icon("history")} Historique des courses</button>` : "");
  }

  _tplStatsChart(data) {
    const st = this.s.stats;
    const bars = data.bars;
    const kcalOf = (b) => b.protein * 4 + b.carbs * 4 + b.fat * 9;
    const max = Math.max(1, ...bars.map((b) => Math.max(b.kcal, kcalOf(b))));
    const scale = Math.ceil(max / 500) * 500;
    const avg = data.average.kcal;
    let sel = st.sel;
    if (sel == null || !bars[sel]) {
      sel = bars.findIndex((b) => b.today);
      if (sel < 0 || bars[sel].state === "empty") {
        const filled = bars.map((b, i) => (b.state === "eaten" ? i : -1)).filter((i) => i >= 0);
        sel = filled.length ? filled[filled.length - 1] : Math.max(0, sel);
      }
    }
    const per = data.period === "year" ? "/ jour en moyenne" : "";
    const showLabel = (i) => data.period !== "month" || i % 5 === 0 || bars[i].today;
    const cols = bars
      .map((b, i) => {
        const total = kcalOf(b) || 1;
        const h = b.state === "empty" ? 0 : Math.max(3, (b.kcal / scale) * 100);
        const seg = ["fat", "carbs", "protein"]
          .map((k) => `<i style="flex-grow:${Math.max(0.001, (b[k] * (k === "fat" ? 9 : 4)) / total)};background:${NUT_COLORS[k]}"></i>`)
          .join("");
        const tip = b.state === "empty" ? `${b.label} : rien de prévu` : `${b.label} : ${b.kcal} kcal ${per}${b.state === "planned" ? " (prévu)" : ""}`;
        return `<button class="sc-col ${i === sel ? "sel" : ""} ${b.today ? "today" : ""}" data-action="stats-day" data-i="${i}" title="${esc(tip)}" aria-label="${esc(tip)}">
          <span class="sc-bar ${b.state}" style="height:${h}%">${b.state === "empty" ? "" : seg}</span>
          <span class="sc-x">${showLabel(i) ? esc(b.short) : ""}</span></button>`;
      })
      .join("");
    const b = bars[sel];
    const detail = b
      ? b.state === "empty"
        ? `<b>${esc(cap(b.label))}</b><span class="muted">Aucun repas ${b.date > todayIso() ? "prévu" : "au menu"}</span>`
        : `<b>${esc(cap(b.label))}</b><span><b class="big">${b.kcal.toLocaleString("fr-FR")}</b> kcal${per ? ` <span class="muted">${per}</span>` : ""}${b.state === "planned" ? ` <span class="sc-tag">prévu</span>` : ""}</span>
          <span class="sc-macros">${[["protein", "P"], ["carbs", "G"], ["fat", "L"]].map(([k, l]) => `<span><span class="dot" style="background:${NUT_COLORS[k]}"></span>${l} ${b[k]} g</span>`).join("")}<span class="muted">· ${b.meals} repas</span></span>`
      : "";
    return `<div class="sc">
        <div class="sc-y"><span>${scale}</span><span>${scale / 2}</span><span>0</span></div>
        <div class="sc-plot ${data.period}">
          <div class="sc-grid"><i></i><i></i><i></i></div>
          ${avg ? `<div class="sc-avg" style="bottom:${(avg / scale) * 100}%"><span>moy. ${avg.toLocaleString("fr-FR")}</span></div>` : ""}
          ${cols}
        </div>
      </div>
      <div class="sc-legend">${[["protein", "Protéines"], ["carbs", "Glucides"], ["fat", "Lipides"]].map(([k, l]) => `<span><span class="dot" style="background:${NUT_COLORS[k]}"></span>${l}</span>`).join("")}<span><span class="dot planned"></span>Prévu</span><span class="muted">kcal / pers.</span></div>
      <div class="sc-detail">${detail}</div>`;
  }

  _tplStatsAverages(data) {
    const a = data.average;
    if (!data.days_with_meals) return "";
    const kcal = a.protein * 4 + a.carbs * 4 + a.fat * 9 || 1;
    const tile = (k, label, unit = "g") =>
      `<div class="st-tile"><span class="lbl">${k ? `<span class="dot" style="background:${NUT_COLORS[k]}"></span>` : ""}${label}</span><b>${k ? a[k] : a.kcal.toLocaleString("fr-FR")}<small> ${unit}</small></b>${k && k !== "fiber" ? `<small class="muted">${Math.round((a[k] * (k === "fat" ? 9 : 4) * 100) / kcal)} %</small>` : k ? `<small class="muted">&nbsp;</small>` : `<small class="muted">sur ${data.days_with_meals} j</small>`}</div>`;
    return `<div class="st-title">Moyenne par jour <span class="muted small">· par personne</span></div>
      <div class="st-tiles">${tile("", "Énergie", "kcal")}${tile("protein", "Protéines")}${tile("carbs", "Glucides")}${tile("fat", "Lipides")}${tile("fiber", "Fibres")}</div>`;
  }

  _tplStatsTops(data) {
    if (!data.top_recipes.length) return "";
    const max = Math.max(...data.top_foods.map((f) => f.count), 1);
    const when = { week: "cette semaine", month: "ces 30 derniers jours", year: "ces 12 derniers mois" }[data.period];
    return `<div class="st-title">Les plus mangés <span class="muted small">${when} · ${data.meals} repas</span></div>
      <div class="st-cols">
        <div class="st-top"><div class="st-sub">🍽️ Plats</div>${data.top_recipes
          .map((t, i) => {
            const r = this._recipe(t.id) || t;
            return `<button class="st-meal" data-action="open-recipe" data-id="${esc(t.id)}"><span class="rank">${i + 1}</span>${this._tplThumb(r)}<span class="grow">${esc(t.title)}</span><span class="cnt">×${t.count}</span></button>`;
          })
          .join("")}</div>
        <div class="st-foods"><div class="st-sub">🥕 Ingrédients</div>${data.top_foods
          .map((f) => `<div class="st-food"><span class="nm">${ingEmoji(f.name)} ${esc(f.name)}</span><span class="track"><i style="width:${Math.round((f.count / max) * 100)}%"></i></span><span class="cnt">${f.count}</span></div>`)
          .join("")}</div>
      </div>`;
  }

  /* ---------------- historique des courses */

  async _loadPurchases() {
    const top = this.top;
    if (!top || top.type !== "purchases") return;
    const days = top.days;
    try {
      const data = await this._ws("shopping/history", days ? { days } : {});
      if (top.days !== days) return;
      top.data = data;
      top.error = null;
    } catch (err) {
      top.error = this._err(err);
    }
    top.loading = false;
    if (this.top === top) this._renderOverlay();
  }

  _tplPurchases(top) {
    const periods = [[30, "30 jours"], [90, "3 mois"], [365, "1 an"], [0, "Tout"]];
    let body = `<div class="chips" style="margin-bottom:14px">${periods
      .map(([v, l]) => `<button class="chip ${(top.days || 0) === v ? "on" : ""}" data-action="purchases-days" data-value="${v || ""}">${l}</button>`)
      .join("")}</div>`;
    const data = top.data;
    if (top.error) return this._tplSheet("Historique des courses", body + `<div class="alert">${esc(top.error)}</div>`);
    if (!data) return this._tplSheet("Historique des courses", body + skel("lines", 6));
    if (!data.stats.items && !data.habits.length) {
      body += `<div class="empty"><div class="emoji">🧾</div><p>Pas encore d'achat sur cette période.</p>
        <p class="muted small">Chaque article coché dans la liste de courses (ici, dans Home Assistant ou au magasin) est noté avec sa date. Frigo Malin apprend ainsi vos habitudes pour mieux vous suggérer l'ajout rapide.</p></div>`;
      return this._tplSheet("Historique des courses", body);
    }
    const st = data.stats;
    body += `<div class="st-tiles ph-tiles">
      <div class="st-tile"><span class="lbl">🛒 Articles</span><b>${st.items}</b></div>
      <div class="st-tile"><span class="lbl">📅 Jours de courses</span><b>${st.trips}</b></div>
      <div class="st-tile"><span class="lbl">📈 Par semaine</span><b>${String(st.per_week).replace(".", ",")}</b></div>
      <div class="st-tile"><span class="lbl">🧺 Différents</span><b>${st.distinct}</b></div>
    </div>`;
    const onList = new Set(this.pendingItems.map((i) => foldText(i.summary.replace(/\(.*?\)/g, "")).trim()));
    if (data.habits.length) {
      body += `<div class="card ph-card"><div class="st-title">🔁 Vos habitudes <span class="muted small">pour l'ajout rapide</span></div>
        ${data.habits
          .slice(0, 12)
          .map((h) => {
            const due = h.due >= 1;
            const soon = !due && h.due >= 0.75;
            const there = onList.has(foldText(h.name).trim());
            return `<div class="ph-habit ${due ? "due" : ""}">
              <span class="ing-emoji">${ingEmoji(h.name)}</span>
              <div class="grow"><div class="nm">${esc(h.name)} ${due ? `<span class="badge-due">À racheter</span>` : soon ? `<span class="badge-soon">Bientôt</span>` : ""}</div>
                <div class="muted small">Tous les ~${h.every} j · ${h.since === 0 ? "acheté aujourd'hui" : h.since === 1 ? "acheté hier" : `il y a ${h.since} j`} · ${h.count} fois</div>
                <span class="ph-gauge"><i style="width:${Math.min(100, Math.round(h.due * 100))}%"></i></span></div>
              ${there ? `<span class="muted small ph-there">${icon("check")} Dans la liste</span>` : `<button class="icon-btn ph-add" data-action="quick-chip" data-name="${esc(h.name)}" aria-label="Ajouter ${esc(h.name)} à la liste">${icon("cart-plus")}</button>`}
            </div>`;
          })
          .join("")}</div>`;
    }
    if (data.top.length) {
      const max = data.top[0].count;
      body += `<div class="card ph-card"><div class="st-title">🏆 Les plus achetés</div>
        <div class="st-foods">${data.top
          .map((f) => `<div class="st-food"><span class="nm">${ingEmoji(f.name)} ${esc(f.name)}</span><span class="track"><i style="width:${Math.round((f.count / max) * 100)}%"></i></span><span class="cnt">${f.count}</span></div>`)
          .join("")}</div></div>`;
    }
    if (data.days.length) {
      body += `<div class="st-title" style="margin-top:6px">🗓️ Historique</div>
        ${data.days
          .map(
            (d) => `<div class="ph-day"><div class="ph-date">${esc(cap(fmtDay(d.date, { weekday: "long", day: "numeric", month: "long" })))}${d.date.slice(0, 4) !== todayIso().slice(0, 4) ? ` ${d.date.slice(0, 4)}` : ""}<span class="muted small"> · ${d.items.length} article${d.items.length > 1 ? "s" : ""}</span></div>
            <div class="ph-items">${d.items
              .map((i) => `<span class="ph-item"><span>${ingEmoji(i.name)} ${esc(i.name)}</span><small>${new Date(i.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small><button class="ph-del" data-action="purchase-delete" data-name="${esc(i.name)}" data-at="${esc(i.at)}" aria-label="Retirer ${esc(i.name)} de l'historique">${icon("close")}</button></span>`)
              .join("")}</div></div>`
          )
          .join("")}`;
    }
    return this._tplSheet("Historique des courses", body);
  }

  /* Ajout rapide qui se déplie sous les raccourcis, sans ouvrir de fenêtre. */
  _tplHomeQuick() {
    return `<div class="home-quick ${this.s.home.quick ? "open" : ""}" id="home-quick" aria-hidden="${!this.s.home.quick}">
      <div class="inner"><div class="card">
        <p class="muted small row quick-count" style="margin:0 0 10px">${this._tplQuickCount()}</p>
        ${this._tplQuickInput("quick-input-home")}
        <div class="chips scroll quick-sugg" style="margin-top:10px">${this._tplQuickChips()}</div>
      </div></div>
    </div>`;
  }

  _setHomeQuick(open) {
    this.s.home.quick = open;
    const root = this.shadowRoot;
    const box = root.getElementById("home-quick");
    if (box) {
      box.classList.toggle("open", open);
      box.setAttribute("aria-hidden", String(!open));
    }
    root.getElementById("home-quick-tile")?.classList.toggle("on", open);
    const input = root.getElementById("quick-input-home");
    // Le focus doit être donné pendant l'appui pour que le clavier de l'iPhone s'ouvre.
    if (open && input) input.focus({ preventScroll: true });
    if (!open && input && root.activeElement === input) input.blur();
  }

  _tplHomeShopping() {
    const pending = this.pendingItems;
    const stores = this.settings.stores || [];
    // Carte compacte (moitié de largeur, à côté du frigo).
    return `<button class="duo-head" data-action="home-go" data-tab="shopping">${bubble("cart-outline", COLORS.green)}<h3>Courses</h3>${icon("chevron-right")}</button>
        ${pending.length
          ? `<div class="duo-big">${pending.length}<small>article${pending.length > 1 ? "s" : ""}</small></div>
            <ul class="duo-list">${pending
              .slice(0, 3)
              .map((i) => `<li>${ingEmoji(i.summary)} ${esc(i.summary)}</li>`)
              .join("")}${pending.length > 3 ? `<li class="muted">+ ${pending.length - 3} autre${pending.length - 3 > 1 ? "s" : ""}</li>` : ""}</ul>`
          : `<div class="duo-big">✅</div><div class="duo-ok">Tout est pris</div>`}
        ${stores.length && pending.length
          ? `<button class="btn tonal block duo-btn" data-action="store-mode" data-store="${esc(stores[0].id)}">🏪 Au magasin</button>`
          : `<button class="btn tonal block duo-btn" data-action="home-go" data-tab="shopping">${icon("format-list-checks")} La liste</button>`}`;
  }

  _tplFridge() {
    const f = this.s.fridge;
    const inputs = `
      <input class="hidden-input" id="cam" type="file" accept="image/*" capture="environment" data-change="photo">
      <input class="hidden-input" id="gallery" type="file" accept="image/*" data-change="photo">`;

    if (f.step === "start") {
      return `${inputs}
        ${this._tplFridgeMemory()}
        <div class="card hero ${this.s.fridgeMemory.items.length ? "compact" : ""}">
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
          <img class="photo" src="${esc(f.photo)}" alt="" data-action="lightbox-open">
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
      ${f.photo ? `<div class="photo-wrap"><img class="photo" src="${esc(f.photo)}" alt="Photo du frigo" data-action="lightbox-open"><span class="photo-zoom">${icon("arrow-expand")}</span></div>` : ""}
      <div class="card">
        <div class="row" style="margin-bottom:4px">
          ${bubble("basket-outline", COLORS.green)}
          <h3 class="grow" style="margin:0 0 0 6px">Ingrédients (${f.ingredients.length})</h3>
          <button class="icon-btn" data-action="pick-photo" data-input="cam" aria-label="Ajouter une photo" title="Ajouter une photo">${icon("camera-plus-outline")}</button>
        </div>
        <p class="muted small" style="margin:0 0 8px">Corrigez, supprimez ou ajoutez ce qui manque.${f.fromMemory ? " 🧊 Les changements sont gardés en mémoire." : ""}</p>
        ${(() => {
          const urgent = f.ingredients.filter((i) => i.expires && daysLeft(i.expires) <= 2);
          return urgent.length ? `<div class="urgent" style="margin-bottom:8px">⚠️ ${urgent.length} aliment${urgent.length > 1 ? "s" : ""} à consommer vite : les recettes les utiliseront en priorité.</div>` : "";
        })()}
        ${(() => {
          const row = (ing, i) => f.fromMemory
            ? `<div class="ing-row mem">
                <span class="ing-emoji">${ingEmoji(ing.name)}</span>
                <div class="ing-main">
                  <input value="${esc(ing.name)}" data-model="fridge.ingredients.${i}.name" aria-label="Ingrédient">
                  ${ing.amount ? `<input class="amount" value="${esc(ing.amount)}" data-model="fridge.ingredients.${i}.amount" aria-label="Quantité">` : ""}
                </div>
                ${this._tplKeepSelect(ing, i)}
                <button class="icon-btn" data-action="ing-remove" data-i="${i}" aria-label="Retirer">${icon("close")}</button>
              </div>`
            : `<div class="ing-row">
                <span class="ing-emoji">${ingEmoji(ing.name)}</span>
                <input value="${esc(ing.name)}" data-model="fridge.ingredients.${i}.name" aria-label="Ingrédient">
                ${ing.amount ? `<input class="amount" value="${esc(ing.amount)}" data-model="fridge.ingredients.${i}.amount" aria-label="Quantité">` : ""}
                <button class="icon-btn" data-action="ing-remove" data-i="${i}" aria-label="Retirer">${icon("close")}</button>
              </div>`;
          // Rangés comme dans le frigo : étagères du haut vers le bas, bac, porte, puis congélateur et placard.
          const { body, door, extra } = fridgeSections(f.ingredients.map((x, i) => ({ ...x, _i: i })));
          const groups = [
            ...body.map((g) => ({ ...g, label: g.key.startsWith("shelf") ? `🧊 ${g.label}` : g.label })),
            ...(door.length ? [{ key: "porte", label: "🚪 Porte", items: door }] : []),
            ...extra,
          ];
          return groups
            .map((g) => `<div class="ing-group"><div class="ing-group-head">${esc(g.label)} <span>${g.items.length}</span></div>${g.items.map((x) => row(x, x._i)).join("")}</div>`)
            .join("");
        })()}
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
      .map((name) => {
        const due = this.s.dueNames.has(foldText(name).trim());
        return `<button class="chip add ${due ? "due" : ""}" data-action="quick-chip" data-name="${esc(name)}" ${due ? `title="Vous en rachetez souvent à ce moment-ci"` : ""}>${ingEmoji(name) === "🥄" ? icon("plus") : ingEmoji(name)} ${esc(name)}${due ? ` <span class="due-mark">🔁</span>` : ""}</button>`;
      })
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
      return `<div class="alert">Aucune liste de courses disponible. Choisissez-en une dans ⚙️ Réglages du foyer → Portions et liste de courses.</div>`;
    }
    if (l.error) return `<div class="alert">${esc(l.error)}</div>`;
    if (!l.loaded) return skel("lines", 6);
    const pending = this.pendingItems;
    const done = l.items.filter((i) => i.status === "completed");
    const row = (item) => `<div class="li-wrap" data-lswipe="${esc(item.uid)}">${this._tplSwipeBg(item)}<div class="li ${item.status === "completed" ? "done" : ""} ${item.offline ? "offline" : ""}">
        <button class="tick" data-action="list-toggle" data-uid="${esc(item.uid)}" aria-label="${item.status === "completed" ? "Remettre dans la liste" : "Dans le panier"}">${icon("check")}</button>
        <span class="ing-emoji">${ingEmoji(item.summary)}</span>
        ${l.editing === item.uid
          ? `<input class="input li-edit grow" value="${esc(item.summary)}" data-edit="list" data-uid="${esc(item.uid)}" data-enter="list-rename" enterkeyhint="done" aria-label="Modifier l'article">`
          : `<div class="txt" data-action="list-edit" data-uid="${esc(item.uid)}" title="Toucher pour modifier"><div>${esc(item.summary)}</div>${item.description ? `<div class="d">${esc(item.description)}</div>` : ""}</div>`}
        <button class="icon-btn" data-action="list-remove" data-uid="${esc(item.uid)}" aria-label="Supprimer">${icon("close")}</button>
      </div></div>`;

    let html = `${this._tplOfflineBanner()}<div class="list-head">${bubble("format-list-checks", COLORS.green)}<h3>À acheter</h3><span class="muted small">${pending.length}</span>
        <button class="icon-btn hist-open" data-action="purchases-open" aria-label="Historique des courses" title="Historique des courses">${icon("history")}</button>
        ${pending.length ? `<button class="btn tonal sm-open" data-action="store-mode">🏪 Mode magasin</button>` : ""}</div>`;
    if (!pending.length) {
      html += `<div class="empty" style="padding:20px 16px"><div class="emoji">🛒</div><p>La liste est vide. Ajoutez un article ci-dessus ou les ingrédients de votre menu.</p></div>`;
    } else {
      const { groups, stores, store, order } = this._aisleGroups(pending);
      html += `<div class="store-pick">
        <span class="lbl">${icon("store-outline")} Rayons :</span>
        <button class="chip ${store ? "" : "on"}" data-action="store-pick" data-id="standard">Standard</button>
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

  /* Articles rangés par rayon, dans l'ordre du magasin choisi (par défaut le premier créé). */
  _aisleGroups(items) {
    const l = this.s.list;
    const groups = {};
    for (const item of items) (groups[aisleOf(item.summary)] = groups[aisleOf(item.summary)] || []).push(item);
    const stores = this.settings.stores || [];
    const store = l.storeId === "standard" ? null : stores.find((x) => x.id === l.storeId) || stores[0] || null;
    const byKey = Object.fromEntries(AISLES.map((a) => [a.key, a]));
    const order = store ? store.aisles.map((k) => byKey[k]).filter(Boolean) : AISLES;
    return { groups, stores, store, order };
  }

  _tplSwipeBg(item) {
    return `<div class="li-bg"><span class="ok">${icon(item.status === "completed" ? "undo" : "cart-check")} ${item.status === "completed" ? "Remettre" : "Dans le panier"}</span><span class="del">Supprimer ${icon("delete-outline")}</span></div>`;
  }

  /* ---------------- mode magasin : plein écran, gros boutons, écran allumé */

  _tplStoreProgress() {
    const total = this.s.list.items.length;
    const done = this.s.list.items.filter((i) => i.status === "completed").length;
    const pct = total ? Math.round((done * 100) / total) : 0;
    return `<div class="bar"><i style="width:${pct}%"></i></div><span>${done} / ${total} dans le panier</span>`;
  }

  _tplStoreList() {
    const l = this.s.list;
    const pending = this.pendingItems;
    const done = l.items.filter((i) => i.status === "completed");
    const row = (item) => `<div class="li-wrap" data-lswipe="${esc(item.uid)}">${this._tplSwipeBg(item)}
      <button class="li sm-row ${item.status === "completed" ? "done" : ""}" data-action="list-toggle" data-uid="${esc(item.uid)}">
        <span class="tick">${icon("check")}</span><span class="ing-emoji">${ingEmoji(item.summary)}</span><span class="txt">${esc(item.summary)}${item.description ? `<small>${esc(item.description)}</small>` : ""}</span>
      </button></div>`;
    let html = this._tplOfflineBanner();
    if (!pending.length) {
      html += `<div class="card sm-done"><div class="emoji">🎉</div><h3>Tout est dans le panier !</h3>
        ${done.length ? `<button class="btn big block" data-action="store-finish">🧹 Vider le panier et terminer</button>` : `<button class="btn big block" data-action="close">Terminer</button>`}</div>`;
    } else {
      const { groups, order } = this._aisleGroups(pending);
      for (const aisle of order) {
        const items = groups[aisle.key];
        if (!items) continue;
        html += `<div class="sm-aisle"><div class="sm-aisle-t">${aisle.emoji} ${aisle.label}<span>${items.length}</span></div>${items.map(row).join("")}</div>`;
      }
    }
    if (done.length) html += `<div class="sm-aisle sm-basket"><div class="sm-aisle-t">🛒 Dans le panier<span>${done.length}</span></div>${done.map(row).join("")}</div>`;
    return html;
  }

  _tplStoreMode() {
    const { stores, store } = this._aisleGroups([]);
    const body = `
      <div class="sm-progress" id="sm-progress">${this._tplStoreProgress()}</div>
      ${stores.length > 1 ? `<div class="chips scroll" style="margin-bottom:12px">${stores.map((x) => `<button class="chip ${store && store.id === x.id ? "on" : ""}" data-action="store-pick" data-id="${esc(x.id)}">🏪 ${esc(x.name)}</button>`).join("")}</div>` : ""}
      <p class="muted small" style="margin:0 0 10px">Touchez un article pour le mettre dans le panier · balayez à gauche pour le supprimer.</p>
      <div id="store-list">${this._tplStoreList()}</div>`;
    const footer = `<button class="btn tonal grow" data-action="quick-open">${icon("plus")} Un article</button>
      <button class="btn grow" data-action="close">${icon("check")} Terminer</button>`;
    return this._tplSheet(`🏪 ${store ? store.name : "Mode magasin"}`, body, footer);
  }

  _tplShopping() {
    return `
      <div class="quickbar">
        <div class="qb-field">
          ${icon("cart-plus")}
          <input class="quick-input" id="quick-input" placeholder="Ajouter un article…" value="${esc(this.s.list.quick)}" data-model="list.quick" data-enter="quick-add" enterkeyhint="send" autocomplete="off" aria-label="Ajouter un article">
          <button class="qb-add" data-action="quick-add" aria-label="Ajouter">${icon("plus")}</button>
        </div>
        <div class="chips scroll quick-sugg">${this._tplQuickChips()}</div>
      </div>
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

  /* Réglages : un menu de thèmes, chaque thème ouvre sa page. Tout est enregistré automatiquement. */
  _settingsThemes(d) {
    const portions = d.members.reduce((t, m) => t + ({ adult: 1, teen: 1, child: 0.5, toddler: 0.25 })[m.age], 0);
    const serv = d.servings || (d.members.length ? Math.max(1, Math.ceil(portions - 0.01)) : this.defaultServings);
    const allergies = new Set(d.members.flatMap((m) => m.allergies)).size;
    const slots = d.plan_slots || {};
    const perWeek = (slots.lunch_weekday ? 5 : 0) + (slots.dinner_weekday ? 5 : 0) + (slots.lunch_weekend ? 2 : 0) + (slots.dinner_weekend ? 2 : 0);
    const plain = (t) => String(t).replace(/^\S+\s/u, "");
    const listName = d.shopping_entity
      ? (this._hass.states[d.shopping_entity] && this._hass.states[d.shopping_entity].attributes.friendly_name) || d.shopping_entity
      : (this.s.config.shopping_list && this.s.config.shopping_list.name) || "Liste automatique";
    const u = (this.s.config && this.s.config.usage) || { eur: 0 };
    const days = Number(d.fridge_days ?? 5);
    const nFridge = this.s.fridgeMemory.items.length;
    return [
      ["household", "account-group-outline", COLORS.blue, "Foyer",
        `${d.members.length ? `${d.members.length} personne${d.members.length > 1 ? "s" : ""}` : "Personne pour l'instant"} · ${serv} portion${serv > 1 ? "s" : ""}${allergies ? ` · ⚠️ ${allergies} allergie${allergies > 1 ? "s" : ""}` : ""}`],
      ["meals", "calendar-clock-outline", COLORS.orange, "Repas et menus",
        `${perWeek} repas par semaine · ${d.time_weekday} min en semaine${d.budget_week ? ` · ${d.budget_week} €` : ""}`],
      ["cooking", "chef-hat", COLORS.red, "Cuisine et goûts",
        [d.equipment.slice(0, 2).map((k) => HH.equipment[k]).join(", "), d.goals.slice(0, 2).map((k) => plain(HH.goals[k])).join(", ")].filter(Boolean).join(" · ") || "Équipement, cuisines, objectifs"],
      ["shopping", "cart-outline", COLORS.green, "Courses et magasins",
        `${listName} · ${d.stores.length ? d.stores.map((x) => x.name).join(", ") : "aucun magasin"}${d.stores.length && d.store_reminder ? " · rappel activé" : ""}`],
      ["fridge", "fridge-outline", COLORS.teal, "Frigo",
        `${days ? `Gardé ${days} jours` : "Jusqu'à la prochaine photo"}${nFridge ? ` · ${nFridge} aliment${nFridge > 1 ? "s" : ""}` : ""}`],
      ["ai", "robot-outline", COLORS.indigo, "Intelligence artificielle",
        `${d.ai_mode === "single" ? "Un seul modèle" : "Économique"} · ≈ ${fmtNumber(u.eur)} € ce mois`],
    ];
  }

  _tplSaveState() {
    const st = this._saveState;
    if (!st) return `<span class="save-state" id="save-state"></span>`;
    const label = { pending: "Enregistrement…", saving: "Enregistrement…", saved: "✓ Enregistré", error: "⚠️ Non enregistré" }[st];
    return `<span class="save-state ${st}" id="save-state">${label}</span>`;
  }

  _setSaveState(st) {
    this._saveState = st;
    clearTimeout(this._saveStateTimer);
    if (st === "saved") this._saveStateTimer = setTimeout(() => this._setSaveState(null), 2500);
    const el = this.shadowRoot.getElementById("save-state");
    if (el) el.outerHTML = this._tplSaveState();
  }

  _tplSettings(top) {
    const d = top.draft;
    const sections = this._settingsSections(top);
    const body = `
      <p class="muted set-page-intro">Ces informations guident toutes les propositions de l'IA. Les changements sont enregistrés automatiquement.</p>
      <div class="card set-list">${this._settingsThemes(d)
        .map(([key, ic, color, title, summary]) => `<div class="acc ${top.open === key ? "open" : ""}" data-acc="${key}">
          <button class="set-row" data-action="settings-acc" data-page="${key}" aria-expanded="${top.open === key}">
            ${bubble(ic, color)}
            <div class="grow"><div class="t">${title}</div><div class="m">${esc(summary)}</div></div>
            ${icon("chevron-down")}
          </button>
          <div class="acc-body"><div class="inner"><div class="acc-content">${sections[key][1]}</div></div></div>
        </div>`)
        .join("")}</div>
      <p class="muted small" style="text-align:center">La clé d'IA et le fournisseur se changent dans Paramètres → Appareils et services → Frigo Malin → Configurer.</p>
      ${this._tplVersion()}`;
    return this._tplSheet("Réglages", body, "", this._tplSaveState());
  }

  _settingsSections(top) {
    const d = top.draft;
    const portions = d.members.reduce((t, m) => t + ({ adult: 1, teen: 1, child: 0.5, toddler: 0.25 })[m.age], 0);
    const zones = Object.keys(this._hass.states).filter((id) => id.startsWith("zone."));
    const zoneName = (id) => (this._hass.states[id] ? this._hass.states[id].attributes.friendly_name || id : id);
    const pages = {
      household: ["Foyer", `
      <p class="muted set-page-intro">Qui mange à la maison : l'IA respecte les âges, régimes, allergies et goûts de chacun.</p>
      ${d.members
        .map((m, i) => `<button class="member" data-action="member-edit" data-i="${i}">
          <span class="av">${HH.ages[m.age][1]}</span>
          <div class="grow"><div>${esc(m.name)}</div><div class="m">${esc(this._memberSummary(m))}</div></div>
          ${icon("chevron-right")}
        </button>`)
        .join("")}
      <button class="btn tonal block" data-action="member-add">${icon("account-plus-outline")} Ajouter une personne</button>
      ${d.members.length ? `<p class="hh-hint">${icon("silverware-fork-knife")} Portions calculées : ${fmtNumber(portions)} → ${Math.max(1, Math.ceil(portions - 0.01))} par repas (un enfant compte pour ½).</p>` : ""}


      <div class="set-sec">${bubble("silverware-fork-knife", COLORS.green)}<h3>Portions</h3></div>
      <div class="field"><span>Nombre de personnes par défaut (recettes, menus, idées)</span>
        <div class="chips">
          <button class="chip ${!d.servings ? "on" : ""}" data-action="set-servings" data-value="">Auto${d.members.length ? ` (${Math.max(1, Math.ceil(portions - 0.01))})` : ""}</button>
          ${[1, 2, 3, 4, 5, 6, 8].map((n) => `<button class="chip ${d.servings === n ? "on" : ""}" data-action="set-servings" data-value="${n}">${n} pers.</button>`).join("")}
        </div>
      </div>
`],
      meals: ["Repas et menus", `
      <div class="field"><span>Repas à planifier par défaut</span>
        ${this._tplSwitch("top.draft.plan_slots.lunch_weekday", d.plan_slots.lunch_weekday, "☀️ Midi en semaine")}
        ${this._tplSwitch("top.draft.plan_slots.dinner_weekday", d.plan_slots.dinner_weekday, "🌙 Soir en semaine")}
        ${this._tplSwitch("top.draft.plan_slots.lunch_weekend", d.plan_slots.lunch_weekend, "☀️ Midi le week-end")}
        ${this._tplSwitch("top.draft.plan_slots.dinner_weekend", d.plan_slots.dinner_weekend, "🌙 Soir le week-end")}
      </div>
      <div class="set-sec">${bubble("clock-outline", COLORS.indigo)}<h3>Heures des repas</h3></div>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>☀️ Midi</span><input class="input" type="time" value="${esc(d.lunch_time || "12:00")}" data-model="top.draft.lunch_time"></label>
        <label class="field grow"><span>🌙 Soir</span><input class="input" type="time" value="${esc(d.dinner_time || "19:30")}" data-model="top.draft.dinner_time"></label>
      </div>
      <p class="muted small" style="margin-top:-6px">Le menu apparaît dans le calendrier de Home Assistant (« Frigo Malin menu ») : chaque repas commence quand il faut se mettre aux fourneaux et finit à l'heure du repas. Pratique pour une automatisation « 30 min avant le dîner… ».</p>
      <div class="set-sec">${bubble("timer-outline", COLORS.orange)}<h3>Temps en cuisine</h3></div>
      <div class="row wrap" style="justify-content:space-between;margin-bottom:12px">
        <span class="muted small">En semaine (prépa + cuisson)</span>${this._tplStepper("top.draft.time_weekday", d.time_weekday, "min", 10, 240, 5)}
      </div>
      <div class="row wrap" style="justify-content:space-between;margin-bottom:12px">
        <span class="muted small">Le week-end</span>${this._tplStepper("top.draft.time_weekend", d.time_weekend, "min", 10, 360, 15)}
      </div>
      <div class="set-sec">${bubble("cash", COLORS.green)}<h3>Budget</h3></div>
      <label class="field"><span>${icon("cash")} Budget courses par semaine (facultatif)</span>
        <input class="input" type="number" min="0" inputmode="numeric" placeholder="Ex. : 80 €" value="${esc(d.budget_week ?? "")}" data-model="top.draft.budget_week"></label>
`],
      cooking: ["Cuisine et goûts", `
      <div class="field"><span>Équipement</span>${this._tplMulti("top.draft.equipment", d.equipment, HH.equipment)}</div>
      <div class="field"><span>Cuisines préférées</span>${this._tplMulti("top.draft.cuisines", d.cuisines, HH.cuisines)}</div>
      <div class="field"><span>Objectifs</span>${this._tplMulti("top.draft.goals", d.goals, HH.goals)}</div>
      <label class="field"><span>Autres consignes pour l'IA</span>
        <textarea class="input" rows="3" placeholder="Ex. : pas de coriandre, poisson le vendredi, plats qui se réchauffent pour le midi…" data-model="top.draft.notes">${esc(d.notes)}</textarea></label>

`],
      shopping: ["Courses et magasins", `
      <label class="field"><span>${icon("cart-outline")} Liste de courses</span>
        <select class="input" data-model="top.draft.shopping_entity">
          <option value="">Automatique${this.s.config.shopping_list && this.s.config.shopping_list.name && !d.shopping_entity ? ` (${esc(this.s.config.shopping_list.name)})` : ""}</option>
          ${Object.keys(this._hass.states)
            .filter((id) => id.startsWith("todo."))
            .map((id) => `<option value="${esc(id)}" ${d.shopping_entity === id ? "selected" : ""}>${esc(this._hass.states[id].attributes.friendly_name || id)}</option>`)
            .join("")}
        </select></label>
      <p class="muted small" style="margin-top:-6px">« Frigo Malin courses » est la liste intégrée, utilisée si vous n'en choisissez pas d'autre. Toute liste de Home Assistant convient (Liste de courses, Bring!, Todoist…).</p>


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
      ${this._tplSwitch("top.draft.store_reminder", d.store_reminder, "🔔 Rappel en arrivant au magasin", zones.length ? "Notification sur le téléphone de la personne qui arrive, si la liste n'est pas vide." : "Créez d'abord une zone pour votre magasin dans Paramètres → Zones.")}`],
      fridge: ["Frigo", `
      <p class="muted set-page-intro">La dernière photo du frigo est gardée en mémoire pour proposer des idées sans reprendre de photo.</p>
      <div class="field"><span>Combien de temps garder la dernière photo du frigo</span>
        <div class="chips">
          ${[[3, "3 jours"], [5, "5 jours"], [7, "1 semaine"], [14, "2 semaines"], [0, "Jusqu'à la prochaine photo"]]
            .map(([v, label]) => `<button class="chip ${Number(d.fridge_days ?? 5) === v ? "on" : ""}" data-action="set-fridge-days" data-value="${v}">${label}</button>`)
            .join("")}
        </div>
      </div>
      <button class="btn danger block" data-action="memory-clear" ${this.s.fridgeMemory.items.length ? "" : "disabled"}>${icon("delete-outline")} Oublier le contenu du frigo${this.s.fridgeMemory.items.length ? ` (${this.s.fridgeMemory.items.length} aliments)` : ""}</button>

`],
      ai: ["Intelligence artificielle", `
      <div class="segmented">
        <button class="${d.ai_mode !== "single" ? "on" : ""}" data-action="set" data-path="top.draft.ai_mode" data-value="economy">💡 Économique</button>
        <button class="${d.ai_mode === "single" ? "on" : ""}" data-action="set" data-path="top.draft.ai_mode" data-value="single">🎯 Un seul modèle</button>
      </div>
      <p class="muted small">${d.ai_mode === "single"
        ? `Toutes les demandes utilisent le modèle choisi dans les options de l'intégration (${esc((this.s.config && this.s.config.model) || "")}).`
        : "Le modèle le plus léger pour la photo du frigo et les idées, un modèle intermédiaire pour lire une page ou trouver des idées saines, le plus puissant seulement pour planifier la semaine et lire une recette photographiée."}</p>
      <div class="info" id="ai-usage">${this._tplUsage()}</div>

`],
    };
    return pages;
  }

  _tplUsage() {
    const u = (this.s.config && this.s.config.usage) || { eur: 0, calls: 0 };
    const month = new Date().toLocaleDateString("fr-FR", { month: "long" });
    return `💶 Dépense IA en ${month} : <b>≈ ${fmtNumber(u.eur).replace(/^0$/, "0")} €</b> (${u.calls} demande${u.calls > 1 ? "s" : ""}). <span class="muted small">Estimation d'après les tarifs publics ; la facture exacte est chez votre fournisseur.</span>`;
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
      const toWrite = top.proposal ? top.proposal.meals.filter((m) => !m.recipe_id).length : 0;
      const msg =
        top.step === "applying"
          ? toWrite
            ? `✍️ J'écris ${toWrite} recette${toWrite > 1 ? "s" : ""}, puis je remplis la liste de courses…`
            : "J'ajoute tout au menu et à la liste de courses…"
          : PLAN_LOADING[top.loadingMsg || 0];
      return this._tplSheet("Planifier ma semaine", `<div class="card hero">
        <div class="emoji" style="font-size:56px">✨</div>
        <div class="spinner" style="margin:16px auto;color:var(--fm-primary)"></div>
        <h2>${esc(msg)}</h2>
        <p class="muted">${top.step === "applying" ? "Les recettes s'écrivent en parallèle : une trentaine de secondes." : "Le menu arrive en une quinzaine de secondes."}</p>
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
      days.push(`<div class="plan-day"><span class="d">${DAY_SHORT[(parseIso(date).getDay() + 6) % 7]} ${parseIso(date).getDate()}</span>${chip("lunch")}${chip("dinner")}</div>`);
    }
    const hh = this.settings.members.length;
    const body = `
      <p class="muted" style="margin-top:0">Du ${esc(fmtDay(top.start, { weekday: "long", day: "numeric" }))} au ${esc(fmtDay(addDays(top.start, 6), { weekday: "long", day: "numeric", month: "long" }))}. Choisissez les repas à préparer : l'IA compose un menu équilibré, de saison, adapté à votre foyer et à votre temps.</p>
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
      <p class="muted small" style="margin:0 0 10px">🔒 Gardez les repas qui vous plaisent, ↻ remplacez-en un, ✕ retirez-le. Les recettes ne sont écrites qu'à la validation.</p>
      ${total ? `<p class="row small ${over ? "warn" : "muted"}" style="margin:0 0 12px">${icon("cash")} Coût estimé : <b>${fmtNumber(total)} €</b>${p.budget ? ` pour un budget de ${p.budget} €` : ""}</p>` : ""}
      ${p.meals
        .map((m, i) => `<div class="card pmeal ${m.locked ? "locked" : ""} ${m.replacing ? "busy" : ""}">
          <div class="thumb" style="background:hsl(${hashHue(m.title)} 60% 50% / .15)">${m.replacing ? `<span class="spinner sm"></span>` : emojiFor(m.title)}</div>
          <div class="grow">
            <div class="when">${esc(label(m))}</div>
            <div class="t">${esc(m.title)}</div>
            ${m.description ? `<div class="muted small">${esc(m.description)}</div>` : ""}
            <div class="badges">
              ${m.time ? `<span class="tag">⏱️ ${fmtMinutes(m.time)}</span>` : ""}
              ${m.estimated_cost ? `<span class="tag gold">${fmtNumber(m.estimated_cost)} €</span>` : ""}
              ${m.recipe_id ? `<span class="tag">📖 Du carnet</span>` : ""}
              ${m.leftovers_from ? `<span class="tag alt">♻️ Restes</span>` : ""}
              ${m.locked ? `<span class="tag alt">🔒 Gardé</span>` : ""}
            </div>
            ${m.key_ingredients && m.key_ingredients.length ? `<div class="muted small" style="margin-top:6px">${m.key_ingredients.map((x) => `${ingEmoji(x)} ${esc(x)}`).join(" · ")}</div>` : ""}
            ${m.note ? `<div class="muted small" style="margin-top:6px">${esc(m.note)}</div>` : ""}
          </div>
          <div class="pm-actions">
            <button class="icon-btn ${m.locked ? "on" : ""}" data-action="weekplan-lock" data-i="${i}" aria-label="${m.locked ? "Ne plus garder" : "Garder ce repas"}" title="${m.locked ? "Gardé" : "Garder"}">${icon(m.locked ? "lock" : "lock-open-variant-outline")}</button>
            <button class="icon-btn" data-action="weekplan-replace" data-i="${i}" aria-label="Remplacer ce repas" title="Remplacer" ${m.locked || m.replacing ? "disabled" : ""}>${icon("refresh")}</button>
            <button class="icon-btn" data-action="weekplan-remove" data-i="${i}" aria-label="Retirer ce repas" title="Retirer">${icon("close")}</button>
          </div>
        </div>`)
        .join("")}
      <button class="btn text block" data-action="weekplan-back">${icon("tune-variant")} Changer les réglages et recommencer</button>`;
    const unlocked = p.meals.filter((m) => !m.locked).length;
    const footer = `<button class="btn tonal" data-action="weekplan-generate" title="Refaire les repas non gardés" ${unlocked && unlocked < p.meals.length + 1 ? "" : "disabled"}>${icon("refresh")} ${unlocked < p.meals.length ? `Refaire ${unlocked}` : "Tout refaire"}</button>
      <button class="btn grow big" data-action="weekplan-apply" ${p.meals.length ? "" : "disabled"}>${icon("calendar-check")} Ajouter ${p.meals.length} repas</button>`;
    return this._tplSheet("Votre menu", body, footer);
  }

  _tplQuickSheet() {
    const body = `
      <p class="muted small row quick-count" style="margin-top:0">${this._tplQuickCount()}</p>
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

  _tplKeepSelect(ing, i) {
    const d = daysLeft(ing.expires);
    const current = d == null ? "" : KEEP_OPTIONS.reduce((best, [v]) => (v === "" ? best : Math.abs(v - d) < Math.abs(best - d) ? v : best), 0);
    const cls = d == null ? "" : d <= 1 ? "danger" : d <= 3 ? "soon" : "";
    return `<select class="keep ${cls}" data-change="ing-days" data-i="${i}" aria-label="Se garde encore" title="Se garde encore">
      ${d != null && d < 0 ? `<option selected>⚠️ dépassé</option>` : ""}
      ${KEEP_OPTIONS.map(([v, label]) => `<option value="${v}" ${d != null && d >= 0 && v === current ? "selected" : ""} ${d == null && v === "" ? "selected" : ""}>${v === "" ? "⏳ ?" : d != null && v === current ? expiryLabel(ing.expires) : label}</option>`).join("")}
    </select>`;
  }

  _tplFridgeDrawing(items, edit = false) {
    const { body, door, extra } = fridgeSections(items);
    const chips = (list) =>
      `<div class="chips">${list
        .map((i) =>
          edit
            ? `<button class="chip removable" data-action="memory-remove" data-name="${esc(i.name)}" aria-label="Retirer ${esc(i.name)}">${ingEmoji(i.name)} ${esc(i.name)} ${icon("close")}</button>`
            : `<span class="chip ${i.expires && daysLeft(i.expires) <= 2 ? "urgent-chip" : ""}">${ingEmoji(i.name)} ${esc(i.name)}</span>`
        )
        .join("")}</div>`;
    const section = (sec) => `<div class="fz-shelf fz-${sec.key.startsWith("shelf") ? "etagere" : sec.key}"><div class="fz-label">${sec.label}</div>${chips(sec.items)}</div>`;
    return `<div class="fridge-box">
      ${body.length ? `<div class="fz-body">${body.map(section).join("")}</div>` : ""}
      ${door.length ? `<div class="fz-door"><div class="fz-label">🚪 Porte</div>${chips(door)}</div>` : ""}
    </div>
    ${extra.map((sec) => `<div class="fridge-box fz-extra">${section(sec)}</div>`).join("")}`;
  }

  _tplFridgeAdd() {
    const places = [["etagere", "🧊 Étagère"], ["bac", "🥬 Bac"], ["porte", "🚪 Porte"], ["congelateur", "❄️ Congél."], ["placard", "🗄️ Placard"]];
    return `<div class="fz-add">
      <input class="input" id="memory-new" placeholder="Ajouter un aliment" value="${esc(this.s.fridgeNew || "")}" data-model="fridgeNew" data-enter="memory-add" enterkeyhint="done" autocomplete="off">
      <select class="input" data-model="fridgeNewPlace" aria-label="Où ?">
        ${places.map(([v, label]) => `<option value="${v}" ${(this.s.fridgeNewPlace || "etagere") === v ? "selected" : ""}>${label}</option>`).join("")}
      </select>
      <button class="btn" data-action="memory-add" aria-label="Ajouter">${icon("plus")}</button>
    </div>`;
  }

  /* Enregistre le contenu modifié à la main (photos gardées). */
  async _saveFridgeItems(items) {
    try {
      this.s.fridgeMemory = await this._ws("fridge/memory/save", { items, mode: "replace" });
    } catch (err) {
      this._toast(this._err(err), true);
    }
    this._render();
  }

  /* ---------------- visionneuse plein écran (photo du frigo) */

  async _showFridgePhoto(index = null) {
    const count = this.s.fridgeMemory.photos || 0;
    if (!count) return;
    const i = index == null ? count - 1 : index;
    const box = { index: i, count, image: null, zoom: false };
    this._lightbox = box;
    // La dernière photo est déjà chargée pour la vignette : affichage immédiat.
    if (i === count - 1 && this._fridgeThumb) {
      box.image = this._fridgeThumb;
      this._renderLightbox();
      return;
    }
    this._renderLightbox();
    try {
      const res = await this._ws("fridge/memory/photo", { index: i });
      box.image = `data:${res.mime};base64,${res.image}`;
    } catch (err) {
      box.error = this._err(err);
    }
    if (this._lightbox === box) this._renderLightbox();
  }

  /* Vignette de la dernière photo du frigo, chargée une fois (et réutilisée par la visionneuse). */
  _tplFridgeThumb() {
    const mem = this.s.fridgeMemory;
    const key = `${mem.updated}|${mem.photos}`;
    if (this._thumbKey !== key) queueMicrotask(() => this._loadFridgeThumb());
    return `<button class="mem-thumb" data-action="memory-photo" aria-label="Voir la photo du frigo en grand">
      ${this._fridgeThumb && this._thumbKey === key ? `<img src="${this._fridgeThumb}" alt="">` : icon("image-outline")}
      <span class="mem-thumb-zoom">${icon("arrow-expand")}</span>
    </button>`;
  }

  async _loadFridgeThumb() {
    const mem = this.s.fridgeMemory;
    const key = `${mem.updated}|${mem.photos}`;
    if (!mem.photos || this._thumbKey === key) return;
    this._thumbKey = key;
    this._fridgeThumb = null;
    try {
      const res = await this._ws("fridge/memory/photo", { index: mem.photos - 1 });
      if (this._thumbKey === key) this._fridgeThumb = `data:${res.mime};base64,${res.image}`;
    } catch (_) {
      /* pas de vignette */
    }
    if (this.s.tab === "fridge") this._render();
  }

  _openImage(src) {
    if (!src) return;
    this._lightbox = { index: 0, count: 1, image: src, zoom: false };
    this._renderLightbox();
  }

  _closeLightbox() {
    this._lightbox = null;
    this._renderLightbox();
  }

  _renderLightbox() {
    const host = this.shadowRoot.getElementById("lightbox");
    if (!host) return;
    const box = this._lightbox;
    if (!box) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML = `<div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo du frigo">
      <button class="lb-close" data-action="lightbox-close" aria-label="Fermer">${icon("close")}</button>
      <div class="lb-stage ${box.zoom ? "zoom" : ""}" data-action="lightbox-zoom">
        ${box.error
          ? `<div class="lb-msg">${esc(box.error)}</div>`
          : box.image
            ? `<img src="${box.image}" alt="Photo du frigo" draggable="false">`
            : `<div class="spinner"></div>`}
      </div>
      <div class="lb-foot">
        ${box.count > 1 ? `<div class="lb-dots">${Array.from({ length: box.count }, (_, k) => `<button class="${k === box.index ? "on" : ""}" data-action="memory-photo" data-i="${k}">Photo ${k + 1}</button>`).join("")}</div>` : ""}
        ${box.image ? `<div class="lb-hint">${box.zoom ? "Touchez pour revenir à la photo entière" : "Touchez la photo pour zoomer"}</div>` : ""}
      </div>
    </div>`;
  }

  _tplFridgeMemory() {
    const mem = this.s.fridgeMemory;
    if (!mem.items.length) return "";
    const ago = mem.updated ? Math.round((Date.now() - new Date(mem.updated).getTime()) / DAY_MS) : 0;
    const when = ago <= 0 ? "aujourd'hui" : ago === 1 ? "hier" : `il y a ${ago} jours`;
    const urgent = mem.items.filter((i) => i.expires && daysLeft(i.expires) <= 2);
    return `<div class="card memory">
      <div class="row" style="align-items:flex-start">
        ${mem.photos ? this._tplFridgeThumb() : bubble("fridge-outline", COLORS.teal)}
        <div class="grow">
          <h3 style="margin:0">Dans mon frigo</h3>
          <div class="muted small">${mem.items.length} aliment${mem.items.length > 1 ? "s" : ""} · ${mem.photos ? `<button class="linkish" data-action="memory-photo">📷 photo ${when}</button>` : `photo ${when}`}${mem.days ? ` · gardé ${mem.days} jours` : ""}</div>
        </div>
        <button class="icon-btn ${this.s.fridgeEdit ? "on" : ""}" data-action="memory-edit" aria-label="Modifier le contenu" title="Modifier">${icon(this.s.fridgeEdit ? "check" : "pencil-outline")}</button>
        <button class="icon-btn" data-action="memory-clear" aria-label="Oublier le contenu du frigo" title="Oublier">${icon("delete-outline")}</button>
      </div>
      ${urgent.length
        ? `<div class="urgent">⚠️ À consommer vite : ${urgent.map((i) => `<b>${esc(i.name)}</b> (${esc(expiryLabel(i.expires).replace(/^⚠️ |^⏳ /, ""))})`).join(", ")}</div>`
        : `<div class="muted small" style="margin:8px 0 0">✅ Rien ne presse pour l'instant.</div>`}
      ${this._tplFridgeDrawing(mem.items, this.s.fridgeEdit)}
      ${this.s.fridgeEdit ? this._tplFridgeAdd() : ""}
      <button class="btn block big" data-action="${this.s.fridgeEdit ? "memory-edit" : "memory-use"}">${this.s.fridgeEdit ? `${icon("check")} Terminé` : "💡 Des idées avec ce qu'il me reste"}</button>
    </div>`;
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
        ${r.nutrition && r.nutrition.kcal ? `<span><span class="ico" style="--c:${COLORS.orange}">${icon("fire")}</span> ${r.nutrition.kcal} kcal · ${fmtNumber(r.nutrition.protein)} g prot.</span>` : ""}
      </div>
      ${r.uses && r.uses.length ? `<div class="uses"><b class="ok">✓ Utilise :</b> ${esc(r.uses.join(", "))}</div>` : ""}
      ${r.missing && r.missing.length ? `<div class="uses"><b class="warn">+ À acheter :</b> ${esc(r.missing.join(", "))}</div>` : `<div class="uses ok">Rien à acheter 🎉</div>`}
    </div>`;
  }

  /* ---------------- onglet Recettes */

  _filteredRecipes() {
    const q = foldText(this.s.search).trim();
    return this.s.recipes.filter((r) => {
      if (this.s.filter === "fav" && !r.favorite) return false;
      if (this.s.filter.startsWith("tag:") && !(r.tags || []).includes(this.s.filter.slice(4))) return false;
      if (!q) return true;
      return (
        foldText(r.title).includes(q) ||
        (r.tags || []).some((t) => foldText(t).includes(q)) ||
        r.ingredients.some((i) => foldText(i.name).includes(q))
      );
    });
  }

  _tplRecipes() {
    return this._tplMyRecipes();
  }

  get householdAllergens() {
    return new Set(this.settings.members.flatMap((m) => m.allergies));
  }

  _tplMyRecipes() {
    const tagCount = {};
    for (const r of this.s.recipes) for (const t of r.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
    // Quelques catégories seulement : les plus fréquentes, sur une seule ligne qui défile.
    const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    const f = this.s.filter;
    return `
      <div class="row" style="margin-bottom:12px">
        <button class="btn grow" data-action="new-recipe">${icon("plus")} Nouvelle</button>
        <button class="btn tonal grow" data-action="import-open">${icon("download")} Importer</button>
        <button class="btn tonal grow" data-action="book-open">${icon("book-open-variant")} Photo</button>
      </div>
      <div class="row search-row">
        <div class="search grow">
          ${icon("magnify")}
          <input class="input" type="search" placeholder="Chercher une recette, un ingrédient…" value="${esc(this.s.search)}" data-model="search" data-live="recipes">
        </div>
        <button class="icon-btn layout-btn" data-action="recipes-layout" aria-label="${this.recipesLayout === "grid" ? "Afficher en liste" : "Afficher en grille"}" title="${this.recipesLayout === "grid" ? "Liste" : "Grille"}">${icon(this.recipesLayout === "grid" ? "view-list-outline" : "view-grid-outline")}</button>
      </div>
      <div class="chips scroll filters" style="margin-bottom:14px">
        <button class="chip ${f === "all" ? "on" : ""}" data-action="filter" data-value="all">Toutes</button>
        <button class="chip ${f === "fav" ? "on" : ""}" data-action="filter" data-value="fav">⭐ Favoris</button>
        ${tags.map((t) => `<button class="chip ${f === "tag:" + t ? "on" : ""}" data-action="filter" data-value="tag:${esc(t)}">${TAG_EMOJI[t] ? TAG_EMOJI[t] + " " : ""}${esc(t)}</button>`).join("")}
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

  get recipesLayout() {
    if (this._layout) return this._layout;
    try {
      this._layout = localStorage.getItem("frigo-malin-layout") || "grid";
    } catch (_) {
      this._layout = "grid";
    }
    return this._layout;
  }

  /* Carte photo du carnet : photo (ou dégradé + emoji), titre sur dégradé, temps et calories. */
  _tplRecipeCard(r) {
    const img = safeUrl(r.image);
    const time = totalTime(r);
    const hue = hashHue(r.title || "recette");
    const meta = [time ? `⏱ ${fmtMinutes(time)}` : "", r.nutrition && r.nutrition.kcal ? `🔥 ${r.nutrition.kcal}` : ""].filter(Boolean).join(" · ");
    return `<div class="rcard">
      <button class="rcard-open" data-action="open-recipe" data-id="${esc(r.id)}" aria-label="${esc(r.title)}">
        ${img
          ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
          : `<span class="rcard-bg" style="background:linear-gradient(135deg,hsl(${hue} 65% 55%),hsl(${(hue + 40) % 360} 70% 40%))"><span>${emojiFor(r.title)}</span></span>`}
        <span class="rcard-shade"></span>
        <span class="rcard-text"><span class="t">${esc(r.title)}</span>${meta ? `<span class="m">${meta}</span>` : ""}</span>
      </button>
      <button class="rcard-fav ${r.favorite ? "on" : ""}" data-action="swipe-fav" data-id="${esc(r.id)}" aria-label="${r.favorite ? "Retirer des favoris" : "Mettre en favori"}">${icon(r.favorite ? "star" : "star-outline")}</button>
    </div>`;
  }

  _tplRecipeItems() {
    if (!this.s.loaded && !this.s.recipes.length) return skel(this.recipesLayout === "grid" ? "grid" : "cards", 4);
    if (!this.s.recipes.length) {
      return `<div class="empty"><div class="emoji">📖</div><p>Votre carnet est vide.<br>Ajoutez une recette, importez un lien Marmiton, ou partez d'une photo du frigo.</p></div>`;
    }
    const list = this._filteredRecipes();
    if (!list.length) return `<div class="empty"><p>Aucune recette ne correspond.</p></div>`;
    if (this.recipesLayout === "grid") return `<div class="rgrid">${list.map((r) => this._tplRecipeCard(r)).join("")}</div>`;
    return list
      .map((r) => {
        const time = totalTime(r);
        const meta = [time ? fmtMinutes(time) : "", r.servings ? `${r.servings} pers.` : "", r.nutrition && r.nutrition.kcal ? `🔥 ${r.nutrition.kcal} kcal` : `${r.ingredients.length} ingrédients`].filter(Boolean).join(" · ");
        return `<div class="swipe" data-swipe="${esc(r.id)}">
          <div class="swipe-actions">
            <button class="fav" data-action="swipe-fav" data-id="${esc(r.id)}" aria-label="${r.favorite ? "Retirer des favoris" : "Mettre en favori"}">${icon(r.favorite ? "star-off-outline" : "star")}${r.favorite ? "Retirer" : "Favori"}</button>
            <button class="del" data-action="swipe-delete" data-id="${esc(r.id)}" aria-label="Supprimer">${icon("delete-outline")}Supprimer</button>
          </div>
          <button class="list-item" data-action="open-recipe" data-id="${esc(r.id)}">
            ${this._tplThumb(r)}
            <div class="grow"><div class="t">${esc(r.title)}</div><div class="m">${esc(meta)}</div></div>
            ${r.favorite ? `<span class="star">${icon("star")}</span>` : ""}
          </button>
        </div>`;
      })
      .join("") + `<p class="swipe-hint">${icon("gesture-swipe-left")} Glissez une recette vers la gauche pour la mettre en favori ou la supprimer.</p>`;
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
    const dayTotals = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(w.start, i);
      const t = this._dayNutrition(date);
      if (t) dayTotals.push(t);
      days.push(`<div class="card day ${date === today ? "today" : ""}">
        <div class="dname">${cap(fmtDay(date, { weekday: "long", day: "numeric" }))}${date === today ? `<span class="now">Aujourd'hui</span>` : ""}${t ? `<span class="nut-day" title="Par personne">🔥 ${t.kcal} kcal · 💪 ${fmtNumber(t.protein)} g</span>` : ""}</div>
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
      <div class="week-actions">
        <button class="btn tonal" data-action="weekplan-open">${icon("creation")} Planifier avec l'IA</button>
        <button class="btn tonal" data-action="copy-open">${icon("content-copy")} Reprendre un menu</button>
      </div>
      ${dayTotals.length ? this._tplWeekNutrition(dayTotals) : ""}
      ${w.entries.length ? `<p class="drag-hint">✋ Tenez un repas par ⠿ et glissez-le vers un autre jour. Gardez-le en haut ou en bas de l'écran pour faire défiler.</p>` : ""}
      ${days.join("")}
      <button class="btn big block" data-action="shop-preview" ${w.entries.length ? "" : "disabled"}>${icon("cart-outline")} Liste de courses de la semaine${pending ? ` (${pending} repas)` : ""}</button>`;
  }

  /* Total d'une journée pour une personne : somme des portions des repas prévus. */
  _dayNutrition(date) {
    const meals = this.s.week.entries.filter((e) => e.date === date);
    let found = false;
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    for (const e of meals) {
      const n = (this._recipe(e.recipe_id) || {}).nutrition;
      if (!n || !n.kcal) continue;
      found = true;
      for (const k of Object.keys(t)) t[k] += n[k] || 0;
    }
    if (!found) return null;
    t.kcal = Math.round(t.kcal);
    for (const k of ["protein", "carbs", "fat", "fiber"]) t[k] = Math.round(t[k]);
    t.meals = meals.length;
    return t;
  }

  _tplWeekNutrition(days) {
    const avg = (k) => Math.round(days.reduce((s, d) => s + d[k], 0) / days.length);
    const energy = avg("protein") * 4 + avg("carbs") * 4 + avg("fat") * 9 || 1;
    const parts = [["protein", "prot."], ["carbs", "gluc."], ["fat", "lip."]];
    const k = { protein: 4, carbs: 4, fat: 9 };
    return `<div class="card week-nut">
      <div class="row" style="gap:10px">${bubble("nutrition", COLORS.green)}
        <div class="grow"><b>Moyenne par personne</b><div class="muted small">sur ${days.length} jour${days.length > 1 ? "s" : ""} planifié${days.length > 1 ? "s" : ""} (repas prévus seulement)</div></div>
        <div class="nut-kcal sm"><b>${avg("kcal")}</b> kcal/j</div>
      </div>
      <div class="nut-bar">${parts.map(([key]) => `<i style="width:${Math.round((avg(key) * k[key] * 100) / energy)}%;background:${NUT_COLORS[key]}"></i>`).join("")}</div>
      <div class="muted small">${parts.map(([key, label]) => `<span class="dot" style="background:${NUT_COLORS[key]}"></span> ${avg(key)} g ${label}`).join(" &nbsp; ")} &nbsp; <span class="dot" style="background:${NUT_COLORS.fiber}"></span> ${avg("fiber")} g fibres</div>
    </div>`;
  }

  _tplSlot(date, slot) {
    const meals = this.s.week.entries.filter((e) => e.date === date && e.slot === slot);
    return `<div class="slot" data-drop-date="${date}" data-drop-slot="${slot}">
      <div class="sl"><span class="ico" style="--c:${slot === "lunch" ? COLORS.amber : COLORS.indigo}">${icon(slot === "lunch" ? "weather-sunny" : "weather-night")}</span>${SLOT_LABELS[slot]}</div>
      <div class="meals">
        ${meals
          .map((e) => {
            const r = this._recipe(e.recipe_id);
            return `<div class="meal" data-meal="${esc(e.id)}">
              <span class="grip" data-grip aria-label="Déplacer ce repas" title="Maintenir et glisser">${icon("drag")}</span>
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
      case "store-mode":
        return this._tplStoreMode(top);
      case "member":
        return this._tplMember(top);
      case "store":
        return this._tplStore(top);
      case "book":
        return this._tplBook(top);
      case "weekplan":
        return this._tplWeekPlan(top);
      case "copy":
        return this._tplCopy(top);
      case "purchases":
        return this._tplPurchases(top);
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
      <div class="rhero" style="${this._heroBg(r)}">
        <div class="hero-shade"></div>
        <div class="hero-text">
          ${r.origin === "jow" ? `<span class="hero-badge">🥘 Jow</span>` : ""}
          <h1 class="hero-title">${esc(r.title)}</h1>
          ${r.description ? `<p class="hero-desc">${esc(r.description)}</p>` : ""}
        </div>
      </div>
      <div class="meta">
        ${r.prep_time ? `<span><span class="ico" style="--c:${COLORS.green}">${icon("knife")}</span> Préparation ${fmtMinutes(r.prep_time)}</span>` : ""}
        ${r.cook_time ? `<span><span class="ico" style="--c:${COLORS.red}">${icon("stove")}</span> Cuisson ${fmtMinutes(r.cook_time)}</span>` : ""}
        ${r.nutrition && r.nutrition.kcal ? `<span><span class="ico" style="--c:${COLORS.orange}">${icon("fire")}</span> ${r.nutrition.kcal} kcal / pers.</span>` : ""}
      </div>
      ${r.tags && r.tags.length ? `<div class="chips" style="margin-bottom:8px">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      ${!saved && r.missing && r.missing.length ? `<div class="info"><b>À acheter :</b> ${esc(r.missing.join(", "))}</div>` : ""}
      ${r.benefits && r.benefits.length ? `<div class="benefits"><b>💚 Pourquoi c'est bon</b><ul>${r.benefits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>` : ""}
      ${(r.allergens || []).some((a) => this.householdAllergens.has(a)) ? `<div class="alert">⚠️ Contient : ${esc(r.allergens.filter((a) => this.householdAllergens.has(a)).map((a) => HH.allergens[a]).join(", "))} (allergie dans le foyer).</div>` : ""}

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

      ${this._tplNutrition(r)}

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
            <button class="btn danger" data-action="delete-recipe">${icon("delete-outline")} Supprimer</button>
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
    const servings = top.servings || base;
    const factor = servings / base;
    const step = top.step;
    const done = step >= total;
    const checked = top.checked || [];
    const ingRow = (ing, i, clickable) => {
      const f = fmtIngredient(ing, factor);
      const on = checked.includes(i);
      return clickable
        ? `<button class="tick-row ${on ? "on" : ""}" data-action="cook-check" data-i="${i}">
            <span class="box">${icon("check")}</span><span class="ing-emoji">${ingEmoji(ing.name)}</span>
            <span class="q">${esc(f.amount)}</span><span class="nm grow">${esc(cap(f.name))}</span></button>`
        : `<li><span class="ing-emoji">${ingEmoji(ing.name)}</span><span class="q">${esc(f.amount)}</span><span>${esc(cap(f.name))}</span></li>`;
    };

    let content;
    if (step < 0) {
      // Mise en place : on sort tout avant de commencer.
      const time = totalTime(r);
      content = `<div class="stepcard mise">
        <div class="stephead"><div class="bigemoji">🧺</div>
          <div><div class="num">Mise en place<small>Sortez et préparez tout avant de commencer.</small></div></div></div>
        <h2>${esc(r.title)}</h2>
        <div class="metas">
          <span class="tag">👥 ${servings} pers.</span>
          ${r.prep_time ? `<span class="tag">🔪 ${fmtMinutes(r.prep_time)}</span>` : ""}
          ${r.cook_time ? `<span class="tag">🔥 ${fmtMinutes(r.cook_time)}</span>` : ""}
          ${time ? `<span class="tag gold">⏱️ ${fmtMinutes(time)} en tout</span>` : ""}
          <span class="tag">📝 ${total} étape${total > 1 ? "s" : ""}</span>
        </div>
        <div class="row" style="justify-content:space-between">
          <div class="ready">${checked.length === r.ingredients.length && r.ingredients.length ? "✅ Tout est prêt !" : `✔️ ${checked.length} / ${r.ingredients.length} ingrédients prêts`}</div>
          <button class="btn text" data-action="cook-check-all">${checked.length === r.ingredients.length ? "Tout décocher" : "Tout cocher"}</button>
        </div>
        ${r.ingredients.map((ing, i) => ingRow(ing, i, true)).join("")}
      </div>`;
    } else if (done) {
      content = `<div class="stepcard done">
        <div class="emoji">🎉</div>
        <div class="txt">Bon appétit !</div>
        <p class="muted">« ${esc(r.title)} » est prêt${servings ? ` pour ${servings} personne${servings > 1 ? "s" : ""}` : ""}. 🍽️</p>
        <div class="stack">
          ${r.id && !r.favorite ? `<button class="btn tonal block" data-action="cook-favorite">⭐ Ajouter aux favoris</button>` : ""}
          <button class="btn tonal block" data-action="cook-goto" data-step="0">🔁 Revoir les étapes</button>
          <button class="btn block big" data-action="close">✅ Terminer</button>
        </div>
      </div>`;
    } else {
      const text = r.steps[step];
      const uses = stepIngredients(text, r.ingredients);
      const dur = stepDuration(text);
      content = `<div class="stepcard">
        <div class="stephead"><div class="bigemoji">${stepEmoji(text)}</div>
          <div class="num">Étape ${step + 1} sur ${total}${step + 1 === total ? "<small>Dernière étape 🏁</small>" : ""}</div></div>
        <div class="txt">${esc(text)}</div>
        ${uses.length
          ? `<div class="usechips">${uses
              .map((ing) => {
                const f = fmtIngredient(ing, factor);
                return `<span class="chip">${ingEmoji(ing.name)} ${f.amount ? `<b>${esc(f.amount)}</b>` : ""} ${esc(f.name)}</span>`;
              })
              .join("")}</div>`
          : ""}
        ${dur ? `<button class="btn tonal timerbtn" data-action="timer-start" data-seconds="${dur.seconds}" data-label="${esc(`Étape ${step + 1} · ${dur.label}`)}">⏲️ Lancer un minuteur de ${esc(dur.label)}</button>` : ""}
      </div>`;
    }

    const dots = r.steps
      .map((_, i) => `<button class="${i < step ? "on" : ""} ${i === step ? "cur" : ""}" data-action="cook-goto" data-step="${i}" aria-label="Étape ${i + 1}"></button>`)
      .join("");
    const next =
      step < 0
        ? `<button class="btn" data-action="cook-next">👩‍🍳 C'est parti !</button>`
        : done
          ? ""
          : `<button class="btn" data-action="cook-next">${step + 1 === total ? "🏁 J'ai fini" : `Suivant ${icon("chevron-right")}`}</button>`;
    return `<div class="sheet cook ${top.big ? "big" : ""}">
      <div class="toolbar">
        <button class="icon-btn" data-action="close" aria-label="Quitter le mode cuisine">${icon("close")}</button>
        <div class="title">👩‍🍳 ${esc(r.title)}</div>
        <button class="icon-btn ${this._voice.speak ? "on" : ""}" data-action="cook-speak" aria-label="${this._voice.speak ? "Arrêter la lecture à voix haute" : "Lire les étapes à voix haute"}" title="Lecture à voix haute">${icon(this._voice.speak ? "volume-high" : "volume-off")}</button>
        <button class="icon-btn ${this._voice.listen ? "on" : ""}" data-action="cook-listen" aria-label="${this._voice.listen ? "Arrêter la commande vocale" : "Commande vocale"}" title="Commande vocale">${icon(this._voice.listen ? "microphone" : "microphone-off")}</button>
        <button class="icon-btn" data-action="cook-big" aria-label="Taille du texte" title="Taille du texte">${icon(top.big ? "format-font-size-decrease" : "format-font-size-increase")}</button>
        <button class="icon-btn" data-action="cook-ing" aria-label="Ingrédients" title="Ingrédients">${icon(top.showIng ? "close-box-outline" : "basket-outline")}</button>
      </div>
      ${step >= 0 && !done ? `<div class="dots">${dots}</div>` : ""}
      ${this._voice.listen ? `<div class="voice-hint"><span class="mic-dot"></span> J'écoute : « suivant », « répète », « minuteur »</div>` : ""}
      <div class="timers" id="cook-timers" style="${(this._timers || []).length ? "" : "display:none"}">${this._tplTimers()}</div>
      ${top.showIng ? `<div class="ingpanel"><ul class="ings">${r.ingredients.map((ing, i) => ingRow(ing, i, false)).join("")}</ul></div>` : ""}
      <div class="stepbox">${content}</div>
      ${done
        ? ""
        : `<div class="nav">
            ${step >= 0 ? `<button class="btn tonal prev" data-action="cook-prev" aria-label="Étape précédente">${icon("chevron-left")}</button>` : ""}
            ${next}
          </div>`}
    </div>`;
  }

  /* Fond de l'en-tête : la photo de la recette, sinon un dégradé à sa couleur avec son emoji. */
  _heroBg(r) {
    const img = safeUrl(r.image);
    if (img) return `background-image:url('${esc(img).replace(/'/g, "%27")}')`;
    const hue = hashHue(r.title || "recette");
    return `background-image:linear-gradient(135deg,hsl(${hue} 65% 52%),hsl(${(hue + 40) % 360} 70% 38%));--hero-emoji:'${emojiFor(r.title || "")}'`;
  }

  _tplEditor(top) {
    const d = top.draft;
    const badge =
      top.imported === "photo" ? "📖 Lue sur la photo · relisez les quantités" : d.origin === "jow" && top.imported ? "🥘 Importée de Jow · à vérifier" : top.imported ? "🔗 Importée · à vérifier" : "";
    const body = `
      <div class="rhero edit" id="editor-hero" style="${this._heroBg(d)}">
        <div class="hero-shade"></div>
        <button class="hero-photo" data-action="editor-image" aria-label="Changer la photo">${icon("image-edit-outline")}</button>
        <div class="hero-text">
          ${badge ? `<span class="hero-badge">${badge}</span>` : ""}
          <textarea class="hero-title" rows="1" data-model="top.draft.title" data-hero-title placeholder="Nom de la recette" aria-label="Nom de la recette">${esc(d.title)}</textarea>
          <input class="hero-desc" value="${esc(d.description)}" data-model="top.draft.description" placeholder="Une phrase qui donne envie…" aria-label="Description">
        </div>
      </div>
      <div class="hero-stats">
        <label><span>👥 Portions</span><input type="number" min="1" inputmode="numeric" value="${esc(d.servings)}" data-model="top.draft.servings"></label>
        <label><span>🔪 Prépa</span><input type="number" min="0" inputmode="numeric" value="${esc(d.prep_time)}" data-model="top.draft.prep_time" placeholder="–"><em>min</em></label>
        <label><span>🔥 Cuisson</span><input type="number" min="0" inputmode="numeric" value="${esc(d.cook_time)}" data-model="top.draft.cook_time" placeholder="–"><em>min</em></label>
      </div>
      <label class="field"><span>Ingrédients — un par ligne (ex. : 200 g de farine)</span><textarea class="input" rows="8" data-model="top.draft.ingredients">${esc(d.ingredients)}</textarea></label>
      <label class="field"><span>Étapes — une par ligne</span><textarea class="input" rows="10" data-model="top.draft.steps">${esc(d.steps)}</textarea></label>
      <label class="field"><span>Mots-clés, séparés par des virgules</span><input class="input" value="${esc(d.tags)}" data-model="top.draft.tags" placeholder="plat, végétarien, rapide"></label>
      <label class="field"><span>Adresse d'une photo (facultatif)</span><input class="input" id="editor-image" type="url" value="${esc(d.image)}" data-model="top.draft.image" placeholder="https://…"></label>
      <label class="field"><span>Source (facultatif)</span><input class="input" type="url" value="${esc(d.source_url)}" data-model="top.draft.source_url"></label>`;
    const footer = `<button class="btn grow big" data-action="save-editor">${icon("content-save-outline")} Enregistrer</button>`;
    return this._tplSheet(d.id ? "Modifier la recette" : "Nouvelle recette", body, footer);
  }

  _tplImport(top) {
    const tabs = `<div class="segmented" style="margin-bottom:14px">
        <button class="${top.mode === "jow" ? "on" : ""}" data-action="import-mode" data-value="jow">🥘 Jow</button>
        <button class="${top.mode === "url" ? "on" : ""}" data-action="import-mode" data-value="url">🔗 Un lien</button>
      </div>`;
    if (top.mode === "jow") {
      const jowBody = `${tabs}
        <div class="search">
          ${icon("magnify")}
          <input class="input" type="search" id="jow-query" placeholder="Chercher sur Jow (ex. : poulet curry, lasagnes…)" value="${esc(top.jowQuery)}" data-model="top.jowQuery" data-live="jow" enterkeyhint="search" autocomplete="off">
        </div>
        <p class="muted small" style="margin:-4px 0 10px">Les quantités sont adaptées à votre foyer (${this.defaultServings} pers.) et vous relisez la recette avant de l'enregistrer.</p>
        <div id="jow-results">${this._tplJowResults(top)}</div>`;
      return this._tplSheet("Importer une recette", jowBody);
    }
    const body = `${tabs}
      <p class="muted">Collez l'adresse d'une recette (Jow, Marmiton, 750g, Cuisine AZ, un blog…). Je récupère les ingrédients et les étapes.</p>
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
    const q = foldText(top.query).trim();
    const list = this.s.recipes
      .filter((r) => !q || foldText(r.title).includes(q) || (r.tags || []).some((t) => foldText(t).includes(q)))
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
        ${top.list_name ? "" : `<div class="alert">Aucune liste de courses disponible. Choisissez-en une dans ⚙️ Réglages du foyer.</div>`}
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
