const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const DEVICE_PIXEL_RATIO_CAP = 2;
const MAP_SIZE = 256;
const LIGHT_ANGLE_DEG = -60;
const REFRACTIVE_INDEX = 1.5;

let svgRoot;
let defs;
let styleEl;
let resizeObserver;
let updateQueued = false;
let initialized = false;

const TARGET_CONFIGS = [
  { selector: 'header', variant: 'chrome', profile: 'convex', bezel: 0.18, thickness: 18, refraction: 28, blur: 1.2, specularOpacity: 0.26, specularSaturation: 8, radiusVar: '--radius-xl', minHeight: 72 },
  { selector: '.manual-location-card', variant: 'panel', profile: 'convex', bezel: 0.16, thickness: 18, refraction: 26, blur: 1.1, specularOpacity: 0.24, specularSaturation: 7, radiusVar: '--radius-md' },
  { selector: '.prayer-focus', variant: 'panel', profile: 'convex-squircle', bezel: 0.15, thickness: 19, refraction: 26, blur: 0.9, specularOpacity: 0.34, specularSaturation: 9, radiusVar: '--radius-md' },
  { selector: '.grouped-prayers', variant: 'panel', profile: 'convex-squircle', bezel: 0.14, thickness: 16, refraction: 22, blur: 0.7, specularOpacity: 0.22, specularSaturation: 6, radiusVar: '--radius-md' },
  { selector: '.grouped-prayers .prayer-row.active', variant: 'active-row', profile: 'convex-squircle', bezel: 0.18, thickness: 20, refraction: 30, blur: 0.25, specularOpacity: 0.44, specularSaturation: 10, radiusVar: '--radius-md' },
  { selector: '.monthly-card', variant: 'panel', profile: 'convex-squircle', bezel: 0.16, thickness: 18, refraction: 24, blur: 1.0, specularOpacity: 0.30, specularSaturation: 8, radiusVar: '--radius-md' },
  { selector: '.settings-list', variant: 'panel', profile: 'convex-squircle', bezel: 0.14, thickness: 16, refraction: 22, blur: 0.9, specularOpacity: 0.24, specularSaturation: 6, radiusVar: '--radius-md' },
  { selector: '.settings-row', variant: 'row', profile: 'convex', bezel: 0.12, thickness: 10, refraction: 14, blur: 0.25, specularOpacity: 0.12, specularSaturation: 4, radiusVar: '--radius-none' },
  { selector: '.settings-action-button', variant: 'button', profile: 'convex-squircle', bezel: 0.18, thickness: 20, refraction: 26, blur: 0.8, specularOpacity: 0.34, specularSaturation: 8, radiusVar: '--radius-sm' },
  { selector: '.tabbar-capsule', variant: 'chrome', profile: 'convex-squircle', bezel: 0.2, thickness: 22, refraction: 34, blur: 0.85, specularOpacity: 0.34, specularSaturation: 8, radiusVar: '--radius-tab' },
  { selector: '.tab-active-pill', variant: 'lens', profile: 'convex-squircle', bezel: 0.24, thickness: 28, refraction: 44, blur: 0.0, specularOpacity: 0.48, specularSaturation: 10, radiusVar: '--radius-tab' },
  { selector: '.progress-center', variant: 'lens', profile: 'convex', bezel: 0.24, thickness: 28, refraction: 40, blur: 0.6, specularOpacity: 0.42, specularSaturation: 10, radiusVar: '--radius-tab' },
  { selector: '.toggle', variant: 'switch-track', profile: 'lip', bezel: 0.22, thickness: 18, refraction: 24, blur: 0.18, specularOpacity: 0.34, specularSaturation: 8, radiusVar: '--radius-xxs' },
  { selector: '.toggle::after', skip: true },
  { selector: '.calendar-day.today', variant: 'button', profile: 'convex', bezel: 0.18, thickness: 18, refraction: 18, blur: 0.45, specularOpacity: 0.28, specularSaturation: 7, radiusVar: '--radius-xxs' },
  { selector: '.calendar-day:not(.header):not(.today)', variant: 'cell', profile: 'convex', bezel: 0.14, thickness: 11, refraction: 12, blur: 0.15, specularOpacity: 0.12, specularSaturation: 3, radiusVar: '--radius-xxs' }
];

