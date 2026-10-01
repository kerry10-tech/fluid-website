import * as THREE from 'three';
import gsap from 'gsap';
import { noise2, palette, grain } from './glsl.js';

// Five living "photographs", all mathematics. They are drawn on planes that
// shadow DOM placeholders so the layout stays in CSS while the pixels stay in
// WebGL (hover ripples, velocity bending, circular lens masks…).

const scenes = /* glsl */ `
#define PI 3.14159265
#define TAU 6.28318530

// ─── I · CAUSTIC ─────────────────────────────────────────────
vec2 hash22(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// distance to the nearest Voronoi edge — water focuses light along these
float voroEdge(vec2 x, float t){
  vec2 n = floor(x); vec2 f = fract(x);
  float md = 8.0, md2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    o = 0.5 + 0.42 * sin(t + TAU * o);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md){ md2 = md; md = d; } else if (d < md2){ md2 = d; }
  }
  return sqrt(md2) - sqrt(md);
}
vec3 sceneCaustic(vec2 p, float t){
  vec2 q = p * 6.2;
  q += vec2(fbm3(q * 0.28 + vec2(0.0, t * 0.06)), fbm3(q * 0.28 + vec2(3.1, -t * 0.05))) * 2.2;
  float tt = t * 0.55;
  float ca = 0.028;
  vec3 e = vec3(voroEdge(q + vec2(ca, 0.0), tt), voroEdge(q, tt), voroEdge(q - vec2(ca, 0.0), tt));
  vec3 lines = exp(-e * vec3(17.0)) ;
  float e2 = voroEdge(q * 0.47 + 7.3, tt * 0.7);
  float l2 = exp(-e2 * 11.0);
  float shade = smoothstep(1.2, -0.3, length(p - vec2(0.18, 0.38)));
  vec3 floorCol = mix(vec3(0.004, 0.014, 0.022), vec3(0.025, 0.085, 0.11), shade);
  vec3 col = floorCol;
  col += lines * vec3(0.72, 0.9, 1.0) * (0.22 + 0.85 * shade);
  col += l2 * vec3(0.3, 0.55, 0.65) * 0.3 * shade;
  col += lines * l2 * vec3(1.0, 0.98, 0.92) * 1.2 * shade;   // nodes flare where layers cross   // nodes flare where layers cross
  float ray = pow(vnoise(vec2(p.x * 5.0 + p.y * 1.3, t * 0.12)), 4.0) * smoothstep(-0.7, 0.7, p.y);
  col += vec3(0.45, 0.65, 0.75) * ray * 0.12;
  return col;
}

// ─── II · CHROME ─────────────────────────────────────────────
float mercury(vec2 q, float t){
  vec2 w1 = vec2(fbm3(q + vec2(0.0, t * 0.07)), fbm3(q + vec2(4.2, -t * 0.06)));
  return fbm3(q * 0.9 + w1 * 1.6 + vec2(t * 0.025, 0.0));
}
vec3 mercuryEnv(vec3 r){
  float y = r.y;
  vec3 c = mix(vec3(0.015, 0.015, 0.02), vec3(0.75, 0.77, 0.8), smoothstep(-0.45, 0.55, y));
  c += vec3(1.0) * smoothstep(0.16, 0.0, abs(y - 0.42)) * 0.9;        // horizon softbox
  c += vec3(1.0) * smoothstep(0.3, 0.0, abs(r.x - 0.5)) * 0.45;       // vertical strip
  c += EMBER * smoothstep(0.35, 0.0, length(vec2(r.x + 0.55, y + 0.35))) * 0.9; // warm kicker
  c *= 0.85 + 0.15 * sin(r.x * 5.0 + y * 2.0);
  return c;
}
vec3 sceneChrome(vec2 p, float t){
  vec2 q = p * 1.5;
  float e = 0.012;
  float h = mercury(q, t);
  float hx = mercury(q + vec2(e, 0.0), t);
  float hy = mercury(q + vec2(0.0, e), t);
  vec2 g = vec2(hx - h, hy - h) / e;
  vec3 n = normalize(vec3(-g * 0.42, 1.0));
  vec3 r = reflect(normalize(vec3(p * 0.3, -1.0)), n);
  vec3 col = mercuryEnv(r);
  // cavities stay dark, crests catch light
  col *= 0.3 + 1.0 * smoothstep(0.25, 0.72, h);
  col = pow(col, vec3(1.35)) * 1.25;
  float spec = pow(max(dot(n, normalize(vec3(-0.3, 0.5, 1.0))), 0.0), 90.0);
  col += vec3(1.0) * spec * 0.8;
  return col;
}

// ─── III · VAPOR ─────────────────────────────────────────────
vec3 sceneVapor(vec2 p, float t){
  vec2 q = p * vec2(1.7, 1.15) + vec2(0.0, -t * 0.085);
  vec2 w = vec2(fbm(q * 1.15 + vec2(t * 0.035, 0.0)), fbm(q * 1.15 + vec2(5.1, -t * 0.03)));
  float n = fbm(q + w * 2.1);
  float ridge = 1.0 - abs(n * 2.0 - 1.0);
  float fil = pow(ridge, 13.0);
  float fil2 = pow(1.0 - abs(fbm(q * 2.1 + w * 1.4 + 3.0) * 2.0 - 1.0), 14.0);
  float body = smoothstep(0.4, 0.85, n);
  float sway = sin(p.y * 2.3 + t * 0.25) * 0.12;
  float column = exp(-pow((p.x - sway) * 2.6, 2.0)) * smoothstep(1.3, -0.75, p.y);
  float light = exp(-2.6 * length((p - vec2(0.0, -0.78)) * vec2(1.0, 1.3)));
  vec3 col = vec3(0.01, 0.009, 0.01);
  vec3 warm = mix(EMBER, vec3(1.0, 0.86, 0.72), smoothstep(0.2, 0.9, fil));
  col += warm * fil * (column * 1.9 + light * 0.9);
  col += EMBER * 0.22 * column * body * (0.4 + light);
  col += vec3(1.0, 0.8, 0.65) * fil2 * column * 0.45;
  col += EMBER * 0.12 * body * light;
  col += vec3(0.035) * body * column;
  col += vec3(1.0, 0.55, 0.3) * exp(-length((p - vec2(0.0, -0.8)) * vec2(1.0, 5.0)) * 9.0) * 0.5;
  return col;
}

// ─── IV · REED (fluted glass) ─────────────────────────────────
vec3 reedBehind(vec2 q, float t){
  vec3 col = mix(vec3(0.05, 0.045, 0.045), vec3(0.16, 0.15, 0.14), smoothstep(-0.6, 0.6, q.y));
  vec2 sp = vec2(0.12 * sin(t * 0.13) + 0.05, 0.1 + 0.06 * cos(t * 0.11));
  col = mix(col, EMBER, smoothstep(0.34, 0.24, length(q - sp)));
  col = mix(col, BONE, smoothstep(0.1, 0.04, abs(q.x + 0.32 + 0.04 * sin(t * 0.2))) * smoothstep(-0.7, -0.1, q.y) * 0.95);
  col = mix(col, STEEL * 0.55, smoothstep(-0.18, -0.34, q.y));
  col = mix(col, INK, smoothstep(0.1, 0.02, abs(q.x - 0.36 - 0.03 * cos(t * 0.17))) * 0.9);
  return col;
}
vec3 sceneReed(vec2 p, float t){
  float flutes = 17.0;
  float fx = fract(p.x * flutes + 0.5);
  float o = fx - 0.5;
  float lens = o * 0.16;
  vec2 q = vec2(p.x - lens, p.y);
  vec3 col;
  float ca = 0.014 * o;
  col.r = reedBehind(q + vec2(ca, 0.0), t).r;
  col.g = reedBehind(q, t).g;
  col.b = reedBehind(q - vec2(ca, 0.0), t).b;
  col *= 0.78 + 0.34 * (1.0 - 4.0 * o * o);
  col += vec3(1.0) * pow(1.0 - abs(o * 2.0), 28.0) * 0.08;
  col -= vec3(0.06) * smoothstep(0.44, 0.5, abs(o));
  return col;
}

// ─── V · ECLIPSE ─────────────────────────────────────────────
vec3 sceneEclipse(vec2 p, float t){
  vec2 c = vec2(0.0, 0.02);
  vec2 d = p - c;
  float r = length(d);
  float R = 0.24;
  float ang = atan(d.y, d.x);
  float n = fbm(vec2(ang * 2.2 + t * 0.03, r * 3.0 - t * 0.07));
  float n2 = fbm(vec2(ang * 9.0 - t * 0.02, r * 6.0 - t * 0.05));
  float outside = smoothstep(R - 0.002, R + 0.002, r);
  float corona = exp(-(r - R) * (6.5 - 3.5 * n)) * outside;
  float streak = pow(n2, 3.0) * exp(-(r - R) * 3.2) * outside;
  float ring = exp(-pow((r - R) * 160.0, 2.0));
  vec3 col = vec3(0.007, 0.007, 0.009);
  col += vec3(1.0, 0.86, 0.74) * corona * 0.75;
  col += vec3(1.0, 0.62, 0.38) * streak * 1.1;
  col += vec3(1.0, 0.97, 0.94) * ring * 1.4;
  vec2 bp = c + R * vec2(cos(2.35), sin(2.35));
  vec2 bd = p - bp;
  col += vec3(1.0, 0.95, 0.9) * exp(-length(bd) * 40.0) * 2.2;
  col += vec3(1.0, 0.75, 0.55) * exp(-abs(bd.y) * 140.0) * exp(-abs(bd.x) * 4.0) * 0.55;
  col = mix(vec3(0.006, 0.006, 0.008), col, outside);
  float st = step(0.9965, hash12(floor(p * 260.0))) * smoothstep(R + 0.25, R + 0.7, r);
  col += st * 0.5;
  return col;
}

vec3 sceneAt(float s, vec2 p, float t){
  if (s < 0.5) return sceneCaustic(p, t);
  if (s < 1.5) return sceneChrome(p, t);
  if (s < 2.5) return sceneVapor(p, t);
  if (s < 3.5) return sceneReed(p, t);
  return sceneEclipse(p, t);
}
`;

