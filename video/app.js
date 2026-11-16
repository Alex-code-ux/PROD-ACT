import { demoRequest as getJson } from './demo-api.js?v=prodacy-duration';

if (location.hash === '#tariffs') location.replace('./top-up.html');

const $ = (selector) => document.querySelector(selector);
const composer = $('#composer');
const dropArea = $('#drop-area');
const clothesInput = $('#photos');
const clothesList = $('#photo-list');
const attachTile = $('#attach-tile');
const attachTitle = $('#attach-title');
const referenceHint = $('#reference-hint');
const errorBanner = $('#error');
const sendButton = $('#generate');
const picker = $('#picker');
const pickerTitle = $('#picker-title');
const pickerBody = $('#picker-body');
const picks = { person: $('#pick-person'), background: $('#pick-background'), template: $('#pick-template') };
const uploads = { person: $('#person'), background: $('#background') };
const result = $('#result');
const player = $('#player');
const previewLabel = $('#preview-label');
const statusLine = $('#status');
const downloadLink = $('#download');
const templateGrid = $('#template-grid');
const galleryCount = $('#gallery-count');
const modeLabel = $('#mode');

const storageKey = 'product-video-job';
const allowedTypes = new Set(['image/jpeg', 'image/png']);
const maxPhotoBytes = 5 * 1024 * 1024;
const maxPhotos = 3;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const clothes = [];
const refs = { person: { presets: [], preset: undefined, upload: undefined }, background: { presets: [], preset: undefined, upload: undefined } };
let templates = [];
let selected;
let mode = 'demo';
let busy = false;
let openKind = null;
let requestId;

const icons = {
  person: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  background: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.6"/></svg>',
};

function pluralTemplates(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} шаблон`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} шаблона`;
  return `${count} шаблонов`;
}

function showError(message = '') {
  errorBanner.textContent = message;
  errorBanner.hidden = !message;
}

function refTitle(kind) {
  const ref = refs[kind];
  if (ref.upload) return 'Своё фото';
  if (ref.preset) return ref.preset.title;
  return 'Из шаблона';
}

function makeVideo(src, autoplay) {
  const video = document.createElement('video');
  video.src = autoplay ? src : `${src}#t=0.1`;
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'metadata';
  video.setAttribute('aria-hidden', 'true');
  if (autoplay) observeVideo(video);
  return video;
}

const videoObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && !reducedMotion.matches) target.play().catch(() => {});
      else target.pause();
    }
  }, { threshold: 0.3 })
  : null;

function observeVideo(video) {
  if (videoObserver) videoObserver.observe(video);
  else if (!reducedMotion.matches) video.autoplay = true;
}

function templateDuration(template) {
  return `${template.seconds} с`;
}

function renderPickThumbs() {
  for (const kind of ['person', 'background']) {
    const thumb = picks[kind].querySelector('[data-thumb]');
    const ref = refs[kind];
    thumb.replaceChildren();
    thumb.style.backgroundImage = '';
    thumb.style.backgroundSize = '';
    thumb.style.backgroundPosition = '';
    if (ref.upload) {
      thumb.style.backgroundImage = `url("${ref.upload.url}")`;
    } else if (ref.preset) {
      thumb.style.backgroundImage = `url("${ref.preset.imageUrl}")`;
      if (ref.preset.thumb) {
        thumb.style.backgroundSize = ref.preset.thumb.size;
        thumb.style.backgroundPosition = ref.preset.thumb.position;
      }
    } else {
      thumb.innerHTML = icons[kind];
    }
    picks[kind].querySelector('[data-value]').textContent = refTitle(kind);
  }
  const templateThumb = picks.template.querySelector('[data-thumb]');
  if (selected && templateThumb.dataset.id !== selected.id) {
    templateThumb.dataset.id = selected.id;
    templateThumb.replaceChildren(makeVideo(selected.previewUrl, false));
  }
  picks.template.querySelector('[data-value]').textContent = selected?.title ?? 'Не выбран';
  picks.template.querySelector('[data-duration]').textContent = selected ? `· ${templateDuration(selected)}` : '';
}

