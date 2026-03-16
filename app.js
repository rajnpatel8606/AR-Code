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
 *   4. MODEL NORMALIZATION   — V2.3 orientation + V2.2/V2.5 AR scale
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
    primary:      '#ff6b35',
    primaryDark:  '#e55a2b',
    bg:           '#111111',
    surface:      '#1a1a1a',
    targetHeight: 0.20,          // 20 cm brand-wide default
    models: [
      { label: 'Food',    file: 'assets/food.glb'                                       },
      { label: 'Cheese Balls',  file: 'assets/Cheese Balls.glb',    targetHeight: 0.12  },
      { label: 'Samosa Plate',  file: 'assets/Samosa Plate LA.glb', targetHeight: 0.12  },
      { label: 'Orange',  file: 'assets/Orange.glb',       targetHeight: 0.042          }, // ~4 cm
      { label: 'Chicken',     file: 'assets/Chicken.glb',    targetHeight: 0.30  }, // 30 cm
      { label: 'CMF Earbuds', file: 'assets/CMFEarbuds.glb',  targetHeight: 0.07  }  //  7 cm
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
   MODULE 4 — MODEL NORMALIZATION
   ══════════════════════════════════════════════════════════════════════════════
   Pipeline (runs after every model load):

     Step 1 — Read bounding box          via modelViewer.getDimensions()
     Step 2 — Orientation correction     V2.3: auto-detect flat models, apply Euler
     Step 3 — Height normalization       V2.2: scale to targetHeight (per-model or brand)
     Step 4 — Width normalization        V2.5: clamp so model never exceeds targetWidth
     Step 5 — Uniform scale              take Math.min(scaleH, scaleW); store as _arScale

   The model-viewer stays at native scale (1 1 1) in the 3-D viewer so that its
   camera auto-framing works correctly. The computed AR scale is stored on the
   active model entry and applied only when the user taps "View in Your Space".
   ══════════════════════════════════════════════════════════════════════════════ */

const ModelNormalization = {

  /**
   * V2.6 — Auto orientation correction.
   *
   * Priority:
   *   1. Manual registry override  (entry.orientation)
   *   2. Auto-detected from GLB root rotation  (entry._detectedOrientation)
   *   3. No correction (default)
   *
   * The old bounding-box heuristic (looksFlat) has been removed.
   * It caused false positives on flat food models (e.g. plates) and missed
   * embedded-rotation issues on Meshy-generated models.  The GLB probe
   * (probeGlbRootRotation) is the reliable replacement.
   *
   * @param  {DOMPointReadOnly} dims  Raw bounding box {x,y,z} from getDimensions()
   * @param  {object}  entry          Active model registry entry
   * @param  {object}  mv             model-viewer element
   * @returns {object}  effectiveDims  Axis-remapped {x,y,z} after rotation
   */
  applyOrientationCorrection(dims, entry, mv) {
    const { x, y, z } = dims;

    // 1. Manual registry override — highest priority
    if (entry?.orientation != null) {
      mv.orientation = entry.orientation;
      console.log(`[V2.6] Manual orientation override: ${entry.orientation}`);
      return { x, y, z };   // caller supplied override; trust its dimensions as-is
    }

    // 2. Auto-detected orientation from GLB probe (null/undefined = not ready, skip)
    const detected = entry?._detectedOrientation;
    if (detected != null) {   // != null is false for both null AND undefined
      mv.orientation = detected;
      console.log(`[V2.6] Auto-detected orientation: ${detected}`);
      // If the model had an embedded −90° X root rotation (Meshy pattern), the
      // world-space bounding box has Y and Z swapped vs the model's true shape.
      // Applying +90° X counteracts it — swap Y↔Z to get correct effective dims.
      if (detected === '90deg 0deg 0deg') return { x, y: z, z: y };
      return { x, y, z };
    }

    // 3. No correction available yet (probe still in-flight or probe not started)
    mv.orientation = '0deg 0deg 0deg';
    console.log('[V2.6] No orientation data yet — using identity.');
    return { x, y, z };
  },

  /**
   * V2.6 — Probe a GLB file's root-node rotation quaternion.
   *
   * Fetches the GLB (uses the browser cache — same URL model-viewer is loading),
   * parses only the JSON chunk, and checks if the scene root node contains the
   * well-known Meshy "orientation_correction" −90° X rotation.
   *
   * Returns a model-viewer orientation string that counteracts the embedded
   * rotation, or '0deg 0deg 0deg' if no problematic rotation is detected.
   *
   * @param  {string} file  Relative path to the .glb file
   * @returns {Promise<string>}
   */
  async probeGlbRootRotation(file) {
    try {
      const resp = await fetch(file);
      const buf  = await resp.arrayBuffer();
      const view = new DataView(buf);

      // Validate GLB magic 0x46546C67 ('glTF' little-endian)
      if (view.getUint32(0, true) !== 0x46546C67) return '0deg 0deg 0deg';

      const jsonLen = view.getUint32(12, true);
      const jsonStr = new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen));
      const json    = JSON.parse(jsonStr);

      const sceneRootIds = json.scenes?.[json.scene ?? 0]?.nodes ?? [];

      for (const id of sceneRootIds) {
        const node = json.nodes?.[id];
        if (!node?.rotation) continue;

        const [qx, qy, qz, qw] = node.rotation;

        // Meshy −90° X pattern: quaternion ≈ (−0.7071, 0, 0, +0.7071)
        // This erroneously tilts an already-correct Y-up mesh sideways.
        // Counteract with +90° X orientation.
        if (Math.abs(qx + 0.7071) < 0.01 && Math.abs(qw - 0.7071) < 0.01
            && Math.abs(qy) < 0.01 && Math.abs(qz) < 0.01) {
          console.log(`[V2.6] Probe "${file}": Meshy −90°X root detected → applying +90°X counteraction`);
          return '90deg 0deg 0deg';
        }
      }

      console.log(`[V2.6] Probe "${file}": no problematic root rotation → identity`);
      return '0deg 0deg 0deg';

    } catch (e) {
      console.warn('[V2.6] GLB probe failed:', e.message);
      return '0deg 0deg 0deg';
    }
  },

  /**
   * V2.2 / V2.5 — Compute AR scale factor (height + width constraint).
   * Scale is stored on the entry as entry._arScale ("s s s").
   * The model-viewer element is NOT scaled here — that happens on AR button click.
   *
   * @param  {object} effectiveDims  Post-orientation {x,y,z} in metres
   * @param  {object} entry          Active model registry entry
   * @param  {object} config         Active restaurant config
   */
  computeArScale(effectiveDims, entry, config) {
    // Resolve target sizes:  per-model > brand > hardcoded fallbacks
    const targetH = entry?.targetHeight ?? config.targetHeight ?? 0.20;
    const targetW = entry?.targetWidth  ?? config.targetWidth  ?? targetH; // square default

    const modelH = effectiveDims.y;
    const modelW = Math.max(effectiveDims.x, effectiveDims.z); // widest horizontal axis

    if (modelH <= 0) {
      console.warn('[V2.2] Effective Y is zero — skipping AR scale computation.');
      return;
    }

    // Step 3: scale by height
    const scaleByHeight = targetH / modelH;

    // Step 4: scale by width (prevent model from being too wide)
    const scaleByWidth  = modelW > 0 ? targetW / modelW : scaleByHeight;

    // Step 5: take the smaller — model fits within both constraints
    let finalScale = Math.min(scaleByHeight, scaleByWidth);

    // Safety clamp: never below 1% or above 1000%
    finalScale = Math.max(0.01, Math.min(finalScale, 10.0));

    const s = finalScale.toFixed(6);

    // Store for AR use — applied on AR button click, restored on exit
    if (entry) entry._arScale = `${s} ${s} ${s}`;

    console.log(
      `[V2.2] targetH=${targetH}m targetW=${targetW}m | ` +
      `modelH=${modelH.toFixed(4)}m modelW=${modelW.toFixed(4)}m | ` +
      `scaleH=${scaleByHeight.toFixed(4)} scaleW=${scaleByWidth.toFixed(4)} → arScale=${s}`
    );
  }

};

