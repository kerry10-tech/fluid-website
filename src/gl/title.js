import * as THREE from 'three';

// The giant "FLUID" title lives *inside* the WebGL scene so the glass drop can
// refract it. Each glyph is its own plane: it can rise out of a mask, drift on
// its own depth layer, and fly past the camera like a title sequence.
const FONT = '"Mona Sans Variable", "Helvetica Neue", Arial, sans-serif';

function letterTexture(ch, fontPx) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `900 expanded ${fontPx}px ${FONT}`;
  ctx.font = font;
  try { ctx.fontStretch = 'expanded'; } catch (e) { /* older browsers */ }
  const m = ctx.measureText(ch);
  const asc = m.actualBoundingBoxAscent;
  const desc = Math.max(0, m.actualBoundingBoxDescent);
  const padX = Math.ceil(fontPx * 0.04);
  const padY = Math.ceil(fontPx * 0.04);
  const w = Math.ceil(m.width + padX * 2);
  const h = Math.ceil(asc + desc + padY * 2);
  c.width = w;
  c.height = h;
  ctx.font = font;
  try { ctx.fontStretch = 'expanded'; } catch (e) { /* noop */ }
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, padX, padY + asc);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  return { tex, w, h, advance: m.width, padX, padY, asc };
}

export class Title {
  constructor(word = 'FLUID') {
    this.word = word;
    this.group = new THREE.Group();
    this.letters = [];
    this.reveal = 0; // 0..1 intro
    this.exit = 0; // 0..1 hero exit
    this.finale = 0; // 0..1 coda return
    this.finaleColor = new THREE.Color(1, 0.353, 0.122);
  }

  build(viewW, viewH, dpr) {
    this.letters.forEach((l) => { [l.mesh, l.mirror].forEach((m) => { m.geometry.dispose(); m.material.dispose(); this.group.remove(m); }); l.tex.dispose(); });
    this.letters = [];
    // size so the word spans the viewport
    const probe = document.createElement('canvas').getContext('2d');
    const basePx = 200;
    probe.font = `900 expanded ${basePx}px ${FONT}`;
    try { probe.fontStretch = 'expanded'; } catch (e) { /* noop */ }
    const wordW = probe.measureText(this.word).width;
    const targetW = viewW * (viewW < 700 ? 0.96 : 0.94);
    const cssPx = (basePx * targetW) / wordW;
    this.cssFontPx = cssPx;
    const texPx = Math.min(cssPx * Math.min(dpr, 2), 1400);
    const scale = cssPx / texPx; // css px per texture px

    let x = 0;
    const items = [];
    for (const ch of this.word) {
      const t = letterTexture(ch, texPx);
      items.push({ ch, ...t, x });
      x += t.advance * scale;
    }
    const total = x;
    items.forEach((it, i) => {
      const mesh = this.makeMesh(it.tex, i, false);
      const mirror = this.makeMesh(it.tex, i, true);
      this.group.add(mesh, mirror);
      this.letters.push({
        mesh,
        mirror,
        tex: it.tex,
        // layout in css px, relative to word centre
        cx: it.x + (it.w * scale) / 2 - it.padX * scale - total / 2,
        w: it.w * scale,
        h: it.h * scale,
        baselineOffset: (it.padY + it.asc) * scale, // from top of quad to baseline
        capH: it.asc * scale,
        depth: [0.0, -0.35, 0.25, -0.2, 0.15][i % 5],
        seed: Math.random(),
      });
    });
    this.total = total;
  }

