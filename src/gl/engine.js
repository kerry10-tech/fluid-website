import * as THREE from 'three';
import { createBackground } from './background.js';
import { createBlob } from './blob.js';
import { createDust } from './dust.js';
import { Title } from './title.js';
import { Planes } from './planes.js';
import { Portal } from './portal.js';

const FOV = 35;
const CAM_Z = 6;

export class Engine {
  constructor(canvas, state) {
    this.state = state;
    this.mobile = state.mobile;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x08080a, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // our shaders speak display values

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
    this.camera.position.z = CAM_Z;
    this.ortho = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000);
    this.clipCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.bgScene = new THREE.Scene();
    this.blobScene = new THREE.Scene();
    this.frontScene = new THREE.Scene();
    this.domScene = new THREE.Scene();
    this.blitScene = new THREE.Scene();
    this.portalScene = new THREE.Scene();

    // background atmosphere
    this.bg = createBackground();
    this.bgScene.add(this.bg.mesh);

    // title glyphs (refracted by the drop)
    this.title = new Title('FLUID');
    this.bgScene.add(this.title.group);

    // dust: far (refracted) and near (bokeh, in front of everything)
    this.dustFar = createDust(this.mobile ? 260 : 650, { zMin: -8, zMax: -1, size: 1.1 });
    this.bgScene.add(this.dustFar.points);
    this.dustNear = createDust(this.mobile ? 14 : 34, { zMin: 1.5, zMax: 4, size: 1.2, near: true });
    this.frontScene.add(this.dustNear.points);

    // glass drop
    this.blob = createBlob(this.mobile ? 32 : 60);
    this.blobScene.add(this.blob.mesh);

    // blit
    this.rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, stencilBuffer: false });
    this.blitMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { uTex: { value: this.rt.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'precision highp float; uniform sampler2D uTex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(uTex, vUv); }',
    });
    const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat);
    blit.frustumCulled = false;
    this.blitScene.add(blit);
    this.blob.material.uniforms.uBg.value = this.rt.texture;

    // DOM-synced planes
    this.planes = new Planes(this.domScene);

    // portal sheet
    this.portal = new Portal();
    this.portalScene.add(this.portal.mesh);

    this.resize();
  }

  pxToWorld(z) {
    const dist = CAM_Z - z;
    return (2 * dist * Math.tan((FOV * Math.PI) / 360)) / this.H;
  }

  resize() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.W = W; this.H = H;
    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 1.75, this.dprCap || 3);
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    Object.assign(this.ortho, { left: 0, right: W, top: 0, bottom: -H });
    this.ortho.updateProjectionMatrix();
    this.rt.setSize(Math.round(W * dpr), Math.round(H * dpr));
    this.bg.material.uniforms.uRes.value.set(W * dpr, H * dpr);
    this.blob.material.uniforms.uRes.value.set(W * dpr, H * dpr);
    this.dustFar.material.uniforms.uDpr.value = dpr;
    this.dustNear.material.uniforms.uDpr.value = dpr;
    this.title.build(W, H, dpr);
  }

  render(t, dt) {
    const s = this.state;
    const { W, H, dpr } = this;
    const mx = s.mouse.x, my = s.mouse.y;

    // ── background
    const bu = this.bg.material.uniforms;
    bu.uTime.value = t;
    bu.uMouse.value.set(s.mouse.x * 0.5 + 0.5, s.mouse.y * 0.5 + 0.5);
    bu.uTheme.value = s.theme;
    bu.uScroll.value = s.scroll;
    bu.uWarm.value = s.warm;

    // ── camera breathes with the cursor
    this.camera.position.x += (mx * 0.18 - this.camera.position.x) * 0.05;
    this.camera.position.y += (my * 0.12 - this.camera.position.y) * 0.05;
    this.camera.lookAt(0, 0, 0);

    // ── title
    this.title.reveal = s.title.reveal;
    this.title.exit = s.title.exit;
    this.title.finale = s.title.finale;
    this.title.update(t, { W, H, pxToWorld: (z) => this.pxToWorld(z), mouse: { x: mx, y: my }, zPlane: -2.2 });
    bu.uFloor.value.set(this.title.floor.y * dpr, this.title.floor.a);

    // ── dust
    for (const d of [this.dustFar, this.dustNear]) {
      const u = d.material.uniforms;
      u.uTime.value = t;
      u.uScroll.value = s.scroll;
      u.uMouse.value.set(mx, my);
      u.uTheme.value = s.theme;
    }

    // ── blob
    const b = s.blob;
    const bm = this.blob.material.uniforms;
    const blobVisible = b.alpha > 0.003 && b.size > 2;
    if (blobVisible) {
      const k = this.pxToWorld(0);
      const mesh = this.blob.mesh;
      mesh.position.set((b.x - W / 2) * k, -(b.y - H / 2) * k, 0);
      const r = (b.size / 2) * k;
      mesh.scale.setScalar(r);
      mesh.rotation.y += dt * 0.08;
      mesh.rotation.x += ((my * 0.4) - mesh.rotation.x) * 0.04;
      bm.uTime.value = t;
      bm.uOpacity.value = b.alpha;
      bm.uAmp.value = b.amp + s.pulse * 0.22;
      bm.uVel.value += (Math.min(Math.abs(s.velocity) * 0.012, 1.2) - bm.uVel.value) * 0.08;
      bm.uMouse.value.set(mx * 0.5, my * 0.5);
      bm.uLight.value.set(mx, my);
      bm.uWarm.value = s.warm;
      bm.uLift.value = b.lift ?? 0;
      bm.uCenter.value.set(b.x / W, 1 - b.y / H);
      bu.uBlob.value.set(b.x * dpr, b.y * dpr, (b.size / 2) * dpr, b.alpha * b.glow);
    } else {
      bu.uBlob.value.set(0, 0, 0, 0);
    }

    // ── planes + portal
    this.planes.update(t, W, H, s.bend);
    if (s.portal.active) {
      this.portal.scale = s.portal.scale;
      this.portal.update(t, W, H, dpr);
    }

    // ── draw
    const r = this.renderer;
    if (blobVisible) {
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(this.bgScene, this.camera);
      r.setRenderTarget(null);
      r.clear();
      r.render(this.blitScene, this.clipCam);
      r.render(this.blobScene, this.camera);
    } else {
      r.setRenderTarget(null);
      r.clear();
      r.render(this.bgScene, this.camera);
    }
    r.render(this.frontScene, this.camera);
    r.render(this.domScene, this.ortho);
    if (s.portal.active) r.render(this.portalScene, this.clipCam);
  }
}