const vertex = /* glsl */ `
  uniform float uBend;
  uniform vec2 uSize;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 p = position;
    p.x += sin(uv.y * 3.14159) * uBend / max(uSize.x, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform vec2 uSize, uMouse;
  uniform float uTime, uScene, uSceneB, uMix, uHover, uReveal, uMaskR, uAlpha, uPar, uZoom, uRim, uDark, uRadius;
  varying vec2 vUv;
  ${noise2}
  ${palette}
  ${grain}
  ${scenes}

  void main(){
    vec2 uv = vUv;
    vec2 px = (uv - 0.5) * uSize;
    float alpha = uAlpha;
    if (uRadius > 0.0) {
      vec2 q = abs(px) - (uSize * 0.5 - uRadius);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
      alpha *= smoothstep(0.75, -0.75, d);
    }

    // circular lens mask (the drop we dive into)
    float r = length(px);
    if (uMaskR >= 0.0) {
      float R = max(uMaskR, 0.001);
      float rr = clamp(r / R, 0.0, 1.0);
      px *= 1.0 - 0.32 * pow(rr, 5.0) * uRim;
      alpha *= smoothstep(R + 0.75, R - 0.75, r);
    }

    // hover: a ripple radiating from the cursor + a slow push-in
    vec2 mpx = (uMouse - 0.5) * uSize;
    vec2 dm = px - mpx;
    float md = length(dm);
    float rip = sin(md * 0.055 - uTime * 3.2) * exp(-md * 0.006) * uHover;
    px += (dm / max(md, 1.0)) * rip * 9.0;

    // reveal: a liquid edge rising from the bottom
    float edgeN = vnoise(vec2(uv.x * 6.0, uTime * 0.4)) - 0.5;
    float edge = uReveal * 1.25 - 0.1;
    alpha *= smoothstep(edge, edge - 0.08, (1.0 - uv.y) + edgeN * 0.08);

    float zoom = uZoom * (1.0 - 0.07 * uHover) * (1.0 + (1.0 - uReveal) * 0.25);
    vec2 p = px / uSize.y * zoom;
    p.x += uPar;
    float t = uTime;

    vec3 col = sceneAt(uScene, p, t);
    if (uMix > 0.001) col = mix(col, sceneAt(uSceneB, p, t), uMix);

    // lens rim light
    if (uMaskR >= 0.0) {
      float R = max(uMaskR, 0.001);
      float rim = exp(-pow((r - R) * 0.18, 2.0));
      col += vec3(1.0, 0.96, 0.9) * rim * 0.55 * uRim;
      col += vec3(0.8, 0.85, 1.0) * pow(clamp(r / R, 0.0, 1.0), 10.0) * 0.18 * uRim;
    }

    col *= 1.0 + uHover * 0.08;
    col *= 1.0 - uDark;
    // vignette + grain so they sit like printed photographs
    col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.3, 2.5);
    col += (grainNoise(gl_FragCoord.xy, uTime) - 0.5) * 0.05;
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Planes {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.PlaneGeometry(1, 1, 1, 24);
    this.base = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {},
    });
  }

  makeUniforms(scene) {
    return {
      uSize: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uScene: { value: scene },
      uSceneB: { value: scene },
      uMix: { value: 0 },
      uHover: { value: 0 },
      uReveal: { value: 1 },
      uMaskR: { value: -1 },
      uAlpha: { value: 1 },
      uPar: { value: 0 },
      uZoom: { value: 1 },
      uBend: { value: 0 },
      uRim: { value: 0 },
      uDark: { value: 0 },
      uRadius: { value: 0 },
    };
  }

  // el: DOM placeholder whose rect the plane mirrors (or null for manual planes)
  add(el, { scene = 0, hover = true, reveal = 1, parallax = 0, order = 0 } = {}) {
    const material = this.base.clone();
    material.uniforms = this.makeUniforms(scene);
    const mesh = new THREE.Mesh(this.geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.scene.add(mesh);
    const item = { el, mesh, u: material.uniforms, parallax, manual: !el, rect: null, hoverTarget: 0 };
    item.u.uReveal.value = reveal;
    if (el && hover && matchMedia('(hover: hover)').matches) {
      el.addEventListener('pointerenter', () => gsap.to(item.u.uHover, { value: 1, duration: 1.1, ease: 'expo.out' }));
      el.addEventListener('pointerleave', () => gsap.to(item.u.uHover, { value: 0, duration: 1.4, ease: 'expo.out' }));
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        gsap.to(item.u.uMouse.value, { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, duration: 0.6, ease: 'power3.out' });
      });
    }
    this.items.push(item);
    return item;
  }

  update(t, W, H, bend) {
    for (const it of this.items) {
      it.u.uTime.value = t;
      if (it.manual) continue; // positioned by its owner
      const r = it.el.getBoundingClientRect();
      const visible = r.bottom > -40 && r.top < H + 40 && r.right > -40 && r.left < W + 40 && r.width > 1 && it.u.uAlpha.value > 0.001;
      it.mesh.visible = visible;
      if (!visible) continue;
      it.mesh.position.set(r.left + r.width / 2, -(r.top + r.height / 2), 0);
      it.mesh.scale.set(r.width, r.height, 1);
      it.u.uSize.value.set(r.width, r.height);
      it.u.uBend.value = bend * (it.bendable ? 1 : 0);
      if (it.pill) it.u.uRadius.value = r.height / 2;
      if (it.parallax) it.u.uPar.value = ((r.left + r.width / 2) / W - 0.5) * it.parallax;
    }
  }
}
