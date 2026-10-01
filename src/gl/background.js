import * as THREE from 'three';
import { noise2, palette } from './glsl.js';

// Full-screen atmosphere: ink fog, a lamp that follows the cursor, a caustic
// focus thrown by the glass drop, and the liquid ink → bone "milk" wipe.
export function createBackground() {
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uTheme: { value: 0 },
      uBlob: { value: new THREE.Vector4(0, 0, 0, 0) },
      uScroll: { value: 0 },
      uWarm: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uTheme, uScroll, uWarm;
      uniform vec2 uRes, uMouse;
      uniform vec4 uBlob;
      varying vec2 vUv;
      ${noise2}
      ${palette}

      void main(){
        vec2 uv = vUv;
        vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
        vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        float t = uTime;
        float sc = uScroll * 0.00012;

        // ── INK ──────────────────────────────────────────
        float fog = fbm(p * 1.25 + vec2(t * 0.018, -t * 0.012 - sc));
        float fog2 = fbm(p * 2.7 - vec2(t * 0.01, sc * 1.6) + fog);
        vec3 col = INK;

        // overhead lamp, drifting toward the cursor
        vec2 lp = vec2(-0.15, 0.62) + m * 0.32;
        float lamp = exp(-1.9 * length((p - lp) * vec2(0.8, 1.15)));
        col += vec3(0.115, 0.108, 0.1) * lamp * (0.55 + 0.9 * fog);

        // ember bloom bottom-right, steel bloom left
        vec2 ep = vec2(0.78, -0.48) - m * 0.08;
        col += EMBER * 0.11 * exp(-2.6 * length(p - ep)) * (0.4 + fog2) * (1.0 + uWarm);
        col += STEEL * 0.055 * exp(-2.4 * length(p - vec2(-0.85, -0.25))) * (0.5 + fog);

        // light shafts falling from the lamp
        float shaft = smoothstep(0.0, 1.0, 1.0 - abs((p.x - lp.x) * 1.4 + (p.y - lp.y) * 0.35));
        shaft *= smoothstep(-1.0, 0.6, p.y) * (0.5 + 0.5 * fog2);
        col += vec3(0.05, 0.048, 0.045) * shaft * shaft;

        // caustic focus thrown by the drop (light from top-left → spot bottom-right)
        if (uBlob.w > 0.001) {
          vec2 bp = (vec2(uBlob.x, uRes.y - uBlob.y) - 0.5 * uRes) / uRes.y;
          float br = max(uBlob.z / uRes.y, 0.001);
          vec2 d = (p - bp - vec2(0.38, -0.86) * br) / br;
          float spot = exp(-dot(d * vec2(1.0, 1.6), d * vec2(1.0, 1.6)) * 3.2);
          float ring = exp(-pow((length(d * vec2(1.0, 1.6)) - 0.48) * 9.0, 2.0));
          col += mix(EMBER, BONE, 0.45) * (spot * 0.16 + ring * 0.05) * uBlob.w;
          // soft contact shadow
          vec2 s = (p - bp - vec2(0.05, -0.95) * br) / br;
          col *= 1.0 - 0.35 * exp(-dot(s * vec2(0.8, 3.0), s * vec2(0.8, 3.0))) * uBlob.w;
        }

        // vignette
        col *= 1.0 - 0.6 * pow(length((uv - 0.5) * vec2(1.05, 1.2)), 2.3);
        col = max(col, INK * 0.6);

        // ── BONE + liquid wipe ─────────────────────────────
        if (uTheme > 0.0) {
          vec3 bone = boneSurface(p, t);
          vec2 w = vec2(fbm3(p * 1.5 + vec2(t * 0.05, 0.0)), fbm3(p * 1.5 + vec2(3.3, -t * 0.04)));
          float n = fbm3(p * 1.1 + w * 1.8 + vec2(0.0, t * 0.03));
          float k = uv.y * 0.9 + n * 0.62;                // rises from the bottom
          float edge = uTheme * 1.62 - 0.08;
          float d = k - edge;                              // >0 still ink
          float mask = smoothstep(0.008, -0.008, d);
          // light scattering out of the milk into the ink, warm at the very lip
          col += BONE * 0.10 * exp(-max(d, 0.0) * 22.0) * step(0.0, d);
          col += EMBER * 0.18 * exp(-pow(d * 120.0, 2.0));
          col = mix(col, bone, mask);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, material };
}
