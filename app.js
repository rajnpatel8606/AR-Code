/**
 * AR Food Viewer — app.js
 *
 * Single-file, pure-JS application logic split into 7 clear modules.
 * No frameworks. No build step. Runs directly in the browser.
 *
 * Module map:
 *   1. RESTAURANT REGISTRY   — unified brand + model config
 *   2. ANALYTICS TRACKER     — V3.1 sessionStorage event system
 *   3. THEME ENGINE          — CSS variable theming + branding DOM
 *   4. MODEL NORMALIZATION   — removed; baked into GLBs by AR-3D-Pipeline
 *   5. MODEL LOADER          — V2.4 stale-load guard, load/error/progress
 *   6. CAROUSEL CONTROLLER   — V3.2 thumbnail cards, selection state
 *   7. AR SESSION MANAGER    — AR scale apply/restore + ar-status events
 *   8. INIT                  — single boot function
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 1 — RESTAURANT REGISTRY
   ══════════════════════════════════════════════════════════════════════════════
   Single source of truth for all restaurant brands.
   Each brand entry supports:
     name          — display name
     logo          — URL string (empty = no logo)
     primary       — main brand accent colour (used for --primary CSS var)
     primaryDark   — darker shade for hover states
     bg            — page background colour
     surface       — card / viewer background colour
     targetHeight  — brand-wide AR height default in metres (per-model can override)
     models[]      — list of 3D models for this restaurant's carousel
       .label        — display label on carousel card
       .file         — GLB filename (resolved relative to index.html)
       .targetHeight — (optional) per-model height override in metres
       .targetWidth  — (optional) per-model width override in metres
       .orientation  — (optional) manual Euler override, e.g. "0deg 0deg 0deg"

   URL parameters:
     ?brand=X  — select a restaurant (alias: ?r=X for backward-compatibility)
     ?model=X  — pre-select a specific model by file name or label
   ══════════════════════════════════════════════════════════════════════════════ */

const RESTAURANTS = {

  default: {
    name:         'AR Food Viewer',
    logo:         '',
    primary:      '#b5451b',   // warm terracotta
    primaryDark:  '#8f3614',   // darker for hover/glow
    bg:           '#faf7f2',   // warm cream page background
    surface:      '#ffffff',   // white card/panel surfaces
    targetHeight: 0.20,          // 20 cm brand-wide default
    models: [
      { label: 'Food',    file: 'assets/food.glb'    , targetHeight: 0.20  }, // 20 cm                           },
      { label: 'Cold Coffee',  file: 'assets/Cold Cofee.glb',     targetHeight: 0.12  },
      { label: 'Samosa Plate',  file: 'assets/Samosa Plate LA.glb', targetHeight: 0.12  },
      { label: 'Orange',  file: 'assets/Orange.glb',       targetHeight: 0.042          }, // 4 cm
      { label: 'Chicken',     file: 'assets/Chicken.glb',    targetHeight: 0.30  }, // 30 cm
      { label: 'Cheese Balls', file: 'assets/Cheese Balls 2.glb',  targetHeight: 0.07  }  //  7 cm
    ]
  },

  tajmahal: {
    name:         'Taj Mahal Restaurant',
    logo:         'assets/logos/tajmahal.png',
    primary:      '#d4a843',
    primaryDark:  '#b8922f',
    bg:           '#0d0d0d',
    surface:      '#1c1a17',
    targetHeight: 0.20,
    models: [
      // Add models here as GLB files become available
      // { label: 'Biryani', file: 'biryani.glb', targetHeight: 0.18 }
    ]
  },

  sakura: {
    name:         'Sakura Sushi',
    logo:         'assets/logos/sakura.png',
    primary:      '#e74c6f',
    primaryDark:  '#c93a5a',
    bg:           '#0e0c0d',
    surface:      '#1c1719',
    targetHeight: 0.15,
    models: []
  },

  greenleaf: {
    name:         'Green Leaf Bistro',
    logo:         'assets/logos/greenleaf.png',
    primary:      '#4caf50',
    primaryDark:  '#388e3c',
    bg:           '#0b0e0b',
    surface:      '#161c16',
    targetHeight: 0.18,
    models: []
  },

  pizzanova: {
    name:         'Pizza Nova',
    logo:         'assets/logos/pizzanova.png',
    primary:      '#e53935',
    primaryDark:  '#c62828',
    bg:           '#0e0c0c',
    surface:      '#1c1616',
    targetHeight: 0.30,
    models: []
  },

  bluefin: {
    name:         'Blue Fin Seafood',
    logo:         'assets/logos/bluefin.png',
    primary:      '#2196f3',
    primaryDark:  '#1976d2',
    bg:           '#0c0d0e',
    surface:      '#161a1e',
    targetHeight: 0.22,
    models: []
  }

};