  makeMesh(tex, i, mirror) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMap: { value: tex },
        uReveal: { value: 0 },
        uAlpha: { value: 1 },
        uTime: { value: 0 },
        uSweep: { value: 0 },
        uIndex: { value: i },
        uWarm: { value: 0 },
        uMirror: { value: mirror ? 1 : 0 },
        uColor: { value: new THREE.Color(0.925, 0.906, 0.871) },
        uWarmColor: { value: this.finaleColor },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main(){
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uMap;
        uniform float uReveal, uAlpha, uTime, uSweep, uIndex, uWarm, uMirror;
        uniform vec3 uColor, uWarmColor;
        varying vec2 vUv;
        varying vec3 vWorld;
        void main(){
          vec2 uv = vUv;
          if (uMirror > 0.5) {
            // a liquid floor: the reflection ripples
            uv.x += sin(uv.y * 38.0 - uTime * 1.6 + uIndex) * 0.004 * (0.3 + uv.y);
          }
          // rise out of a horizon line at the foot of the glyph
          uv.y += 1.0 - uReveal;
          if (uv.y > 1.0) discard;
          float a = texture2D(uMap, uv).a * uAlpha;
          if (uMirror > 0.5) a *= (1.0 - smoothstep(0.0, 0.62, vUv.y)) * 0.2;
          if (a < 0.002) discard;
          vec3 col = mix(uColor, uWarmColor, uWarm);
          col *= 0.78 + 0.26 * smoothstep(0.0, 1.0, uv.y);
          float band = vWorld.x * 0.55 + vWorld.y * 0.35 - uSweep;
          col += vec3(1.0, 0.97, 0.92) * exp(-band * band * 6.0) * 0.28;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    m.frustumCulled = false;
    return m;
  }

  // px→world helper supplied by engine
  update(t, ctx) {
    const { W, H, pxToWorld, mouse, zPlane } = ctx;
    const n = this.letters.length;
    const center = (n - 1) / 2;
    const sweep = ((t * 0.12) % 1.6) * 9 - 6;
    const exit = this.exit;
    const fin = this.finale;
    const k = pxToWorld(zPlane);

    this.letters.forEach((L, i) => {
      const u = L.mesh.material.uniforms;
      u.uTime.value = t;
      u.uSweep.value = sweep;

      // HERO layout — optically centred, baseline just under the middle
      const heroBaseline = H * 0.5 + L.capH * 0.5;
      // FINALE layout — sunk into the bottom edge
      const finBaseline = H + L.capH * 0.22;

      const baseline = fin > 0 ? finBaseline : heroBaseline;
      const topY = baseline - L.baselineOffset;
      const cyPx = topY + L.h / 2;
      let x = (L.cx) * k;
      let y = -(cyPx - H / 2) * k;
      let z = zPlane;
      let rotY = 0, rotZ = 0;
      let alpha = 1;
      let reveal = this.reveal;

      // mouse parallax per glyph depth
      x += mouse.x * (0.06 + L.depth * 0.08);
      y += mouse.y * (0.04 + L.depth * 0.05);

      if (exit > 0 && fin <= 0) {
        const dir = i - center;
        const local = Math.min(1, Math.max(0, exit * 1.25 - Math.abs(dir) * 0.06 - L.seed * 0.08));
        const e = local * local * (3 - 2 * local);
        const ee = Math.pow(local, 2.2);
        x += dir * ee * 2.4 + Math.sign(dir || 0.3) * ee * 1.5;
        y += (L.depth * 2.0 - 0.6) * ee;
        z += ee * (7.4 + L.depth * 2.0);
        rotY = -dir * e * 0.5;
        rotZ = (L.seed - 0.5) * e * 0.4;
        alpha = 1 - Math.pow(Math.max(0, local - 0.55) / 0.45, 1.4);
      }

      if (fin > 0) {
        // coda: glyphs arrive from deep space, one after the other
        const local = Math.min(1, Math.max(0, fin * 1.35 - i * 0.08));
        const e = 1 - Math.pow(1 - local, 4);
        z = zPlane - (1 - e) * (28 + L.depth * 6);
        y -= (1 - e) * 2.5;
        x *= 1;
        rotY = (1 - e) * (i - center) * 0.25;
        alpha = Math.min(1, local * 2.5);
        reveal = 1;
        u.uWarm.value = 0.0;
      }

      L.mesh.position.set(x, y, z);
      L.mesh.rotation.set(0, rotY, rotZ);
      L.mesh.scale.set(L.w * k, L.h * k, 1);
      const rv = Math.min(1, Math.max(0, reveal * 1.5 - i * 0.1));
      u.uReveal.value = 1 - Math.pow(1 - rv, 3);
      u.uAlpha.value = alpha;
      L.mesh.visible = alpha > 0.002 && (exit < 1 || fin > 0);

      // reflection: mirrored about the quad's foot, only in the hero
      const mu = L.mirror.material.uniforms;
      const baseY = y + (L.h / 2 - L.baselineOffset) * k;
      L.mirror.position.set(x, 2 * baseY - y, z);
      L.mirror.rotation.set(0, rotY, -rotZ);
      L.mirror.scale.set(L.w * k, -L.h * k, 1);
      mu.uReveal.value = u.uReveal.value;
      mu.uTime.value = t;
      mu.uSweep.value = sweep;
      mu.uAlpha.value = alpha * (1 - Math.min(1, exit * 3)) * (fin > 0 ? 0 : 1);
      L.mirror.visible = mu.uAlpha.value > 0.002;
    });
  }
}
