// ============================================================================
// EDIT ME: site configuration. Add more links to `socials` when needed.
// Static HTML contains the same defaults, so the page is readable without JS.
// ============================================================================
const CONFIG = {
  name: 'Selim',
  callsign: 'TA1RJV',
  role: 'Engineer & radio amateur',
  tagline: 'Transmitting from beyond the event horizon.',
  githubUser: 'ta1rjv',
  socials: [
    { label: 'GitHub', href: 'https://github.com/ta1rjv' },
    // { label: 'Email', href: 'mailto:you@example.com' },
  ],
  fetchGithubStats: true, // live public repo count and avatar (fails silently)
};

import { clamp, SCENE_MARKS, cameraDistance } from './path.js';
import { startWaterfall } from './waterfall.js';
import { initOrbit } from './orbit.js';


const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const lowEnd = coarse || window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 2;

const QUALITY = lowEnd
  ? { steps: 56, oct: 3, layers: 1, stars: 4500, dprCap: 1.0, bloom: true }
  : { steps: 110, oct: 5, layers: 2, stars: 12000, dprCap: 1.5, bloom: true };

// ---------------------------------------------------------------------------
// Config hydration
// ---------------------------------------------------------------------------
function hydrate() {
  $$('[data-cfg]').forEach((el) => {
    const v = CONFIG[el.dataset.cfg];
    if (typeof v === 'string') el.textContent = v;
  });
  $$('[data-socials]').forEach((ul) => {
    ul.textContent = '';
    CONFIG.socials.forEach((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.href;
      a.textContent = s.label;
      if (/^https?:/.test(s.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      li.appendChild(a);
      ul.appendChild(li);
    });
  });
}

async function loadGithubStats() {
  if (!CONFIG.fetchGithubStats || !window.fetch) return;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch('https://api.github.com/users/' + encodeURIComponent(CONFIG.githubUser), {
      signal: ctl.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    clearTimeout(to);
    if (!res.ok) return;
    const data = await res.json();
    const repos = $('#stat-repos');
    if (repos && Number.isFinite(data.public_repos)) repos.textContent = String(data.public_repos);
    const img = $('#avatar');
    if (img && typeof data.avatar_url === 'string' && data.avatar_url.startsWith('https://')) {
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.src = data.avatar_url + (data.avatar_url.includes('?') ? '&' : '?') + 's=160';
    }
  } catch (_) {
    // Network or rate limit failure: keep static defaults.
  }
}

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------
function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (_) {
    return false;
  }
}

const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
const webgl = hasWebGL2();

hydrate();
loadGithubStats();

// Static layout: no scroll narrative (reduced motion, no WebGL, or no GSAP).
let staticMode = reducedMotion || !webgl || !hasGsap;

function enterStatic() {
  staticMode = true;
  html.classList.add('static');
  html.classList.remove('no-js');
  html.classList.add('ready');
}

if (!webgl) html.classList.add('no-webgl');
if (staticMode) enterStatic();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
const mouse = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
}, { passive: true });

let scene = null;
const raw = { v: 0 };
let bounds = SCENE_MARKS.slice();
let lastP = 0;

function measure() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const y = (id) => {
    const el = document.getElementById(id);
    return el ? clamp((el.getBoundingClientRect().top + window.scrollY) / max, 0, 1) : 0;
  };
  sectorTops = SECTORS.map(([id]) => {
    const el = document.getElementById(id);
    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
  });
  const b = [0, y('fall'), y('universe'), y('about'), 1];
  for (let i = 1; i < b.length; i++) b[i] = Math.max(b[i], b[i - 1] + 1e-4);
  bounds = b;
}

