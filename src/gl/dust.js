import * as THREE from 'three';

// Suspended dust. Three depth bands that scroll at different rates give the
// whole page a sense of physical volume; near motes are blurred into bokeh.
export function createDust(count, { zMin, zMax, size = 1, near = false }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 9;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * 6;
    pos[i * 3 + 2] = zMin + Math.random() * (zMax - zMin);
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uSize: { value: size },
      uDpr: { value: 1 },
      uTheme: { value: 0 },
      uAlpha: { value: 1 },
      uNear: { value: near ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uScroll, uSize, uDpr, uNear;
      uniform vec2 uMouse;
      varying float vSeed;
      varying float vDepth;
      void main(){
        vec3 p = position;
        float depth = clamp((p.z + 8.0) / 12.0, 0.0, 1.0);   // 0 far → 1 near
        // drift
        p.x += sin(uTime * 0.07 + aSeed * 40.0) * 0.35;
        p.y += cos(uTime * 0.05 + aSeed * 23.0) * 0.25 + uTime * 0.03 * (aSeed - 0.3);
        // scroll parallax: near layers travel faster
        p.y += uScroll * (0.0012 + depth * 0.0042);
        p.y = mod(p.y + 6.0, 12.0) - 6.0;
        // cursor parallax
        p.xy += uMouse * (0.15 + depth * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = uSize * (0.6 + aSeed * 1.4) * uDpr;
        gl_PointSize = s * (16.0 / -mv.z) * (1.0 + uNear * 5.0);
        vSeed = aSeed;
        vDepth = depth;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uTheme, uAlpha, uNear;
      varying float vSeed;
      varying float vDepth;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float soft = mix(0.5, 0.18, uNear);
        float a = smoothstep(0.5, 0.5 - soft, d);
        float tw = 0.55 + 0.45 * sin(uTime * (0.4 + vSeed) + vSeed * 50.0);
        vec3 lightDust = vec3(0.95, 0.92, 0.86);
        vec3 darkDust = vec3(0.12, 0.11, 0.1);
        vec3 col = mix(lightDust, darkDust, uTheme);
        float alpha = a * tw * mix(0.55, 0.22, uTheme) * mix(0.35, 1.0, vDepth) * uAlpha;
        if (uNear > 0.5) alpha *= mix(0.1, 0.04, uTheme);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, material };
}
