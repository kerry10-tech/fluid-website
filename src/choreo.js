import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { splitWords, splitChars, scramble } from './ui/text.js';

gsap.registerPlugin(ScrollTrigger);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function buildChoreography({ engine, state, lenis }) {
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const planes = engine.planes;
  const frameHooks = [];
  const onFrame = (fn) => frameHooks.push(fn);

  // ─────────────────────────────────────────────────────────────
  // The drop's journey. Each stop is a function returning a screen-space
  // state; segments interpolate between stops over a scroll range. When a
  // stop is anchored to a DOM element the drop stays glued to it.
  // ─────────────────────────────────────────────────────────────
  const segs = [];
  const segment = (trigger, start, end, from, to, ease = easeInOut) => {
    segs.push({ st: ScrollTrigger.create({ trigger, start, end }), from, to, ease });
  };
  const anchor = (el, sizeMul, extra = {}) => () => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.height * sizeMul, alpha: 1, amp: 0.12, glow: 1, lift: 0.6, ...(typeof extra === 'function' ? extra() : extra) };
  };
  const heroStop = () => {
    const s = Math.min(H() * 0.6, W() * (state.mobile ? 0.56 : 0.44));
    return { x: W() / 2, y: H() * 0.5, size: s * (0.2 + 0.8 * state.intro), alpha: Math.min(1, state.intro * 2.5), amp: 0.1 + (1 - state.intro) * 0.55, glow: 1, lift: 0 };
  };

  // ═════════════ HERO ═════════════
  const hero = $('.hero');
  gsap.to(state.title, { exit: 1, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  const heroOut = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  heroOut
    .to('.hero__lede', { y: -H() * 0.35, opacity: 0, ease: 'none' }, 0)
    .to('.hero__readout', { y: -H() * 0.6, opacity: 0, ease: 'none' }, 0)
    .to('.hero__scroll', { y: -H() * 0.2, opacity: 0, ease: 'none' }, 0)
    .to('.hero__coords', { y: -H() * 0.15, opacity: 0, ease: 'none' }, 0)
    .to('.hero__side', { y: H() * 0.3, opacity: 0, ease: 'none' }, 0);

  // ═════════════ MANIFESTO ═════════════
  const man = $('.manifesto');
  const slot = $('[data-blob-slot]', man);
  const words = splitWords($('.js-words', man));
  const pills = $$('.pill', man).map((el) => { const p = planes.add(el, { scene: +el.dataset.glScene, reveal: 0 }); p.pill = true; return p; });
  segment(man, 'top bottom', 'top top', heroStop, anchor(slot, 1.5, { amp: 0.08, glow: 0.6, lift: 1.2 }));

  const manTl = gsap.timeline({
    scrollTrigger: { trigger: man, start: 'top top', end: () => '+=' + H() * 1.7, pin: true, scrub: 1 },
  });
  // the first line arrives with the drop; the rest is read in by the scroll
  // group words into visual lines; alternate lines slide in from opposite sides
  const lineOf = new Map();
  { let top = null, li = -1; words.forEach((w) => { const t = w.offsetTop; if (top === null || Math.abs(t - top) > 8) { top = t; li++; } lineOf.set(w, li); }); }
  const drift = (w) => ((lineOf.get(w) % 2 ? 1 : -1) * Math.min(W() * 0.06, 90));
  gsap.set(words, { opacity: 0.1, filter: 'blur(7px)', y: 18 });
  words.forEach((w) => { if (!w.classList.contains('slot')) gsap.set(w, { x: drift(w) }); });
  const firstLine = words.slice(0, 4);
  gsap.to(firstLine, {
    opacity: 1, filter: 'blur(0px)', y: 0, x: 0, stagger: 0.05, ease: 'power2.out',
    scrollTrigger: { trigger: man, start: 'top 75%', end: 'top 5%', scrub: true },
  });
  words.slice(4).forEach((w, i) => {
    const at = i * 0.075;
    if (w.classList.contains('pill')) {
      const p = pills.find((pp) => pp.el === w);
      manTl.to(p.u.uReveal, { value: 1, duration: 0.5, ease: 'power2.out' }, at)
        .to(w, { x: 0, duration: 0.5, ease: 'power3.out' }, at);
    } else {
      manTl.to(w, { opacity: 1, filter: 'blur(0px)', y: 0, x: 0, duration: 0.5, ease: 'power3.out' }, at);
      if (w.closest('em')) manTl.fromTo(w, { letterSpacing: '0.12em' }, { letterSpacing: '-0.01em', duration: 0.6, ease: 'power3.out' }, at);
    }
  });
  manTl.fromTo('.manifesto__num', { yPercent: 12 }, { yPercent: -18, duration: manTl.duration() + 0.4, ease: 'none' }, 0);
  manTl.fromTo('.manifesto__aside', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4 }, 0.9);
  manTl.to({}, { duration: 0.4 });

  // ═════════════ JOURNEY: dive → full-bleed → studies ═════════════
  const journey = $('.journey');
  const core = $('[data-blob-core]', journey);
  const track = $('.track', journey);
  const card1 = $('.study--1', journey);
  const frame1 = $('.study__frame', card1);
  const dive = { blobAlpha: 1, mask: 0, rim: 1 };
  const winPlane = planes.add(frame1, { scene: 0, parallax: 0.25 });
  winPlane.bendable = true;
  winPlane.u.uAlpha.value = 0;
  const cards = $$('.study', journey).slice(1).map((el) => {
    const frame = $('.study__frame', el);
    const p = planes.add(frame, { scene: +frame.dataset.glScene, reveal: 0, parallax: 0.3 });
    p.bendable = true;
    return { el, p };
  });

  segment(journey, 'top bottom', 'top top', anchor(slot, 1.5, { amp: 0.08, glow: 0.6, lift: 1.2 }),
    anchor(core, 1, () => ({ alpha: dive.blobAlpha, amp: 0.12, glow: dive.blobAlpha, lift: 0.7 })));

  // FLIP: the first study starts as the whole viewport, measured from layout
  // offsets so it is immune to the pin and to the track's current position
  gsap.set(card1, { transformOrigin: '0 0' });
  const flipVals = { x: 0, y: 0, sx: 1, sy: 1 };
  const computeFlip = () => {
    flipVals.x = -(track.offsetLeft + card1.offsetLeft);
    flipVals.y = -card1.offsetTop;
    flipVals.sx = W() / card1.offsetWidth;
    flipVals.sy = H() / card1.offsetHeight;
  };

  const others = [$('.track__title', journey), ...cards.map((c) => c.el), $('.track__quote', journey), $('.track__end', journey)];
  const hspeed = $$('[data-hspeed]', journey).map((el) => ({ el, s: parseFloat(el.dataset.hspeed), off: 0 }));
  const captionChars = splitChars($('.caption__big', journey));
  const trackDist = () => track.scrollWidth - W();

  const jt = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: journey,
      start: 'top top',
      end: () => '+=' + (H() * 3.0 + trackDist() * 1.1),
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
      onRefreshInit: () => computeFlip(),
    },
  });
  computeFlip();
  const U = { dive: 1.5, hold: 0.55, flip: 0.95 };
  const trackUnits = () => (trackDist() * 1.1) / H();

  // phase 1 — dive into the drop
  jt.set(card1, { x: () => flipVals.x, y: () => flipVals.y, scaleX: () => flipVals.sx, scaleY: () => flipVals.sy }, 0)
    .set(others, { opacity: 0, x: () => W() * 0.5 }, 0)
    .set('.caption__meta', { opacity: 0 }, 0)
    .set(captionChars, { yPercent: 110 }, 0)
    .set('.study--1 .study__label, .study--1 .study__num', { opacity: 0, y: 20 }, 0)
    .fromTo(core, { scale: 1 }, { scale: () => Math.hypot(W(), H()) / core.offsetWidth * 1.08, duration: U.dive, ease: 'power3.in' }, 0)
    .fromTo('.dive__w--a', { x: 0, y: 0, opacity: 1, filter: 'blur(0px)' }, { x: () => -W() * 0.35, y: () => -H() * 0.25, scale: 1.6, opacity: 0, filter: 'blur(14px)', duration: U.dive * 0.8, ease: 'power2.in' }, 0)
    .fromTo('.dive__w--b', { x: 0, y: 0, opacity: 1, filter: 'blur(0px)' }, { x: () => W() * 0.35, y: () => H() * 0.25, scale: 1.6, opacity: 0, filter: 'blur(14px)', duration: U.dive * 0.8, ease: 'power2.in' }, 0)
    .to('.dive__meta', { opacity: 0, duration: U.dive * 0.4 }, 0)
    .fromTo(dive, { blobAlpha: 1 }, { blobAlpha: 0, duration: U.dive * 0.45, ease: 'power1.in' }, U.dive * 0.4)
    .fromTo(winPlane.u.uAlpha, { value: 0 }, { value: 1, duration: U.dive * 0.35, ease: 'power1.out' }, U.dive * 0.32)
    .fromTo(dive, { rim: 1 }, { rim: 0, duration: U.dive * 0.3 }, U.dive * 0.7);

  // phase 2 — the drop's interior holds full-bleed, captioned
  const t2 = U.dive;
  jt.to(captionChars, { yPercent: 0, duration: U.hold * 0.6, stagger: 0.03, ease: 'expo.out' }, t2 - 0.1)
    .to('.caption__meta', { opacity: 1, duration: U.hold * 0.4 }, t2)
    .fromTo(winPlane.u.uZoom, { value: 1.0 }, { value: 0.92, duration: U.hold + U.flip }, t2);

  // phase 3 — full-bleed shrinks into the first study; the others arrive
  const t3 = t2 + U.hold;
  jt.to(card1, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: U.flip, ease: 'expo.inOut' }, t3)
    .to(captionChars, { yPercent: -115, duration: U.flip * 0.5, stagger: 0.02, ease: 'power3.in' }, t3)
    .to('.caption__big', { autoAlpha: 0, duration: 0.05 }, t3 + U.flip * 0.55)
    .to('.caption__meta', { opacity: 0, duration: U.flip * 0.3 }, t3)
    .to(others, { opacity: 1, x: 0, duration: U.flip, stagger: 0.04, ease: 'expo.out' }, t3 + U.flip * 0.35)
    .to('.study--1 .study__label, .study--1 .study__num', { opacity: 1, y: 0, duration: U.flip * 0.5, ease: 'expo.out' }, t3 + U.flip * 0.6)
    .to('.journey__progress', { opacity: 1, duration: U.flip * 0.4 }, t3 + U.flip * 0.6);

  // phase 4 — horizontal drift through the studies
  const t4 = t3 + U.flip;
  const trackTween = gsap.fromTo(track, { x: 0 }, { x: () => -trackDist(), duration: trackUnits(), ease: 'none' });
  jt.add(trackTween, t4);
  jt.to('.journey__progress', { opacity: 0, duration: 0.25 }, t4 + trackUnits() - 0.2);

  const jpBar = $('.jp__bar i', journey);
  const jpN = $('.jp__n', journey);
  const romans = ['I', 'II', 'III', 'IV', 'V'];
  let lastCard = -1;
  onFrame(() => {
    // lens mask follows the core while we dive
    const p = jt.scrollTrigger ? jt.time() : 0;
    if (p < U.dive + 0.01) {
      winPlane.u.uMaskR.value = core.getBoundingClientRect().width / 2;
      winPlane.u.uRim.value = dive.rim;
    } else {
      winPlane.u.uMaskR.value = -1;
      winPlane.u.uRim.value = 0;
    }
    // horizontal parallax layers
    const tx = gsap.getProperty(track, 'x') || 0;
    const cx = W() / 2;
    for (const h of hspeed) {
      const r = h.el.getBoundingClientRect();
      const natural = r.left + r.width / 2 - h.off;
      h.off = (h.s - 1) * (natural - cx) * 0.6;
      h.el.style.translate = `${h.off.toFixed(2)}px 0`;
    }
    // studies reveal with a liquid edge as they enter
    const w = W();
    let best = 0, bestD = Infinity;
    [{ el: card1 }, ...cards].forEach((c, i) => {
      const r = c.el.getBoundingClientRect();
      if (c.p) c.p.u.uReveal.value = smooth(w * 1.02, w * 0.5, r.left);
      const d = Math.abs(r.left + r.width / 2 - w / 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best !== lastCard) { lastCard = best; jpN.textContent = `${romans[best]} / V`; }
    const prog = trackDist() > 0 ? clamp01(-tx / trackDist()) : 0;
    jpBar.style.transform = `scaleX(${prog})`;
  });

  // ═════════════ TRACE: ink dissolves into milk ═════════════
  const trace = $('.trace');
  gsap.to(state, { themeTrace: 1, ease: 'none', scrollTrigger: { trigger: trace, start: 'top 35%', end: 'bottom 85%', scrub: true } });
  gsap.fromTo('.trace__rule', { scaleY: 0 }, { scaleY: 1, stagger: 0.2, ease: 'none', scrollTrigger: { trigger: trace, start: 'top 60%', end: 'top 0%', scrub: true } });
  gsap.fromTo('.trace__text', { opacity: 0, filter: 'blur(12px)', letterSpacing: '0.04em' }, { opacity: 1, filter: 'blur(0px)', letterSpacing: '-0.025em', ease: 'none', scrollTrigger: { trigger: trace, start: 'top 55%', end: 'top 0%', scrub: true } });
  gsap.to('.trace__inner', { opacity: 0, y: -60, ease: 'none', scrollTrigger: { trigger: trace, start: 'bottom 90%', end: 'bottom 30%', scrub: true } });
  const traceInner = $('.trace__inner', trace);
  onFrame(() => {
    // text inverts as the milk front passes behind it
    const k = smooth(0.42, 0.62, state.themeTrace);
    const c = Math.round(236 - (236 - 8) * k);
    traceInner.style.color = `rgb(${c}, ${Math.round(231 - 223 * k)}, ${Math.round(222 - 212 * k)})`;
  });

  // ═════════════ MORPH: solid → liquid → light ═════════════
  const morph = $('.morph');
  const wordEls = $$('.morph__word', morph);
  const letters = wordEls.map((el) => {
    el.textContent = '';
    return [...el.dataset.word].map((c) => { const s = document.createElement('span'); s.textContent = c; el.appendChild(s); return s; });
  });
  const looks = [
    { wdth: 150, wght: 900 }, // SOLID — wide, heavy
    { wdth: 112, wght: 280 }, // LIQUID — loose, light
    { wdth: 150, wght: 100 }, // LIGHT — wide hairline
  ];
  const HAIR = { wdth: 50, wght: 100 };
  letters.forEach((ls, i) => gsap.set(ls, { '--wdth': i === 0 ? looks[0].wdth : HAIR.wdth, '--wght': i === 0 ? looks[0].wght : HAIR.wght }));
  gsap.set(wordEls.slice(1), { opacity: 0 });
  const mt = gsap.timeline({ scrollTrigger: { trigger: morph, start: 'top top', end: () => '+=' + H() * 2.8, pin: true, scrub: 1 } });
  mt.fromTo(morph.querySelector('.morph__stage'), { scale: 0.9 }, { scale: 1.05, duration: 5.6, ease: 'none' }, 0);
  const swap = (from, to, at) => {
    mt.to(letters[from], { '--wdth': HAIR.wdth, '--wght': HAIR.wght, duration: 0.7, stagger: { each: 0.06, from: 'center' }, ease: 'power2.in' }, at)
      .set(wordEls[from], { opacity: 0 }, at + 0.95)
      .set(wordEls[to], { opacity: 1 }, at + 0.95)
      .fromTo(letters[to], { '--wdth': HAIR.wdth, '--wght': HAIR.wght }, { '--wdth': looks[to].wdth, '--wght': looks[to].wght, duration: 0.8, stagger: { each: 0.06, from: 'center' }, ease: 'power3.out', immediateRender: false }, at + 0.95);
  };
  swap(0, 1, 0.5);
  swap(1, 2, 3.0);
  mt.to(letters[2], { color: '#ff5a1f', duration: 0.6, stagger: 0.05 }, 4.3);
  const listItems = $$('.morph__list li', morph);
  const countEl = $('.morph__count b', morph);
  let lastState = 0;
  mt.eventCallback('onUpdate', () => {
    const t = mt.time();
    const s = t < 1.45 ? 0 : t < 3.95 ? 1 : 2;
    if (s !== lastState) {
      lastState = s;
      listItems.forEach((li, i) => li.classList.toggle('is-on', i === s));
      countEl.textContent = '0' + (s + 1);
    }
  });

  // ═════════════ INDEX: look through the lines ═════════════
  const index = $('.index');
  $$('.row', index).forEach((row) => {
    gsap.from(row.children, {
      y: 50, opacity: 0, filter: 'blur(8px)', duration: 1.4, stagger: 0.06, ease: 'expo.out',
      scrollTrigger: { trigger: row, start: 'top 92%' },
    });
  });
  gsap.from('.index__head > *', { y: 60, opacity: 0, duration: 1.6, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.index__head', start: 'top 85%' } });
  const preview = planes.add(null, { scene: 3, order: 5 });
  preview.mesh.visible = false;
  const pv = { x: W() / 2, y: H() / 2, s: 0, rot: 0, vx: 0 };
  const list = $('.index__list', index);
  let pvTarget = 0;
  let currentScene = -1;
  $$('.row', index).forEach((row) => {
    row.addEventListener('pointerenter', () => {
      list.classList.add('is-hovering');
      $$('.row', index).forEach((r) => r.classList.toggle('is-active', r === row));
      const sc = +row.dataset.scene;
      pvTarget = 1;
      if (currentScene === -1 || preview.u.uAlpha.value < 0.05) {
        preview.u.uScene.value = sc; preview.u.uMix.value = 0;
      } else if (sc !== currentScene) {
        gsap.killTweensOf(preview.u.uMix);
        preview.u.uSceneB.value = sc;
        gsap.fromTo(preview.u.uMix, { value: 0 }, { value: 1, duration: 0.7, ease: 'power2.out', onComplete: () => { preview.u.uScene.value = sc; preview.u.uMix.value = 0; } });
      }
      currentScene = sc;
    });
  });
  list.addEventListener('pointerleave', () => {
    list.classList.remove('is-hovering');
    $$('.row', index).forEach((r) => r.classList.remove('is-active'));
    pvTarget = 0;
  });
  onFrame((dt) => {
    const ptr = state.pointer;
    const nx = pv.x + (ptr.x - pv.x) * 0.1;
    pv.vx = nx - pv.x;
    pv.x = nx;
    pv.y += (ptr.y - pv.y) * 0.1;
    pv.s += ((state.portal.active ? 0 : pvTarget) - pv.s) * 0.09;
    pv.rot += (Math.max(-0.35, Math.min(0.35, pv.vx * 0.012)) - pv.rot) * 0.12;
    const w = Math.min(W() * 0.24, 380), h = w * 1.28;
    preview.mesh.visible = pv.s > 0.01;
    preview.mesh.position.set(pv.x, -pv.y, 0);
    preview.mesh.scale.set(w * (0.6 + 0.4 * pv.s), h * (0.6 + 0.4 * pv.s), 1);
    preview.mesh.rotation.z = -pv.rot;
    preview.u.uSize.value.set(w, h);
    preview.u.uAlpha.value = pv.s;
    preview.u.uReveal.value = pv.s;
    preview.u.uHover.value = 0.35;
    preview.u.uMouse.value.set(0.5 + pv.vx * 0.01, 0.5);
  });

  // ═════════════ PORTAL: fly through the letter ═════════════
  const portal = $('.portal');
  const portalCore = $('[data-blob-portal]', portal);
  engine.portal.build($('.portal__word', portal), '"Mona Sans Variable", Arial, sans-serif');
  const portalStop = anchor(portalCore, 1, { amp: 0.1, glow: 1, lift: 1 });
  segment(portal, 'top bottom', 'top top', () => ({ ...portalStop(), alpha: 0 }), portalStop, (t) => t);
  const portalSeg = segs[segs.length - 1];

  const pz = { s: 1 };
  ScrollTrigger.create({
    trigger: portal, start: 'top bottom', end: () => '+=' + H() * 3.3,
    onToggle: (self) => { state.portal.active = self.isActive && pz.s < 70; },
  });
  const pt = gsap.timeline({ scrollTrigger: { trigger: portal, start: 'top top', end: () => '+=' + H() * 2.3, pin: true, scrub: 1 } });
  pt.to('.portal__meta', { opacity: 0, y: 20, duration: 0.3 }, 0)
    .fromTo(pz, { s: 1 }, { s: 90, duration: 1, ease: 'power4.in', onUpdate: () => { state.portal.scale = pz.s; state.portal.active = pz.s < 85 && portal.getBoundingClientRect().top < H(); } }, 0.05)
    .to({}, { duration: 0.15 });
  gsap.fromTo('.portal__meta', { opacity: 0 }, { opacity: 1, scrollTrigger: { trigger: portal, start: 'top 60%', end: 'top 20%', scrub: true } });
  gsap.to(state, { warm: 1, ease: 'none', scrollTrigger: { trigger: portal, start: 'top top', end: () => '+=' + H() * 1.5, scrub: true } });

  // ═════════════ FINALE ═════════════
  const finale = $('.finale');
  segment(finale, 'top bottom', 'top top', portalStop, anchor($('[data-blob-finale]', finale), 1, { amp: 0.09, glow: 1, lift: 0.9 }));
  gsap.to(state.title, { finale: 1, ease: 'none', scrollTrigger: { trigger: finale, start: 'top 70%', end: 'top top', scrub: true } });
  const finWords = splitWords($('.finale__line', finale));
  gsap.from(finWords, { yPercent: 60, opacity: 0, filter: 'blur(10px)', stagger: 0.04, ease: 'power3.out', scrollTrigger: { trigger: finale, start: 'top 45%', end: 'top 0%', scrub: true } });
  gsap.from(['.finale__head .mono', '.finale__cta', '.finale__foot'], { opacity: 0, y: 40, stagger: 0.1, ease: 'power2.out', scrollTrigger: { trigger: finale, start: 'top 40%', end: 'top 0%', scrub: true } });

  // ═════════════ HUD chapters + rail ═════════════
  const chapterName = $('.hud__name');
  const chapterNum = $('.hud__num');
  const chapters = $$('[data-chapter]');
  let lastChapter = -1;
  onFrame(() => {
    const mid = H() * 0.5;
    let idx = 0;
    chapters.forEach((sec, i) => {
      const box = sec.parentElement.classList.contains('pin-spacer') ? sec.parentElement : sec;
      const r = box.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) idx = i;
    });
    if (idx !== lastChapter) {
      lastChapter = idx;
      scramble(chapterName, chapters[idx].dataset.chapter, 650);
      chapterNum.textContent = String(idx).padStart(2, '0');
    }
  });
  const railFill = $('.rail__fill');
  const railPct = $('.rail__pct');
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      railFill.style.transform = `scaleY(${self.progress})`;
      railPct.textContent = String(Math.round(self.progress * 100)).padStart(3, '0');
    },
  });

  // generic parallax
  $$('[data-speed]').forEach((el) => {
    const sp = parseFloat(el.dataset.speed);
    if (el.closest('.manifesto')) return;
    gsap.fromTo(el, { y: () => -(1 - sp) * H() * 0.3 }, { y: () => (1 - sp) * H() * 0.3, ease: 'none', scrollTrigger: { trigger: el.closest('section'), start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
  });

  // ─────────────────────────────────────────────────────────────
  function blobAt(y) {
    let seg = segs[0];
    for (const s of segs) if (y >= s.st.start) seg = s;
    const span = Math.max(1, seg.st.end - seg.st.start);
    const t = seg.ease(clamp01((y - seg.st.start) / span));
    const a = seg.from();
    if (t <= 0) return a;
    const b = seg.to();
    if (t >= 1) return b;
    const o = {};
    for (const k in a) o[k] = lerp(a[k], b[k] ?? a[k], t);
    return o;
  }

  return {
    update(dt) {
      const y = window.scrollY;
      Object.assign(state.blob, blobAt(y));
      // once the paper sheet is down, the world behind it is dark again
      state.theme = state.portal.active || y >= portalSeg.st.start ? 0 : state.themeTrace;
      frameHooks.forEach((f) => f(dt));
    },
  };
}
