import { demoRequest as getJson } from './demo-api.js';
const editor = document.querySelector('#editor');
const dropArea = document.querySelector('#drop-area');
const photoHeading = document.querySelector('#photos-heading');
const photoFields = {
  photos: { input: document.querySelector('#photos'), list: document.querySelector('#photo-list'), entries: [] },
  person: {
    input: document.querySelector('#person'), list: document.querySelector('#person-list'),
    presets: document.querySelector('#person-presets'), entries: [],
  },
  background: {
    input: document.querySelector('#background'), list: document.querySelector('#background-list'),
    presets: document.querySelector('#background-presets'), entries: [],
  },
};
const templateList = document.querySelector('#templates');
const referenceHint = document.querySelector('#reference-hint');
const generateButton = document.querySelector('#generate');
const errorBanner = document.querySelector('#error');
const player = document.querySelector('#player');
const previewLabel = document.querySelector('#preview-label');
const statusLine = document.querySelector('#status');
const downloadLink = document.querySelector('#download');
const modeLabel = document.querySelector('#mode');
const storageKey = 'product-video-job';
const allowedTypes = new Set(['image/jpeg', 'image/png']);
const maxPhotoBytes = 5 * 1024 * 1024;

let templates = [];
let mode = 'demo';
let selected;
let busy = false;
let requestId;

function showError(message = '') {
  errorBanner.textContent = message;
  errorBanner.hidden = !message;
}

function referenceLabels() {
  const { photos, person, background } = photoFields;
  const labels = [];
  if (photos.entries.length) labels.push(selected?.photoTitle ?? 'Фото товара');
  if (person.preset || person.entries.length) labels.push(person.preset?.title ?? 'Фото человека');
  if (background.preset || background.entries.length) labels.push(background.preset?.title ?? 'Фото фона');
  return labels;
}

function updateControls() {
  const labels = referenceLabels();
  referenceHint.textContent = labels.length
    ? `Для генерации: ${labels.join(' · ')}`
    : 'Выберите хотя бы одно фото для замены.';
  generateButton.disabled = busy || !selected || !labels.length;
  generateButton.textContent = busy ? 'Готовим ролик…' : 'Создать ролик';
  for (const { input, list, presets, preset } of Object.values(photoFields)) {
    input.disabled = busy;
    for (const button of list.querySelectorAll('button')) button.disabled = busy;
    for (const button of presets?.children ?? []) {
      button.disabled = busy;
      button.setAttribute('aria-pressed', button.dataset.preset === preset?.id);
    }
  }
  for (const button of templateList.children) {
    button.disabled = busy;
    button.setAttribute('aria-pressed', button.dataset.template === selected?.id);
  }
}

function rememberJob(id) {
  try {
    if (id) sessionStorage.setItem(storageKey, id);
    else sessionStorage.removeItem(storageKey);
  } catch {
    // The current session can run without browser storage.
  }
}

function setPreview(url, label) {
  if (player.getAttribute('src') !== url) player.src = url;
  previewLabel.textContent = label;
}

function selectTemplate(template) {
  if (selected === template) return;
  requestId = undefined;
  rememberJob(null);
  selected = template;
  photoHeading.textContent = template.photoTitle ?? 'Фото товара';
  downloadLink.hidden = true;
  setPreview(template.previewUrl, 'Исходный шаблон');
  statusLine.textContent = mode === 'demo'
    ? 'Демо выдаёт пример выбранного шаблона.'
    : 'После запуска задание отправится в Higgsfield.';
  updateControls();
}

function renderTemplates() {
  for (const template of templates) {
    const button = document.createElement('button');
    button.className = 'template';
    button.type = 'button';
    button.dataset.template = template.id;
    button.addEventListener('click', () => selectTemplate(template));
    const thumbnail = document.createElement('video');
    thumbnail.src = `${template.previewUrl}#t=0.1`;
    thumbnail.preload = 'metadata';
    thumbnail.muted = true;
    thumbnail.playsInline = true;
    thumbnail.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = template.title;
    const description = document.createElement('span');
    description.className = 'hint';
    description.textContent = template.description;
    button.append(thumbnail, title, description);
    templateList.append(button);
  }
}

function renderPresets(field, presets) {
  for (const preset of presets) {
    const button = document.createElement('button');
    button.className = 'template';
    button.type = 'button';
    button.dataset.preset = preset.id;
    button.addEventListener('click', () => {
      field.preset = field.preset === preset ? undefined : preset;
      clearPhotos(field);
      renderPhotos(field);
      referencesChanged();
    });
    const image = document.createElement('img');
    image.src = preset.imageUrl;
    image.alt = '';
    const title = document.createElement('strong');
    title.textContent = preset.title;
    button.append(image, title);
    field.presets.append(button);
  }
}