function remap(v) {
  for (let i = 0; i < 4; i++) {
    if (v <= bounds[i + 1] || i === 3) {
      const t = clamp((v - bounds[i]) / (bounds[i + 1] - bounds[i]), 0, 1);
      return SCENE_MARKS[i] + t * (SCENE_MARKS[i + 1] - SCENE_MARKS[i]);
    }
  }
  return 1;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const hud = {
  label: $('#hud-label'),
  value: $('#hud-value'),
  bar: $('#hud-bar'),
  pct: $('#hud-pct'),
  ruler: $('#hud-ruler'),
  lastLabel: '',
  lastValue: '',
  lastPct: '',
};

const SECTORS = [['about', 'ABOUT'], ['projects', 'SELECTED WORK'], ['skills', 'SKILLS'], ['contact', 'CONTACT']];
let sectorTops = [];

function currentSector() {
  const y = window.scrollY + window.innerHeight * 0.5;
  let name = SECTORS[0][1];
  for (let i = 0; i < sectorTops.length; i++) if (sectorTops[i] <= y) name = SECTORS[i][1];
  return name;
}

function updateHud(p, v) {
  let label;
  let value;
  if (p < 0.4) {
    label = 'DISTANCE TO SINGULARITY';
    value = cameraDistance(p).toFixed(2) + ' Rs';
  } else if (p < 0.55) {
    label = 'TRANSIT';
    value = p < 0.47 ? 'HORIZON CROSSED' : 'NEW SPACETIME';
  } else {
    label = 'SECTOR';
    value = currentSector();
  }
  const pct = String(Math.round(v * 100)).padStart(3, '0') + '%';
  if (hud.label && label !== hud.lastLabel) { hud.label.textContent = label; hud.lastLabel = label; }
  if (hud.value && value !== hud.lastValue) { hud.value.textContent = value; hud.lastValue = value; }
  if (hud.pct && pct !== hud.lastPct) { hud.pct.textContent = pct; hud.lastPct = pct; }
  if (hud.bar) hud.bar.style.transform = 'scaleY(' + v.toFixed(4) + ')';
  if (hud.ruler) hud.ruler.style.backgroundPositionX = (-v * 2400).toFixed(1) + 'px';
}

// ---------------------------------------------------------------------------
// Text splitting helpers
// ---------------------------------------------------------------------------
function splitWords(el) {
  const text = el.textContent.trim();
  el.textContent = '';
  const words = text.split(/\s+/);
  words.forEach((w, i) => {
    const o = document.createElement('span');
    o.className = 'sw';
    const inner = document.createElement('span');
    inner.className = 'swi';
    inner.textContent = w;
    o.appendChild(inner);
    el.appendChild(o);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return $$('.swi', el);
}

function splitChars(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  Array.from(text).forEach((ch) => {
    const o = document.createElement('span');
    o.className = 'chm';
    o.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.className = 'ch';
    inner.textContent = ch;
    o.appendChild(inner);
    el.appendChild(o);
  });
  return $$('.ch', el);
}

// ---------------------------------------------------------------------------
// Static mode behaviour
// ---------------------------------------------------------------------------
function initStatic() {
  html.classList.add('ready');
  startWaterfall($('#waterfall'), { animate: false });
  if (!webgl) return;
  import('./scene.js').then((m) => {
    const canvas = $('#gl');
    scene = m.createScene({ canvas, quality: QUALITY });
    const draw = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const f = window.scrollY / max;
      scene.frame(0, f < 0.35 ? 0.04 : 0.72, { x: 0, y: 0 }, false);
    };
    draw();
    let queued = false;
    const req = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', () => { scene.resize(); req(); });
  }).catch(() => {
    html.classList.add('no-webgl');
  });
}

// ---------------------------------------------------------------------------
// Animated (scroll-driven) mode
// ---------------------------------------------------------------------------
function initAnimated() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  html.classList.remove('no-js');
  html.classList.add('js');

  // Smooth scroll synced with ScrollTrigger and the GSAP ticker
  let lenis = null;
  if (typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
  }
  gsap.ticker.lagSmoothing(0);

  // Text splits
  const heroTitle = $('[data-hero-title]');
  const heroChars = heroTitle ? splitChars(heroTitle) : [];
  $$('[data-split]').forEach((el) => {
    const words = splitWords(el);
    gsap.from(words, {
      yPercent: 115,
      duration: 1.1,
      ease: 'power4.out',
      stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
    });
  });
  html.classList.add('ready');

  // Hero intro
  const intro = gsap.timeline({ delay: 0.4 });
  intro
    .from(heroChars, { yPercent: 120, duration: 1.4, ease: 'power4.out', stagger: 0.07 })
    .fromTo('.hero [data-intro]', { autoAlpha: 0, y: 24 },
      { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.12 }, '-=0.9');

  // Hero fade-out and scroll cue (scrubbed)
  gsap.to('.hero-content', {
    autoAlpha: 0, y: -90, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: '55% top', scrub: true },
  });
  gsap.to('.scroll-cue', {
    autoAlpha: 0, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: '12% top', scrub: true },
  });

  // Phase captions (scrubbed, one after another)
  // Triggers are relative to section tops, which are also the scene-progress marks,
  // so caption timing follows the same DOM-based mapping at any viewport size.
  const capRange = {
    '#fall': ['top 55%', 'bottom 75%'],
    '#universe': ['top 10%', 'bottom 60%'], // door opens at p 0.40-0.50
  };
  ['#fall', '#universe'].forEach((id) => {
    const caps = $$(id + ' .cap');
    if (!caps.length) return;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: id, start: capRange[id][0], end: capRange[id][1], scrub: true },
    });
    caps.forEach((cap, i) => {
      tl.fromTo(cap, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'none' }, i * 1.2)
        .to(cap, { autoAlpha: 0, y: -30, duration: 0.5, ease: 'none' }, i * 1.2 + 0.85);
    });
  });

  // Generic reveals
  $$('.reveal').forEach((el) => {
    gsap.fromTo(el, { autoAlpha: 0, y: 40 }, {
      autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' },
    });
  });

  // Global scroll progress, smoothed by ScrollTrigger scrub
  gsap.to(raw, {
    v: 1, ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.5 },
  });
  ScrollTrigger.addEventListener('refresh', measure);
  measure();

  // Nav anchors
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : document.body;
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(id ? target : 0, { duration: 2.2 });
      else target.scrollIntoView({ behavior: 'auto' });
    });
  });

  startWaterfall($('#waterfall'), { animate: true });
  initCursor(gsap);
  initTilt();

  // Single render loop
  gsap.ticker.add((time) => {
    if (lenis) lenis.raf(time * 1000);
    if (document.hidden) return;
    const p = remap(raw.v);
    lastP = p;
    updateHud(p, raw.v);
    if (scene) scene.frame(time, p, mouse, true);
  });

  window.addEventListener('resize', () => { if (scene) scene.resize(); });

  // Load the WebGL scene lazily so page content never depends on the CDN
  import('./scene.js').then((m) => {
    const canvas = $('#gl');
    scene = m.createScene({
      canvas,
      quality: QUALITY,
      onLost: () => { html.classList.add('no-webgl'); scene = null; },
    });
    html.classList.add('gl-ready');
  }).catch(() => {
    html.classList.add('no-webgl');
    ScrollTrigger.getAll().forEach((st) => st.kill());
    if (lenis) lenis.destroy();
    gsap.ticker.lagSmoothing(500, 33);
    enterStatic();
    $$('.reveal,[data-split] .swi,.ch,[data-intro],.hero-content,.scroll-cue').forEach((el) => {
      gsap.set(el, { clearProps: 'all' });
    });
    startWaterfall($('#waterfall'), { animate: false });
  });
}

