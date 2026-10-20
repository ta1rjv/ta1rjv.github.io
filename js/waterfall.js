// Subtle decorative SDR-style display: spectrum trace, tick axis and scrolling waterfall.
// Data is simulated, not a real receiver.

export function startWaterfall(canvas, { animate = true } = {}) {
  if (canvas.dataset.wfRunning) return; // only one loop per canvas
  canvas.dataset.wfRunning = '1';

  const W = 320;
  const SPEC_H = 30;  // spectrum trace area
  const AXIS_H = 6;   // tick row
  const WF_H = 74;    // waterfall rows
  const H = SPEC_H + AXIS_H + WF_H;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const wf = document.createElement('canvas');
  wf.width = W;
  wf.height = WF_H;
  const wctx = wf.getContext('2d');
  if (!wctx) return;

  // Muted colormap: near-black -> deep blue -> teal -> thin yellow peaks
  const stops = [
    [0.00, 2, 4, 12], [0.28, 5, 16, 52], [0.50, 8, 62, 96],
    [0.68, 22, 130, 128], [0.86, 215, 205, 105], [1.00, 255, 238, 150],
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const a = stops[k];
    const b = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
  }

  const row = wctx.createImageData(W, 1);
  const vals = new Float32Array(W);
  const trace = new Float32Array(W);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  let tick = 0;

  function makeRow() {
    tick++;
    const cw = 0.72 + 0.05 * Math.sin(tick * 0.012) + 0.008 * Math.sin(tick * 0.09); // drifting CW trace
    const keyed = (Math.floor(tick / 13) % 6) < 3 ? 1 : 0;
    const blockC = 0.34 + 0.002 * Math.sin(tick * 0.02);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let v = 0.10 + 0.03 * (u - 0.5) + 0.035 * gauss();
      // DATV-like band: moderate, textured noise with soft shoulders (not a flat block)
      const d1 = Math.abs(u - blockC);
      const shoulder = Math.min(1, Math.max(0, (0.12 - d1) / 0.03));
      v += shoulder * (0.20 + 0.09 * gauss());
      // thin carriers
      v += 0.62 * Math.exp(-Math.pow((u - 0.60) / 0.0028, 2)) * (0.85 + 0.15 * Math.random());
      v += 0.45 * Math.exp(-Math.pow((u - 0.91) / 0.0026, 2)) * (0.85 + 0.15 * Math.random());
      v += 0.34 * Math.exp(-Math.pow((u - 0.13) / 0.0026, 2));
      v += 0.72 * Math.exp(-Math.pow((u - cw) / 0.003, 2));
      v += keyed * 0.5 * Math.exp(-Math.pow((u - 0.84) / 0.0028, 2));
      v = Math.min(1, Math.max(0, v));
      vals[x] = v;
      const idx = Math.floor(v * 255) * 3;
      const o = x * 4;
      row.data[o] = lut[idx]; row.data[o + 1] = lut[idx + 1]; row.data[o + 2] = lut[idx + 2]; row.data[o + 3] = 255;
    }
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    // faint spectrum trace (smoothed in time)
    for (let x = 0; x < W; x++) trace[x] += (vals[x] - trace[x]) * 0.35;
    ctx.beginPath();
    ctx.moveTo(0, SPEC_H);
    for (let x = 0; x < W; x++) ctx.lineTo(x, SPEC_H - 2 - trace[x] * (SPEC_H - 5));
    ctx.lineTo(W, SPEC_H);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, SPEC_H);
    grad.addColorStop(0, 'rgba(70, 217, 255, 0.22)');
    grad.addColorStop(1, 'rgba(70, 217, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const y = SPEC_H - 2 - trace[x] * (SPEC_H - 5);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(120, 225, 255, 0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // frequency tick axis
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    for (let x = 0; x <= W; x += 16) {
      const major = x % 64 === 0;
      ctx.fillRect(x, SPEC_H + 1, 1, major ? 4 : 2);
    }
    // waterfall
    ctx.drawImage(wf, 0, SPEC_H + AXIS_H);
  }

  function step() {
    wctx.drawImage(wf, 0, 1);
    makeRow();
    wctx.putImageData(row, 0, 0);
    drawFrame();
  }

  for (let i = 0; i < WF_H; i++) step();
  if (!animate) return;

  let visible = false;
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (now - last < 50) return; // about 20 rows per second
    last = now;
    step();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(canvas);
  } else {
    visible = true;
  }
  requestAnimationFrame(loop);
}
