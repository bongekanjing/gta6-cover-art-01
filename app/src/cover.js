// Vice Cover — the cover renderer. Draws a multi-panel GTA-style poster onto a
// canvas: cropped photos with a warm sunset / neon grade, white gutters, a bold
// gradient caption band, and a procedural sunset scene for any panel with no
// photo yet. Pure canvas 2D, no libraries, no network.

export const FONT_STACK = "'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif";
export const BODY_FONT = "'Arial Narrow', Arial, sans-serif";

/** Panel layouts: each returns panel rects (fractions of w/h) plus the title band. */
export const LAYOUTS = {
  hero(w, h) {
    const titleH = 0.2 * h;
    const areaH = h - titleH;
    return {
      panels: [
        { x: 0, y: 0, w: 0.6 * w, h: areaH },
        { x: 0.6 * w, y: 0, w: 0.4 * w, h: 0.5 * areaH },
        { x: 0.6 * w, y: 0.5 * areaH, w: 0.4 * w, h: 0.5 * areaH },
      ],
      title: { x: 0, y: areaH, w, h: titleH },
    };
  },
  grid(w, h) {
    const titleH = 0.18 * h;
    const areaH = h - titleH;
    return {
      panels: [
        { x: 0, y: 0, w: 0.5 * w, h: 0.5 * areaH },
        { x: 0.5 * w, y: 0, w: 0.5 * w, h: 0.5 * areaH },
        { x: 0, y: 0.5 * areaH, w: 0.5 * w, h: 0.5 * areaH },
        { x: 0.5 * w, y: 0.5 * areaH, w: 0.5 * w, h: 0.5 * areaH },
      ],
      title: { x: 0, y: areaH, w, h: titleH },
    };
  },
  strip(w, h) {
    const titleH = 0.16 * h;
    const areaH = h - titleH;
    const panels = [];
    for (let i = 0; i < 4; i++) {
      panels.push({ x: (i / 4) * w, y: 0, w: 0.25 * w, h: areaH });
    }
    return { panels, title: { x: 0, y: areaH, w, h: titleH } };
  },
};

export const LAYOUT_NAMES = { hero: 'Hero + 2', grid: 'Grid 4', strip: 'Strip 4' };

export const SIZES = {
  square: { w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  portrait: { w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  wide: { w: 1920, h: 1080, label: 'Wide 1920 x 1080' },
};

export const TITLE_STYLES = {
  sunset: ['#ffffff', '#ffe9a8', '#ff9a5c', '#ff2e63'],
  neon: ['#ffffff', '#ffd6f2', '#ff5ce1', '#b967ff'],
  gold: ['#ffffff', '#fff3c4', '#ffc93c', '#ff7b00'],
};

export const GRADES = {
  sunset: { top: 'rgba(255, 120, 60, 0.08)', bottom: 'rgba(255, 46, 136, 0.30)' },
  neon: { top: 'rgba(0, 229, 255, 0.10)', bottom: 'rgba(255, 46, 200, 0.38)' },
  gold: { top: 'rgba(255, 190, 80, 0.10)', bottom: 'rgba(255, 110, 30, 0.32)' },
};

/** A fresh panel slot: which photo it shows and how the photo is cropped. */
export function blankPanel() {
  return { photo: null, zoom: 1, ox: 0, oy: 0 };
}

/** Panels for a layout, keeping assignments by index where the count matches. */
export function panelsFor(layout, oldPanels) {
  const count = LAYOUTS[layout](100, 100).panels.length;
  const panels = [];
  for (let i = 0; i < count; i++) {
    panels.push(oldPanels && oldPanels[i] ? { ...oldPanels[i] } : blankPanel());
  }
  return panels;
}

function coverFit(imgW, imgH, rectW, rectH, zoom, ox, oy) {
  const scale = Math.max(rectW / imgW, rectH / imgH) * zoom;
  const dw = imgW * scale;
  const dh = imgH * scale;
  return { dx: (rectW - dw) / 2 + ox * rectW, dy: (rectH - dh) / 2 + oy * rectH, dw, dh };
}

/** Draws one palm silhouette: a curved trunk and drooping fronds. */
function drawPalm(ctx, bx, by, size, lean) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(lean, 1);
  ctx.strokeStyle = '#14042a';
  ctx.lineWidth = Math.max(3, size * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.08, -size * 0.55, size * 0.22, -size * 0.95);
  ctx.stroke();
  const topX = size * 0.22;
  const topY = -size * 0.95;
  ctx.lineWidth = Math.max(2, size * 0.03);
  for (let i = 0; i < 7; i++) {
    const a = (-160 + i * 52) * (Math.PI / 180);
    const len = size * (0.42 + (i % 2) * 0.1);
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(a) * len * 0.6,
      topY + Math.sin(a) * len * 0.55 - size * 0.1,
      topX + Math.cos(a) * len,
      topY + Math.sin(a) * len + size * 0.22,
    );
    ctx.stroke();
  }
  ctx.restore();
}

