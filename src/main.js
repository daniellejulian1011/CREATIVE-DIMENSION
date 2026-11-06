import { filters, projects, zoneToFilter, getProject } from './portfolio-data.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const views = { home: $('#home-view'), work: $('#work-view'), about: $('#about-view'), resume: $('#resume-view'), contact: $('#contact-view'), project: $('#project-view') };
const state = { route: 'home', filter: 'all', project: null, imageIndex: 0, immersive: false };
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const captureMode = new URLSearchParams(location.search).has('t');
let reducedMotion = motionQuery.matches;
let world = null;
let gsap = null;
let toastTimer = 0;
let audioContext = null;
let ambientGain = null;
let soundEnabled = false;

function toast(message) {
  const element = $('#toast');
  element.textContent = message; element.classList.add('is-visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2600);
}
function icon(button, name) { button.querySelector('use').setAttribute('href', `#i-${name}`); }
function setReducedMotion(value) {
  reducedMotion = value;
  document.body.classList.toggle('reduce-motion', value);
  $('#motion-toggle').setAttribute('aria-pressed', String(value));
  $('#motion-toggle').setAttribute('aria-label', value ? 'Restore full motion' : 'Reduce motion');
  world?.setReducedMotion(value);
}

function renderFilters() {
  $('#project-filters').innerHTML = filters.map((filter) => `<button class="filter-button ${state.filter === filter.id ? 'is-active' : ''}" data-filter="${filter.id}" aria-pressed="${state.filter === filter.id}">${filter.label}</button>`).join('');
}
function visibleProjects() { return state.filter === 'all' ? projects : projects.filter((project) => project.filters.includes(state.filter)); }
function renderProjects() {
  const list = visibleProjects();
  $('#project-grid').innerHTML = list.map((project) => `
    <button class="project-card" data-project="${project.id}" aria-label="Open ${project.title} case study">
      <span class="project-card-image"><img src="${project.hero}" alt="Original presentation for ${project.title}" loading="lazy" width="800" height="560"></span>
      <span class="project-card-copy"><small>${project.type}</small><h3>${project.title}</h3><p>${project.summary}</p></span>
      <svg class="card-arrow" aria-hidden="true"><use href="#i-arrow"/></svg>
    </button>`).join('');
  $('#filter-status').textContent = `${list.length} ${list.length === 1 ? 'project' : 'projects'} shown`;
  renderFilters();
}
function setFilter(filter) {
  state.filter = filter;
  renderProjects();
}

function updateHash(route, projectId, push = true) {
  const hash = route === 'project' && projectId ? `#project/${projectId}` : route === 'home' ? '#home' : `#${route}`;
  if (push && location.hash !== hash) history.pushState({ route, projectId }, '', hash);
}
function navigate(route, { filter, projectId, push = true } = {}) {
  if (state.immersive) exitExperience();
  Object.entries(views).forEach(([name, view]) => { view.hidden = name !== route; });
  $$('.nav-link').forEach((button) => button.classList.toggle('is-active', button.dataset.route === route || (route === 'project' && button.dataset.route === 'work')));
  state.route = route;
  $('#menu-toggle').setAttribute('aria-expanded', 'false'); $('#menu-toggle').setAttribute('aria-label', 'Open navigation menu');
  $('.main-nav').classList.remove('is-open');
  if (route === 'work') {
    if (filter) state.filter = filter;
    renderProjects();
  }
  if (route === 'project' && projectId) populateProject(projectId);
  if (route === 'home') world?.goHome();
  else if (route !== 'project') world?.goHome();
  const panel = views[route];
  if (panel) panel.scrollTop = 0;
  updateHash(route, projectId, push);
  const heading = panel?.querySelector('h1, h2');
  if (heading && route !== 'home') { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  if (gsap && !reducedMotion && !captureMode && route !== 'home') gsap.fromTo(panel, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .28, ease: 'power2.out', clearProps: 'all' });
}

function populateProject(id) {
  const project = getProject(id) || projects[0];
  state.project = project; state.imageIndex = 0;
  $('#project-type').textContent = project.type;
  $('#project-title').textContent = project.title;
  $('#project-summary').textContent = project.summary;
  $('#project-status').textContent = project.status;
  $('#project-role').textContent = project.role;
  $('#project-focus').textContent = project.focus;
  $('#project-outcome').textContent = project.outcome;
  $('#project-deliverables').innerHTML = project.deliverables.map((item) => `<li>${item}</li>`).join('');
  setProjectImage(0);
  $('#project-thumbnails').innerHTML = project.gallery.map((source, index) => `<button class="thumbnail-button ${index === 0 ? 'is-active' : ''}" data-image-index="${index}" aria-label="View image ${index + 1} of ${project.title}"><img src="${source}" alt="" loading="lazy" width="160" height="110"></button>`).join('');
  const next = projects[(projects.indexOf(project) + 1) % projects.length];
  $('#next-project').dataset.project = next.id;
  $('#next-project').setAttribute('aria-label', `Open next project: ${next.title}`);
}
function setProjectImage(index) {
  const project = state.project;
  if (!project) return;
  state.imageIndex = (index + project.gallery.length) % project.gallery.length;
  $('#project-hero-image').src = project.gallery[state.imageIndex];
  $('#project-hero-image').alt = `${project.title}, portfolio image ${state.imageIndex + 1}`;
  $$('.thumbnail-button').forEach((button, buttonIndex) => button.classList.toggle('is-active', buttonIndex === state.imageIndex));
}
function openProject(id) { navigate('project', { projectId: id }); }
function openLightbox() {
  if (!state.project) return;
  $('#lightbox-image').src = state.project.gallery[state.imageIndex];
  $('#lightbox-image').alt = `${state.project.title}, enlarged portfolio image ${state.imageIndex + 1}`;
  $('#lightbox-count').textContent = `${state.imageIndex + 1} / ${state.project.gallery.length}`;
  $('#lightbox').showModal();
}
function stepLightbox(direction) {
  setProjectImage(state.imageIndex + direction);
  $('#lightbox-image').src = state.project.gallery[state.imageIndex];
  $('#lightbox-image').alt = `${state.project.title}, enlarged portfolio image ${state.imageIndex + 1}`;
  $('#lightbox-count').textContent = `${state.imageIndex + 1} / ${state.project.gallery.length}`;
}

function enterExperience() {
  if (!world) { toast('The 3D scene is unavailable. Every project remains accessible in classic mode.'); navigate('work'); return; }
  navigate('home', { push: false });
  state.immersive = true;
  $('.hero-copy').hidden = true; $('.portal-links').hidden = true; $('.explore-bar').hidden = true;
  $('#immersive-hud').hidden = false;
  world.enter();
  toast(matchMedia('(pointer:fine)').matches ? 'WASD to move · mouse to look · E to interact' : 'Drag to look · tap a portal to enter');
}
function exitExperience() {
  state.immersive = false; world?.exit();
  $('.hero-copy').hidden = false; $('.portal-links').hidden = false; $('.explore-bar').hidden = false;
  $('#immersive-hud').hidden = true;
}
function enterZone(zone) {
  navigate('work', { filter: zoneToFilter[zone] });
  world?.showZone(zone);
}

function toggleSound() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { toast('Ambient audio is not supported by this browser.'); return; }
    audioContext = new AudioContext();
    ambientGain = audioContext.createGain(); ambientGain.gain.value = 0;
    const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520;
    ambientGain.connect(filter); filter.connect(audioContext.destination);
    [110, 164.81, 220].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const gain = audioContext.createGain(); gain.gain.value = index === 1 ? .15 : .09;
      oscillator.connect(gain); gain.connect(ambientGain); oscillator.start();
    });
    const lfo = audioContext.createOscillator(); const lfoGain = audioContext.createGain();
    lfo.frequency.value = .08; lfoGain.gain.value = 90; lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
  }
  soundEnabled = !soundEnabled;
  audioContext.resume();
  ambientGain.gain.cancelScheduledValues(audioContext.currentTime);
  ambientGain.gain.linearRampToValueAtTime(soundEnabled ? .12 : 0, audioContext.currentTime + .35);
  const button = $('#sound-toggle'); button.setAttribute('aria-pressed', String(soundEnabled));
  button.setAttribute('aria-label', soundEnabled ? 'Turn ambient sound off' : 'Turn ambient sound on'); icon(button, soundEnabled ? 'sound' : 'muted');
  toast(soundEnabled ? 'Ambient sound on' : 'Ambient sound off');
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const routeButton = event.target.closest('[data-route]');
    if (routeButton) navigate(routeButton.dataset.route);
    const zoneButton = event.target.closest('[data-zone]');
    if (zoneButton) enterZone(zoneButton.dataset.zone);
    const projectButton = event.target.closest('[data-project]');
    if (projectButton) openProject(projectButton.dataset.project);
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) setFilter(filterButton.dataset.filter);
    const closeButton = event.target.closest('[data-close]');
    if (closeButton) document.getElementById(closeButton.dataset.close).close();
  });
  $('#enter-experience').addEventListener('click', enterExperience);
  $('#classic-mode').addEventListener('click', () => navigate('work'));
  $('#exit-experience').addEventListener('click', exitExperience);
  $('#back-to-work').addEventListener('click', () => navigate('work'));
  $('#project-hero-button').addEventListener('click', openLightbox);
  $('#project-thumbnails').addEventListener('click', (event) => {
    const button = event.target.closest('[data-image-index]');
    if (button) setProjectImage(Number(button.dataset.imageIndex));
  });
  $('#lightbox-prev').addEventListener('click', () => stepLightbox(-1));
  $('#lightbox-next').addEventListener('click', () => stepLightbox(1));
  $('#lightbox').addEventListener('click', (event) => { if (event.target === $('#lightbox')) $('#lightbox').close(); });
  $('#help-open').addEventListener('click', () => $('#help-dialog').showModal());
  $('#help-dialog').addEventListener('click', (event) => { if (event.target === $('#help-dialog')) $('#help-dialog').close(); });
  $('#sound-toggle').addEventListener('click', toggleSound);
  $('#motion-toggle').addEventListener('click', () => setReducedMotion(!reducedMotion));
  $('#quality-select').addEventListener('change', (event) => { world?.setQuality(event.target.value); toast(`Graphics set to ${event.target.selectedOptions[0].text.replace('Graphics: ', '')}`); });
  $('#menu-toggle').addEventListener('click', () => {
    const open = $('.main-nav').classList.toggle('is-open');
    $('#menu-toggle').setAttribute('aria-expanded', String(open)); $('#menu-toggle').setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && state.immersive) exitExperience();
  });
  window.addEventListener('popstate', () => routeFromHash(false));
  motionQuery.addEventListener('change', (event) => setReducedMotion(event.matches));
}

