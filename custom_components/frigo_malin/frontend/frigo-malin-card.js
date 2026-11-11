/*
 * Frigo Malin — cartes de tableau de bord.
 * Ajout : Modifier le tableau de bord → Ajouter une carte → chercher « Frigo Malin ».
 *
 *  • Plat du jour          frigo-malin-card           (le prochain repas, avec « Cuisiner »)
 *  • Ajout rapide          frigo-malin-quick-card     (champ + suggestions qui apprennent)
 *  • Courses               frigo-malin-shopping-card  (la liste, à cocher depuis le tableau de bord)
 *  • Menu de la semaine    frigo-malin-week-card
 *  • Calories              frigo-malin-stats-card     (macros jour par jour)
 *  • Mon frigo             frigo-malin-fridge-card    (à consommer vite)
 */

const FMC_EMOJIS = [
  [/pizza/, "🍕"], [/burger/, "🍔"], [/soupe|veloute|potage/, "🍲"], [/curry|tajine|couscous/, "🍛"],
  [/gateau|cake|fondant|moelleux/, "🍰"], [/tarte|quiche|tourte/, "🥧"], [/crepe|pancake|gaufre/, "🥞"],
  [/omelette|oeuf/, "🍳"], [/gratin|cocotte|mijote|ragout|bourguignon|blanquette|hachis/, "🥘"],
  [/salade/, "🥗"], [/risotto|\briz\b/, "🍚"], [/pate|spaghetti|lasagne|tagliatelle|penne/, "🍝"],
  [/poulet|dinde|canard/, "🍗"], [/boeuf|steak|veau|agneau|porc|tartare/, "🥩"], [/saumon|poisson|cabillaud|thon/, "🐟"],
  [/wrap|burrito|taco/, "🌮"], [/sushi|maki/, "🍣"], [/sandwich|croque/, "🥪"], [/nouille|ramen|pho/, "🍜"],
];

const fmcFold = (t) =>
  String(t || "").toLowerCase().replace(/œ/g, "oe").normalize("NFD").replace(/[̀-ͯ]/g, "");
