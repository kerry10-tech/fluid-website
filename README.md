# FLUID — Matter in Motion

A cinematic, scroll-driven visual concept: an "atlas of liquid light".
Every image on the page is computed live in WebGL. There are no photographs and no video.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

Best experienced on a desktop browser with a mouse and a reasonably modern GPU.

## The journey

A glass drop is the protagonist. It travels through the page as one continuous object.

| # | Chapter | What happens |
|---|---|---|
| 00 | **Overture** | The drop condenses in front of a giant `FLUID` wordmark that lives *inside* the WebGL scene, so the drop really refracts it (with spectral dispersion). The letters stand on a rippling liquid floor. The cursor tilts the drop, moves the studio lights in its reflections and parallaxes each glyph on its own depth. Click the drop and it shudders. |
| ↓ | | On scroll the glyphs fly apart past the camera like a title sequence, while the drop drifts down into… |
| 01 | **Manifesto** | …a gap in the sentence ("Matter, ● in motion."). Words are read in by the scroll, blur to sharp, one line at a time. The inline "pills" are tiny live shaders. |
| 02 | **Studies** | The drop moves to the centre. "Step / inside" splits apart and the camera dives into it: the drop becomes a circular lens onto a caustic world, which opens full-bleed. That full-bleed image then shrinks (FLIP) into the first card of a horizontal gallery of five material studies (Caustic, Chrome, Vapor, Reed, Eclipse). Hover a study to ripple it, and scroll speed bends the frames. |
| 03 | **Trace** | Stillness. Ink dissolves into milk through a liquid, noise-driven wipe. |
| 04 | **States** | `SOLID → LIQUID → LIGHT`. Each word collapses its variable-font axes to hairlines, swaps, and re-expands. |
| 05 | **Index** | A list of experiments. A live shader preview follows the cursor, tilts with its velocity and crossfades between worlds. |
| 06 | **Immerse** | A sheet of paper with `IMMERSE` cut out of it (an SDF, so it stays razor sharp). The scroll flies you through the stem of the **I** into the dark world behind. |
| 07 | **Coda** | The drop returns and rests on the wordmark, refracting it once more. |

## How it's built

- **Three.js** renders one fixed full-screen canvas behind the DOM:
  - an atmosphere shader (fog, a lamp that follows the cursor, the caustic focus the drop throws, the ink → milk wipe)
  - title glyphs + far dust, rendered to a target that the drop's shader refracts
  - the drop (a displaced icosphere with procedural studio reflections, thin-film iridescence and 9-tap dispersion)
  - **DOM-synced planes**: CSS lays out invisible placeholders and WebGL draws the "photographs" on top of their rects
  - the portal sheet (signed-distance-field cut-out)
- **GSAP + ScrollTrigger** handle the pinned, scrubbed choreography. **Lenis** provides the smooth scroll.
- The drop's path is a chain of scroll segments between *stops*. A stop can be anchored to a DOM element, so the drop can land inside a sentence and stay glued to it.
- Type: Mona Sans (variable width), Anybody (for the morph), Instrument Serif, JetBrains Mono.

On small screens the effects simplify: lighter geometry, fewer particles and no custom cursor. Resolution drops automatically if the GPU struggles.