export function initLiquidGlass() {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;

  ensureSvgRoot();
  ensureDynamicStyle();
  document.documentElement.classList.add('liquid-glass-experiment');
  applyTargets();

  resizeObserver = new ResizeObserver(() => queueUpdate());
  observeTargets();

  window.addEventListener('resize', queueUpdate, { passive: true });
  window.addEventListener('orientationchange', queueUpdate, { passive: true });
  window.addEventListener('hashchange', queueUpdate, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) queueUpdate();
  });

  const mutationObserver = new MutationObserver(() => {
    applyTargets();
    observeTargets();
    queueUpdate();
  });

  mutationObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-pressed']
  });

  queueUpdate();
}

function ensureSvgRoot() {
  svgRoot = document.createElementNS(SVG_NS, 'svg');
  svgRoot.setAttribute('aria-hidden', 'true');
  svgRoot.setAttribute('width', '0');
  svgRoot.setAttribute('height', '0');
  svgRoot.setAttribute('focusable', 'false');
  svgRoot.style.position = 'fixed';
  svgRoot.style.width = '0';
  svgRoot.style.height = '0';
  svgRoot.style.inset = '0';
  svgRoot.style.pointerEvents = 'none';
  svgRoot.style.opacity = '0';
  svgRoot.style.zIndex = '-1';
  svgRoot.setAttribute('color-interpolation-filters', 'sRGB');

  defs = document.createElementNS(SVG_NS, 'defs');
  svgRoot.appendChild(defs);
  document.body.prepend(svgRoot);
}

function ensureDynamicStyle() {
  styleEl = document.createElement('style');
  styleEl.id = 'minaret-liquid-glass-inline-style';
  document.head.appendChild(styleEl);
}

function applyTargets() {
  TARGET_CONFIGS.forEach((config) => {
    if (config.skip) return;
    document.querySelectorAll(config.selector).forEach((element, index) => {
      element.classList.add('liquid-glass-ui');
      element.classList.add(`liquid-glass-ui--${config.variant}`);
      element.dataset.liquidGlassProfile = config.profile;
      element.dataset.liquidGlassVariant = config.variant;
      element.dataset.liquidGlassIndex = String(index);
      element.dataset.liquidGlassBezel = String(config.bezel);
      element.dataset.liquidGlassThickness = String(config.thickness);
      element.dataset.liquidGlassRefraction = String(config.refraction);
      element.dataset.liquidGlassBlur = String(config.blur);
      element.dataset.liquidGlassSpecularOpacity = String(config.specularOpacity);
      element.dataset.liquidGlassSpecularSaturation = String(config.specularSaturation);
      if (config.radiusVar) {
        element.dataset.liquidGlassRadiusVar = config.radiusVar;
      }
      if (config.minHeight) {
        element.style.minHeight = `${config.minHeight}px`;
      }
      if (!element.dataset.liquidGlassId) {
        element.dataset.liquidGlassId = `${sanitizeSelector(config.selector)}-${index}-${Math.random().toString(36).slice(2, 9)}`;
      }
    });
  });
}

function observeTargets() {
  resizeObserver?.disconnect();
  document.querySelectorAll('[data-liquid-glass-id]').forEach((element) => resizeObserver.observe(element));
}

function queueUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(() => {
    updateQueued = false;
    refreshFilters();
  });
}

function refreshFilters() {
  const cssRules = [];
  const seen = new Set();

  document.querySelectorAll('[data-liquid-glass-id]').forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (!isRenderable(rect, element)) return;

    const filterId = `liquid-glass-filter-${element.dataset.liquidGlassId}`;
    buildOrUpdateFilter(filterId, rect, readElementConfig(element));

    const selector = `[data-liquid-glass-id="${element.dataset.liquidGlassId}"]`;
    const blur = Number(element.dataset.liquidGlassBlur || 0);

    cssRules.push(`${selector}{backdrop-filter:url(#${filterId}) blur(${blur}px) saturate(180%);-webkit-backdrop-filter:url(#${filterId}) blur(${blur}px) saturate(180%);}`);
    seen.add(filterId);
  });

  styleEl.textContent = cssRules.join('\n');

  Array.from(defs.querySelectorAll('filter')).forEach((node) => {
    if (!seen.has(node.id)) node.remove();
  });
}

