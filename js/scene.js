// Three.js scene: fullscreen shader background + 3D star field + post processing.
// Loaded lazily from main.js so that a CDN failure does not break the page content.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  SKY_VERT, SKY_FRAG, POST_VERT, POST_FRAG, STAR_VERT, STAR_FRAG, STREAK_VERT, STREAK_FRAG,
} from './shaders.js';
import { clamp, smooth, cameraDistance } from './path.js';

const STAR_FIELD_LENGTH = 780; // world units along -z
const FLIGHT_TRAVEL = 640;     // camera travel over the flight phase

function buildStars(count) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const tw = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = 2.5 + Math.pow(Math.random(), 1.8) * 75;
    const th = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(th) * r;
    pos[i * 3 + 1] = Math.sin(th) * r;
    pos[i * 3 + 2] = 20 - Math.random() * STAR_FIELD_LENGTH;
    const k = Math.random();
    let c;
    if (k < 0.55) c = [0.75, 0.85, 1.0];
    else if (k < 0.8) c = [1.0, 0.8, 0.6];
    else if (k < 0.92) c = [0.4, 0.9, 1.0];
    else c = [0.8, 0.5, 1.0];
    col.set(c, i * 3);
    size[i] = 0.8 + Math.pow(Math.random(), 2.5) * 2.4;
    tw[i] = 0.6 + Math.random() * 2.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
  g.userData = { pos, col };
  return g;
}

function buildStreaks(base) {
  const { pos, col } = base.userData;
  const n = pos.length / 3;
  const p2 = new Float32Array(n * 6);
  const c2 = new Float32Array(n * 6);
  const e2 = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 2; k++) {
      p2.set(pos.subarray(i * 3, i * 3 + 3), (i * 2 + k) * 3);
      c2.set(col.subarray(i * 3, i * 3 + 3), (i * 2 + k) * 3);
      e2[i * 2 + k] = k;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(c2, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(e2, 1));
  return g;
}

/**
 * @param {{canvas: HTMLCanvasElement, quality: object, onLost?: Function}} opts
 */