function hasEdits() {
  return clothes.length > 0 || Object.values(refs).some(({ preset, upload }) => preset || upload);
}

function updateControls() {
  const ready = Boolean(selected && hasEdits());
  sendButton.disabled = busy || !ready;
  sendButton.classList.toggle('busy', busy);
  sendButton.setAttribute('aria-label', busy ? 'Готовим пример' : 'Посмотреть пример');
  clothesInput.disabled = busy || clothes.length >= maxPhotos;
  attachTile.hidden = clothes.length >= maxPhotos;
  attachTitle.textContent = clothes.length
    ? `${selected?.photoTitle ?? 'Фото одежды'}: ${clothes.length} из ${maxPhotos}`
    : 'Прикрепите фото одежды';
  for (const button of [...clothesList.querySelectorAll('button'), ...Object.values(picks)]) button.disabled = busy;
  if (busy) closePicker();
  const parts = [
    clothes.length && 'фото одежды',
    (refs.person.preset || refs.person.upload) && 'модель',
    (refs.background.preset || refs.background.upload) && 'фон',
  ].filter(Boolean);
  referenceHint.textContent = ready
    ? `Выбрано: ${parts.join(', ')}. Нажмите стрелку, чтобы посмотреть пример.`
    : 'Добавьте фото или выберите новую модель или фон.';
  for (const card of templateGrid.querySelectorAll('[data-template]')) {
    card.setAttribute('aria-pressed', card.dataset.template === selected?.id);
  }
  renderPickThumbs();
}