function routeFromHash(push = false) {
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('project/')) navigate('project', { projectId: hash.split('/')[1], push });
  else if (['work','about','resume','contact'].includes(hash)) navigate(hash, { push });
  else navigate('home', { push });
}

function populateSkills() {
  const tools = ['Figma','Photoshop','Illustrator','Lightroom','Canva','GitHub','HTML','CSS','JavaScript','PowerPoint'];
  const skills = ['Graphic Design','UX/UI','Branding','Visual Design','Web Design','Interaction Design','Typography','Advertising','Photo Compositing','UX Research','Wireframing','Visual Storytelling','HTML/CSS/JS'];
  $('#tools-list').innerHTML = tools.map((tool) => `<div class="tool-item"><span class="tool-monogram">${tool.slice(0,2)}</span>${tool}</div>`).join('');
  $('#skills-list').innerHTML = skills.map((skill) => `<span>${skill}</span>`).join('');
}

function finishLoader() {
  if ($('#loader').classList.contains('is-finished')) return;
  $('#loader-progress').style.width = '100%'; $('#loader-label').textContent = 'The exhibition is ready';
  $('#loader').classList.add('is-finished');
  if (gsap && !reducedMotion && !captureMode) {
    gsap.fromTo('.hero-copy > *', { opacity: .72, y: 12 }, { opacity: 1, y: 0, duration: .45, stagger: .04, ease: 'power3.out', clearProps: 'all' });
    gsap.fromTo('.portal-link', { opacity: .72, y: 10 }, { opacity: 1, y: 0, duration: .4, stagger: .06, ease: 'power2.out', clearProps: 'all' });
  }
}

