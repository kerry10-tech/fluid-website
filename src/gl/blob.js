import * as THREE from 'three';
import { simplex3 } from './glsl.js';

// The protagonist: a drop of liquid glass. It refracts whatever was rendered
// behind it (with spectral dispersion), mirrors a procedural studio, and wears
// a thin oil-slick film at grazing angles.
export function createBlob(detail = 96) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: 0.12 },
      uFreq: { value: 0.95 },
      uVel: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uBg: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 1 },
      uWarm: { value: 0 },
      uLight: { value: new THREE.Vector2() },
      uLift: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uAmp, uFreq, uVel;
      uniform vec2 uMouse;
      varying vec3 vNormalV;
      varying vec3 vPosV;
      varying float vField;
      ${simplex3}

      float field(vec3 n){
        float t = uTime;
        vec3 q = n * uFreq;
        float f = snoise(q + vec3(0.0, t * 0.16, t * 0.08)) * 0.72;
        f += snoise(q * 1.9 + vec3(t * 0.12, 0.0, -t * 0.1)) * 0.2;
        f += snoise(q * 3.6 - vec3(0.0, t * 0.25, 0.0)) * 0.035 * (1.0 + uVel * 6.0);
        // cursor pressure: the drop leans and bulges toward the pointer
        f += dot(n.xy, uMouse) * 0.35;
        return f;
      }
      vec3 displace(vec3 n){ return n * (1.0 + field(n) * (uAmp + uVel * 0.12)); }

      void main(){
        vec3 n = normalize(position);
        vec3 tng = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 btg = cross(n, tng);
        float e = 0.012;
        vec3 p0 = displace(n);
        vec3 p1 = displace(normalize(n + tng * e));
        vec3 p2 = displace(normalize(n + btg * e));
        vec3 nn = normalize(cross(p1 - p0, p2 - p0));
        vField = field(n);
        vec4 mv = modelViewMatrix * vec4(p0, 1.0);
        vPosV = mv.xyz;
        vNormalV = normalize(normalMatrix * nn);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uBg;
      uniform vec2 uRes, uLight;
      uniform float uOpacity, uTime, uWarm, uLift;
      varying vec3 vNormalV;
      varying vec3 vPosV;
      varying float vField;

      // A procedural photo studio: dark cyclorama, a big overhead softbox,
      // two tall strip lights and a warm kicker. Rotated by the cursor.
      vec3 studio(vec3 r){
        float c = cos(uLight.x * 0.9), s = sin(uLight.x * 0.9);
        r.xz = mat2(c, -s, s, c) * r.xz;
        float c2 = cos(uLight.y * 0.5), s2 = sin(uLight.y * 0.5);
        r.yz = mat2(c2, -s2, s2, c2) * r.yz;
        vec3 col = vec3(0.012, 0.012, 0.016) + vec3(0.03) * smoothstep(-0.6, 0.6, r.y);
        // overhead softbox
        col += vec3(1.0, 0.98, 0.95) * smoothstep(0.62, 0.86, r.y) * 1.25;
        float a = atan(r.x, r.z);
        // strip lights
        float strip1 = smoothstep(0.075, 0.02, abs(a - 1.05)) * smoothstep(0.85, 0.2, abs(r.y - 0.05));
        float strip2 = smoothstep(0.05, 0.012, abs(a + 1.9)) * smoothstep(0.8, 0.1, abs(r.y + 0.05));
        col += vec3(1.0) * strip1 * 2.0 + vec3(0.85, 0.9, 1.0) * strip2 * 1.4;
        // warm kicker
        col += vec3(1.0, 0.36, 0.12) * smoothstep(0.55, 0.0, length(vec2(a - 2.6, r.y + 0.35))) * (1.1 + uWarm * 1.4);
        // floor bounce
        col += vec3(0.05, 0.045, 0.04) * smoothstep(-0.2, -0.9, r.y);
        return col;
      }

      vec3 film(float x){
        // thin-film interference, tuned soft (no neon)
        return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + x));
      }

      void main(){
        vec3 N = normalize(vNormalV);
        vec3 V = normalize(-vPosV);
        float NdV = clamp(dot(N, V), 0.0, 1.0);
        float fres = pow(1.0 - NdV, 3.0);
        vec2 suv = gl_FragCoord.xy / uRes;

        // spectral refraction — 9 taps spread across the visible spectrum
        vec2 dir = -N.xy;
        float bend = 0.06 + 0.07 * pow(1.0 - NdV, 1.5);
        vec3 refr = vec3(0.0);
        vec3 wsum = vec3(0.0);
        for (int i = 0; i < 9; i++){
          float s = float(i) / 8.0;
          vec3 w = clamp(vec3(1.0 - abs(s - 0.0) * 2.4, 1.0 - abs(s - 0.5) * 2.4, 1.0 - abs(s - 1.0) * 2.4), 0.0, 1.0);
          vec2 off = dir * (bend + s * 0.016 * (0.4 + fres * 2.0));
          refr += texture2D(uBg, suv + off).rgb * w;
          wsum += w;
        }
        refr /= wsum;
        // magnify + slightly brighten what we see through the glass
        refr = refr * vec3(0.9, 0.94, 0.98) + 0.01;

        vec3 R = reflect(-V, N);
        vec3 refl = studio(R);

        vec3 irid = film(fres * 1.4 + vField * 0.6 + uTime * 0.02);
        vec3 col = refr * (1.0 - fres * 0.55);
        col += refl * (0.1 + fres * 1.0) * (1.0 + uLift * 0.8);
        // light gathered at the bottom of the drop (a glass sphere is a lens)
        vec3 glowCol = mix(vec3(1.0, 0.93, 0.85), vec3(1.0, 0.5, 0.22), 0.35 + 0.55 * uWarm);
        col += glowCol * pow(clamp(-N.y * 0.9 + 0.1, 0.0, 1.0), 2.4) * pow(NdV, 0.6) * (0.12 + 0.22 * uLift);
        col += irid * fres * 0.12 * (1.0 - fres * 0.5);

        // specular glints from the softbox
        vec3 H = normalize(normalize(vec3(-0.35 + uLight.x * 0.4, 0.8, 0.6)) + V);
        float spec = pow(max(dot(N, H), 0.0), 220.0);
        col += vec3(1.0) * spec * 1.6;

        // inner shadow core for weight
        col *= 0.92 + 0.08 * smoothstep(0.0, 0.6, NdV);

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}
