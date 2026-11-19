// Neon Coast editor — wires the controls to the cover renderer, loads the
// photos and fonts, and runs the ?shot= scenes the screenshots are taken
// from. Everything runs offline: photos are read on this machine only.
import {
  LAYOUTS, GRADES, SIZES,
  layoutPanels, renderCover, exportCoverCanvas, defaultState,
} from './cover.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot') || '';
const isCoverShot = shot === 'cover';
const isExportProbe = shot === 'export';

const stage = document.getElementById('stage');
const state = defaultState();

// URL params drive the shot scenes (and are handy for sharing a setup).
if (params.get('layout') && LAYOUTS[params.get('layout')]) state.layout = params.get('layout');
if (params.get('grade') && GRADES[params.get('grade')]) state.grade = params.get('grade');
if (params.get('size') && SIZES[params.get('size')]) state.size = params.get('size');
if (params.get('caption')) state.caption = params.get('caption');
if (params.get('subtitle')) state.subtitle = params.get('subtitle');
if (params.get('tag')) state.tag = params.get('tag');
if (params.get('titleStyle')) state.titleStyle = params.get('titleStyle');

let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawStage();
  });
}

function drawStage() {
  if (isCoverShot) {
    // The cover fills the window: the screenshot IS the exported cover,
    // drawn by the app at the window's own size.
    renderCover(stage, state, window.innerWidth, window.innerHeight);
    return;
  }
  const { w, h } = SIZES[state.size] || SIZES['1080x1350'];
  renderCover(stage, state, w, h);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + url));
    img.src = url;
  });
}

async function loadFont(name, url) {
  try {
    const face = new FontFace(name, `url(${url})`);
    await face.load();
    document.fonts.add(face);
  } catch (err) {
    console.warn('font failed, using fallback:', name, err);
  }
}

async function loadSamplePhotos() {
  const wanted = params.get('photo');
  const order = wanted === 'boulevard'
    ? ['boulevard', 'pier']
    : ['pier', 'boulevard'];
  const loaded = [];
  for (const key of order) {
    try {
      const img = await loadImage(`samples/${key}.jpg`);
      loaded.push({ name: key === 'pier' ? 'Pier day' : 'Boulevard dusk', img });
    } catch (err) {
      console.warn('sample failed:', key, err);
    }
  }
  state.photos = loaded;
  // Keep panel assignments inside the photo list.
  state.panelPhoto = state.panelPhoto.map((i) => Math.min(i, Math.max(0, loaded.length - 1)));
}

// ---- photo slots: one row per panel, pick which photo fills it ----
const slotsBox = document.getElementById('photoSlots');

