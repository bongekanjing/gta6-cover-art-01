// Neon Coast cover renderer — draws a GTA-style multi-panel poster onto a
// canvas from the editor state. Pure canvas 2D, no libraries, no network.
// The same renderCover() draws the live preview, the ?shot= scenes and the
// exported PNG, so what the screenshots show is exactly what the app makes.

export const LAYOUTS = {
  hero: { panels: 4, label: 'Hero + three' },
  grid: { panels: 4, label: 'Four panels' },
  strip: { panels: 3, label: 'Three strips' },
  full: { panels: 1, label: 'Full bleed' },
};

export const GRADES = {
  sunset: { label: 'Sunset', sat: 1.18, contrast: 1.06 },
  neon: { label: 'Neon night', sat: 1.28, contrast: 1.12 },
  teal: { label: 'Teal coast', sat: 1.12, contrast: 1.04 },
  noir: { label: 'Noir', sat: 0.0, contrast: 1.1 },
};

export const SIZES = {
  '1080x1350': { w: 1080, h: 1350 },
  '1080x1080': { w: 1080, h: 1080 },
  '1920x1080': { w: 1920, h: 1080 },
};

// A tiny deterministic random source so grain is identical on every render.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-grade colour curves: three 256-entry lookup tables, built once.
const lutCache = {};
function gradeLUT(grade) {
  if (lutCache[grade]) return lutCache[grade];
  const r = new Uint8Array(256);
  const g = new Uint8Array(256);
  const b = new Uint8Array(256);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  for (let v = 0; v < 256; v++) {
    const t = v / 255; // 0 = shadow, 1 = highlight
    if (grade === 'sunset') {
      // Shadows go violet, highlights go warm orange.
      r[v] = clamp(v * 1.1 + 14 + 10 * (1 - t));
      g[v] = clamp(v * 0.96 + 3);
      b[v] = clamp(v * 0.9 + 26 * (1 - t) - 4 * t);
    } else if (grade === 'neon') {
      // Pink highlights, deep blue-teal shadows.
      r[v] = clamp(v * 1.05 + 10 * t + 4);
      g[v] = clamp(v * 0.94 + 2);
      b[v] = clamp(v * 1.1 + 16 * (1 - t));
    } else if (grade === 'teal') {
      r[v] = clamp(v * 0.93 + 2);
      g[v] = clamp(v * 1.04 + 5);
      b[v] = clamp(v * 1.07 + 10);
    } else {
      // noir: neutral; saturation is removed in the pixel loop.
      r[v] = clamp(v);
      g[v] = clamp(v);
      b[v] = clamp(v);
    }
  }
  lutCache[grade] = { r, g, b };
  return lutCache[grade];
}