/** File to load if a model errors and no better fallback exists */
const FALLBACK_MODEL = 'assets/food.glb';

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 2 — ANALYTICS TRACKER  (V3.1)
   ══════════════════════════════════════════════════════════════════════════════
   Lightweight, sessionStorage-backed event log.
   Events: model_view · model_load · ar_start · ar_place · ar_end · ar_fail

   DevTools access:  _arAnalytics.getReport()
                     _arAnalytics.clear()
   ══════════════════════════════════════════════════════════════════════════════ */

const AnalyticsTracker = (() => {
  const SESSION_KEY  = 'ar_analytics_events';
  const sessionStart = Date.now();
  let arSessionStart = null;

  let events = [];
  try { events = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch (_) {}

  function save() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(events)); } catch (_) {}
  }

  function track(type, data = {}) {
    const entry = { type, ts: Date.now(), ...data };
    events.push(entry);
    save();
    console.log(`[V3.1] ${type}`, entry);
  }

  return {
    modelView(model)                           { track('model_view',  { model }); },
    modelLoad(model, dims, scale, durationMs)  { track('model_load',  { model, dims, scale, durationMs }); },
    arStart(model)  { arSessionStart = Date.now(); track('ar_start', { model }); },
    arPlace(model)  { track('ar_place', { model }); },
    arEnd(model)    {
      const dur = arSessionStart ? Date.now() - arSessionStart : null;
      arSessionStart = null;
      track('ar_end', { model, durationMs: dur });
    },
    arFail(model)   { track('ar_fail',  { model }); },

    getReport() {
      const views    = events.filter(e => e.type === 'model_view');
      const arStarts = events.filter(e => e.type === 'ar_start');
      const arEnds   = events.filter(e => e.type === 'ar_end');
      const avgArDur = arEnds.length
        ? Math.round(arEnds.reduce((s, e) => s + (e.durationMs || 0), 0) / arEnds.length)
        : 0;
      const report = {
        sessionDurationMs: Date.now() - sessionStart,
        totalModelViews:   views.length,
        arActivations:     arStarts.length,
        avgArDurationMs:   avgArDur,
        modelViewCounts:   views.reduce((acc, e) => {
          acc[e.model] = (acc[e.model] || 0) + 1;
          return acc;
        }, {}),
        allEvents: events
      };
      console.table(report.modelViewCounts);
      return report;
    },

    clear() {
      events = [];
      sessionStorage.removeItem(SESSION_KEY);
      console.log('[V3.1] Analytics cleared.');
    }
  };
})();

window._arAnalytics = AnalyticsTracker; // expose to DevTools

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 3 — THEME ENGINE
   ══════════════════════════════════════════════════════════════════════════════
   Applies restaurant brand config to:
     • CSS custom properties on :root (colours, bg, surface)
     • <title> + #brand-name text
     • #brand-logo src + visibility
   ══════════════════════════════════════════════════════════════════════════════ */