function referencesChanged() {
  requestId = undefined;
  showError();
  updateControls();
}

function clearPhotos(field) {
  for (const entry of field.entries) URL.revokeObjectURL(entry.url);
  field.entries = [];
}

function clearExtraReferences() {
  for (const field of [photoFields.person, photoFields.background]) {
    field.preset = undefined;
    clearPhotos(field);
    renderPhotos(field);
  }
}

function renderPhotos(field) {
  field.list.replaceChildren();
  field.list.hidden = !field.entries.length;
  for (const entry of field.entries) {
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
      field.entries = field.entries.filter((photo) => photo !== entry);
      renderPhotos(field);
      referencesChanged();
    });
    item.append(image, remove);
    field.list.append(item);
  }
}

function addPhotos(field, fileList) {
  if (busy || !fileList.length) return;
  const files = Array.from(fileList);
  if (field === photoFields.photos && files.length + field.entries.length > 3) {
    showError('Можно добавить до трёх фотографий. Уберите лишние перед загрузкой.');
    return;
  }
  if (files.some((file) => !allowedTypes.has(file.type) || !file.size || file.size > maxPhotoBytes)) {
    showError('Выберите JPG или PNG размером до 5 МБ.');
    return;
  }
  if (field !== photoFields.photos) {
    clearPhotos(field);
    field.preset = undefined;
  }
  field.entries.push(...files.map((file) => ({ file, url: URL.createObjectURL(file) })));
  renderPhotos(field);
  referencesChanged();
}



function showJob(job) {
  switch (job.status) {
    case 'completed': {
      const expires = job.expiresAt && new Date(job.expiresAt);
      const hasExpiry = expires && !Number.isNaN(expires.getTime());
      setPreview(job.videoUrl, mode === 'demo' ? 'Демо-результат' : 'Результат');
      statusLine.textContent = hasExpiry
        ? `Ролик готов. Ссылка действует до ${expires.toLocaleString('ru-RU')}.`
        : 'Ролик готов к скачиванию.';
      downloadLink.href = job.downloadUrl;
      downloadLink.hidden = false;
      clearExtraReferences();
      return true;
    }
    case 'failed':
      statusLine.textContent = job.message || 'Задание завершилось без ролика.';
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

for (const field of Object.values(photoFields)) {
  field.input.addEventListener('change', () => {
    addPhotos(field, field.input.files);
    field.input.value = '';
  });
}
dropArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!busy) dropArea.classList.add('dragging');
});
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragging'));
dropArea.addEventListener('drop', (event) => {
  event.preventDefault();
  dropArea.classList.remove('dragging');
  addPhotos(photoFields.photos, event.dataTransfer.files);
});

editor.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !selected || !referenceLabels().length) return;
  showError();
  busy = true;
  downloadLink.hidden = true;
  setPreview(selected.previewUrl, 'Исходный шаблон');
  statusLine.textContent = 'Отправляем фотографии…';
  updateControls();

  requestId ||= crypto.randomUUID();
  const form = new FormData();
  form.set('template', selected.id);
  form.set('requestId', requestId);
  for (const [name, { entries, preset }] of Object.entries(photoFields)) {
    for (const { file } of entries) form.append(name, file);
    if (preset) form.set(`${name}Preset`, preset.id);
  }

  try {
    const job = await getJson('/api/jobs', { method: 'POST', body: form });
    requestId = undefined;
    rememberJob(job.id);
    await pollJob(job.id);
  } catch (error) {
    statusLine.textContent = 'Можно повторить отправку.';
    showError(error.status ? error.message : 'Не удалось связаться с приложением.');
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
  renderTemplates();
  renderPresets(photoFields.person, config.referencePresets?.person ?? []);
  renderPresets(photoFields.background, config.referencePresets?.background ?? []);
  let savedId;
  try {
    savedId = sessionStorage.getItem(storageKey);
  } catch {
    // Browser storage can be disabled.
  }
  selectTemplate(templates[0]);
  if (!savedId) return;
  busy = true;
  updateControls();
  const job = await getJson(`/api/jobs/${savedId}`).catch(() => null);
  if (job) {
    selectTemplate(templates.find((template) => template.id === job.templateId) ?? templates[0]);
    rememberJob(job.id);
    if (!showJob(job)) {
      await pollJob(job.id);
      return;
    }
  }
  busy = false;
  updateControls();
}

init().catch(() => {
  statusLine.textContent = 'Не удалось загрузить шаблоны. Обновите страницу.';
});
