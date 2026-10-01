import gsap from 'gsap';

export function initCursor(state) {
  const el = document.querySelector('.cursor');
  if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const dot = el.querySelector('.cursor__dot');
  const ring = el.querySelector('.cursor__ring');
  const label = el.querySelector('.cursor__label');
  const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3.out' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3.out' });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.55, ease: 'power3.out' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.55, ease: 'power3.out' });

  window.addEventListener('pointermove', (e) => {
    el.classList.add('is-live');
    dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
  });
  document.addEventListener('pointerleave', () => el.classList.add('is-hidden'));
  document.addEventListener('pointerenter', () => el.classList.remove('is-hidden'));

  // the drop is WebGL, so we watch a body class instead of DOM hover
  new MutationObserver(() => {
    if (document.body.classList.contains('over-blob')) { label.textContent = 'Touch'; el.classList.add('is-label'); }
    else if (label.textContent === 'Touch') el.classList.remove('is-label');
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor], a, button, .row');
    el.classList.remove('is-label', 'is-link');
    if (!t) return;
    const text = t.getAttribute('data-cursor') || (t.classList.contains('row') ? 'Look' : '');
    if (text) { label.textContent = text; el.classList.add('is-label'); }
    else el.classList.add('is-link');
  });
}
