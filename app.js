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
 *   6. CAROUSEL CONTROLLER   — V3.2 thumbnail cards + V2 category tabs
 *   7. AR SESSION MANAGER    — AR scale apply/restore + ar-status events
 *   8. INIT                  — single boot function
 *
 * Changes:
 *   V1 Performance: static thumbnail preloading, next-model prefetch
 *   V2 Category Tabs: models grouped into Beverages/Starters/Main Course/Salads
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
     categories[]  — V2: models grouped into named tabs
       .id           — unique tab identifier
       .label        — tab display label
       .models[]     — list of 3D models for this category
         .label        — display label on carousel card
         .file         — GLB filename (resolved relative to index.html)
         .thumb        — V1: optional static thumbnail image (preloaded instantly)
         .targetHeight — (optional) per-model height override in metres
     models[]      — flat list (used by brands without tabs, backward-compatible)

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
    // V2: models grouped into category tabs
    categories: [
      {
        id: 'beverages', label: 'Beverages',
        models: [
          { label: 'Cold Coffee',  file: 'assets/Cold Cofee.glb',      thumb: 'assets/thumbs/cold-coffee.png'  },
        ]
      },
      {
        id: 'starters', label: 'Starters',
        models: [
          { label: 'Samosa Plate', file: 'assets/Samosa Plate LA.glb', thumb: 'assets/thumbs/samosa-plate.png' },
          { label: 'Cheese Balls', file: 'assets/Cheese Balls 2.glb',  thumb: 'assets/thumbs/cheese-balls.png' },
        ]
      },
      {
        id: 'main-course', label: 'Main Course',
        models: [
          { label: 'Burger',       file: 'assets/food.glb',            thumb: 'assets/thumbs/food.png'         },
          { label: 'Chicken',      file: 'assets/Chicken.glb',         thumb: 'assets/thumbs/chicken.png'      },
        ]
      },
      {
        id: 'salads', label: 'Salads',
        models: [
          { label: 'Fruit Salad',  file: 'assets/Fruit Salad.glb',     thumb: 'assets/thumbs/fruit-salad.png'  },
        ]
      },
    ]
  },

  tajmahal: {
    name:         'Taj Mahal Restaurant',
    logo:         'assets/logos/tajmahal.png',
    primary:      '#d4a843',
    primaryDark:  '#b8922f',
    bg:           '#0d0d0d',
    surface:      '#1c1a17',
    models: [
      // Add models here as GLB files become available
      // { label: 'Biryani', file: 'biryani.glb' }
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

/**
 * V1 utility: get a flat array of all models from a config.
 * Handles both categories (V2) and flat models (backward-compat) brands.
 */
function getModels(cfg) {
  if (cfg.categories) return cfg.categories.flatMap(c => c.models);
  return cfg.models || [];
}

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
     • V3.2 thumbnail capture: toDataURL() at 150 ms after load (fallback).
     • V1 next-model prefetch: queues preload link for next carousel model.
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
      ? getModels(config).find(m => m.file === entryOrFile) || { file: entryOrFile }
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

    // UI updates
    document.querySelector('#loading').style.display    = 'none';
    document.querySelector('#progress-bar').style.width = '100%';
    CarouselController.setDisabled(false);
    setTimeout(() => {
      document.querySelector('#progress-bar').style.width = '0%';
    }, 400);

    // V3.2: auto-capture thumbnail from canvas at 150 ms (fallback for models without static thumb)
    const captureEntry = this.activeEntry;
    setTimeout(() => {
      if (!captureEntry) return;
      try {
        const dataUrl = mv.toDataURL('image/jpeg', 0.6);
        const btn = CarouselController.buttonMap.get(captureEntry);
        if (btn) {
          const img = btn.querySelector('.slide-thumb');
          // Only update if no static thumb is already showing
          if (img && !img.dataset.staticThumb) {
            img.src = dataUrl;
          }
        }
        try { sessionStorage.setItem(`ar_thumb_${captureEntry.file}`, dataUrl); } catch (_) {}
        console.log(`[V3.2] Thumbnail captured: ${captureEntry.file}`);
      } catch (e) {
        console.log('[V3.2] toDataURL skipped:', e.message);
      }
    }, 150);

    // V1: prefetch next model in the current category carousel
    const visibleModels = CarouselController._currentModels;
    if (visibleModels.length > 1) {
      const curIdx = visibleModels.indexOf(captureEntry);
      if (curIdx >= 0) {
        const next = visibleModels[(curIdx + 1) % visibleModels.length];
        if (!document.head.querySelector(`link[href="${next.file}"][rel="preload"]`)) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as  = 'fetch';
          link.href = next.file;
          document.head.appendChild(link);
          console.log(`[V1] Prefetch queued: ${next.file}`);
        }
      }
    }
  },

  /** model-viewer 'error' event handler */
  _onError() {
    document.querySelector('#error-banner').style.display = 'block';
    document.querySelector('#loading').style.display      = 'none';
    CarouselController.setDisabled(false);

    // Fallback to default model if not already showing it
    if (this._mv.src !== FALLBACK_MODEL) {
      this._mv.src = FALLBACK_MODEL;
      const fallbackEntry = getModels(this._config).find(m => m.file === FALLBACK_MODEL);
      if (fallbackEntry) {
        const btn = CarouselController.buttonMap.get(fallbackEntry);
        if (btn) CarouselController.setSelected(btn);
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
   MODULE 6 — CAROUSEL CONTROLLER  (V3.2 thumbnails + V2 category tabs)
   ══════════════════════════════════════════════════════════════════════════════
   Builds the model-selector carousel from the restaurant config.
   Each card has:
     • A thumbnail <img>  — V1: static thumb (instant) or sessionStorage cache;
                            V3.2: auto-captured via toDataURL after model loads
     • A placeholder icon — shown while thumbnail is not yet available
     • A text label       — from model entry .label

   V2 additions:
     • buildTabs(cfg)       — renders category tab row from cfg.categories
     • showCategory(id,cfg) — switches tab + rebuilds carousel for that category
     • buttonMap            — Map<entry, button> for O(1) lookup by model entry
   ══════════════════════════════════════════════════════════════════════════════ */

const CarouselController = {

  buttons:        [],           // currently visible carousel buttons
  buttonMap:      new Map(),    // entry → button (persists across category switches)
  _currentModels: [],           // currently visible models array
  _tabButtons:    [],           // category tab <button> elements

  /**
   * Build (or rebuild) carousel from an array of model entries.
   * Called directly for flat-models brands, or by showCategory() for tabs.
   * @param {object[]} models  Array of model entry objects
   */
  build(models) {
    const carousel = document.querySelector('#carousel');
    carousel.innerHTML = '';
    this.buttons = [];
    this._currentModels = models;

    models.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'slide';

      // Thumbnail — V1 priority order:
      //   1. Static thumb image (instant display, preloaded into browser cache)
      //   2. sessionStorage capture from previous session
      //   3. Empty src (placeholder shows; toDataURL fills it in after load)
      const img = document.createElement('img');
      img.className = 'slide-thumb';
      img.alt = item.label;
      if (item.thumb) {
        img.src = item.thumb;
        img.dataset.staticThumb = '1'; // flag: don't overwrite with toDataURL
      } else {
        const cached = sessionStorage.getItem(`ar_thumb_${item.file}`);
        img.src = cached || '';
      }

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
      this.buttonMap.set(item, btn); // track for thumbnail capture + error fallback

      // V1: warm browser image cache for static thumbnails
      if (item.thumb) {
        const preload = new Image();
        preload.src = item.thumb;
      }
    });
  },

  /**
   * V2: Build the category tab row from cfg.categories.
   * Clears previous tabs. Call once per restaurant config.
   * @param {object} cfg  Restaurant config with .categories[]
   */
  buildTabs(cfg) {
    this.buttonMap.clear();
    this._tabButtons = [];

    const tabsEl = document.querySelector('#category-tabs');
    tabsEl.innerHTML = '';

    // Mark slider so CSS hides the "Our Dishes" pseudo-element
    document.querySelector('.slider').classList.add('has-tabs');

    cfg.categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'cat-tab';
      btn.textContent = cat.label;
      btn.addEventListener('click', () => this.showCategory(cat.id, cfg));
      tabsEl.appendChild(btn);
      this._tabButtons.push(btn);
    });
  },

  /**
   * V2: Switch to a category tab, rebuild carousel, auto-load first model.
   * @param {string} catId   Category id from cfg.categories
   * @param {object} cfg     Restaurant config
   */
  showCategory(catId, cfg) {
    const catIndex = cfg.categories.findIndex(c => c.id === catId);
    if (catIndex < 0) return;
    const cat = cfg.categories[catIndex];

    // Update active tab highlight
    this._tabButtons.forEach((b, i) => {
      b.classList.toggle('active', i === catIndex);
    });

    // Rebuild carousel for this category's models
    this.build(cat.models);

    // Auto-load first model in the new category
    if (cat.models.length > 0) {
      ModelLoader.switchModel(this.buttons[0], cat.models[0]);
    }
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
     4. ModelLoader.init()      — attach load/error/progress listeners
     5. ARSessionManager.init() — attach AR button + ar-status listeners
     6. buildCarousel()         — tabs (V2) or flat carousel (backward compat)
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

  // Steps 4 + 5: init model loader and AR manager BEFORE any switchModel call
  ModelLoader.init(mv, config);
  ARSessionManager.init(mv);

  // Steps 6 + 7: build carousel and load initial model
  if (config.categories) {
    // V2: category tabs
    CarouselController.buildTabs(config);

    const allModels = getModels(config);
    const initEntry = allModels.find(m =>
      m.file === initModel ||
      m.label.toLowerCase() === (initModel || '').toLowerCase()
    );

    if (initEntry) {
      // Navigate to the category that contains the requested model
      const initCat = config.categories.find(c => c.models.includes(initEntry));
      const firstCatId = initCat ? initCat.id : config.categories[0].id;
      CarouselController.showCategory(firstCatId, config);

      // showCategory already loads the first model in the category;
      // if the requested model is different, switch to it explicitly
      if (initCat && initEntry !== initCat.models[0]) {
        const btn = CarouselController.buttonMap.get(initEntry);
        if (btn) ModelLoader.switchModel(btn, initEntry);
      }
    } else {
      // No URL param — show first category
      CarouselController.showCategory(config.categories[0].id, config);
    }

  } else {
    // Backward compat: flat models list (other brands)
    const models = getModels(config);
    CarouselController.build(models);

    const initEntry = models.find(m =>
      m.file === initModel ||
      m.label.toLowerCase() === (initModel || '').toLowerCase()
    ) || models[0];

    if (initEntry) {
      const btn = CarouselController.buttonMap.get(initEntry);
      ModelLoader.switchModel(btn, initEntry);
    } else {
      console.warn('[Init] No models configured for this restaurant.');
    }
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