const ThemeEngine = {

  /** Apply full brand config — CSS vars + DOM branding */
  apply(cfg) {
    const root = document.documentElement;

    // Colour tokens
    root.style.setProperty('--primary',      cfg.primary);
    root.style.setProperty('--primary-dark', cfg.primaryDark);
    root.style.setProperty('--bg',           cfg.bg);
    root.style.setProperty('--surface',      cfg.surface);

    // Page title + header name
    document.title                          = cfg.name;
    document.querySelector('#brand-name').textContent = cfg.name;

    // Logo
    const logo = document.querySelector('#brand-logo');
    if (cfg.logo) {
      logo.src              = cfg.logo;
      logo.style.display    = 'block';
      logo.onerror          = () => {
        logo.style.display  = 'none'; // hide if logo file missing
        logo.onerror        = null;
      };
    } else {
      logo.style.display    = 'none';
    }
  }

};

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 4 — MODEL NORMALIZATION  (removed — handled by pipeline)
   ══════════════════════════════════════════════════════════════════════════════
   Orientation correction and AR scale are now baked into every GLB by the
   AR-3D-Pipeline (server/normalize.js) before assets reach this viewer.
   The viewer loads models as-is — no runtime transforms needed.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 5 — MODEL LOADER
   ══════════════════════════════════════════════════════════════════════════════
   Manages model switching, the load / error / progress event pipeline,
   and bridges into Normalization, Analytics, and Carousel modules.

   Key mechanisms:
     • V2.4 stale-load guard: currentLoadId increments on every switchModel().
       The load handler ignores events from previous (cancelled) switches.
     • Models are pre-normalized by pipeline — no bounding box reads needed.
     • V3.2 thumbnail capture: toDataURL() at 150 ms after load.
   ══════════════════════════════════════════════════════════════════════════════ */

