import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { sceneState } from './sceneState.ts';

const planeVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const planeFrag = /* glsl */ `
precision highp float;
uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uVel; uniform float uScroll; uniform float uBoost;
uniform vec3 uPaper; uniform vec3 uCobalt; uniform vec3 uTeal; uniform vec3 uPersimmon;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.02+vec2(3.1,1.7); a*=.5; } return v; }
void main(){
  float asp = uRes.x/uRes.y;
  vec2 p = (vUv-.5)*vec2(asp,1.);
  vec2 m = (uMouse-.5)*vec2(asp,1.);
  float d = length(p-m);
  float ripple = (1.0 - smoothstep(0.,.5,d)) * (.22 + uVel*1.6 + uBoost*.6);
  vec2 q = p*1.35 + vec2(0., uScroll*2.2);
  float t = uTime*.055;
  vec2 w  = vec2(fbm(q+t), fbm(q+vec2(5.2,1.3)-t));
  vec2 w2 = vec2(fbm(q+3.*w+vec2(1.7,9.2)+t*1.5), fbm(q+3.*w+vec2(8.3,2.8)-t*1.2));
  float f = fbm(q + 3.4*w2 + (p-m)*ripple*2.2);

  vec3 hi = mix(uCobalt, uTeal, smoothstep(.18,.42,uScroll));
  hi = mix(hi, uPersimmon, smoothstep(.72,.95,uScroll));

  float glow = smoothstep(.38,.98,f);
  vec3 col = mix(uPaper, hi, min(.16, glow*glow*.13 + ripple*.06));
  float c = abs(fract(f*11.)-.5);
  col = mix(col, hi, (1.0 - smoothstep(.0,.035,c)) * .045 * glow);
  col = mix(col, uPaper, smoothstep(.15,1.35,length(p))*.22);
  gl_FragColor = vec4(col,1.);
}
`;

const ptsVert = /* glsl */ `
attribute vec3 aRing; attribute float aSeed;
uniform float uTime; uniform float uMorph; uniform float uScroll; uniform vec2 uMouse; uniform float uPx; uniform float uBoost;
varying float vA;
mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
void main(){
  vec3 shell = position;
  vec3 p = mix(shell, aRing, uMorph);
  p.xz *= rot(uTime*.05 + uScroll*3.0);
  p.xy *= rot((uMouse.x-.5)*.35);
  p.yz *= rot((uMouse.y-.5)*.35 + .35*uMorph);
  p *= 1.0 + uBoost*.12;
  p.y += sin(uTime*.4 + aSeed*20.)*.05;
  vec4 mv = modelViewMatrix * vec4(p,1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.2 + aSeed*2.6) * uPx * (4.2 / -mv.z);
  vA = .25 + .75*aSeed;
}
`;
const ptsFrag = /* glsl */ `
precision highp float; varying float vA; uniform vec3 uColor;
void main(){ float d = length(gl_PointCoord-.5); float a = 1.0 - smoothstep(.0,.5,d); gl_FragColor = vec4(uColor, a*vA*.9); }
`;

const readTokenRgb = (name: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`Expected ${name} to be a six-digit hex color, received "${value}"`);
  const hex = Number.parseInt(match[1], 16);
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
};

/** Fixed, full-viewport WebGL backdrop: domain-warped fluid shader + scroll-morphing particle field. */
export const ShaderBackdrop: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch {
      return; // CSS gradient fallback behind the canvas remains
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.autoClear = false;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';

    // Pass 1 — fluid plane
    const bgScene = new THREE.Scene();
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const planeMat = new THREE.ShaderMaterial({
      vertexShader: planeVert,
      fragmentShader: planeFrag,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uVel: { value: 0 },
        uScroll: { value: 0 },
        uBoost: { value: 0 },
        uPaper: { value: readTokenRgb('--color-porcelain') },
        uCobalt: { value: readTokenRgb('--color-cobalt') },
        uTeal: { value: readTokenRgb('--color-teal') },
        uPersimmon: { value: readTokenRgb('--color-persimmon') },
      },
      depthTest: false,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), planeMat);
    plane.frustumCulled = false;
    bgScene.add(plane);

    // Pass 2 — data particles (shell → spiral ring as you scroll)
    const N = coarse ? 900 : 1800;
    const shell = new Float32Array(N * 3);
    const ring = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const r = 2.2 + Math.random() * 1.8;
      shell.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
      const rr = 1.0 + Math.pow(Math.random(), 0.7) * 3.2;
      const a = rr * 1.4 + Math.random() * 0.5;
      ring.set([rr * Math.cos(a), (Math.random() - 0.5) * 0.25, rr * Math.sin(a)], i * 3);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(shell, 3));
    geo.setAttribute('aRing', new THREE.BufferAttribute(ring, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const ptsMat = new THREE.ShaderMaterial({
      vertexShader: ptsVert,
      fragmentShader: ptsFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMorph: { value: 0 },
        uScroll: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uPx: { value: dpr * 1.7 },
        uBoost: { value: 0 },
        uColor: { value: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--color-cobalt-soft').trim()) },
      },
    });
    const points = new THREE.Points(geo, ptsMat);
    points.frustumCulled = false;
    const ptsScene = new THREE.Scene();
    ptsScene.add(points);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
    cam.position.z = 6;

    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      planeMat.uniforms.uRes.value.set(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const sm = { x: 0.5, y: 0.5, vel: 0, morph: 0, boost: 0 };
    const t0 = performance.now();
    let raf = 0;
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    const frame = () => {
      if (!reduce) raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const t = reduce ? 0 : (performance.now() - t0) / 1000;
      sm.x += (sceneState.mouseX - sm.x) * 0.06;
      sm.y += (sceneState.mouseY - sm.y) * 0.06;
      sm.vel += (Math.min(1, Math.abs(sceneState.vel)) - sm.vel) * 0.08;
      sm.boost += (sceneState.boost - sm.boost) * 0.08;
      const s = sceneState.scroll;
      const morphTarget = smooth(0.08, 0.28, s) - smooth(0.62, 0.82, s);
      sm.morph += (morphTarget - sm.morph) * 0.05;

      const u = planeMat.uniforms;
      u.uTime.value = t;
      u.uMouse.value.set(sm.x, sm.y);
      u.uVel.value = sm.vel;
      u.uScroll.value = s;
      u.uBoost.value = sm.boost;
      const pu = ptsMat.uniforms;
      pu.uTime.value = t;
      pu.uMouse.value.set(sm.x, sm.y);
      pu.uScroll.value = s;
      pu.uMorph.value = sm.morph;
      pu.uBoost.value = sm.boost;

      renderer.clear();
      renderer.render(bgScene, bgCam);
      renderer.clearDepth();
      renderer.render(ptsScene, cam);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      geo.dispose();
      ptsMat.dispose();
      planeMat.dispose();
      plane.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ background: 'radial-gradient(120% 90% at 30% 10%, var(--color-paper) 0%, var(--color-porcelain) 60%)' }}
    />
  );
};
