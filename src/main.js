import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { state } from './state.js';
import { Engine } from './gl/engine.js';
import { buildChoreography } from './choreo.js';
import { initCursor } from './ui/cursor.js';
import { initMagnetic } from './ui/magnetic.js';

gsap.registerPlugin(ScrollTrigger);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── grain texture, generated once
(() => {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  document.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

// ── loader counter runs while fonts + shaders warm up
const loaderNum = document.querySelector('.loader__num');
const loaderLine = document.querySelector('.loader__line span');
const loaderStatus = document.querySelector('.loader__status');
const counter = { v: 0 };
const countTween = gsap.to(counter, {
  v: 86, duration: 1.6, ease: 'power2.inOut',
  onUpdate: () => {
    loaderNum.textContent = String(Math.round(counter.v)).padStart(3, '0');
    loaderLine.style.transform = `scaleX(${counter.v / 100})`;
  },
});

async function boot() {
  await Promise.all([
    document.fonts.load('900 200px "Mona Sans Variable"'),
    document.fonts.load('400 100px "Anybody Variable"'),
    document.fonts.load('italic 400 100px "Instrument Serif"'),
    document.fonts.load('400 12px "JetBrains Mono Variable"'),
  ]).catch(() => {});
  await document.fonts.ready;

  const lenis = new Lenis({ lerp: reduced ? 1 : 0.075, wheelMultiplier: 0.85, smoothWheel: !reduced, syncTouch: false });
  lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  window.__lenis = lenis;

  const engine = new Engine(document.getElementById('gl'), state);
  const choreo = buildChoreography({ engine, state, lenis });
  initCursor(state);
  initMagnetic();

  // pointer → smoothed normalised mouse
  window.addEventListener('pointermove', (e) => {
    state.pointer.x = e.clientX;
    state.pointer.y = e.clientY;
    state.mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    state.mouseTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
  });

  // touch the drop and it shudders
  window.addEventListener('pointerdown', () => {
    if (state.overBlob || state.mobile) gsap.to(state, { pulse: 1, duration: 0.25, ease: 'power2.out', overwrite: true });
  });

  // anchor links → smooth scroll
  document.querySelectorAll('[data-scroll-to]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const to = a.getAttribute('data-scroll-to');
      lenis.scrollTo(to === '0' ? 0 : to, { duration: to === '0' ? 4.2 : 2.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    });
  });

  // live readouts in the hero
  const frameEl = document.querySelector('.js-frame');
  const clockEl = document.querySelector('.js-clock');
  const iorEl = document.querySelector('.js-ior');
  const tenEl = document.querySelector('.js-tension');
  let frame = 0;
  const perf = { on: false, n: 0, sum: 0 };
  setTimeout(() => { perf.on = true; }, 6500);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      engine.resize();
      engine.portal.build(document.querySelector('.portal__word'), '"Mona Sans Variable", Arial, sans-serif');
      ScrollTrigger.refresh();
    }, 180);
  });

  // ── the one loop
  let last = performance.now();
  const start = last;
  gsap.ticker.lagSmoothing(0);
  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    lenis.raf(now);
    const t = (now - start) / 1000;
    state.scroll = window.scrollY;
    state.velocity = lenis.velocity || 0;
    state.bend += (Math.max(-60, Math.min(60, state.velocity * 2.2)) - state.bend) * 0.12;
    state.mouse.x += (state.mouseTarget.x - state.mouse.x) * 0.045;
    state.mouse.y += (state.mouseTarget.y - state.mouse.y) * 0.045;
    choreo.update(dt);
    state.pulse *= Math.pow(0.12, dt);
    const b = state.blob;
    const over = b.alpha > 0.5 && Math.hypot(state.pointer.x - b.x, state.pointer.y - b.y) < b.size * 0.5;
    if (over !== state.overBlob) { state.overBlob = over; document.body.classList.toggle('over-blob', over); }
    engine.render(t, dt);

    // adaptive resolution: if the GPU struggles, trade pixels for fluidity
    if (perf.on) {
      perf.n++; perf.sum += dt;
      if (perf.n === 90) {
        const avg = perf.sum / perf.n;
        if (avg > 1 / 34 && engine.dpr > 1) { engine.dprCap = Math.max(1, engine.dpr - 0.5); engine.resize(); perf.n = 0; perf.sum = 0; }
        else perf.on = false;
      }
    }

    frame++;
    if (frame % 3 === 0 && state.scroll < window.innerHeight) {
      frameEl.textContent = String(frame).padStart(6, '0');
      iorEl.textContent = (1.333 + Math.sin(t * 0.7) * 0.004 + state.blob.amp * 0.01).toFixed(3);
      tenEl.textContent = (72.8 + Math.sin(t * 0.43) * 0.6 + Math.abs(state.velocity) * 0.05).toFixed(1);
      const d = new Date();
      clockEl.textContent = d.toTimeString().slice(0, 8);
    }
  });

  // warm up shaders before the curtain lifts
  engine.renderer.compile(engine.bgScene, engine.camera);
  engine.renderer.compile(engine.blobScene, engine.camera);
  engine.renderer.compile(engine.domScene, engine.ortho);
  engine.renderer.compile(engine.portalScene, engine.clipCam);
  ScrollTrigger.refresh();
  window.__ready = true;

  await countTween.then();
  intro(lenis);
}

function intro(lenis) {
  const counter2 = { v: 86 };
  const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } });
  tl.to(counter2, {
    v: 100, duration: 0.5, ease: 'power2.out',
    onUpdate: () => {
      loaderNum.textContent = String(Math.round(counter2.v)).padStart(3, '0');
      loaderLine.style.transform = `scaleX(${counter2.v / 100})`;
    },
  })
    .call(() => { loaderStatus.textContent = 'Light compiled'; })
    .to('.loader__num', { yPercent: -105, duration: 0.9, ease: 'expo.in' }, '+=0.1')
    .to('.loader__top, .loader__bottom, .loader__line', { opacity: 0, duration: 0.5, ease: 'power2.in' }, '<')
    .to('.loader', { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.4 }, '-=0.25')
    .add(() => document.body.classList.remove('is-loading'), '<0.5')
    .to(state, { intro: 1, duration: 3.2, ease: 'expo.out' }, '<0.35')
    .to(state.title, { reveal: 1, duration: 2.6, ease: 'expo.out' }, '<0.1')
    .from('.hud', { opacity: 0, y: -20, duration: 1.4, ease: 'expo.out' }, '<0.4')
    .from('.reveal-up', { opacity: 0, y: 40, duration: 1.6, stagger: 0.08, ease: 'expo.out' }, '<0.1')
    .from('.hero__side', { opacity: 0, duration: 1.6 }, '<')
    .call(() => {
      document.querySelector('.loader').style.display = 'none';
      lenis.start();
    }, null, '<0.2');
}

loaderStatus.textContent = 'Compiling light';
boot();