// Draw one photo into a panel rect, graded, with the panel's crop applied.
// The photo is graded on a panel-sized offscreen canvas so the pixel loop
// only ever touches the pixels that are on screen.
function drawGradedPhoto(ctx, img, rect, crop, grade) {
  const w = Math.max(2, Math.round(rect.w));
  const h = Math.max(2, Math.round(rect.h));
  const tmp = drawGradedPhoto.cache ?? (drawGradedPhoto.cache = document.createElement('canvas'));
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const base = Math.max(w / iw, h / ih);
  const scale = base * (crop.zoom || 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2 + (crop.ox || 0) * w;
  const dy = (h - dh) / 2 + (crop.oy || 0) * h;
  tctx.fillStyle = '#1a0f26';
  tctx.fillRect(0, 0, w, h);
  tctx.drawImage(img, dx, dy, dw, dh);

  const spec = GRADES[grade] || GRADES.sunset;
  const lut = gradeLUT(grade);
  const data = tctx.getImageData(0, 0, w, h);
  const px = data.data;
  const sat = spec.sat;
  const con = spec.contrast;
  for (let i = 0; i < px.length; i += 4) {
    let r = lut.r[px[i]];
    let gg = lut.g[px[i + 1]];
    let bb = lut.b[px[i + 2]];
    // Contrast around middle grey.
    r = (r - 128) * con + 128;
    gg = (gg - 128) * con + 128;
    bb = (bb - 128) * con + 128;
    // Saturation (noir sets it to 0, which greyscales the panel).
    const grey = 0.299 * r + 0.587 * gg + 0.114 * bb;
    r = grey + (r - grey) * sat;
    gg = grey + (gg - grey) * sat;
    bb = grey + (bb - grey) * sat;
    px[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    px[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
    px[i + 2] = bb < 0 ? 0 : bb > 255 ? 255 : bb;
  }
  tctx.putImageData(data, 0, 0);
  ctx.drawImage(tmp, rect.x, rect.y, rect.w, rect.h);
}

// Panel rectangles for a layout. Gutters are white, poster-style.
export function layoutPanels(layout, W, H) {
  const g = Math.max(6, Math.round(W * 0.012));
  const inner = { x: g, y: g, w: W - 2 * g, h: H - 2 * g };
  if (layout === 'grid') {
    const hw = (inner.w - g) / 2;
    const hh = (inner.h - g) / 2;
    return [
      { x: inner.x, y: inner.y, w: hw, h: hh },
      { x: inner.x + hw + g, y: inner.y, w: hw, h: hh },
      { x: inner.x, y: inner.y + hh + g, w: hw, h: hh },
      { x: inner.x + hw + g, y: inner.y + hh + g, w: hw, h: hh },
    ];
  }
  if (layout === 'strip') {
    const cw = (inner.w - 2 * g) / 3;
    return [0, 1, 2].map((i) => ({
      x: inner.x + i * (cw + g), y: inner.y, w: cw, h: inner.h,
    }));
  }
  if (layout === 'full') {
    return [{ ...inner }];
  }
  // hero: one big panel left, three stacked right.
  const heroW = inner.w * 0.62;
  const sideX = inner.x + heroW + g;
  const sideW = inner.w - heroW - g;
  const sh = (inner.h - 2 * g) / 3;
  return [
    { x: inner.x, y: inner.y, w: heroW, h: inner.h },
    { x: sideX, y: inner.y, w: sideW, h: sh },
    { x: sideX, y: inner.y + sh + g, w: sideW, h: sh },
    { x: sideX, y: inner.y + 2 * (sh + g), w: sideW, h: sh },
  ];
}

// Split a caption into one or two balanced lines that fit the width.
function fitCaptionLines(ctx, caption, maxWidth, maxSize) {
  const words = caption.trim().split(/\s+/).filter(Boolean);
  let size = maxSize;
  const setFont = (s) => { ctx.font = `${s}px Anton, "Arial Black", sans-serif`; };
  setFont(size);
  if (words.length < 2 || ctx.measureText(caption).width <= maxWidth) {
    while (size > maxSize * 0.4 && ctx.measureText(caption).width > maxWidth) {
      size -= 2;
      setFont(size);
    }
    return { lines: [caption], size };
  }
  // Two lines: balance the words so the lines are near equal width.
  let best = null;
  for (let cut = 1; cut < words.length; cut++) {
    const a = words.slice(0, cut).join(' ');
    const b = words.slice(cut).join(' ');
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!best || w < best.w) best = { lines: [a, b], w };
  }
  size = maxSize;
  setFont(size);
  while (size > maxSize * 0.4 && best.w > maxWidth) {
    size -= 2;
    setFont(size);
    best.w = Math.max(
      ctx.measureText(best.lines[0]).width,
      ctx.measureText(best.lines[1]).width,
    );
  }
  return { lines: best.lines, size };
}

function drawTitleBlock(ctx, W, H, state) {
  const bandH = H * 0.30;
  const bandY = H - bandH;
  // Dark gradient band so the lettering reads over any photo.
  const band = ctx.createLinearGradient(0, bandY - H * 0.06, 0, H);
  band.addColorStop(0, 'rgba(12,4,22,0)');
  band.addColorStop(0.35, 'rgba(12,4,22,0.78)');
  band.addColorStop(1, 'rgba(12,4,22,0.96)');
  ctx.fillStyle = band;
  ctx.fillRect(0, bandY - H * 0.06, W, bandH + H * 0.06);

  // Sunset disc glowing behind the title.
  const discR = H * 0.085;
  const discX = W * 0.5;
  const discY = bandY + H * 0.045;
  const disc = ctx.createRadialGradient(discX, discY, discR * 0.1, discX, discY, discR);
  disc.addColorStop(0, 'rgba(255,209,102,0.95)');
  disc.addColorStop(0.55, 'rgba(255,126,61,0.75)');
  disc.addColorStop(1, 'rgba(255,45,120,0)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(discX, discY, discR, 0, Math.PI * 2);
  ctx.fill();

  const caption = (state.caption || 'SUNSET HEIST').toUpperCase();
  const maxWidth = W * 0.92;
  const maxSize = Math.round(H * 0.105);
  const sub = (state.subtitle || '').trim();
  const subSize = Math.round(H * 0.034);
  const footSize = Math.round(H * 0.016);

  // Lay the block out from the bottom up, so the subtitle and footer can
  // never run off the canvas: footer, then subtitle, then the title above.
  const footBaseline = H - H * 0.016;
  const subBaseline = footBaseline - footSize * 2.4;
  const lastTitleBaseline = sub ? subBaseline - subSize * 1.7 : footBaseline - footSize * 2.4;

  // Shrink the title until its top clears the band, keeping the last line
  // anchored so the block stays glued to the bottom.
  let { lines, size } = fitCaptionLines(ctx, caption, maxWidth, maxSize);
  let lineH = size * 0.94;
  let firstBaseline = lastTitleBaseline - (lines.length - 1) * lineH;
  while (firstBaseline - size * 0.95 < bandY + H * 0.02 && size > maxSize * 0.45) {
    size -= 4;
    ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    lineH = size * 0.94;
    firstBaseline = lastTitleBaseline - (lines.length - 1) * lineH;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  let y = firstBaseline;
  for (const line of lines) {
    ctx.font = `${size}px Anton, "Arial Black", sans-serif`;
    ctx.shadowColor = 'rgba(255,45,120,0.85)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.03;
    ctx.lineWidth = Math.max(4, size * 0.055);
    ctx.strokeStyle = '#160418';
    ctx.strokeText(line, W / 2, y);
    if (state.titleStyle === 'sunset') {
      const grad = ctx.createLinearGradient(0, y - size, 0, y + size * 0.15);
      grad.addColorStop(0, '#fff3c4');
      grad.addColorStop(0.45, '#ffb347');
      grad.addColorStop(1, '#ff2d78');
      ctx.fillStyle = grad;
    } else if (state.titleStyle === 'neon') {
      ctx.fillStyle = '#fff0f6';
      ctx.shadowColor = '#ff2d78';
      ctx.shadowBlur = size * 0.3;
    } else {
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillText(line, W / 2, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    y += lineH;
  }

  // Script subtitle, tilted, sitting just above the footer line.
  if (sub) {
    ctx.save();
    ctx.translate(W * 0.5, subBaseline);
    ctx.rotate(-0.045);
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur = subSize * 0.5;
    ctx.fillStyle = '#ff9ecf';
    ctx.fillText(sub, 0, 0);
    ctx.restore();
  }

  // Small footer line: the app's promise, in the poster.
  ctx.font = `700 ${footSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText('F R E E   ·   O F F L I N E   ·   N O   U P L O A D', W / 2, footBaseline);

  // Top-left tag chip and top-right star meter.
  const chipH = Math.round(H * 0.036);
  const pad = Math.round(W * 0.02);
  ctx.font = `700 ${Math.round(chipH * 0.52)}px system-ui, sans-serif`;
  const tag = (state.tag || 'NEON COAST').toUpperCase();
  const tagW = ctx.measureText(tag).width + pad * 1.6;
  const chipY = Math.round(H * 0.022);
  const chipX = Math.round(W * 0.02);
  ctx.fillStyle = 'rgba(10,3,18,0.85)';
  ctx.beginPath();
  ctx.roundRect(chipX, chipY, tagW, chipH, chipH / 2);
  ctx.fill();
  ctx.fillStyle = '#ff7e3d';
  ctx.beginPath();
  ctx.arc(chipX + pad * 0.7, chipY + chipH / 2, chipH * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, chipX + pad * 1.15, chipY + chipH / 2 + 1);

  ctx.textAlign = 'right';
  ctx.font = `${Math.round(chipH * 0.62)}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(255,209,102,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillText('★★★★★', W - Math.round(W * 0.035), chipY + chipH / 2 + 1);
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';
}

function addGrainAndVignette(ctx, W, H) {
  // Film grain, seeded so every render of the same cover is identical.
  const rand = mulberry32(W * 7919 + H * 104729);
  const dots = Math.round((W * H) / 420);
  for (let i = 0; i < dots; i++) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  const vg = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.42,
    W / 2, H / 2, Math.max(W, H) * 0.75,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,2,16,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// Default crop per panel, so one photo fills several panels differently.
function defaultCrop(panelIndex) {
  // Positive oy moves the photo down, revealing its top (faces); the
  // presets keep heads in frame for the tall sample photos.
  const presets = [
    { zoom: 1.0, ox: 0, oy: 0 },
    { zoom: 1.22, ox: 0, oy: 0.18 },
    { zoom: 1.22, ox: -0.05, oy: 0.08 },
    { zoom: 1.18, ox: 0, oy: 0.1 },
  ];
  return { ...presets[panelIndex % presets.length] };
}

export function defaultState() {
  return {
    layout: 'hero',
    grade: 'sunset',
    size: '1080x1350',
    caption: 'SUNSET HEIST',
    subtitle: 'vice city nights',
    tag: 'NEON COAST',
    titleStyle: 'sunset',
    photos: [],
    panelPhoto: [0, 1, 0, 1],
    crops: [0, 1, 2, 3].map(defaultCrop),
    selectedPanel: 0,
  };
}

// The one render path: preview, shot scenes and exports all call this.
export function renderCover(canvas, state, W, H) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // White poster gutters.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const panels = layoutPanels(state.layout, W, H);
  panels.forEach((rect, i) => {
    const photoIndex = state.panelPhoto[i] ?? 0;
    const photo = state.photos[photoIndex];
    const crop = state.crops[i] || defaultCrop(i);
    if (photo && photo.img && photo.img.complete && photo.img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      drawGradedPhoto(ctx, photo.img, rect, crop, state.grade);
      ctx.restore();
    } else {
      // Empty panel: a sunset placeholder so the poster never looks broken.
      const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      g.addColorStop(0, '#ff7e3d');
      g.addColorStop(0.6, '#ff2d78');
      g.addColorStop(1, '#3b0f5e');
      ctx.fillStyle = g;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `${Math.round(rect.h * 0.09)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('＋ add a photo', rect.x + rect.w / 2, rect.y + rect.h / 2);
    }
    // Thin inner keyline around each panel.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, W * 0.003);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });

  drawTitleBlock(ctx, W, H, state);
  addGrainAndVignette(ctx, W, H);
  return canvas;
}

// Render an export-size cover offscreen and hand back the canvas.
export function exportCoverCanvas(state) {
  const { w, h } = SIZES[state.size] || SIZES['1080x1350'];
  const canvas = document.createElement('canvas');
  renderCover(canvas, state, w, h);
  return canvas;
}