function buildOrUpdateFilter(filterId, rect, config) {
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const map = generateMaps(width, height, config);

  let filter = defs.querySelector(`#${CSS.escape(filterId)}`);
  if (!filter) {
    filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', filterId);
    filter.setAttribute('filterUnits', 'objectBoundingBox');
    filter.setAttribute('primitiveUnits', 'objectBoundingBox');
    filter.setAttribute('x', '0%');
    filter.setAttribute('y', '0%');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    defs.appendChild(filter);
  }

  filter.replaceChildren();

  const feBlur = document.createElementNS(SVG_NS, 'feGaussianBlur');
  feBlur.setAttribute('in', 'SourceGraphic');
  feBlur.setAttribute('stdDeviation', String((config.blur ?? 0) * 0.15));
  feBlur.setAttribute('result', 'backdrop_blur');
  filter.appendChild(feBlur);

  const feDisplacementImage = document.createElementNS(SVG_NS, 'feImage');
  feDisplacementImage.setAttributeNS(XLINK_NS, 'href', map.displacementDataUrl);
  feDisplacementImage.setAttribute('preserveAspectRatio', 'none');
  feDisplacementImage.setAttribute('x', '0');
  feDisplacementImage.setAttribute('y', '0');
  feDisplacementImage.setAttribute('width', '1');
  feDisplacementImage.setAttribute('height', '1');
  feDisplacementImage.setAttribute('result', 'displacement_map');
  filter.appendChild(feDisplacementImage);

  const feDisplacementMap = document.createElementNS(SVG_NS, 'feDisplacementMap');
  feDisplacementMap.setAttribute('in', 'backdrop_blur');
  feDisplacementMap.setAttribute('in2', 'displacement_map');
  feDisplacementMap.setAttribute('scale', String(map.maximumDisplacement * config.refraction));
  feDisplacementMap.setAttribute('xChannelSelector', 'R');
  feDisplacementMap.setAttribute('yChannelSelector', 'G');
  feDisplacementMap.setAttribute('result', 'refracted');
  filter.appendChild(feDisplacementMap);

  const feHighlightImage = document.createElementNS(SVG_NS, 'feImage');
  feHighlightImage.setAttributeNS(XLINK_NS, 'href', map.highlightDataUrl);
  feHighlightImage.setAttribute('preserveAspectRatio', 'none');
  feHighlightImage.setAttribute('x', '0');
  feHighlightImage.setAttribute('y', '0');
  feHighlightImage.setAttribute('width', '1');
  feHighlightImage.setAttribute('height', '1');
  feHighlightImage.setAttribute('result', 'highlight_map');
  filter.appendChild(feHighlightImage);

  const feHighlightBlur = document.createElementNS(SVG_NS, 'feGaussianBlur');
  feHighlightBlur.setAttribute('in', 'highlight_map');
  feHighlightBlur.setAttribute('stdDeviation', '0.004');
  feHighlightBlur.setAttribute('result', 'highlight_soft');
  filter.appendChild(feHighlightBlur);

  const feBlend = document.createElementNS(SVG_NS, 'feBlend');
  feBlend.setAttribute('in', 'refracted');
  feBlend.setAttribute('in2', 'highlight_soft');
  feBlend.setAttribute('mode', 'screen');
  filter.appendChild(feBlend);
}

function generateMaps(width, height, config) {
  const dpr = Math.min(window.devicePixelRatio || 1, DEVICE_PIXEL_RATIO_CAP);
  const canvasSize = MAP_SIZE;
  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = canvasSize;
  dispCanvas.height = canvasSize;
  const dispCtx = dispCanvas.getContext('2d', { willReadFrequently: true });
  const dispImage = dispCtx.createImageData(canvasSize, canvasSize);

  const hiCanvas = document.createElement('canvas');
  hiCanvas.width = canvasSize;
  hiCanvas.height = canvasSize;
  const hiCtx = hiCanvas.getContext('2d', { willReadFrequently: true });
  const hiImage = hiCtx.createImageData(canvasSize, canvasSize);

  const radius = getRadius(config, width, height);
  const bezelPx = Math.max(6, Math.min(width, height) * config.bezel);
  const lightDirection = degreesToVector(LIGHT_ANGLE_DEG);
  let maximumDisplacement = 0;

  const raw = new Float32Array(canvasSize * canvasSize * 2);

  for (let y = 0; y < canvasSize; y += 1) {
    for (let x = 0; x < canvasSize; x += 1) {
      const nx = x / (canvasSize - 1);
      const ny = y / (canvasSize - 1);
      const px = nx * width;
      const py = ny * height;
      const sample = sampleRoundedRect(px, py, width, height, radius, bezelPx, config);
      const index = (y * canvasSize + x) * 2;
      raw[index] = sample.dx;
      raw[index + 1] = sample.dy;
      maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(sample.dx, sample.dy));
    }
  }

  maximumDisplacement = Math.max(maximumDisplacement, 0.001);

  for (let y = 0; y < canvasSize; y += 1) {
    for (let x = 0; x < canvasSize; x += 1) {
      const i = y * canvasSize + x;
      const rawIndex = i * 2;
      const rgbaIndex = i * 4;
      const dx = raw[rawIndex] / maximumDisplacement;
      const dy = raw[rawIndex + 1] / maximumDisplacement;
      dispImage.data[rgbaIndex] = clampByte(128 + dx * 127);
      dispImage.data[rgbaIndex + 1] = clampByte(128 + dy * 127);
      dispImage.data[rgbaIndex + 2] = 128;
      dispImage.data[rgbaIndex + 3] = 255;

      const highlight = sampleHighlight(x / (canvasSize - 1), y / (canvasSize - 1), width, height, radius, bezelPx, config, lightDirection);
      hiImage.data[rgbaIndex] = highlight.r;
      hiImage.data[rgbaIndex + 1] = highlight.g;
      hiImage.data[rgbaIndex + 2] = highlight.b;
      hiImage.data[rgbaIndex + 3] = highlight.a;
    }
  }

  dispCtx.putImageData(dispImage, 0, 0);
  hiCtx.putImageData(hiImage, 0, 0);

  return {
    displacementDataUrl: dispCanvas.toDataURL('image/png'),
    highlightDataUrl: hiCanvas.toDataURL('image/png'),
    maximumDisplacement: maximumDisplacement / dpr
  };
}