const ModelLoader = {

  activeEntry:     null,   // full registry object for the currently displayed model
  currentLoadId:   0,      // V2.4: incremented on each switchModel call
  switchStartTime: 0,      // V3.1: used to measure load duration in ms

  // References set during init()
  _mv:     null,
  _config: null,

  /**
   * Switch to a new model.
   * Accepts a full entry object (normal case) or a file string (fallback / init).
   */
  switchModel(btn, entryOrFile) {
    const config = this._config;
    const entry  = (typeof entryOrFile === 'string')
      ? config.models.find(m => m.file === entryOrFile) || { file: entryOrFile }
      : entryOrFile;

    this.activeEntry      = entry;
    this.currentLoadId++;                          // V2.4: invalidate in-flight loads
    this._mv._expectedLoadId = this.currentLoadId;
    AnalyticsTracker.modelView(entry.file);        // V3.1

    // UI state
    document.querySelector('#error-banner').style.display = 'none';
    document.querySelector('#loading').style.display      = 'block';
    document.querySelector('#progress-bar').style.width   = '0%';
    CarouselController.setDisabled(true);
    if (btn) CarouselController.setSelected(btn);

    // Reset model-viewer state for clean load
    this._mv.scale = '1 1 1';
    this._mv.removeAttribute('camera-orbit'); // let model-viewer auto-frame

    this.switchStartTime = Date.now();        // V3.1: start load timer
    this._mv.src = entry.file;
  },

  /** model-viewer 'load' event handler */
  _onLoad() {
    const mv = this._mv;

    // V2.4: stale-load guard
    if (mv._expectedLoadId !== this.currentLoadId) {
      console.log('[V2.4] Stale load event ignored.');
      return;
    }

    // V3.1: log load completion (models are pre-normalized by pipeline)
    AnalyticsTracker.modelLoad(
      this.activeEntry?.file, null, null,
      Date.now() - this.switchStartTime
    );

    // V1 UI updates
    document.querySelector('#loading').style.display    = 'none';
    document.querySelector('#progress-bar').style.width = '100%';
    CarouselController.setDisabled(false);
    setTimeout(() => {
      document.querySelector('#progress-bar').style.width = '0%';
    }, 400);

    // V3.2: auto-capture thumbnail from canvas at 150 ms
    const captureEntry = this.activeEntry;
    const captureConfig = this._config;
    setTimeout(() => {
      if (!captureEntry) return;
      try {
        const dataUrl = mv.toDataURL('image/jpeg', 0.6);
        const idx = captureConfig.models.indexOf(captureEntry);
        if (idx >= 0 && CarouselController.buttons[idx]) {
          const img = CarouselController.buttons[idx].querySelector('.slide-thumb');
          if (img) img.src = dataUrl;
        }
        try { sessionStorage.setItem(`ar_thumb_${captureEntry.file}`, dataUrl); } catch (_) {}
        console.log(`[V3.2] Thumbnail captured: ${captureEntry.file}`);
      } catch (e) {
        console.log('[V3.2] toDataURL skipped:', e.message);
      }
    }, 150);
  },

  /** model-viewer 'error' event handler */
  _onError() {
    document.querySelector('#error-banner').style.display = 'block';
    document.querySelector('#loading').style.display      = 'none';
    CarouselController.setDisabled(false);

    // Fallback to default model if not already showing it
    if (this._mv.src !== FALLBACK_MODEL) {
      this._mv.src = FALLBACK_MODEL;
      const fallbackEntry = this._config.models.find(m => m.file === FALLBACK_MODEL);
      if (fallbackEntry) {
        const idx = this._config.models.indexOf(fallbackEntry);
        if (CarouselController.buttons[idx]) {
          CarouselController.setSelected(CarouselController.buttons[idx]);
        }
      }
    }
  },

  /** model-viewer 'progress' event handler */
  _onProgress(e) {
    const pct = e.detail.totalProgress * 100;
    document.querySelector('#progress-bar').style.width = pct + '%';
  },

  /** Attach all event listeners. Call once during init(). */
  init(mv, config) {
    this._mv     = mv;
    this._config = config;

    mv.addEventListener('load',     () => this._onLoad());
    mv.addEventListener('error',    () => this._onError());
    mv.addEventListener('progress', (e) => this._onProgress(e));
  }

};

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 6 — CAROUSEL CONTROLLER  (V3.2)
   ══════════════════════════════════════════════════════════════════════════════
   Builds the model-selector carousel from the restaurant config.
   Each card has:
     • A thumbnail <img>  — auto-captured after load; pre-filled from sessionStorage
     • A placeholder icon — shown while thumbnail is not yet available
     • A text label       — from model entry .label
   ══════════════════════════════════════════════════════════════════════════════ */