const fmcEmoji = (title) => {
  const t = fmcFold(title);
  for (const [re, e] of FMC_EMOJIS) if (re.test(t)) return e;
  return "🍽️";
};
const fmcEsc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmcMinutes = (m) => (!m ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + String(m % 60).padStart(2, "0") : ""}`);

class FrigoMalinCard extends HTMLElement {
  static getStubConfig() {
    return { entity: "sensor.frigo_malin_prochain_repas" };
  }

  setConfig(config) {
    this._config = { entity: "sensor.frigo_malin_prochain_repas", ...(config || {}) };
    this._key = null;
    if (this._hass) this._render();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4, rows: 4, min_rows: 3 };
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    const key = st ? `${st.state}|${st.last_updated}` : "none";
    if (key !== this._key) {
      this._key = key;
      this._render();
    }
  }

  _navigate(url) {
    history.pushState(null, "", url);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const el = ev.composedPath().find((n) => n.dataset && n.dataset.url);
        if (el) this._navigate(el.dataset.url);
      });
    }
    const st = this._hass && this._hass.states[this._config.entity];
    const a = (st && st.attributes) || {};
    const title = this._config.title;
    let body;
    if (!st) {
      body = `<div class="empty">Frigo Malin n'est pas encore configuré.</div>`;
    } else if (!a.planned) {
      body = `
        <div class="hero none"><span class="emoji">🤔</span></div>
        <div class="content">
          <div class="label">${fmcEsc(title || "Ce soir on mange…")}</div>
          <div class="title">Rien de prévu pour l'instant</div>
          <div class="actions">
            <button class="primary" data-url="/frigo-malin?tab=fridge">📸 Une idée avec le frigo</button>
            <button data-url="/frigo-malin?tab=week">🗓️ Planifier</button>
          </div>
        </div>`;
    } else {
      const time = (a.prep_time || 0) + (a.cook_time || 0);
      const label = title || `${a.label || "Ce soir"} on mange…`;
      const image = a.image && /^(https?:\/\/|\/frigo_malin_static\/)/.test(a.image) ? a.image : "";
      body = `
        <div class="hero" ${image ? `style="background-image:url('${fmcEsc(image)}')"` : ""}>
          ${image ? "" : `<span class="emoji">${fmcEmoji(st.state)}</span>`}
        </div>
        <div class="content">
          <div class="label">${fmcEsc(label)}</div>
          <div class="title">${fmcEsc(st.state)}</div>
          ${a.description ? `<div class="desc">${fmcEsc(a.description)}</div>` : ""}
          <div class="meta">
            ${time ? `<span>⏱️ ${fmcMinutes(time)}</span>` : ""}
            ${a.servings ? `<span>👥 ${a.servings} pers.</span>` : ""}
          </div>
          ${a.note ? `<div class="note">♻️ ${fmcEsc(a.note)}</div>` : ""}
          <div class="actions">
            <button class="primary" data-url="${fmcEsc(a.url)}&cook=1">👩‍🍳 Cuisiner</button>
            <button data-url="${fmcEsc(a.url)}">Voir la recette</button>
          </div>
        </div>`;
    }
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { overflow: hidden; height: 100%; display: flex; flex-direction: column; }
        .hero {
          height: 140px; background: center / cover no-repeat,
            linear-gradient(135deg, color-mix(in srgb, #22b8a7 35%, transparent), color-mix(in srgb, #ffd166 35%, transparent));
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .hero.none { height: 100px; }
        .emoji { font-size: 64px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.2)); }
        .content { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .label { color: var(--secondary-text-color); font-size: 13px; text-transform: uppercase; letter-spacing: .05em; }
        .title { font-size: 22px; font-weight: 500; line-height: 1.25; color: var(--primary-text-color); }
        .desc { color: var(--secondary-text-color); font-size: 14px; }
        .meta { display: flex; gap: 14px; color: var(--secondary-text-color); font-size: 14px; }
        .note { font-size: 13px; color: var(--primary-color); }
        .actions { display: flex; gap: 8px; margin-top: auto; padding-top: 8px; flex-wrap: wrap; }
        button {
          font: inherit; font-weight: 500; font-size: 14px; border-radius: 20px; min-height: 40px; padding: 0 16px; cursor: pointer;
          border: 1px solid var(--divider-color); background: transparent; color: var(--primary-color);
        }
        button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: transparent; }
        .empty { padding: 16px; color: var(--secondary-text-color); }
      </style>
      <ha-card>${body}</ha-card>`;
  }
}

if (!customElements.get("frigo-malin-card")) {
  customElements.define("frigo-malin-card", FrigoMalinCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "frigo-malin-card",
    name: "Frigo Malin – Plat du jour",
    description: "Le prochain repas du menu, avec sa photo et un bouton pour cuisiner.",
    preview: true,
  });
}


/* ====================================================================== autres cartes */

const FMW_PANEL = "/frigo-malin";
const FMW_COLORS = { protein: "#e53935", fat: "#1e88e5", carbsLight: "#e08a00", carbsDark: "#f9a825" };
const FMW_CSS = `
  ha-card { overflow: hidden; height: 100%; box-sizing: border-box; }
  .wrap { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box; }
  .head { display: flex; align-items: center; gap: 8px; }
  .head h3 { margin: 0; flex: 1; font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
  .head .count { color: var(--secondary-text-color); font-size: 14px; }
  .muted { color: var(--secondary-text-color); font-size: 13px; }
  .link { border: 0; background: none; padding: 4px 2px; font: inherit; font-size: 13px; color: var(--primary-color); cursor: pointer; }
  button { font: inherit; cursor: pointer; }
  .btn { font-weight: 500; font-size: 14px; border-radius: 20px; min-height: 40px; padding: 0 16px; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-color); }
  .btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: transparent; }
  .row { display: flex; gap: 8px; align-items: center; }
  .field { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; height: 42px; padding: 0 4px 0 14px; border-radius: 21px; border: 1px solid var(--divider-color); background: var(--card-background-color); }
  .field input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: inherit; font-size: 15px; color: var(--primary-text-color); }
  .field button { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--primary-color); color: var(--text-primary-color, #fff); font-size: 20px; line-height: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { min-height: 34px; padding: 0 12px; border-radius: 17px; border: 1px dashed var(--divider-color); background: transparent; color: var(--primary-text-color); font-size: 14px; }
  .chip.due { border-style: solid; border-color: color-mix(in srgb, var(--primary-color) 55%, transparent); }
  .chip:active, .item:active { transform: scale(.97); }
  .flash { font-size: 13px; color: var(--primary-color); min-height: 18px; }
  .empty { padding: 8px 0; color: var(--secondary-text-color); text-align: center; }
  .item { display: flex; align-items: center; gap: 10px; padding: 7px 0; border: 0; border-top: 1px solid var(--divider-color); background: none; width: 100%; text-align: left; font: inherit; color: var(--primary-text-color); }
  .item:first-of-type { border-top: 0; }
  .tick { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--divider-color); background: none; padding: 0; }
  .tick.done { background: var(--primary-color); border-color: var(--primary-color); }
  .item .txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  .thumb { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; background: center / cover no-repeat color-mix(in srgb, var(--primary-color) 12%, transparent); display: flex; align-items: center; justify-content: center; font-size: 17px; }