async function init() {
  populateSkills(); bindEvents(); renderProjects(); setReducedMotion(reducedMotion);
  const mobile = matchMedia('(max-width: 767px)').matches;
  $('#quality-select').value = mobile ? 'balanced' : 'high';
  routeFromHash(false);
  import('https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm').then((module) => { gsap = module.gsap; }).catch(() => {});
  const loaderTimer = setTimeout(finishLoader, 1300);
  $('#skip-loader').addEventListener('click', () => { clearTimeout(loaderTimer); finishLoader(); }, { once: true });
  try {
    const { createWorld } = await import('./scene.js');
    world = createWorld({
      canvas: $('#world'),
      onPortal: enterZone,
      onPrompt: (message) => { $('#interaction-prompt').textContent = message; },
      onReady: () => { clearTimeout(loaderTimer); finishLoader(); },
    });
    world.setQuality($('#quality-select').value); world.setReducedMotion(reducedMotion);
  } catch (error) {
    clearTimeout(loaderTimer); finishLoader();
    $('#world').hidden = true;
    toast('3D is unavailable on this device. Classic portfolio mode is fully available.');
  }
  window.__APP_READY__ = true;
  window.__APP_STATE__ = () => ({ route: state.route, filter: state.filter, project: state.project?.id, immersive: state.immersive, quality: $('#quality-select').value, reducedMotion });
}

init();
