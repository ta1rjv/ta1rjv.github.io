// JS-driven skills orbit: three concentric ellipses sharing one tilt, with DOM label pills.
// Skill names are read from the (semantic) legend lists in the HTML, so the text stays accessible.

const TAU = Math.PI * 2;
const K = 0.42; // vertical squash, about cos(65 degrees)

// Ring radius is a fraction of the stage width; speed is in rad/s (all rings rotate the same way).
const RINGS = [
  { cat: 'rf', r: 0.24, speed: 0.12, off: 0.0 },
  { cat: 'hw', r: 0.34, speed: 0.085, off: 0.45 },
  { cat: 'sw', r: 0.43, speed: 0.06, off: 0.9 },
];
const RGB = { rf: '255,138,43', hw: '70,217,255', sw: '139,92,255' };

export function initOrbit(wrap, { animate = true } = {}) {
  const stage = wrap.querySelector('.orbit-stage');
  const svg = wrap.querySelector('.orbit-svg');
  const nodesEl = wrap.querySelector('.orbit-nodes');
  if (!stage || !svg || !nodesEl) return;

  const items = [];
  let active = null;
  let hovering = false;

  function setActive(it) {
    active = it;
    hovering = !!it;
    stage.classList.toggle('has-active', hovering);
    items.forEach((o) => {
      const on = o === it;
      o.node.classList.toggle('is-active', on);
      o.li.classList.toggle('is-active', on);
    });
  }

  RINGS.forEach((ring, ri) => {
    const lg = document.querySelector('.legend .lg[data-cat="' + ring.cat + '"]');
    if (!lg) return;
    const lis = Array.from(lg.querySelectorAll('li'));
    lis.forEach((li, j) => {
      const node = document.createElement('div');
      node.className = 'node cat-' + ring.cat;
      const dot = document.createElement('span');
      dot.className = 'dot';
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = li.textContent.replace(/\s*\(.*\)/, '').trim();
      node.appendChild(dot);
      node.appendChild(pill);
      nodesEl.appendChild(node);
      const it = { node, li, ri, base: (j * TAU) / lis.length + ring.off };
      items.push(it);
      node.addEventListener('pointerenter', () => setActive(it));
      node.addEventListener('pointerleave', () => setActive(null));
      li.addEventListener('pointerenter', () => setActive(it));
      li.addEventListener('pointerleave', () => setActive(null));
    });
  });

  let W = 0;
  let H = 0;

  function layout() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (!W) return;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    let out = '<defs>';
    RINGS.forEach((ring, i) => {
      const rx = ring.r * W;
      const c = RGB[ring.cat];
      out += '<linearGradient id="orbitg' + i + '" gradientUnits="userSpaceOnUse" x1="' + (W / 2 - rx) + '" y1="0" x2="' + (W / 2 + rx) + '" y2="0">' +
        '<stop offset="0" stop-color="rgb(' + c + ')" stop-opacity="0.2"/>' +
        '<stop offset="0.5" stop-color="rgb(' + c + ')" stop-opacity="0.45"/>' +
        '<stop offset="1" stop-color="rgb(' + c + ')" stop-opacity="0.2"/></linearGradient>';
    });
    out += '</defs>';
    RINGS.forEach((ring, i) => {
      out += '<ellipse cx="' + W / 2 + '" cy="' + H / 2 + '" rx="' + ring.r * W + '" ry="' + ring.r * W * K +
        '" fill="none" stroke="url(#orbitg' + i + ')" stroke-width="1"/>';
    });
    // Faint dashed tick ring just outside the outer orbit (instrument-like accent).
    const o = RINGS[RINGS.length - 1];
    out += '<ellipse cx="' + W / 2 + '" cy="' + H / 2 + '" rx="' + (o.r * W + 14) + '" ry="' + (o.r * W + 14) * K +
      '" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1" stroke-dasharray="1 9"/>';
    svg.innerHTML = out;
  }

  function place(t) {
    if (!W) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const ring = RINGS[it.ri];
      const a = it.base + t * ring.speed;
      const d = Math.sin(a); // depth: +1 in front, -1 behind
      const k = (d + 1) / 2;
      const x = W / 2 + Math.cos(a) * ring.r * W;
      const y = H / 2 + d * ring.r * W * K;
      it.node.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + (0.8 + 0.25 * k).toFixed(3) + ')';
      it.node.style.opacity = (0.45 + 0.55 * k).toFixed(3);
      // The core sits at z-index 100: back items go behind it, front items in front.
      it.node.style.zIndex = String(d >= 0 ? 101 + Math.round(d * 50) : 99 + Math.round(d * 50));
    }
  }

  let t = 0;
  let mul = 1;
  let visible = false;
  let last = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || document.hidden) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    mul += ((hovering ? 0 : 1) - mul) * Math.min(1, dt * 6);
    t += dt * mul;
    place(t);
  }

  layout();
  place(0);
  wrap.classList.add('is-ready');
  layout();
  place(0);

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { layout(); place(t); }).observe(stage);
  } else {
    window.addEventListener('resize', () => { layout(); place(t); });
  }

  if (!animate) return;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(wrap);
  } else {
    visible = true;
  }
  requestAnimationFrame(loop);
}