function rebuildSlots() {
  slotsBox.innerHTML = '';
  const panels = layoutPanels(state.layout, 100, 100);
  panels.forEach((_, i) => {
    const row = document.createElement('div');
    row.className = 'slot' + (state.selectedPanel === i ? ' selected' : '');
    row.addEventListener('click', () => {
      state.selectedPanel = i;
      syncCropControls();
      rebuildSlots();
      requestRender();
    });
    const photo = state.photos[state.panelPhoto[i]];
    const thumb = document.createElement('img');
    thumb.alt = '';
    thumb.src = photo ? photo.img.src : '';
    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = `Panel ${i + 1} · ${photo ? photo.name : 'no photo'}`;
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Photo for panel ${i + 1}`);
    state.photos.forEach((p, pi) => {
      const opt = document.createElement('option');
      opt.value = String(pi);
      opt.textContent = p.name;
      if (pi === state.panelPhoto[i]) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', (ev) => {
      ev.stopPropagation();
      state.panelPhoto[i] = Number(select.value);
      state.selectedPanel = i;
      syncCropControls();
      rebuildSlots();
      requestRender();
    });
    select.addEventListener('click', (ev) => ev.stopPropagation());
    row.append(thumb, name, select);
    slotsBox.appendChild(row);
  });
}

// ---- controls ----
function bindGroup(containerId, attr, apply) {
  const box = document.getElementById(containerId);
  box.addEventListener('click', (ev) => {
    const btn = ev.target.closest(`[data-${attr}]`);
    if (!btn) return;
    box.querySelectorAll('.active').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    apply(btn.dataset[attr]);
    requestRender();
  });
}

bindGroup('layoutGrid', 'layout', (v) => {
  state.layout = v;
  if (state.selectedPanel >= LAYOUTS[v].panels) state.selectedPanel = 0;
  rebuildSlots();
  syncCropControls();
});
bindGroup('gradeGrid', 'grade', (v) => { state.grade = v; });
bindGroup('sizePicker', 'size', (v) => { state.size = v; });

const captionInput = document.getElementById('captionInput');
const subtitleInput = document.getElementById('subtitleInput');
const tagInput = document.getElementById('tagInput');
const titleStyle = document.getElementById('titleStyle');
captionInput.value = state.caption;
subtitleInput.value = state.subtitle;
tagInput.value = state.tag;
titleStyle.value = state.titleStyle;
captionInput.addEventListener('input', () => { state.caption = captionInput.value; requestRender(); });
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; requestRender(); });
tagInput.addEventListener('input', () => { state.tag = tagInput.value; requestRender(); });
titleStyle.addEventListener('change', () => { state.titleStyle = titleStyle.value; requestRender(); });

const zoomSlider = document.getElementById('zoomSlider');
const selectedLabel = document.getElementById('selectedLabel');
function syncCropControls() {
  const crop = state.crops[state.selectedPanel];
  zoomSlider.value = Math.round((crop?.zoom || 1) * 100);
  selectedLabel.textContent = `Panel ${state.selectedPanel + 1} — drag the photo, scroll to zoom.`;
}
zoomSlider.addEventListener('input', () => {
  const crop = state.crops[state.selectedPanel];
  if (crop) crop.zoom = Number(zoomSlider.value) / 100;
  requestRender();
});
document.getElementById('fitBtn').addEventListener('click', () => {
  state.crops[state.selectedPanel] = { zoom: 1, ox: 0, oy: 0 };
  syncCropControls();
  requestRender();
});
document.getElementById('swapBtn').addEventListener('click', () => {
  if (!state.photos.length) return;
  const i = state.selectedPanel;
  state.panelPhoto[i] = (state.panelPhoto[i] + 1) % state.photos.length;
  rebuildSlots();
  requestRender();
});

// Upload: photos are read on this machine and never leave it.
document.getElementById('uploadInput').addEventListener('change', async (ev) => {
  const files = [...ev.target.files];
  for (const file of files) {
    try {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      state.photos.push({ name: file.name.replace(/\.[^.]+$/, ''), img });
    } catch (err) {
      console.warn('upload failed:', file.name, err);
    }
  }
  ev.target.value = '';
  rebuildSlots();
  requestRender();
});
document.querySelectorAll('.sample-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const key = btn.dataset.sample;
    if (state.photos.some((p) => p.img.src.includes(`${key}.jpg`))) return;
    try {
      const img = await loadImage(`samples/${key}.jpg`);
      state.photos.push({ name: key === 'pier' ? 'Pier day' : 'Boulevard dusk', img });
      rebuildSlots();
      requestRender();
    } catch (err) {
      console.warn('sample failed:', key, err);
    }
  });
});

// ---- canvas interaction: click selects a panel, drag pans, wheel zooms ----
function panelAt(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const sx = stage.width / rect.width;
  const sy = stage.height / rect.height;
  const x = (clientX - rect.left) * sx;
  const y = (clientY - rect.top) * sy;
  const panels = layoutPanels(state.layout, stage.width, stage.height);
  return panels.findIndex((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
}

let drag = null;
stage.addEventListener('pointerdown', (ev) => {
  const i = panelAt(ev.clientX, ev.clientY);
  if (i === -1) return;
  state.selectedPanel = i;
  syncCropControls();
  rebuildSlots();
  const rect = stage.getBoundingClientRect();
  drag = {
    panel: i,
    startX: ev.clientX,
    startY: ev.clientY,
    ox: state.crops[i].ox,
    oy: state.crops[i].oy,
    scaleX: stage.width / rect.width,
    scaleY: stage.height / rect.height,
  };
  stage.setPointerCapture(ev.pointerId);
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const panels = layoutPanels(state.layout, stage.width, stage.height);
  const rect = panels[drag.panel];
  const crop = state.crops[drag.panel];
  crop.ox = drag.ox + ((ev.clientX - drag.startX) * drag.scaleX) / rect.w;
  crop.oy = drag.oy + ((ev.clientY - drag.startY) * drag.scaleY) / rect.h;
  crop.ox = Math.max(-1, Math.min(1, crop.ox));
  crop.oy = Math.max(-1, Math.min(1, crop.oy));
  requestRender();
});
stage.addEventListener('pointerup', () => { drag = null; });
stage.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const i = panelAt(ev.clientX, ev.clientY);
  if (i === -1) return;
  state.selectedPanel = i;
  const crop = state.crops[i];
  crop.zoom = Math.max(1, Math.min(3, crop.zoom * (1 - ev.deltaY * 0.001)));
  syncCropControls();
  requestRender();
}, { passive: false });

// Re-render when the window changes size (cover shots fill the window).
window.addEventListener('resize', () => { if (isCoverShot) requestRender(); });

// ---- export ----
document.getElementById('exportBtn').addEventListener('click', () => {
  const canvas = exportCoverCanvas(state);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (state.caption || 'cover').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cover';
    a.href = url;
    a.download = `neon-coast-${slug}-${state.size}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
});

// ---- boot ----
async function boot() {
  if (isCoverShot) document.body.classList.add('shot-cover');
  await Promise.all([
    loadFont('Anton', 'fonts/Anton-Regular.ttf'),
    loadFont('Pacifico', 'fonts/Pacifico-Regular.ttf'),
  ]);
  await loadSamplePhotos();
  rebuildSlots();
  syncCropControls();
  if (document.fonts?.ready) await document.fonts.ready;
  drawStage();
  document.title = isCoverShot ? 'COVER-READY' : 'Neon Coast — GTA 6-style Cover Studio';

  if (isExportProbe) {
    // Headless check: export the PNG and report its byte size in the title.
    const canvas = exportCoverCanvas(state);
    canvas.toBlob((blob) => {
      document.title = blob
        ? `EXPORT-OK ${blob.size} ${state.size}`
        : 'EXPORT-FAIL';
    }, 'image/png');
  }
}
boot();