function initCursor(gsap) {
  if (!finePointer) return;
  const dot = $('.cursor-dot');
  const ring = $('.cursor-ring');
  if (!dot || !ring) return;
  html.classList.add('has-cursor');
  gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3' });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.4, ease: 'power3' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.4, ease: 'power3' });
  window.addEventListener('pointermove', (e) => {
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    dot.classList.add('is-on'); ring.classList.add('is-on');
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const t = e.target instanceof Element ? e.target.closest('a,button,[data-hover]') : null;
    ring.classList.toggle('is-hover', !!t);
  });
  document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
  document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
  document.documentElement.addEventListener('pointerleave', () => {
    dot.classList.remove('is-on'); ring.classList.remove('is-on');
  });
}

function initTilt() {
  if (!finePointer) return;
  $$('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      card.style.transform =
        'perspective(900px) rotateX(' + ((0.5 - py) * 10).toFixed(2) + 'deg) rotateY(' +
        ((px - 0.5) * 12).toFixed(2) + 'deg) translateZ(0)';
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

try {
  const orbitWrap = $('.orbit-wrap');
  if (orbitWrap) {
    try { initOrbit(orbitWrap, { animate: !reducedMotion }); } catch (_) { /* orbit is decorative */ }
  }
  if (staticMode) initStatic();
  else initAnimated();
  window.__booted = true;
} catch (err) {
  // A synchronous init failure must never leave reveal content hidden.
  enterStatic();
  window.__booted = true;
}
