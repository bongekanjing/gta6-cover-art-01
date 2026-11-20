// Vice Cover — editor wiring. Loads photos, keeps the cover state, re-renders the
// live preview on every change, and exports the cover as a PNG in three sizes.
// Photos are read on this machine only; nothing is uploaded anywhere.
import { drawCover, renderCover, panelsFor, LAYOUTS, SIZES, LAYOUT_NAMES } from './cover.js';

const $ = (id) => document.getElementById(id);
const preview = $('preview');

const SAMPLE_PHOTOS = [
  { src: './samples/portrait-neon.jpg', name: 'Portrait' },
  { src: './samples/neon-street.jpg', name: 'Neon street' },
  { src: './samples/beach-sunset.jpg', name: 'Beach sunset' },
];

const state = {
  photos: [], // { img, name }
  panels: panelsFor('hero', []),
  selectedPanel: 0,
  layout: 'hero',
  size: 'square',
  title: 'VICE SUNSET',
  subtitle: 'NEON NIGHTS • PALM SHORES',
  titleStyle: 'sunset',
  grade: 'sunset',
  halftone: true,
  vignette: true,
};

let layoutRects = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function render() {
  const size = SIZES[state.size];
  if (preview.width !== size.w || preview.height !== size.h) {
    preview.width = size.w;
    preview.height = size.h;
  }
  layoutRects = drawCover(preview, state);
  syncPanelControls();
}

function syncPanelControls() {
  const chips = $('panelChips');
  chips.innerHTML = '';
  state.panels.forEach((panel, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `btn chip${i === state.selectedPanel ? ' active' : ''}`;
    chip.textContent = `Panel ${i + 1}`;
    chip.addEventListener('click', () => { state.selectedPanel = i; render(); });
    chips.appendChild(chip);
  });

  const select = $('photoSelect');
  select.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Sunset scene (no photo)';
  select.appendChild(none);
  state.photos.forEach((photo, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = photo.name;
    select.appendChild(option);
  });
  const panel = state.panels[state.selectedPanel];
  select.value = panel.photo === null || panel.photo === undefined ? '' : String(panel.photo);
  $('zoom').value = panel.zoom;
  $('zoomVal').textContent = `${panel.zoom.toFixed(2)}×`;
  $('panX').value = panel.ox;
  $('panY').value = panel.oy;

  const thumbs = $('thumbs');
  thumbs.innerHTML = '';
  if (state.photos.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = 'No photos yet — choose some, or load the samples.';
    thumbs.appendChild(empty);
    return;
  }
  state.photos.forEach((photo, i) => {
    const thumb = document.createElement('img');
    thumb.src = photo.img.src;
    thumb.alt = photo.name;
    thumb.title = `Use “${photo.name}” in panel ${state.selectedPanel + 1}`;
    if (panel.photo === i) thumb.classList.add('assigned');
    thumb.addEventListener('click', () => {
      state.panels[state.selectedPanel].photo = i;
      render();
    });
    thumbs.appendChild(thumb);
  });
}

async function addPhotoFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    state.photos.push({ img, name: file.name.replace(/\.[^.]+$/, '') || 'Photo' });
  } catch {
    $('status').textContent = `Could not read ${file.name} — try another image.`;
  }
}

async function addSamplePhotos() {
  $('status').textContent = 'Loading sample photos…';
  for (const sample of SAMPLE_PHOTOS) {
    if (state.photos.some((p) => p.name === sample.name)) continue;
    try {
      const img = await loadImage(sample.src);
      state.photos.push({ img, name: sample.name });
    } catch {
      $('status').textContent = `Could not load ${sample.src}.`;
      return;
    }
  }
  // A ready-made poster: portrait in the hero panel, street and beach beside it.
  if (state.photos.length >= 3) {
    state.panels[0].photo = 0;
    if (state.panels[1]) state.panels[1].photo = 1;
    if (state.panels[2]) state.panels[2].photo = 2;
  }
  $('status').textContent = 'Sample photos loaded — pick a panel and crop away.';
  render();
}