function sampleRoundedRect(px, py, width, height, radius, bezelPx, config) {
  const { distance, normal } = roundedRectInnerDistanceAndNormal(px, py, width, height, radius);

  if (distance > bezelPx) {
    return { dx: 0, dy: 0 };
  }

  const t = clamp(distance / bezelPx, 0, 1);
  const heightFn = profileHeight(config.profile, t);
  const derivative = profileDerivative(config.profile, t);
  const slope = derivative * (config.thickness / bezelPx);
  const surfaceNormal = normalize({ x: -slope, y: 1 });
  const refracted = refract({ x: 0, y: 1 }, surfaceNormal, 1 / REFRACTIVE_INDEX) || { x: 0, y: 1 };
  const lateralShift = Math.abs(refracted.x / Math.max(Math.abs(refracted.y), 0.001)) * config.thickness;
  const direction = { x: -normal.x, y: -normal.y };

  return {
    dx: direction.x * lateralShift,
    dy: direction.y * lateralShift
  };
}

function sampleHighlight(nx, ny, width, height, radius, bezelPx, config, lightDirection) {
  const px = nx * width;
  const py = ny * height;
  const { distance, normal } = roundedRectInnerDistanceAndNormal(px, py, width, height, radius);
  if (distance > bezelPx) {
    return { r: 255, g: 255, b: 255, a: 0 };
  }

  const t = clamp(distance / bezelPx, 0, 1);
  const derivative = profileDerivative(config.profile, t);
  const slope = derivative * (config.thickness / bezelPx);
  const bevelNormal = normalize({ x: normal.x, y: normal.y, z: -slope * 3.4 });
  const intensity = Math.pow(Math.max(0, dot3(bevelNormal, lightDirection)), config.specularSaturation);
  const edgeFalloff = Math.pow(1 - t, 0.55);
  const alpha = clampByte(255 * intensity * edgeFalloff * config.specularOpacity);
  const brightness = clampByte(215 + intensity * 40);

  return {
    r: brightness,
    g: brightness,
    b: 255,
    a: alpha
  };
}