/** A procedural Vice City sunset: sky, striped sun, skyline, palms. Used for
 *  empty panels so the poster looks finished before any photo is added. */
export function drawSunsetScene(ctx, r, seed) {
  const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  sky.addColorStop(0, '#2b1055');
  sky.addColorStop(0.45, '#c6427a');
  sky.addColorStop(0.75, '#ff7a59');
  sky.addColorStop(1, '#ffb347');
  ctx.fillStyle = sky;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Striped retro sun, low on the horizon.
  const sunR = Math.min(r.w, r.h) * 0.24;
  const sunX = r.x + r.w * (0.32 + (seed % 3) * 0.18);
  const sunY = r.y + r.h * 0.62;
  const sun = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR);
  sun.addColorStop(0, '#fff7ae');
  sun.addColorStop(0.6, '#ffd166');
  sun.addColorStop(1, '#ff6b35');
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  ctx.fillStyle = 'rgba(43, 16, 85, 0.55)';
  let stripeY = sunY + sunR * 0.05;
  let stripeH = sunR * 0.05;
  while (stripeY < sunY + sunR) {
    ctx.fillRect(sunX - sunR, stripeY, sunR * 2, stripeH);
    stripeY += stripeH + sunR * 0.16;
    stripeH *= 1.5;
  }
  ctx.restore();

  // Skyline silhouette along the bottom.
  ctx.fillStyle = '#1a0b33';
  let bx = r.x;
  let i = 0;
  while (bx < r.x + r.w) {
    const bw = r.w * (0.09 + ((seed + i * 7) % 5) * 0.02);
    const bh = r.h * (0.1 + ((seed * 3 + i * 11) % 7) * 0.035);
    ctx.fillRect(bx, r.y + r.h - bh, bw, bh);
    bx += bw + r.w * 0.015;
    i++;
  }
  // Lit windows.
  ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
  for (let k = 0; k < 14; k++) {
    const wx = r.x + (((seed + 1) * (k * 37 + 11)) % 100) / 100 * r.w;
    const wy = r.y + r.h * (0.72 + (((k * 13 + seed) % 10) / 100) * 1.6);
    ctx.fillRect(wx, wy, Math.max(2, r.w * 0.008), Math.max(2, r.h * 0.012));
  }

  drawPalm(ctx, r.x + r.w * 0.08, r.y + r.h * 0.98, Math.min(r.w, r.h) * 0.5, 1);
  drawPalm(ctx, r.x + r.w * 0.94, r.y + r.h * 0.98, Math.min(r.w, r.h) * 0.42, -1);
}

let halftonePattern = null;
function getHalftone(ctx) {
  if (halftonePattern) return halftonePattern;
  const tile = document.createElement('canvas');
  tile.width = 12;
  tile.height = 12;
  const t = tile.getContext('2d');
  t.fillStyle = 'rgba(12, 0, 32, 0.55)';
  t.beginPath();
  t.arc(6, 6, 1.7, 0, Math.PI * 2);
  t.fill();
  halftonePattern = ctx.createPattern(tile, 'repeat');
  return halftonePattern;
}

function drawPanel(ctx, rect, photo, panel, index, state) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  if (photo) {
    const fit = coverFit(photo.naturalWidth, photo.naturalHeight, rect.w, rect.h, panel.zoom, panel.ox, panel.oy);
    ctx.filter = 'saturate(1.45) contrast(1.14) brightness(1.05)';
    ctx.drawImage(photo, rect.x + fit.dx, rect.y + fit.dy, fit.dw, fit.dh);
    ctx.filter = 'none';
  } else {
    drawSunsetScene(ctx, rect, index + 1);
  }

  // Warm sunset / neon grade wash, alternating slightly per panel.
  const grade = GRADES[state.grade] || GRADES.sunset;
  const wash = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  wash.addColorStop(0, index % 2 === 0 ? grade.top : 'rgba(0, 229, 255, 0.07)');
  wash.addColorStop(1, grade.bottom);
  ctx.fillStyle = wash;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  if (state.halftone) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = getHalftone(ctx);
    ctx.fillRect(rect.x, rect.y + rect.h * 0.45, rect.w, rect.h * 0.55);
    ctx.globalAlpha = 1;
  }

  if (state.vignette) {
    const v = ctx.createRadialGradient(
      rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) * 0.35,
      rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.75,
    );
    v.addColorStop(0, 'rgba(15, 0, 35, 0)');
    v.addColorStop(1, 'rgba(15, 0, 35, 0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  ctx.restore();
  // Thin dark edge so panels read as separate plates.
  ctx.strokeStyle = 'rgba(20, 5, 40, 0.55)';
  ctx.lineWidth = Math.max(2, rect.w * 0.004);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

/** Shrinks a font until `text` fits `maxWidth`; returns the fitted size. */
function fitFont(ctx, text, maxWidth, startSize, weight = 900) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  while (size > 10 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }
  return size;
}