const CarouselController = {

  buttons: [],

  /**
   * Build (or rebuild) carousel from config.models.
   * @param {object} cfg  Restaurant config object
   */
  build(cfg) {
    const carousel = document.querySelector('#carousel');
    carousel.innerHTML = '';
    this.buttons = [];

    cfg.models.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'slide';

      // Thumbnail — pre-fill from sessionStorage if captured this session
      const img = document.createElement('img');
      img.className = 'slide-thumb';
      img.alt = item.label;
      const cached = sessionStorage.getItem(`ar_thumb_${item.file}`);
      img.src = cached || '';

      // Placeholder cube icon shown until thumbnail is available
      const placeholder = document.createElement('div');
      placeholder.className = 'slide-thumb-placeholder';
      placeholder.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"
                stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
          <line x1="12" y1="3"   x2="12" y2="21" stroke="white" stroke-width="1.5"/>
          <line x1="4"  y1="7.5" x2="20" y2="7.5" stroke="white" stroke-width="1.5"/>
        </svg>`;

      const label = document.createElement('span');
      label.textContent = item.label;

      btn.appendChild(img);
      btn.appendChild(placeholder);
      btn.appendChild(label);
      btn.addEventListener('click', () => ModelLoader.switchModel(btn, item));

      carousel.appendChild(btn);
      this.buttons.push(btn);
    });
  },

  /** Mark one button as selected; clear all others */
  setSelected(btn) {
    this.buttons.forEach(b => b.classList.remove('selected'));
    if (btn) btn.classList.add('selected');
  },

  /** Enable / disable all carousel buttons (during model load) */
  setDisabled(state) {
    this.buttons.forEach(b => { b.disabled = state; });
  }

};

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 7 — AR SESSION MANAGER
   ══════════════════════════════════════════════════════════════════════════════
   Manages the lifecycle of AR sessions:
     • Applies the pre-computed physical AR scale when the AR button is tapped
     • Restores native viewer scale (1 1 1) when the user exits AR
     • Routes ar-status events into the analytics tracker
     • Prevents the carousel from accidentally triggering AR on touch devices
   ══════════════════════════════════════════════════════════════════════════════ */

const ARSessionManager = {

  /** Attach all AR-related event listeners. Call once during init(). */
  init(mv) {

    // ar-status: route analytics events
    // Scale is baked into GLBs by the pipeline — no runtime scale needed.
    mv.addEventListener('ar-status', (e) => {
      const model  = ModelLoader.activeEntry?.file || 'unknown';
      const status = e.detail.status;

      // V3.1 analytics routing
      switch (status) {
        case 'session-started': AnalyticsTracker.arStart(model); break;
        case 'object-placed':   AnalyticsTracker.arPlace(model); break;
        case 'not-presenting':  AnalyticsTracker.arEnd(model);   break;
        case 'failed':          AnalyticsTracker.arFail(model);  break;
      }
    });

    // Prevent carousel touch events from triggering WebXR select
    document.querySelector('.slider').addEventListener('beforexrselect', (ev) => {
      ev.preventDefault();
    });
  }

};

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Parse URL parameters.
 * @returns {{ brandId: string, initModel: string|null }}
 */
function parseURL() {
  const params   = new URLSearchParams(location.search);
  const brandId  = params.get('brand') || params.get('r') || 'default'; // ?r= alias
  const initModel = params.get('model') || null;
  return { brandId: brandId.toLowerCase().trim(), initModel };
}

/* ══════════════════════════════════════════════════════════════════════════════
   INIT — single boot function
   ══════════════════════════════════════════════════════════════════════════════
   Startup pipeline:
     1. parseURL()              — read brand + model from query string
     2. loadRestaurantConfig()  — look up (or fall back to) RESTAURANTS entry
     3. ThemeEngine.apply()     — CSS vars + branding DOM
     4. CarouselController.build() — build thumbnail cards
     5. ModelLoader.init()      — attach load/error/progress listeners
     6. ARSessionManager.init() — attach AR button + ar-status listeners
     7. loadInitialModel()      — switch to URL-specified or first model
   ══════════════════════════════════════════════════════════════════════════════ */

function init() {
  const { brandId, initModel } = parseURL();

  // Step 2: load restaurant config
  const config = RESTAURANTS[brandId] || RESTAURANTS.default;

  if (!RESTAURANTS[brandId]) {
    console.warn(`[Registry] Unknown brand "${brandId}" — using default.`);
  }

  const mv = document.querySelector('#model');

  // Step 3: apply theme
  ThemeEngine.apply(config);

  // Step 4: build carousel (requires config.models)
  CarouselController.build(config);

  // Step 5: init model loader listeners
  ModelLoader.init(mv, config);

  // Step 6: init AR session manager listeners
  ARSessionManager.init(mv);

  // Step 7: select initial model (URL param > first in list)
  const initEntry = config.models.find(m =>
    m.file === initModel ||
    m.label.toLowerCase() === (initModel || '').toLowerCase()
  ) || config.models[0];

  if (initEntry) {
    const initBtn = CarouselController.buttons[config.models.indexOf(initEntry)];
    ModelLoader.switchModel(initBtn, initEntry);
  } else {
    console.warn('[Init] No models configured for this restaurant.');
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
