import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const STATE_STYLE = {
  ready: { a: '#3a4358', b: '#171e2e', speed: 0.35, base: 0.12, glow: 0.25 },
  connected: { a: '#10b981', b: '#0e7490', speed: 0.7, base: 0.22, glow: 0.5 },
  listening: { a: '#22d3ee', b: '#3b82f6', speed: 1.1, base: 0.3, glow: 0.9 },
  thinking: { a: '#a78bfa', b: '#e879f9', speed: 2.4, base: 0.42, glow: 0.9 },
  speaking: { a: '#f472b6', b: '#8b5cf6', speed: 1.7, base: 0.38, glow: 1.0 },
  calling: { a: '#fbbf24', b: '#f97316', speed: 0.9, base: 0.25, glow: 0.6 },
  ringing: { a: '#818cf8', b: '#22d3ee', speed: 0.9, base: 0.25, glow: 0.6 },
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;
  varying vec2 vUv;

  // simplex noise (ashima)
  vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main(){
    vUv = uv;
    float t = uTime * uSpeed;
    float n1 = snoise(position * 1.35 + vec3(t * 0.45, t * 0.3, t * 0.22));
    float n2 = snoise(position * 2.6 - vec3(t * 0.3)) * 0.35;
    float disp = (n1 + n2) * (0.22 + uIntensity * 0.85);
    vDisp = disp;
    vec3 p = position + normal * disp;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uGlow;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;
  varying vec2 vUv;

  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vView);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);

    float bands = sin(vDisp * 9.0 + uTime * 1.6) * 0.5 + 0.5;
    float sweep = sin(vUv.x * 6.2831 + uTime * 0.7 + vDisp * 4.0) * 0.5 + 0.5;

    vec3 deep = uColorB * 0.28;
    vec3 mid = mix(uColorB, uColorA, clamp(sweep * 0.65 + bands * 0.35 + vDisp * 1.4, 0.0, 1.0));
    vec3 rim = mix(mid, uColorA * 1.6 + vec3(0.12, 0.06, 0.18), fres);

    vec3 col = mix(deep, rim, clamp(0.35 + fres * 1.1 + uIntensity * 0.35, 0.0, 1.0));

    // specular streak
    vec3 L = normalize(vec3(0.6, 0.8, 0.9));
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 42.0) * (0.35 + uIntensity);
    col += spec * vec3(0.9, 0.95, 1.0);

    // top light bloom
    float top = smoothstep(0.1, 1.0, N.y * 0.5 + 0.5) * 0.25;
    col += top * uColorA;

    gl_FragColor = vec4(col * uGlow + col * 0.55, 1.0);
  }
`;

function FluidBall({ state, levelRef }) {
  const matRef = useRef();
  const meshRef = useRef();
  const smooth = useRef(0);
  const style = STATE_STYLE[state] || STATE_STYLE.ready;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: style.base },
      uSpeed: { value: style.speed },
      uColorA: { value: new THREE.Color(style.a) },
      uColorB: { value: new THREE.Color(style.b) },
      uGlow: { value: style.glow },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((_, delta) => {
    const t = uniforms.uTime.value + Math.min(delta, 0.05);
    uniforms.uTime.value = t;
    const target = Math.max(0, Math.min(1, levelRef?.current ?? 0));
    // idle breathing when no voice
    const idle = (Math.sin(t * 1.4) * 0.5 + 0.5) * 0.08;
    smooth.current += (target - smooth.current) * 0.12;
    const active = state === 'ready' ? 0.08 + idle : style.base + smooth.current * 0.9 + idle;
    uniforms.uIntensity.value = active;

    // ease color + speed toward state
    const ca = new THREE.Color(style.a);
    const cb = new THREE.Color(style.b);
    uniforms.uColorA.value.lerp(ca, 0.06);
    uniforms.uColorB.value.lerp(cb, 0.06);
    uniforms.uSpeed.value += (style.speed - uniforms.uSpeed.value) * 0.05;
    uniforms.uGlow.value += (style.glow - uniforms.uGlow.value) * 0.05;

    if (meshRef.current) {
      meshRef.current.rotation.y += delta * (0.12 + smooth.current * 0.9 + style.speed * 0.08);
      meshRef.current.rotation.x = Math.sin(t * 0.24) * 0.18;
      const s = 1 + smooth.current * 0.16 + Math.sin(t * 2.1) * 0.012;
      meshRef.current.scale.setScalar(s);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.35, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

function AuraParticles({ state, levelRef }) {
  const ref = useRef();
  const count = 650;
  const { positions, seeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2.1 + Math.random() * 1.6;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
      positions[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      positions[i * 3 + 2] = r * Math.cos(ph);
      seeds[i] = Math.random() * 100;
    }
    return { positions, seeds };
  }, []);

  const style = STATE_STYLE[state] || STATE_STYLE.ready;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const lvl = levelRef?.current ?? 0;
    if (ref.current) {
      ref.current.rotation.y = t * (0.05 + lvl * 0.35 + style.speed * 0.02);
      ref.current.rotation.z = Math.sin(t * 0.18) * 0.2;
      const s = 1 + lvl * 0.22;
      ref.current.scale.setScalar(s);
      ref.current.material.opacity = state === 'ready' ? 0.32 : 0.55 + lvl * 0.4;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.028}
        color={style.a}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function OrbitRings({ state }) {
  const r1 = useRef();
  const r2 = useRef();
  const style = STATE_STYLE[state] || STATE_STYLE.ready;
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (r1.current) {
      r1.current.rotation.x = Math.PI / 2.25 + Math.sin(t * 0.3) * 0.12;
      r1.current.rotation.y += delta * (0.25 + style.speed * 0.12);
    }
    if (r2.current) {
      r2.current.rotation.x = Math.PI / 1.75 + Math.cos(t * 0.24) * 0.12;
      r2.current.rotation.y -= delta * (0.18 + style.speed * 0.1);
    }
  });
  return (
    <group>
      <mesh ref={r1}>
        <torusGeometry args={[2.05, 0.006, 12, 180]} />
        <meshBasicMaterial color={style.a} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={r2}>
        <torusGeometry args={[2.45, 0.005, 12, 180]} />
        <meshBasicMaterial color={style.b} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function VoiceOrb3D({ state = 'ready', levelRef, className = '' }) {
  const s = (state || 'ready').toLowerCase();
  return (
    <div className={`relative ${className}`}>
      {/* halo behind canvas */}
      <div
        aria-hidden
        className="absolute inset-[8%] rounded-full blur-3xl transition-colors duration-700"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${(STATE_STYLE[s] || STATE_STYLE.ready).a}55 0%, transparent 62%)`,
          opacity: s === 'ready' ? 0.5 : 0.9,
        }}
      />
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4.4], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <AuraParticles state={s} levelRef={levelRef} />
        <FluidBall state={s} levelRef={levelRef} />
        <OrbitRings state={s} />
      </Canvas>
    </div>
  );
}
