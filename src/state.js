export const state = {
  mobile: window.matchMedia('(max-width: 820px), (pointer: coarse)').matches,
  scroll: 0,
  velocity: 0,
  bend: 0,
  mouse: { x: 0, y: 0 }, // smoothed, -1..1 (y up)
  mouseTarget: { x: 0, y: 0 },
  pointer: { x: window.innerWidth / 2, y: window.innerHeight / 2 }, // raw px
  intro: 0,
  themeTrace: 0,
  theme: 0,
  warm: 0,
  blob: { x: 0, y: 0, size: 0, alpha: 0, amp: 0.16, glow: 1 },
  pulse: 0,
  overBlob: false,
  title: { reveal: 0, exit: 0, finale: 0 },
  portal: { active: false, scale: 1 },
};
