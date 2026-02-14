/* ========================================
   AR Food Viewer — Application Logic
   ======================================== */

(function () {
  'use strict';

  // ---- Restaurant Configuration Registry ----
  const RESTAURANTS = {
    default: {
      name: 'AR Food Viewer',
      logo: 'assets/logos/default.png',
      primary: '#ff6b35',
      primaryDark: '#e55a2b',
      bg: '#0e0e0e',
      surface: '#1a1a1a',
    },
    tajmahal: {
      name: 'Taj Mahal Restaurant',
      logo: 'assets/logos/tajmahal.png',
      primary: '#d4a843',
      primaryDark: '#b8922f',
      bg: '#0d0d0d',
      surface: '#1c1a17',
    },
    sakura: {
      name: 'Sakura Sushi',
      logo: 'assets/logos/sakura.png',
      primary: '#e74c6f',
      primaryDark: '#c93a5a',
      bg: '#0e0c0d',
      surface: '#1c1719',
    },
    greenleaf: {
      name: 'Green Leaf Bistro',
      logo: 'assets/logos/greenleaf.png',
      primary: '#4caf50',
      primaryDark: '#388e3c',
      bg: '#0b0e0b',
      surface: '#161c16',
    },
    pizzanova: {
      name: 'Pizza Nova',
      logo: 'assets/logos/pizzanova.png',
      primary: '#e53935',
      primaryDark: '#c62828',
      bg: '#0e0c0c',
      surface: '#1c1616',
    },
    bluefin: {
      name: 'Blue Fin Seafood',
      logo: 'assets/logos/bluefin.png',
      primary: '#2196f3',
      primaryDark: '#1976d2',
      bg: '#0c0d0e',
      surface: '#161a1e',
    },
  };

  /* ========================================
     Normalization & Orientation Constants
     ========================================
     These targets define the desired real-world
     size for food models in the AR scene.
     - TARGET_HEIGHT / TARGET_WIDTH: 0.08m (8cm)
     - Volume normalization uses a target bounding
       sphere derived from these dimensions.
     ======================================== */
  var TARGET_HEIGHT = 0.08; // meters
  var TARGET_WIDTH  = 0.08; // meters

  // Target volume derived from a bounding box of TARGET x TARGET x TARGET
  var TARGET_VOLUME = TARGET_HEIGHT * TARGET_WIDTH * TARGET_HEIGHT; // 0.000512 m³

  // ---- DOM References ----
  const modelViewer = document.getElementById('model');
  const restaurantLogo = document.getElementById('restaurant-logo');
  const restaurantNameEl = document.getElementById('restaurant-name');
  const itemNameEl = document.getElementById('item-name');
  const modelLabel = document.getElementById('model-label');

  // ---- URL Parameter Parsing ----
  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      restaurant: (params.get('r') || 'default').toLowerCase().trim(),
      model: params.get('model') || 'assets/Samosa.glb',
    };
  }

  // ---- Apply Restaurant Theme ----
  function applyTheme(config) {
    const root = document.documentElement;
    root.style.setProperty('--primary', config.primary);
    root.style.setProperty('--primary-dark', config.primaryDark);
    root.style.setProperty('--bg', config.bg);
    root.style.setProperty('--surface', config.surface);
  }

  // ---- Format Model Name for Display ----
  function formatModelName(filename) {
    return filename
      .replace(/\.glb$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // ---- Logo Load Error Fallback ----
  function handleLogoError() {
    restaurantLogo.onerror = null;
    restaurantLogo.src = 'assets/logos/default.png';
  }

  // ---- Model Loading Progress ----
  function initProgress() {
    var bar = modelViewer.querySelector('.update-bar');
    if (!bar) return;

    modelViewer.addEventListener('progress', function (event) {
      var progress = event.detail.totalProgress * 100;
      bar.style.width = progress + '%';
      if (progress >= 100) {
        setTimeout(function () {
          bar.parentElement.style.opacity = '0';
        }, 400);
      }
    });
  }

  // ---- Model Load Error Handling ----
  function initErrorHandling() {
    modelViewer.addEventListener('error', function (event) {
      console.error('[AR Food Viewer] Model load error:', event);
      console.error('[AR Food Viewer] Model src:', modelViewer.getAttribute('src'));
      modelLabel.textContent = 'Model unavailable';
      itemNameEl.textContent = 'Could not load the 3D model';
    });
  }

  /* ========================================
     NORMALIZATION ENGINE
     ========================================
     Runs AFTER the model fully loads via the
     model-viewer 'load' event.

     Pipeline order:
       1. Read bounding box from model-viewer
       2. Auto-orient (fix upright + ground plane)
       3. Height normalization
       4. Width normalization
       5. Volume normalization (distortion guard)
       6. Apply final uniform scale
     ======================================== */

  function initNormalization() {
    modelViewer.addEventListener('load', function () {
      console.log('[AR Food Viewer] Model loaded successfully!');
      // Small delay ensures model-viewer internals
      // (scene graph, bounding box) are fully ready
      requestAnimationFrame(function () {
        normalizeModel();
      });
    });
  }

  function normalizeModel() {
    /* ---- Step 1: Read the model's bounding box ----
       model-viewer exposes getDimensions() which
       returns {x, y, z} in meters — the axis-aligned
       bounding box size of the loaded model.          */
    var dimensions = modelViewer.getDimensions();

    if (!dimensions || (dimensions.x === 0 && dimensions.y === 0 && dimensions.z === 0)) {
      console.warn('[AR Food Viewer] Could not read model dimensions. Skipping normalization.');
      return;
    }

    var rawW = dimensions.x; // width  (X axis)
    var rawH = dimensions.y; // height (Y axis)
    var rawD = dimensions.z; // depth  (Z axis)

    console.log('[AR Food Viewer] Raw dimensions (m):', rawW.toFixed(4), rawH.toFixed(4), rawD.toFixed(4));

    /* ---- Step 2: Auto Orientation Correction ----
       Many AI-generated or exported models have
       random rotations — the "tallest" axis might
       not be Y. We detect which axis is tallest and
       rotate the model so it stands upright on Y.

       model-viewer's `orientation` attribute accepts
       a quaternion string "x y z w" or euler
       "Xdeg Ydeg Zdeg". We use euler for clarity.

       Strategy:
       - If Z is the tallest axis → model is lying on
         its back → rotate -90° around X to stand up.
       - If X is the tallest axis → model is on its
         side → rotate 90° around Z to stand up.
       - If Y is already tallest → no correction.

       After rotation the bounding box axes swap, so
       we recalculate effective dimensions.            */

    var orientX = 0;
    var orientY = 0;
    var orientZ = 0;

    var effectiveW = rawW;
    var effectiveH = rawH;
    var effectiveD = rawD;

    if (rawZ_isTallest(rawW, rawH, rawD)) {
      // Z is tallest — tip the model forward onto Y
      orientX = -90;
      effectiveW = rawW; // X stays X
      effectiveH = rawD; // old Z becomes new Y (height)
      effectiveD = rawH; // old Y becomes new Z (depth)
    } else if (rawX_isTallest(rawW, rawH, rawD)) {
      // X is tallest — roll the model so X maps to Y
      orientZ = 90;
      effectiveW = rawH; // old Y becomes new X (width)
      effectiveH = rawW; // old X becomes new Y (height)
      effectiveD = rawD; // Z stays Z
    }
    // else: Y is already tallest — no rotation needed

    // Apply orientation correction
    modelViewer.setAttribute('orientation', orientX + 'deg ' + orientY + 'deg ' + orientZ + 'deg');

    console.log('[AR Food Viewer] Orientation correction:', orientX, orientY, orientZ);
    console.log('[AR Food Viewer] Effective dimensions (m):', effectiveW.toFixed(4), effectiveH.toFixed(4), effectiveD.toFixed(4));

    /* ---- Step 3: Height Normalization ----
       Compute scale factor to fit model height
       to TARGET_HEIGHT (0.08m).                       */
    var scaleByHeight = TARGET_HEIGHT / effectiveH;

    /* ---- Step 4: Width Normalization ----
       Compute scale factor to fit model width
       to TARGET_WIDTH (0.08m).                        */
    var scaleByWidth = TARGET_WIDTH / effectiveW;

    /* ---- Step 5: Volume Normalization ----
       Instead of applying height OR width scale
       independently (which could distort), we use
       volume-based normalization as the final arbiter.

       Volume normalization finds a UNIFORM scale
       factor that maps the model's bounding-box
       volume to the target volume, preserving
       proportions exactly (zero distortion).

       Formula:
         currentVolume = W × H × D
         scaleFactor   = cbrt(targetVolume / currentVolume)

       We then clamp this so it never exceeds the
       height or width targets — whichever is more
       restrictive wins.                               */

    var currentVolume = effectiveW * effectiveH * effectiveD;
    var scaleByVolume = Math.cbrt(TARGET_VOLUME / currentVolume);

    // Choose the most restrictive uniform scale to
    // guarantee the model fits within both the height
    // and width targets while preserving proportions.
    var finalScale = Math.min(scaleByHeight, scaleByWidth, scaleByVolume);

    // Safety clamp: never scale below 1% or above 500%
    finalScale = Math.max(0.01, Math.min(finalScale, 5.0));

    console.log('[AR Food Viewer] Scale factors — H:', scaleByHeight.toFixed(4),
      'W:', scaleByWidth.toFixed(4), 'V:', scaleByVolume.toFixed(4),
      '→ Final:', finalScale.toFixed(4));

    /* ---- Step 6: Apply uniform scale ----
       model-viewer's `scale` attribute takes "x y z".
       Uniform value ensures zero distortion.          */
    var s = finalScale.toFixed(6);
    modelViewer.setAttribute('scale', s + ' ' + s + ' ' + s);

    console.log('[AR Food Viewer] Normalization complete. Scale applied:', s);
  }

  /* ---- Orientation helper: is Z the tallest axis? ---- */
  function rawZ_isTallest(w, h, d) {
    return d > h && d > w;
  }

  /* ---- Orientation helper: is X the tallest axis? ---- */
  function rawX_isTallest(w, h, d) {
    return w > h && w > d;
  }

  // ---- Initialize Application ----
  function init() {
    var params = getParams();
    var config = RESTAURANTS[params.restaurant] || RESTAURANTS.default;

    // Apply theme
    applyTheme(config);

    // Set restaurant info
    restaurantNameEl.textContent = config.name;
    document.title = config.name + ' — AR Food Viewer';

    // Set logo
    restaurantLogo.src = config.logo;
    restaurantLogo.alt = config.name + ' Logo';
    restaurantLogo.onerror = handleLogoError;

    // Set model
    var modelFile = params.model;
    console.log('[AR Food Viewer] Setting model src to:', modelFile);
    modelViewer.setAttribute('src', modelFile);

    // Set display name
    var displayName = formatModelName(modelFile);
    modelLabel.textContent = displayName;
    itemNameEl.textContent = 'View ' + displayName + ' in 3D & AR';
    modelViewer.setAttribute('alt', displayName + ' — 3D Food Model');

    // Init progress & error handling
    initProgress();
    initErrorHandling();

    // Init normalization — fires on model 'load' event
    initNormalization();
  }

  // ---- Boot ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