/* ══════════════════════════════════════════════════════════════════════════════
   MODULE 5 — MODEL LOADER
   ══════════════════════════════════════════════════════════════════════════════
   Manages model switching, the load / error / progress event pipeline,
   and bridges into Normalization, Analytics, and Carousel modules.

   Key mechanisms:
     • V2.4 stale-load guard: currentLoadId increments on every switchModel().
       The load handler ignores events from previous (cancelled) switches.
     • V2.1 bounding box read: getDimensions() after load confirms geometry.
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
    this._mv.scale       = '1 1 1';          // native scale for camera auto-framing
    this._mv.orientation = '0deg 0deg 0deg'; // reset before each load
    this._mv.removeAttribute('camera-orbit'); // let model-viewer auto-frame

    // V2.6: kick off GLB root-rotation probe concurrently with the model load.
    // The probe fetches the same URL model-viewer is about to request, so the
    // browser deduplicates or cache-hits — no extra network cost.
    // Result is cached on the entry so subsequent loads of the same model are instant.
    // undefined = not probed yet | null = probe in-flight | string = result ready
    if (entry.orientation == null && entry._detectedOrientation === undefined) {
      entry._detectedOrientation = null;   // mark in-flight (prevents duplicate probes)
      entry._probePromise = ModelNormalization.probeGlbRootRotation(entry.file)
        .then(result => { entry._detectedOrientation = result; });
    }

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

    // V2.1: read bounding box
    const dims = mv.getDimensions();

    if (!dims || (dims.x === 0 && dims.y === 0 && dims.z === 0)) {
      console.warn('[V2.1] getDimensions() returned zero — skipping normalization.');
      AnalyticsTracker.modelLoad(
        this.activeEntry?.file, null, null,
        Date.now() - this.switchStartTime
      );
    } else {
      console.log(
        `[V2.1] Raw dims (m): X=${dims.x.toFixed(4)} Y=${dims.y.toFixed(4)} Z=${dims.z.toFixed(4)}`
      );
      mv._lastDimensions = dims; // expose for DevTools: modelViewer._lastDimensions

      // V2.6: run normalization once orientation probe is settled.
      // If the probe already resolved (cache hit), this runs synchronously via
      // Promise.resolve(). If still in-flight, we wait for it — the brief delay
      // is invisible because the model is still fading in at this point.
      const runNormalization = () => {
        // Step 2: orientation correction (V2.6 — GLB probe replaces looksFlat heuristic)
        const effectiveDims = ModelNormalization.applyOrientationCorrection(
          dims, this.activeEntry, mv
        );
        // Steps 3–5: compute AR scale (V2.2 + V2.5 width constraint)
        ModelNormalization.computeArScale(effectiveDims, this.activeEntry, this._config);
      };

      const probe = this.activeEntry?._probePromise;
      if (probe && this.activeEntry?._detectedOrientation === null) {
        // null = probe still in-flight; wait for it then normalise
        probe.then(runNormalization);
      } else {
        runNormalization();
      }

      // V3.1: log load completion
      AnalyticsTracker.modelLoad(
        this.activeEntry?.file,
        { x: +dims.x.toFixed(4), y: +dims.y.toFixed(4), z: +dims.z.toFixed(4) },
        this.activeEntry?._arScale,
        Date.now() - this.switchStartTime
      );
    }

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

    // Apply physical scale when user taps the AR button
    document.querySelector('#ar-btn').addEventListener('click', () => {
      const entry = ModelLoader.activeEntry;
      if (entry?._arScale) {
        mv.scale = entry._arScale;
      }
    });

    // ar-status: restore scale on exit + route analytics events
    mv.addEventListener('ar-status', (e) => {
      const model  = ModelLoader.activeEntry?.file || 'unknown';
      const status = e.detail.status;

      // Restore native scale whenever AR is no longer presenting
      if (status === 'not-presenting') {
        mv.scale = '1 1 1';
      }

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