`;

class FmWidget extends HTMLElement {
  setConfig(config) {
    this._config = { ...this.constructor.defaults, ...(config || {}) };
    this._data = null;
    this._lastLoad = 0;
    this._render();
    if (this._hass) this._load();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const key = this._watchKey();
    const stale = Date.now() - this._lastLoad > 5 * 60 * 1000;
    if (first || key !== this._key || (stale && !document.hidden)) {
      this._key = key;
      this._load();
    }
    const dark = !!(hass.themes && hass.themes.darkMode);
    if (dark !== this._dark) {
      this._dark = dark;
      this._render();
    }
  }

  connectedCallback() {
    this._onVisible = () => {
      if (!document.hidden && this._hass && Date.now() - this._lastLoad > 30000) this._load();
    };
    document.addEventListener("visibilitychange", this._onVisible);
  }

  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this._onVisible);
  }

  getCardSize() {
    return 3;
  }

  _watchKey() {
    return "";
  }

  async _ws(type, payload = {}) {
    return this._hass.callWS({ type: `frigo_malin/${type}`, ...payload });
  }

  async _load() {
    this._lastLoad = Date.now();
    try {
      this._data = await this._fetch();
      this._error = null;
    } catch (err) {
      this._error = (err && err.message) || "indisponible";
    }
    this._render();
  }

  _navigate(url) {
    history.pushState(null, "", url);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _shell(inner) {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const el = ev.composedPath().find((n) => n.dataset && (n.dataset.url || n.dataset.act));
        if (!el) return;
        if (el.dataset.url) this._navigate(el.dataset.url);
        else this._act(el.dataset.act, el.dataset);
      });
      this.shadowRoot.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && ev.target && ev.target.dataset && ev.target.dataset.enter) this._act(ev.target.dataset.enter, ev.target.dataset);
      });
    }
    // Un champ en cours de saisie ne doit pas être redessiné : on ne met à jour que la zone sous le champ.
    const dyn = this.shadowRoot.getElementById("dyn");
    if (dyn && this.shadowRoot.querySelector("input:focus")) {
      const tmp = document.createElement("div");
      tmp.innerHTML = inner;
      const fresh = tmp.querySelector("#dyn");
      if (fresh) dyn.innerHTML = fresh.innerHTML;
      return;
    }
    this.shadowRoot.innerHTML = `<style>${FMW_CSS}${this.constructor.css || ""}</style><ha-card>${inner}</ha-card>`;
  }

  _title(def, extra = "") {
    return `<div class="head"><h3>${fmcEsc(this._config.title || def)}</h3>${extra}</div>`;
  }

  _err() {
    return this._error ? `<div class="empty">Frigo Malin est injoignable (${fmcEsc(this._error)}).</div>` : "";
  }

  _addField(placeholder) {
    return `<div class="field"><input id="add" placeholder="${fmcEsc(placeholder)}" data-enter="add" enterkeyhint="send" autocomplete="off" aria-label="${fmcEsc(placeholder)}"><button data-act="add" aria-label="Ajouter">+</button></div>`;
  }

  async _add(texts, quick) {
    const items = texts.map((t) => String(t).trim()).filter(Boolean);
    if (!items.length) return;
    try {
      const res = await this._ws("shopping/add", { items, quick });
      const n = res.added || 0;
      this._flash = n ? `✓ ${items.join(", ")} ajouté${n > 1 ? "s" : ""} à ${res.list_name || "la liste"}` : "Déjà dans la liste";
    } catch (err) {
      this._flash = `⚠️ ${(err && err.message) || "Ajout impossible"}`;
    }
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this._flash = "";
      this._render();
    }, 3500);
  }
}

/* ---------- Ajout rapide */
class FrigoMalinQuickCard extends FmWidget {
  static defaults = { limit: 8 };
  static getStubConfig() {
    return {};
  }
  getGridOptions() {
    return { columns: 6, min_columns: 4, rows: 3, min_rows: 2 };
  }
  async _fetch() {
    const res = await this._ws("shopping/suggestions", { limit: Number(this._config.limit) || 8 });
    return res.suggestions;
  }
  async _act(act, d) {
    if (act === "add") {
      const input = this.shadowRoot.getElementById("add");
      const text = input ? input.value : "";
      if (input) input.value = "";
      await this._add([text], true);
    } else if (act === "chip") {
      this._data = (this._data || []).filter((x) => x.name !== d.name);
      await this._add([d.name], true);
    }
    this._render();
    setTimeout(() => this._load(), 1200);
  }
  _render() {
    const list = this._data || [];
    this._shell(`<div class="wrap">
      ${this._title("Ajout rapide")}
      ${this._addField("Ex. : 2 kg de pommes, lait")}
      <div id="dyn">
      <div class="flash">${fmcEsc(this._flash || "")}</div>
      ${this._error ? this._err() : this._data == null ? `<div class="muted">Chargement…</div>` : list.length
        ? `<div class="chips">${list.map((x) => `<button class="chip ${x.due ? "due" : ""}" data-act="chip" data-name="${fmcEsc(x.name)}" ${x.reason ? `title="${fmcEsc(x.reason)}"` : ""}>${fmcEsc(x.name)}${x.due ? " 🔁" : ""}</button>`).join("")}</div>`
        : `<div class="muted">Vos articles habituels apparaîtront ici.</div>`}
      </div>
    </div>`);
  }
}

/* ---------- Courses */
class FrigoMalinShoppingCard extends FmWidget {
  static defaults = { max_items: 8, show_add: true };
  static getStubConfig() {
    return {};
  }
  getCardSize() {
    return 4;
  }
  getGridOptions() {
    return { columns: 6, min_columns: 4, rows: 5, min_rows: 3 };
  }
  _watchKey() {
    const e = this._entity && this._hass.states[this._entity];
    return e ? `${e.state}|${e.last_updated}` : "none";
  }
  async _fetch() {
    if (!this._entity) {
      const cfg = await this._ws("config");
      this._entity = (cfg.shopping_list && cfg.shopping_list.entity_id) || null;
      this._listName = cfg.shopping_list && cfg.shopping_list.name;
      this._key = this._watchKey();
    }
    if (!this._entity) return [];
    const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._entity });
    return (res.items || []).filter((i) => i.status === "needs_action");
  }
  async _act(act, d) {
    if (act === "add") {
      const input = this.shadowRoot.getElementById("add");
      const text = input ? input.value : "";
      if (input) input.value = "";
      await this._add([text], false);
    } else if (act === "tick") {
      this._data = (this._data || []).filter((i) => i.uid !== d.uid);
      this._render();
      try {
        await this._hass.callService("todo", "update_item", { item: d.uid, status: "completed" }, { entity_id: this._entity });
      } catch (_) {
        /* rechargé ci-dessous */
      }
    }
    this._render();
    setTimeout(() => this._load(), 600);
  }
  _render() {
    const items = this._data || [];
    const max = Number(this._config.max_items) || 8;
    const shown = items.slice(0, max);
    const rest = items.length - shown.length;
    this._shell(`<div class="wrap">
      ${this._title("Courses", `<span class="count">${this._data ? items.length : ""}</span>${items.length ? `<button class="link" data-url="${FMW_PANEL}?tab=shopping&mode=store">🏪 Mode magasin</button>` : ""}`)}
      ${this._config.show_add ? this._addField("Ajouter un article…") : ""}
      <div id="dyn">
      <div class="flash">${fmcEsc(this._flash || "")}</div>
      ${this._error ? this._err() : this._data == null ? `<div class="muted">Chargement…</div>` : !this._entity
        ? `<div class="empty">Aucune liste de courses configurée.</div>`
        : shown.length
        ? `<div>${shown.map((i) => `<div class="item"><button class="tick" data-act="tick" data-uid="${fmcEsc(i.uid)}" aria-label="Dans le panier : ${fmcEsc(i.summary)}"></button><span class="txt">${fmcEsc(i.summary)}</span></div>`).join("")}</div>
          ${rest > 0 ? `<button class="link" data-url="${FMW_PANEL}?tab=shopping">+ ${rest} autre${rest > 1 ? "s" : ""}…</button>` : ""}`
        : `<div class="empty">🛒 La liste est vide.</div>`}
      </div>
    </div>`);
  }
}

/* ---------- Menu de la semaine */
class FrigoMalinWeekCard extends FmWidget {
  static defaults = { days: 7 };
  static getStubConfig() {
    return {};
  }
  static css = `
    .day { display: grid; grid-template-columns: 58px 1fr; gap: 8px; align-items: start; padding: 8px 0; border-top: 1px solid var(--divider-color); }
    .day:first-of-type { border-top: 0; }
    .day.today .when b { color: var(--primary-color); }
    .when { font-size: 13px; color: var(--secondary-text-color); line-height: 1.25; }
    .when b { display: block; font-size: 15px; color: var(--primary-text-color); font-weight: 500; }
    .meals { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .meal { display: flex; align-items: center; gap: 8px; border: 0; background: none; padding: 0; text-align: left; color: var(--primary-text-color); min-width: 0; }
    .meal .thumb { width: 30px; height: 30px; font-size: 15px; border-radius: 8px; }
    .meal .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
    .meal .s { font-size: 11px; color: var(--secondary-text-color); width: 28px; }
    .none { color: var(--secondary-text-color); font-size: 13px; }
  `;
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 7, min_rows: 4 };
  }
  async _fetch() {
    return (await this._ws("widget/week", { days: Number(this._config.days) || 7 })).days;
  }
  _render() {
    const today = new Date().toISOString().slice(0, 10);
    const label = (iso) => {
      const d = new Date(iso + "T12:00:00");
      const delta = Math.round((d - new Date(today + "T12:00:00")) / 864e5);
      return [delta === 0 ? "Auj." : delta === 1 ? "Demain" : d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""), d.getDate()];
    };
    const days = this._data || [];
    const any = days.some((d) => d.meals.length);
    this._shell(`<div class="wrap">
      ${this._title("Au menu", `<button class="link" data-url="${FMW_PANEL}?tab=week">Planifier</button>`)}
      ${this._error ? this._err() : this._data == null ? `<div class="muted">Chargement…</div>` : !any
        ? `<div class="empty">🤔 Rien de prévu.<br><button class="btn primary" style="margin-top:8px" data-url="${FMW_PANEL}?tab=week">🗓️ Planifier la semaine</button></div>`
        : days.map((d) => {
            const [w, n] = label(d.date);
            return `<div class="day ${d.date === today ? "today" : ""}"><div class="when"><b>${fmcEsc(w)}</b>${n}</div><div class="meals">${d.meals.length
              ? d.meals.map((m) => `<button class="meal" data-url="${fmcEsc(m.url)}"><span class="s">${m.slot === "lunch" ? "Midi" : "Soir"}</span><span class="thumb" ${m.image && /^(https?:\/\/|\/frigo_malin_static\/)/.test(m.image) ? `style="background-image:url('${fmcEsc(m.image)}')"` : ""}>${m.image ? "" : fmcEmoji(m.title)}</span><span class="t">${fmcEsc(m.title)}</span></button>`).join("")
              : `<span class="none">—</span>`}</div></div>`;
          }).join("")}
    </div>`);
  }
}

/* ---------- Calories de la semaine */
class FrigoMalinStatsCard extends FmWidget {
  static defaults = { period: "week" };
  static getStubConfig() {
    return { period: "week" };
  }
  static css = `
    .chart { display: flex; align-items: flex-end; gap: 6px; height: 110px; padding-bottom: 18px; position: relative; border-bottom: 1px solid var(--divider-color); }
    .month .chart, .chart.many { gap: 2px; }
    .col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; position: relative; }
    .bar { width: 100%; max-width: 28px; display: flex; flex-direction: column; gap: 2px; border-radius: 4px 4px 0 0; overflow: hidden; }
    .bar.planned { opacity: .38; }
    .bar i { display: block; flex-basis: 0; }
    .x { position: absolute; bottom: -18px; font-size: 11px; color: var(--secondary-text-color); white-space: nowrap; }
    .col.today .x { color: var(--primary-color); font-weight: 700; }
    .avg { position: absolute; left: 0; right: 0; border-top: 1.5px dashed var(--secondary-text-color); pointer-events: none; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--primary-text-color); }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; }
    .big { font-size: 22px; font-weight: 500; color: var(--primary-text-color); }
  `;
  getCardSize() {
    return 4;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 4, min_rows: 3 };
  }
  async _fetch() {
    return this._ws("stats/meals", { period: this._config.period });
  }
  _render() {
    const d = this._data;
    const carbs = this._dark ? FMW_COLORS.carbsDark : FMW_COLORS.carbsLight;
    const col = { protein: FMW_COLORS.protein, carbs, fat: FMW_COLORS.fat };
    let body;
    if (this._error) body = this._err();
    else if (!d) body = `<div class="muted">Chargement…</div>`;
    else if (!d.bars.some((b) => b.state !== "empty")) body = `<div class="empty">📊 Planifiez vos repas pour voir les calories.<br><button class="btn primary" style="margin-top:8px" data-url="${FMW_PANEL}?tab=week">🗓️ Planifier</button></div>`;
    else {
      const kcalOf = (b) => b.protein * 4 + b.carbs * 4 + b.fat * 9 || 1;
      const max = Math.max(1, ...d.bars.map((b) => b.kcal));
      const many = d.bars.length > 12;
      const a = d.average;
      body = `<div><span class="big">${a.kcal.toLocaleString("fr-FR")}</span> <span class="muted">kcal / jour en moyenne · par personne</span></div>
        <div class="chart ${many ? "many" : ""}">
          ${a.kcal ? `<div class="avg" style="bottom:calc(18px + (100% - 18px) * ${a.kcal / max})"></div>` : ""}
          ${d.bars.map((b, i) => {
            const h = b.state === "empty" ? 0 : Math.max(3, (b.kcal / max) * 100);
            const seg = ["fat", "carbs", "protein"].map((k) => `<i style="flex-grow:${Math.max(0.001, (b[k] * (k === "fat" ? 9 : 4)) / kcalOf(b))};background:${col[k]}"></i>`).join("");
            const showX = !many || i % 5 === 0 || b.today;
            return `<div class="col ${b.today ? "today" : ""}" title="${fmcEsc(`${b.label} : ${b.kcal} kcal`)}"><div class="bar ${b.state}" style="height:calc((100% - 18px) * ${h / 100})">${b.state === "empty" ? "" : seg}</div><span class="x">${showX ? fmcEsc(b.short) : ""}</span></div>`;
          }).join("")}
        </div>
        <div class="legend"><span><span class="dot" style="background:${col.protein}"></span>P ${a.protein} g</span><span><span class="dot" style="background:${col.carbs}"></span>G ${a.carbs} g</span><span><span class="dot" style="background:${col.fat}"></span>L ${a.fat} g</span><span class="muted">${d.bars.some((b) => b.state === "planned") ? "· prévu en clair" : ""}</span></div>`;
    }
    const names = { week: "cette semaine", month: "30 derniers jours", year: "12 derniers mois" };
    this._shell(`<div class="wrap">
      ${this._title("Calories", `<span class="count">${fmcEsc(names[this._config.period] || "")}</span>`)}
      ${body}
    </div>`);
  }
}

/* ---------- Mon frigo */
class FrigoMalinFridgeCard extends FmWidget {
  static defaults = { urgent_days: 2 };
  static getStubConfig() {
    return {};
  }
  static css = `
    .big { font-size: 32px; font-weight: 600; line-height: 1.1; color: var(--primary-text-color); }
    .big small { font-size: 14px; font-weight: 400; color: var(--secondary-text-color); margin-left: 6px; }
    .alert { padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--warning-color, #ffa600) 16%, transparent); font-size: 14px; color: var(--primary-text-color); }
    .alert ul { list-style: none; margin: 4px 0 0; padding: 0; }
    .alert li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
    .alert li span:last-child { color: var(--secondary-text-color); white-space: nowrap; }
  `;
  getGridOptions() {
    return { columns: 6, min_columns: 4, rows: 3, min_rows: 2 };
  }
  async _fetch() {
    return this._ws("fridge/memory");
  }
  _render() {
    const d = this._data;
    const today = new Date(new Date().toISOString().slice(0, 10) + "T12:00:00");
    const left = (iso) => Math.round((new Date(iso + "T12:00:00") - today) / 864e5);
    let body;
    if (this._error) body = this._err();
    else if (!d) body = `<div class="muted">Chargement…</div>`;
    else if (!d.items.length) body = `<div class="empty">🧊 Prenez votre frigo en photo : je vous dis quoi cuisiner.</div>`;
    else {
      const urgent = d.items.filter((i) => i.expires && left(i.expires) <= (Number(this._config.urgent_days) || 2)).sort((a, b) => left(a.expires) - left(b.expires));
      body = `<div class="big">${d.items.length}<small>aliment${d.items.length > 1 ? "s" : ""}</small></div>
        ${urgent.length
          ? `<div class="alert">⚠️ À consommer vite<ul>${urgent.slice(0, 4).map((i) => { const n = left(i.expires); return `<li><span>${fmcEsc(i.name)}</span><span>${n < 0 ? "périmé" : n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `${n} j`}</span></li>`; }).join("")}</ul></div>`
          : `<div class="muted">✅ Rien ne presse</div>`}`;
    }
    this._shell(`<div class="wrap">
      ${this._title("Mon frigo")}
      ${body}
      <div class="row" style="margin-top:auto">
        <button class="btn primary" data-url="${FMW_PANEL}?tab=fridge">📸 Photo</button>
        ${d && d.items.length ? `<button class="btn" data-url="${FMW_PANEL}?tab=fridge">💡 Des idées</button>` : ""}
      </div>
    </div>`);
  }
}

for (const [tag, cls, name, description] of [
  ["frigo-malin-quick-card", FrigoMalinQuickCard, "Frigo Malin – Ajout rapide", "Un champ et vos articles habituels pour remplir la liste de courses en un geste."],
  ["frigo-malin-shopping-card", FrigoMalinShoppingCard, "Frigo Malin – Courses", "La liste de courses à cocher, avec un raccourci vers le mode magasin."],
  ["frigo-malin-week-card", FrigoMalinWeekCard, "Frigo Malin – Menu de la semaine", "Les repas des prochains jours, midi et soir."],
  ["frigo-malin-stats-card", FrigoMalinStatsCard, "Frigo Malin – Calories", "Calories et macronutriments jour par jour (semaine, 30 jours ou 12 mois)."],
  ["frigo-malin-fridge-card", FrigoMalinFridgeCard, "Frigo Malin – Mon frigo", "Le contenu du frigo et ce qu'il faut consommer vite."],
]) {
  if (customElements.get(tag)) continue;
  customElements.define(tag, cls);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: tag, name, description, preview: true });
}