function renderClothes() {
  clothesList.replaceChildren();
  for (const entry of clothes) {
    const item = document.createElement('li');
    const image = document.createElement('img');
    image.src = entry.url;
    image.alt = entry.file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Убрать ${entry.file.name}`);
    remove.addEventListener('click', () => {
      URL.revokeObjectURL(entry.url);
      clothes.splice(clothes.indexOf(entry), 1);
      changed();
    });
    item.append(image, remove);
    clothesList.append(item);
  }
}

function changed() {
  requestId = undefined;
  showError();
  renderClothes();
  updateControls();
}

function validFiles(files) {
  if (files.some((file) => !allowedTypes.has(file.type) || !file.size || file.size > maxPhotoBytes)) {
    showError('Подходят только JPG или PNG размером до 5 МБ.');
    return false;
  }
  return true;
}

function addClothes(fileList) {
  if (busy || !fileList.length) return;
  const files = Array.from(fileList);
  if (files.length + clothes.length > maxPhotos) {
    showError('Можно прикрепить до трёх фото. Уберите лишние и добавьте снова.');
    return;
  }
  if (!validFiles(files)) return;
  clothes.push(...files.map((file) => ({ file, url: URL.createObjectURL(file) })));
  changed();
}

function setRef(kind, { preset, file } = {}) {
  const ref = refs[kind];
  if (ref.upload) URL.revokeObjectURL(ref.upload.url);
  ref.upload = file ? { file, url: URL.createObjectURL(file) } : undefined;
  ref.preset = file ? undefined : preset;
  closePicker();
  changed();
}

function selectTemplate(template) {
  if (selected === template) return;
  requestId = undefined;
  selected = template;
  updateControls();
}

function option({ pressed, media, title, description, onSelect }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option';
  button.setAttribute('aria-pressed', pressed);
  const strong = document.createElement('strong');
  strong.textContent = title;
  button.append(media, strong);
  if (description) {
    const text = document.createElement('span');
    text.className = 'hint';
    text.textContent = description;
    button.append(text);
  }
  button.addEventListener('click', onSelect);
  return button;
}

function textOption(className, label, pressed, onSelect) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (pressed !== undefined) button.setAttribute('aria-pressed', pressed);
  button.textContent = label;
  button.addEventListener('click', onSelect);
  return button;
}

function renderPicker(kind) {
  pickerBody.replaceChildren();
  pickerBody.classList.toggle('wide', kind === 'person');
  if (kind === 'template') {
    pickerTitle.textContent = `Шаблоны · ${pluralTemplates(templates.length)}`;
    for (const template of templates) {
      const media = makeVideo(template.previewUrl, true);
      media.className = 'option-media';
      pickerBody.append(option({
        pressed: template === selected, media,
        title: template.title, description: `${templateDuration(template)} · ${template.description}`,
        onSelect: () => { selectTemplate(template); closePicker(); },
      }));
    }
    return;
  }
  const ref = refs[kind];
  pickerTitle.textContent = kind === 'person' ? 'Выберите модель' : 'Выберите фон';
  for (const preset of ref.presets) {
    const media = document.createElement('img');
    media.className = 'option-media';
    media.src = preset.imageUrl;
    media.alt = preset.title;
    pickerBody.append(option({
      pressed: !ref.upload && ref.preset === preset, media, title: preset.title,
      onSelect: () => setRef(kind, { preset }),
    }));
  }
  pickerBody.append(
    textOption('option-upload', '+ Загрузить своё фото', undefined, () => uploads[kind].click()),
    textOption('option-empty', 'Оставить из шаблона', !ref.upload && !ref.preset, () => setRef(kind)),
  );
}

function openPicker(kind) {
  if (openKind === kind) {
    closePicker();
    return;
  }
  openKind = kind;
  renderPicker(kind);
  picker.hidden = false;
  for (const [name, button] of Object.entries(picks)) button.setAttribute('aria-expanded', name === kind);
}

function closePicker() {
  if (!openKind) return;
  openKind = null;
  picker.hidden = true;
  for (const video of pickerBody.querySelectorAll('video')) videoObserver?.unobserve(video);
  pickerBody.replaceChildren();
  for (const button of Object.values(picks)) button.setAttribute('aria-expanded', 'false');
}

function renderGallery() {
  galleryCount.textContent = pluralTemplates(templates.length);
  for (const template of templates) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'template-card';
    card.dataset.template = template.id;
    const chip = document.createElement('span');
    chip.className = 'card-chip';
    chip.textContent = `${templateDuration(template)} · 3:4`;
    const title = document.createElement('strong');
    title.textContent = template.title;
    const description = document.createElement('span');
    description.className = 'muted';
    description.textContent = template.description;
    card.append(makeVideo(template.previewUrl, true), chip, title, description);
    card.addEventListener('click', () => {
      if (busy) return;
      selectTemplate(template);
      composer.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
    });
    templateGrid.append(card);
  }
  const soon = document.createElement('div');
  soon.className = 'template-soon';
  soon.textContent = 'Новые шаблоны появятся здесь';
  templateGrid.append(soon);
}

function rememberJob(id) {
  try {
    if (id) sessionStorage.setItem(storageKey, id);
    else sessionStorage.removeItem(storageKey);
  } catch {
    // The page works without browser storage.
  }
}

function showResult(url, label, done) {
  result.hidden = false;
  result.classList.toggle('done', done);
  if (player.getAttribute('src') !== url) player.src = url;
  player.play().catch(() => {});
  previewLabel.textContent = label;
}

function showJob(job) {
  switch (job.status) {
    case 'completed': {
      const expires = job.expiresAt && new Date(job.expiresAt);
      const hasExpiry = expires && !Number.isNaN(expires.getTime());
      showResult(job.videoUrl, mode === 'demo' ? 'Демо-результат' : 'Готово', true);
      statusLine.textContent = hasExpiry
        ? `Ролик готов. Ссылка действует до ${expires.toLocaleString('ru-RU')}.`
        : mode === 'demo'
          ? 'Демо показывает пример шаблона. В рабочей версии здесь будет ролик с вашей одеждой.'
          : 'Ролик готов. Его можно скачать.';
      downloadLink.href = job.downloadUrl;
      downloadLink.hidden = false;
      return true;
    }
    case 'failed':
      statusLine.textContent = job.message || 'Ролик не получился. Попробуйте отправить ещё раз.';
      rememberJob(null);
      return true;
    default:
      statusLine.textContent = job.message || (job.status === 'queued' ? 'Ролик в очереди…' : 'Готовим ролик…');
      return false;
  }
}

async function pollJob(id) {
  while (busy) {
    try {
      const job = await getJson(`/api/jobs/${id}`);
      if (showJob(job)) break;
    } catch (error) {
      if (error.status === 404) {
        rememberJob(null);
        statusLine.textContent = error.message;
        break;
      }
      statusLine.textContent = 'Связь прервалась. Проверяем статус снова…';
    }
    await new Promise((resolve) => setTimeout(resolve, mode === 'demo' ? 650 : 4500));
  }
  busy = false;
  updateControls();
}

clothesInput.addEventListener('change', () => {
  addClothes(clothesInput.files);
  clothesInput.value = '';
});
for (const kind of ['person', 'background']) {
  uploads[kind].addEventListener('change', () => {
    const [file] = uploads[kind].files;
    uploads[kind].value = '';
    if (file && validFiles([file])) setRef(kind, { file });
  });
}
for (const [kind, button] of Object.entries(picks)) button.addEventListener('click', () => openPicker(kind));
$('#picker-close').addEventListener('click', closePicker);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePicker();
});
dropArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!busy) dropArea.classList.add('dragging');
});
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragging'));
dropArea.addEventListener('drop', (event) => {
  event.preventDefault();
  dropArea.classList.remove('dragging');
  addClothes(event.dataTransfer.files);
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !selected || !hasEdits()) return;
  showError();
  busy = true;
  downloadLink.hidden = true;
  showResult(selected.previewUrl, 'Готовим', false);
  statusLine.textContent = 'Готовим пример…';
  updateControls();
  result.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });

  requestId ||= crypto.randomUUID();
  const form = new FormData();
  form.set('template', selected.id);
  form.set('requestId', requestId);
  for (const { file } of clothes) form.append('photos', file);
  for (const kind of ['person', 'background']) {
    const ref = refs[kind];
    if (ref.upload) form.append(kind, ref.upload.file);
    else if (ref.preset) form.set(`${kind}Preset`, ref.preset.id);
  }

  try {
    const job = await getJson('/api/jobs', { method: 'POST', body: form });
    requestId = undefined;
    rememberJob(job.id);
    await pollJob(job.id);
  } catch (error) {
    statusLine.textContent = 'Можно отправить ещё раз.';
    showError(error.status ? error.message : 'Не удалось связаться с сервисом. Проверьте интернет и повторите.');
    busy = false;
    updateControls();
  }
});

async function init() {
  const config = await getJson('/api/templates');
  templates = config.templates;
  mode = config.mode;
  modeLabel.textContent = mode === 'demo' ? 'Демо' : 'Higgsfield Light';
  modeLabel.hidden = false;
  refs.person.presets = config.referencePresets?.person ?? [];
  refs.background.presets = config.referencePresets?.background ?? [];
  selected = templates[0];
  renderGallery();
  updateControls();

  let savedId;
  try {
    savedId = sessionStorage.getItem(storageKey);
  } catch {
    // Browser storage can be disabled.
  }
  if (!savedId) return;
  const job = await getJson(`/api/jobs/${savedId}`).catch(() => null);
  const template = job && templates.find((item) => item.id === job.templateId);
  if (!template) return;
  selected = template;
  busy = true;
  updateControls();
  showResult(template.previewUrl, 'Готовим', false);
  if (!showJob(job)) {
    await pollJob(job.id);
    return;
  }
  busy = false;
  updateControls();
}

init().catch(() => {
  referenceHint.textContent = 'Не удалось загрузить шаблоны. Обновите страницу.';
});
