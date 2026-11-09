/*
 * Frigo Malin — carte de tableau de bord « Ce soir on mange… ».
 * Ajout : Modifier le tableau de bord → Ajouter une carte → « Frigo Malin – Ce soir on mange ».
 * Elle lit le capteur sensor.frigo_malin_prochain_repas.
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
    name: "Frigo Malin par Adri – Ce soir on mange",
    description: "Le prochain repas du menu, avec sa photo et un bouton pour cuisiner.",
    preview: true,
  });
}