function exportPNG(sizeKey) {
  const size = SIZES[sizeKey];
  const canvas = renderCover(state, size.w, size.h);
  canvas.toBlob((blob) => {
    if (!blob) {
      $('status').textContent = 'Export failed — try again.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-cover-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $('status').textContent = `Saved vice-cover-${size.w}x${size.h}.png`;
  }, 'image/png');
}

$('photoInput').addEventListener('change', async (event) => {
  const files = [...event.target.files];
  for (const file of files) await addPhotoFile(file);
  if (files.length) {
    // First photo fills the first empty panel automatically.
    const empty = state.panels.find((p) => p.photo === null || p.photo === undefined);
    if (empty) empty.photo = state.photos.length - files.length;
    $('status').textContent = `${files.length} photo${files.length > 1 ? 's' : ''} added.`;
  }
  event.target.value = '';
  render();
});

$('loadSamples').addEventListener('click', addSamplePhotos);

$('layoutRow').addEventListener('click', (event) => {
  const button = event.target.closest('[data-layout]');
  if (!button) return;
  state.layout = button.dataset.layout;
  state.panels = panelsFor(state.layout, state.panels);
  state.selectedPanel = 0;
  document.querySelectorAll('#layoutRow .chip').forEach((b) => b.classList.toggle('active', b === button));
  render();
});

$('sizeRow').addEventListener('click', (event) => {
  const button = event.target.closest('[data-size]');
  if (!button) return;
  state.size = button.dataset.size;
  document.querySelectorAll('#sizeRow .chip').forEach((b) => b.classList.toggle('active', b === button));
  render();
});

$('photoSelect').addEventListener('change', (event) => {
  const value = event.target.value;
  state.panels[state.selectedPanel].photo = value === '' ? null : Number(value);
  render();
});
$('zoom').addEventListener('input', (event) => {
  state.panels[state.selectedPanel].zoom = Number(event.target.value);
  render();
});
$('panX').addEventListener('input', (event) => {
  state.panels[state.selectedPanel].ox = Number(event.target.value);
  render();
});
$('panY').addEventListener('input', (event) => {
  state.panels[state.selectedPanel].oy = Number(event.target.value);
  render();
});
$('fillAll').addEventListener('click', () => {
  const photo = state.panels[state.selectedPanel].photo;
  if (photo === null || photo === undefined) {
    $('status').textContent = 'Pick a photo for this panel first.';
    return;
  }
  state.panels.forEach((panel) => { panel.photo = photo; });
  $('status').textContent = 'All panels now use that photo — crop each one differently.';
  render();
});

$('titleInput').addEventListener('input', (event) => { state.title = event.target.value; render(); });
$('subtitleInput').addEventListener('input', (event) => { state.subtitle = event.target.value; render(); });
$('titleStyle').addEventListener('change', (event) => { state.titleStyle = event.target.value; render(); });
$('gradeSelect').addEventListener('change', (event) => { state.grade = event.target.value; render(); });
$('halftoneToggle').addEventListener('change', (event) => { state.halftone = event.target.checked; render(); });
$('vignetteToggle').addEventListener('change', (event) => { state.vignette = event.target.checked; render(); });

document.querySelectorAll('[data-export]').forEach((button) => {
  button.addEventListener('click', () => exportPNG(button.dataset.export));
});

// Drag to pan the photo inside a panel; scroll to zoom it.
let drag = null;
function panelAt(clientX, clientY) {
  if (!layoutRects) return -1;
  const rect = preview.getBoundingClientRect();
  const x = (clientX - rect.left) * (preview.width / rect.width);
  const y = (clientY - rect.top) * (preview.height / rect.height);
  return layoutRects.panels.findIndex((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
}
preview.addEventListener('pointerdown', (event) => {
  const index = panelAt(event.clientX, event.clientY);
  if (index === -1) return;
  state.selectedPanel = index;
  drag = { x: event.clientX, y: event.clientY };
  preview.setPointerCapture(event.pointerId);
  render();
});
preview.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const rect = preview.getBoundingClientRect();
  const panel = state.panels[state.selectedPanel];
  const layoutPanel = layoutRects.panels[state.selectedPanel];
  panel.ox += (event.clientX - drag.x) / rect.width * (preview.width / layoutPanel.w);
  panel.oy += (event.clientY - drag.y) / rect.height * (preview.height / layoutPanel.h);
  panel.ox = Math.max(-0.6, Math.min(0.6, panel.ox));
  panel.oy = Math.max(-0.6, Math.min(0.6, panel.oy));
  drag = { x: event.clientX, y: event.clientY };
  render();
});
preview.addEventListener('pointerup', () => { drag = null; });
preview.addEventListener('wheel', (event) => {
  const index = panelAt(event.clientX, event.clientY);
  if (index === -1) return;
  event.preventDefault();
  state.selectedPanel = index;
  const panel = state.panels[index];
  panel.zoom = Math.max(1, Math.min(2.5, panel.zoom * (event.deltaY < 0 ? 1.08 : 0.93)));
  render();
}, { passive: false });

// ?demo=1 loads the samples and builds a finished poster, for trying the app fast.
const params = new URLSearchParams(location.search);
if (params.get('demo') === '1') {
  addSamplePhotos();
} else {
  render();
}
