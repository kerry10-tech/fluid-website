// Wrap every word of an element's text nodes in <span class="w">, leaving
// inline elements we care about (pills, slots) untouched.
export function splitWords(root) {
  const out = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const parts = child.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        parts.forEach((p) => {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
          const s = document.createElement('span');
          s.className = 'w';
          s.textContent = p;
          frag.appendChild(s);
          out.push(s);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1 && !child.matches('.pill, .slot')) {
        walk(child);
      } else if (child.nodeType === 1) {
        out.push(child);
      }
    });
  };
  walk(root);
  return out;
}

export function splitChars(el) {
  const text = el.textContent;
  el.textContent = '';
  return [...text].map((c) => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = c === ' ' ? ' ' : c;
    el.appendChild(s);
    return s;
  });
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
export function scramble(el, to, duration = 600) {
  const from = el.textContent;
  const len = Math.max(from.length, to.length);
  const start = performance.now();
  cancelAnimationFrame(el._scr);
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    let s = '';
    for (let i = 0; i < len; i++) {
      const settle = i / len;
      if (p > settle * 0.7 + 0.3) s += to[i] || '';
      else if (p > settle * 0.5) s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else s += from[i] || '';
    }
    el.textContent = s;
    if (p < 1) el._scr = requestAnimationFrame(tick);
    else el.textContent = to;
  };
  el._scr = requestAnimationFrame(tick);
}