export function createScene({ canvas, quality, onLost }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x02030a, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  let pr = Math.min(window.devicePixelRatio || 1, quality.dprCap);
  let width = window.innerWidth;
  let height = window.innerHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1200);

  // Background quad
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(width, height) },
      uMouse: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uP: { value: 0 },
      uDist: { value: 14 },
      uAz: { value: 0 },
      uEl: { value: 0.12 },
      uShift: { value: 0 },
      uFade: { value: 1 },
      uDoor: { value: 0 },
      uFlash: { value: 0 },
      uNebAmt: { value: 1 },
      uFlight: { value: 0 },
      uGap: { value: 0 },
      uSteps: { value: quality.steps },
      uOct: { value: quality.oct },
      uLayers: { value: quality.layers },
    },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  quad.frustumCulled = false;
  quad.renderOrder = -10;
  scene.add(quad);

  // Star field
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPR: { value: pr },
      uVis: { value: 0 },
      uTime: { value: 0 },
      uScale: { value: 220 },
    },
  });
  const starGeo = buildStars(quality.stars);
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = 0;
  scene.add(stars);

  const streakMat = new THREE.ShaderMaterial({
    vertexShader: STREAK_VERT,
    fragmentShader: STREAK_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uVis: { value: 0 }, uStreakLen: { value: 0 } },
  });
  const streaks = new THREE.LineSegments(buildStreaks(starGeo), streakMat);
  streaks.frustumCulled = false;
  streaks.renderOrder = 1;
  scene.add(streaks);

  // Post processing chain
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.5, 0.85);
  bloom.enabled = quality.bloom;
  composer.addPass(bloom);
  const post = new ShaderPass(new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: {
      tDiffuse: { value: null },
      uCA: { value: 0.003 },
      uStreak: { value: 0 },
      uVig: { value: 0.55 },
    },
  }));
  composer.addPass(post);
  composer.addPass(new OutputPass());

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    skyMat.uniforms.uRes.value.set(width, height);
    starMat.uniforms.uPR.value = pr;
  }
  resize();

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (onLost) onLost();
  });

  // Adaptive quality: lower pixel ratio, then drop bloom, if frames stay slow.
  let ema = 16.7;
  let slow = 0;
  let lastTime = null;
  function adapt(time) {
    if (lastTime === null) { lastTime = time; return; }
    const dtMs = (time - lastTime) * 1000;
    lastTime = time;
    if (dtMs <= 0 || dtMs > 100) return;
    ema = ema * 0.95 + dtMs * 0.05;
    slow = ema > 30 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 120) {
      slow = 0;
      ema = 16.7;
      if (pr > 0.65) {
        pr = Math.max(0.6, pr * 0.8);
        resize();
      } else if (bloom.enabled) {
        bloom.enabled = false;
      }
    }
  }

  const mouse = new THREE.Vector2();
  let prevP = null;
  let prevT = 0;
  let speed = 0; // smoothed |dp/dt| in scene-progress units per second

  /**
   * Render one frame.
   * @param {number} time seconds (0 for static mode)
   * @param {number} p scene progress 0..1
   * @param {{x:number,y:number}} mouseTarget normalized -1..1
   * @param {boolean} animated enables adaptive quality tracking
   */
  function frame(time, p, mouseTarget, animated = true) {
    if (animated) adapt(time);
    mouse.x += (mouseTarget.x - mouse.x) * 0.06;
    mouse.y += (mouseTarget.y - mouse.y) * 0.06;

    const u = skyMat.uniforms;
    const t = clamp((p - 0.2) / 0.2, 0, 1);
    const heroK = smooth(0, 0.2, p);
    const aspect = width / height;

    u.uTime.value = time;
    u.uP.value = p;
    u.uDist.value = cameraDistance(p);
    u.uAz.value = 0.25 * heroK + 1.9 * Math.pow(t, 1.2);
    u.uEl.value = 0.12 + 0.05 * heroK + 0.85 * t;
    // Hole center at about 60% of the width on wide screens (units: aspect-corrected uv).
    u.uShift.value = aspect > 1.1 ? 0.2 * aspect * (1 - smooth(0, 0.12, p)) : 0;
    u.uFade.value = 1 - smooth(0.33, 0.385, p);
    const door = smooth(0.40, 0.50, p);
    u.uDoor.value = Math.pow(door, 1.5) * 4.5;
    const flash = Math.exp(-Math.pow((p - 0.425) / 0.018, 2));
    u.uFlash.value = flash;
    u.uNebAmt.value = 0.75 - 0.35 * smooth(0.5, 0.68, p);
    u.uGap.value = smooth(0.335, 0.36, p) * (1 - smooth(0.382, 0.398, p));
    u.uFlight.value = Math.max(0, p - 0.4) * 8;
    u.uMouse.value.copy(mouse);

    post.uniforms.uStreak.value = smooth(0.21, 0.37, p) * 0.75 * (1 - smooth(0.375, 0.40, p));
    // Chromatic aberration only during the fall; near zero after the door.
    post.uniforms.uCA.value = 0.0008 + 0.028 * smooth(0.25, 0.37, p) * (1 - smooth(0.39, 0.45, p)) + 0.008 * flash;
    bloom.strength = 0.35 + 0.5 * flash;

    // Scroll velocity (progress units per second), smoothed
    if (prevP !== null && time > prevT) {
      const inst = Math.abs(p - prevP) / Math.max(time - prevT, 1e-3);
      speed += (Math.min(inst, 1.5) - speed) * 0.12;
    } else if (!animated) {
      speed = 0;
    }
    prevP = p;
    prevT = time;

    // Camera flight through the star field
    const flight = clamp((p - 0.45) / 0.55, 0, 1);
    camera.position.set(0, 0, -flight * FLIGHT_TRAVEL);
    camera.rotation.set(-mouse.y * 0.019, mouse.x * 0.019, 0);
    const fov = 60 + clamp(speed * 40, 0, 16);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    starMat.uniforms.uVis.value = smooth(0.45, 0.58, p);
    starMat.uniforms.uTime.value = time;
    stars.visible = starMat.uniforms.uVis.value > 0.001;
    const streakLen = clamp(speed * 80, 0, 60);
    streakMat.uniforms.uVis.value = starMat.uniforms.uVis.value;
    streakMat.uniforms.uStreakLen.value = streakLen;
    streaks.visible = stars.visible && streakLen > 0.15;

    composer.render();
  }

  return { frame, resize };
}
