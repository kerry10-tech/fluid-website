import gsap from 'gsap';

// Elements lean toward the pointer, their contents lean a little further.
export function initMagnetic() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.magnetic').forEach((el) => {
    const inner = el.firstElementChild && el.children.length === 1 ? el.firstElementChild : null;
    const strength = el.classList.contains('finale__cta') ? 0.45 : 0.32;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'expo.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.9, ease: 'expo.out' });
    const ixTo = inner ? gsap.quickTo(inner, 'x', { duration: 0.9, ease: 'expo.out' }) : null;
    const iyTo = inner ? gsap.quickTo(inner, 'y', { duration: 0.9, ease: 'expo.out' }) : null;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2);
      const my = e.clientY - (r.top + r.height / 2);
      xTo(mx * strength); yTo(my * strength);
      if (ixTo) { ixTo(mx * strength * 0.5); iyTo(my * strength * 0.5); }
    });
    el.addEventListener('pointerleave', () => {
      xTo(0); yTo(0);
      if (ixTo) { ixTo(0); iyTo(0); }
    });
  });
}
