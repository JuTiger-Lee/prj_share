const BUCKET = 'project-media';
const MAX_PHOTOS = 6;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (버킷 제한과 동일)
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const db = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

const $ = (sel) => document.querySelector(sel);
const grid = $('#grid');
const empty = $('#empty');

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

function publicUrl(path) {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function videoNode(src, { thumb = false } = {}) {
  return thumb
    ? el('video', { src: src + '#t=0.1', muted: true, preload: 'metadata', playsInline: true })
    : el('video', { src, controls: true, preload: 'metadata', playsInline: true });
}

function imageNode(src, { lazy = false } = {}) {
  return el('img', { src, alt: '', loading: lazy ? 'lazy' : 'eager' });
}

// ---------- 목록 ----------
function thumbnail(p) {
  if (p.photo_paths.length) return imageNode(publicUrl(p.photo_paths[0]), { lazy: true });
  const video = p.video_path || p.promo_video_path;
  if (video) return videoNode(publicUrl(video), { thumb: true });
  return p.name.slice(0, 1);
}

function card(p) {
  const tags = [
    p.video_path && '영상',
    p.photo_paths.length && `사진 ${p.photo_paths.length}`,
    p.promo_video_path && '홍보 영상',
  ].filter(Boolean);

  const thumb = el('div', { className: 'thumb' }, thumbnail(p));
  if (tags.length) thumb.append(el('span', { className: 'badge', textContent: tags.join(' · ') }));

  const node = el('article', { className: 'card', tabIndex: 0 }, [
    thumb,
    el('div', { className: 'card-body' }, [
      el('h3', { className: 'card-title', textContent: p.name }),
      el('p', { className: 'meta', textContent: formatDate(p.created_at) }),
    ]),
  ]);
  node.addEventListener('click', () => openDetail(p));
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDetail(p); });
  return node;
}

async function load() {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    empty.textContent = '프로젝트를 불러오지 못했어요. 잠시 후 새로고침해 주세요.';
    empty.hidden = false;
    return;
  }
  grid.replaceChildren(...data.map(card));
  empty.textContent = '아직 올라온 프로젝트가 없어요.';
  empty.hidden = data.length > 0;
}

// ---------- 상세 ----------
const detailDialog = $('#detailDialog');

function section(title, nodes) {
  return el('section', { className: 'detail-section' }, [
    el('h3', { className: 'detail-label', textContent: title }),
    el('div', { className: 'detail-media' }, nodes),
  ]);
}

function openDetail(p) {
  $('#detailName').textContent = p.name;
  $('#detailMeta').textContent = formatDate(p.created_at);

  $('#detailBody').replaceChildren(
    ...[
      p.video_path && section('프로젝트 영상', videoNode(publicUrl(p.video_path))),
      p.photo_paths.length && section('프로젝트 사진', p.photo_paths.map((path) => imageNode(publicUrl(path)))),
      p.promo_video_path && section('홍보 영상', videoNode(publicUrl(p.promo_video_path))),
    ].filter(Boolean)
  );

  const link = $('#detailLink');
  link.hidden = !p.url;
  link.href = p.url || '#';

  detailDialog.showModal();
}

detailDialog.addEventListener('close', () => {
  // 닫을 때 재생 중인 동영상 정지
  $('#detailBody').replaceChildren();
});

// ---------- 업로드 ----------
const uploadDialog = $('#uploadDialog');
const form = $('#uploadForm');
const photosInput = $('#photosInput');
const previews = $('#previews');
const formError = $('#formError');
const submitBtn = $('#submitBtn');
let previewUrls = [];

function clearPreviews() {
  previewUrls.forEach(URL.revokeObjectURL);
  previewUrls = [];
  previews.replaceChildren();
}

function showError(msg) {
  formError.textContent = msg;
  formError.hidden = !msg;
}

function extOf(file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  return /^[a-z0-9]{1,5}$/.test(ext) ? '.' + ext : '';
}

// 올리기 전에 파일을 검사하고 문제가 있으면 메시지를 돌려준다
function validate({ name, url, video, photos, promo }) {
  if (!name) return '이름을 입력해 주세요.';
  if (url && !/^https?:\/\//i.test(url)) return '프로젝트 링크는 http:// 또는 https:// 로 시작해야 해요.';
  if (photos.length > MAX_PHOTOS) return `사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.`;
  if (video && !VIDEO_TYPES.includes(video.type)) return '프로젝트 영상은 mp4, webm, mov 파일만 올릴 수 있어요.';
  if (promo && !VIDEO_TYPES.includes(promo.type)) return '홍보 영상은 mp4, webm, mov 파일만 올릴 수 있어요.';
  if (photos.some((f) => !IMAGE_TYPES.includes(f.type))) return '사진은 png, jpg, gif, webp 파일만 올릴 수 있어요.';
  const tooBig = [video, promo, ...photos].find((f) => f && f.size > MAX_FILE_SIZE);
  if (tooBig) return `'${tooBig.name}' 파일이 50MB를 넘어요.`;
  return '';
}

$('#openUpload').addEventListener('click', () => {
  form.reset();
  clearPreviews();
  showError('');
  uploadDialog.showModal();
});

document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => btn.closest('dialog').close())
);

photosInput.addEventListener('change', () => {
  clearPreviews();
  const files = [...photosInput.files];
  showError(files.length > MAX_PHOTOS ? `사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.` : '');
  for (const file of files.slice(0, MAX_PHOTOS)) {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    previews.append(imageNode(url));
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const fileOrNull = (f) => (f && f.size > 0 ? f : null);
  const input = {
    name: (fd.get('name') || '').trim(),
    url: (fd.get('url') || '').trim(),
    video: fileOrNull(fd.get('video')),
    photos: fd.getAll('photos').filter((f) => f && f.size > 0),
    promo: fileOrNull(fd.get('promo')),
  };

  const problem = validate(input);
  if (problem) return showError(problem);

  // 프로젝트마다 폴더 하나에 파일을 모아 둔다
  const folder = crypto.randomUUID();
  const uploads = [
    input.video && { file: input.video, path: `${folder}/video${extOf(input.video)}` },
    ...input.photos.map((f, i) => ({ file: f, path: `${folder}/photo-${i + 1}${extOf(f)}` })),
    input.promo && { file: input.promo, path: `${folder}/promo${extOf(input.promo)}` },
  ].filter(Boolean);

  showError('');
  submitBtn.disabled = true;
  try {
    for (const [i, { file, path }] of uploads.entries()) {
      submitBtn.textContent = `파일 올리는 중 (${i + 1}/${uploads.length})`;
      const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) throw new Error(`'${file.name}' 파일을 올리지 못했어요.`);
    }

    submitBtn.textContent = '저장 중...';
    const pathFor = (prefix) => uploads.find((u) => u.path.startsWith(`${folder}/${prefix}`))?.path || null;
    const { error } = await db.from('projects').insert({
      name: input.name,
      url: input.url || null,
      video_path: pathFor('video'),
      photo_paths: uploads.filter((u) => u.path.startsWith(`${folder}/photo-`)).map((u) => u.path),
      promo_video_path: pathFor('promo'),
    });
    if (error) throw new Error('프로젝트를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');

    uploadDialog.close();
    clearPreviews();
    await load();
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '올리기';
  }
});

load();