function roundedRectInnerDistanceAndNormal(px, py, width, height, radius) {
  const cx = width / 2;
  const cy = height / 2;
  const qx = Math.abs(px - cx) - (width / 2 - radius);
  const qy = Math.abs(py - cy) - (height / 2 - radius);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const outsideDistance = Math.hypot(ox, oy);
  const insideDistance = Math.min(Math.max(qx, qy), 0);
  const sdf = outsideDistance + insideDistance;

  const clampedX = clamp(px, radius, width - radius);
  const clampedY = clamp(py, radius, height - radius);
  let nearestX = px;
  let nearestY = py;

  if (px < radius && py < radius) {
    const v = normalize({ x: px - radius, y: py - radius });
    nearestX = radius + v.x * radius;
    nearestY = radius + v.y * radius;
  } else if (px > width - radius && py < radius) {
    const v = normalize({ x: px - (width - radius), y: py - radius });
    nearestX = width - radius + v.x * radius;
    nearestY = radius + v.y * radius;
  } else if (px < radius && py > height - radius) {
    const v = normalize({ x: px - radius, y: py - (height - radius) });
    nearestX = radius + v.x * radius;
    nearestY = height - radius + v.y * radius;
  } else if (px > width - radius && py > height - radius) {
    const v = normalize({ x: px - (width - radius), y: py - (height - radius) });
    nearestX = width - radius + v.x * radius;
    nearestY = height - radius + v.y * radius;
  } else {
    nearestX = clamp(px, 0, width);
    nearestY = clamp(py, 0, height);
    if (py >= radius && py <= height - radius) {
      nearestX = px < width / 2 ? 0 : width;
    }
    if (px >= radius && px <= width - radius) {
      nearestY = py < height / 2 ? 0 : height;
    }
    if (px >= radius && px <= width - radius && py >= radius && py <= height - radius) {
      const dx = Math.min(px, width - px);
      const dy = Math.min(py, height - py);
      if (dx < dy) {
        nearestX = px < width / 2 ? 0 : width;
        nearestY = py;
      } else {
        nearestX = px;
        nearestY = py < height / 2 ? 0 : height;
      }
    }
  }

  const normal = normalize({ x: px - nearestX, y: py - nearestY });
  return {
    distance: Math.max(0, -sdf),
    normal: Number.isFinite(normal.x) ? normal : { x: 0, y: -1 }
  };
}

function profileHeight(profile, x) {
  switch (profile) {
    case 'convex-squircle':
      return Math.pow(Math.max(0, 1 - Math.pow(1 - x, 4)), 0.25);
    case 'concave':
      return 1 - profileHeight('convex-squircle', x);
    case 'lip': {
      const convex = profileHeight('convex-squircle', x);
      const concave = 1 - convex;
      return mix(convex, concave, smootherstep(0, 1, x));
    }
    case 'convex':
    default:
      return Math.sqrt(Math.max(0, 1 - Math.pow(1 - x, 2)));
  }
}

function profileDerivative(profile, x) {
  const delta = 0.001;
  const x1 = clamp(x - delta, 0, 1);
  const x2 = clamp(x + delta, 0, 1);
  return (profileHeight(profile, x2) - profileHeight(profile, x1)) / Math.max(x2 - x1, 0.0001);
}

function getRadius(config, width, height) {
  const cssVarName = config.radiusVar?.trim();
  if (!cssVarName || cssVarName === '--radius-none') {
    return 0;
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const value = rootStyle.getPropertyValue(cssVarName).trim();
  if (!value) {
    return Math.min(width, height) * 0.18;
  }
  if (value.endsWith('px')) {
    return parseFloat(value);
  }
  if (value.includes('%')) {
    return (parseFloat(value) / 100) * Math.min(width, height);
  }
  if (value === '9999px') {
    return Math.min(width, height) / 2;
  }
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Math.min(width, height) * 0.18;
}

function readElementConfig(element) {
  return {
    profile: element.dataset.liquidGlassProfile || 'convex-squircle',
    variant: element.dataset.liquidGlassVariant || 'panel',
    bezel: Number(element.dataset.liquidGlassBezel || 0.16),
    thickness: Number(element.dataset.liquidGlassThickness || 18),
    refraction: Number(element.dataset.liquidGlassRefraction || 24),
    blur: Number(element.dataset.liquidGlassBlur || 0.8),
    specularOpacity: Number(element.dataset.liquidGlassSpecularOpacity || 0.28),
    specularSaturation: Number(element.dataset.liquidGlassSpecularSaturation || 7),
    radiusVar: element.dataset.liquidGlassRadiusVar || '--radius-md'
  };
}

function isRenderable(rect, element) {
  return rect.width > 4 && rect.height > 4 && !element.hidden && getComputedStyle(element).display !== 'none';
}

function refract(I, N, eta) {
  const dotNI = N.x * I.x + N.y * I.y;
  const k = 1 - eta * eta * (1 - dotNI * dotNI);
  if (k < 0) return null;
  return {
    x: eta * I.x - (eta * dotNI + Math.sqrt(k)) * N.x,
    y: eta * I.y - (eta * dotNI + Math.sqrt(k)) * N.y
  };
}

function degreesToVector(deg) {
  const rad = (deg * Math.PI) / 180;
  return normalize3({
    x: Math.cos(rad),
    y: Math.sin(rad),
    z: 0.85
  });
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function normalize3(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function mix(a, b, t) {
  return a * (1 - t) + b * t;
}

function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value) {
  return clamp(Math.round(value), 0, 255);
}

function sanitizeSelector(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