function drawTitleBand(ctx, band, state) {
  const bg = ctx.createLinearGradient(0, band.y, 0, band.y + band.h);
  bg.addColorStop(0, '#2a0a4a');
  bg.addColorStop(1, '#12041f');
  ctx.fillStyle = bg;
  ctx.fillRect(band.x, band.y, band.w, band.h);

  // Neon top edge.
  ctx.save();
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = band.h * 0.12;
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(band.x, band.y, band.w, Math.max(3, band.h * 0.02));
  ctx.restore();

  const pad = band.w * 0.04;
  const title = (state.title || 'VICE SUNSET').trim().toUpperCase();
  const sub = (state.subtitle || '').trim().toUpperCase();

  // Kicker.
  const kickerSize = Math.max(12, band.h * 0.11);
  ctx.font = `900 ${kickerSize}px ${BODY_FONT}`;
  try { ctx.letterSpacing = `${Math.max(2, kickerSize * 0.35)}px`; } catch { /* older canvas */ }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ff9de2';
  const kickerY = band.y + band.h * 0.2;
  ctx.fillText('VICE NIGHTS', band.x + band.w / 2, kickerY);
  try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }

  // Big gradient title with a dark outline.
  const titleSize = fitFont(ctx, title, band.w - pad * 2, band.h * 0.52);
  const titleGrad = ctx.createLinearGradient(0, band.y + band.h * 0.28, 0, band.y + band.h * 0.82);
  const stops = TITLE_STYLES[state.titleStyle] || TITLE_STYLES.sunset;
  stops.forEach((color, i) => titleGrad.addColorStop(i / (stops.length - 1), color));
  ctx.font = `900 ${titleSize}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleY = band.y + band.h * (sub ? 0.52 : 0.58);
  ctx.save();
  ctx.shadowColor = 'rgba(255, 46, 136, 0.65)';
  ctx.shadowBlur = titleSize * 0.14;
  ctx.shadowOffsetY = titleSize * 0.03;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#14042a';
  ctx.lineWidth = Math.max(3, titleSize * 0.09);
  ctx.strokeText(title, band.x + band.w / 2, titleY);
  ctx.fillStyle = titleGrad;
  ctx.fillText(title, band.x + band.w / 2, titleY);
  ctx.restore();

  if (sub) {
    const subSize = fitFont(ctx, sub, band.w - pad * 2, band.h * 0.13, 700);
    ctx.font = `700 ${subSize}px ${BODY_FONT}`;
    try { ctx.letterSpacing = `${Math.max(2, subSize * 0.3)}px`; } catch { /* older canvas */ }
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(sub, band.x + band.w / 2, band.y + band.h * 0.93);
    try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
  }
}

/** Draws the whole cover onto `canvas` at its own pixel size. */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const layout = LAYOUTS[state.layout] || LAYOUTS.hero;
  const { panels, title } = layout(w, h);

  // White gutters between panels, poster style.
  ctx.fillStyle = '#f8f2ff';
  ctx.fillRect(0, 0, w, h);

  const gap = Math.max(6, w * 0.008);
  panels.forEach((rect, i) => {
    const inset = {
      x: rect.x + gap / 2,
      y: rect.y + gap / 2,
      w: rect.w - gap,
      h: rect.h - gap,
    };
    const panel = state.panels[i] || blankPanel();
    const photo = panel.photo === null || panel.photo === undefined
      ? null
      : (state.photos[panel.photo] || {}).img || null;
    drawPanel(ctx, inset, photo, panel, i, state);
  });

  drawTitleBand(ctx, title, state);
  return { panels, title, gap };
}

/** Renders the cover at the given size on a fresh canvas (for export). */
export function renderCover(state, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawCover(canvas, state);
  return canvas;
}
