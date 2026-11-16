import { testCatalog } from './demo-catalog.js?v=prodacy-duration';

const jobs = new Map();
const prefix = 'product-video-demo-';

function saveJob(job) {
  jobs.set(job.id, job);
  try {
    sessionStorage.setItem(prefix + job.id, JSON.stringify(job));
  } catch {
    // The demo continues while this page is open.
  }
}

function readJob(id) {
  if (jobs.has(id)) return jobs.get(id);
  try {
    return JSON.parse(sessionStorage.getItem(prefix + id));
  } catch {
    return null;
  }
}

export async function demoRequest(url, options) {
  if (url === '/api/templates') return testCatalog;
  if (url === '/api/jobs' && options?.method === 'POST') {
    const id = options.body.get('requestId');
    const templateId = options.body.get('template');
    const template = testCatalog.templates.find(item => item.id === templateId);
    if (!template || typeof id !== 'string') throw new Error('Выберите шаблон.');
    const job = readJob(id) ?? { id, templateId, createdAt: Date.now() };
    saveJob(job);
    return { id, templateId, status: 'queued' };
  }

  const id = /^\/api\/jobs\/([a-f\d-]+)$/i.exec(url)?.[1];
  const job = id && readJob(id);
  const template = job && testCatalog.templates.find(item => item.id === job.templateId);
  if (!template) {
    const error = new Error('Задание не найдено. Запустите его заново.');
    error.status = 404;
    throw error;
  }

  const elapsed = Date.now() - job.createdAt;
  if (elapsed < 2200) {
    return { id, templateId: template.id, status: elapsed < 500 ? 'queued' : 'processing' };
  }
  return {
    id,
    templateId: template.id,
    status: 'completed',
    videoUrl: template.previewUrl,
    downloadUrl: template.previewUrl,
  };
}
