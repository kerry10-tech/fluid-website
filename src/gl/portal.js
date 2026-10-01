import * as THREE from 'three';
import { noise2, palette } from './glsl.js';

// A sheet of paper with a word cut out of it. Behind the paper is the dark
// coda scene. Scaling the sheet around a point inside the first glyph's stem
// lets us fly *through* the letter. The word is stored as a signed distance
// field so the cut stays razor sharp at 80× magnification.

const INF = 1e20;
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function edt(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

function wordSDF(word, font, texW, spread) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const basePx = 200;
  ctx.font = `900 expanded ${basePx}px ${font}`;
  try { ctx.fontStretch = 'expanded'; } catch (e) { /* noop */ }
  const pad = spread * 2;
  const m0 = ctx.measureText(word);
  const fontPx = (basePx * (texW - pad * 2)) / m0.width;
  ctx.font = `900 expanded ${fontPx}px ${font}`;
  try { ctx.fontStretch = 'expanded'; } catch (e) { /* noop */ }
  const m = ctx.measureText(word);
  const asc = m.actualBoundingBoxAscent;
  const desc = Math.max(0, m.actualBoundingBoxDescent);
  const w = texW;
  const h = Math.ceil(asc + desc + pad * 2);
  c.width = w; c.height = h;
  ctx.font = `900 expanded ${fontPx}px ${font}`;
  try { ctx.fontStretch = 'expanded'; } catch (e) { /* noop */ }
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(word, pad, pad + asc);
  const img = ctx.getImageData(0, 0, w, h).data;
  const outer = new Float64Array(w * h);
  const inner = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = img[i * 4 + 3] / 255;
    if (a >= 1) { outer[i] = 0; inner[i] = INF; }
    else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
    else { const d = 0.5 - a; outer[i] = d > 0 ? d * d : 0; inner[i] = d < 0 ? d * d : 0; }
  }
  edt(outer, w, h);
  edt(inner, w, h);
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]); // >0 outside glyphs
    const v = Math.max(0, Math.min(255, Math.round(255 * (0.5 - d / (2 * spread)))));
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  // focal point: centre of the first glyph's stem
  const first = ctx.measureText(word[0]);
  const focal = { x: pad + first.width * 0.5, y: pad + asc - first.actualBoundingBoxAscent * 0.5 };
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, w, h, focal };
}

export class Portal {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uSdf: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, // css px: x, y, w, h of the word box
        uFocal: { value: new THREE.Vector2() }, // css px
        uScale: { value: 1 },
        uTime: { value: 0 },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uSdf;
        uniform vec2 uRes, uFocal, uTexel;
        uniform vec4 uRect;
        uniform float uScale, uDpr, uTime, uFade;
        varying vec2 vUv;
        ${noise2}
        ${palette}

        float glyph(vec2 css){
          vec2 anchor = mix(uFocal, uRes * 0.5, smoothstep(1.0, 7.0, uScale));
          vec2 q = uFocal + (css - anchor) / uScale;
          vec2 tuv = (q - uRect.xy) / uRect.zw;
          if (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) return 0.0;
          return texture2D(uSdf, tuv).r;
        }

        void main(){
          vec2 css = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
          float d = glyph(css);
          float w = max(fwidth(d), 1e-4) * 0.75;
          float hole = smoothstep(0.5 - w, 0.5 + w, d);

          // paper casts a soft shadow into the hole (light from top-left)
          float ds = glyph(css - vec2(10.0, 14.0) * min(uScale, 6.0));
          float shadow = 1.0 - smoothstep(0.38, 0.62, ds);

          vec2 p = (gl_FragCoord.xy / uDpr - 0.5 * uRes) / uRes.y;
          vec3 paper = boneSurface(p, uTime);
          // fine bevel highlight on the cut edge
          float bevel = exp(-pow((d - 0.5) / max(w * 3.0, 1e-4), 2.0));
          paper += vec3(0.04) * bevel * (1.0 - hole);

          // paper (opaque) outside, translucent shadow inside the cut
          vec3 col = mix(paper, vec3(0.0), hole);
          float a = mix(1.0, shadow * 0.55, hole);
          gl_FragColor = vec4(col, a * uFade);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scale = 1;
    this.active = false;
  }

  build(el, font) {
    const r = el.getBoundingClientRect();
    const texW = Math.min(2600, Math.max(1400, Math.round(r.width * 1.6)));
    const spread = Math.round(texW / 90);
    if (this.sdf) this.sdf.tex.dispose();
    this.sdf = wordSDF('IMMERSE', font, texW, spread);
    this.material.uniforms.uSdf.value = this.sdf.tex;
    this.material.uniforms.uTexel.value.set(1 / this.sdf.w, 1 / this.sdf.h);
    this.el = el;
  }

  update(t, W, H, dpr) {
    if (!this.sdf || !this.el) return;
    const u = this.material.uniforms;
    const r = this.el.getBoundingClientRect();
    // fit texture into the element width, centred vertically on it
    const w = r.width;
    const h = (w * this.sdf.h) / this.sdf.w;
    const x = r.left;
    const y = r.top + r.height / 2 - h / 2;
    u.uRect.value.set(x, y, w, h);
    u.uFocal.value.set(x + (this.sdf.focal.x / this.sdf.w) * w, y + (this.sdf.focal.y / this.sdf.h) * h);
    u.uScale.value = this.scale;
    u.uTime.value = t;
    u.uRes.value.set(W, H);
    u.uDpr.value = dpr;
  }
}
