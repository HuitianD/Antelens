'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, MeshTransmissionMaterial } from '@react-three/drei';
import { Color, LatheGeometry, MathUtils, Vector2, type Group } from 'three';

/*
 * Decorative brand accent. Geometry is built procedurally and the studio reflections come from
 * local light panels rendered into an environment map, so nothing is fetched at runtime.
 */

const RIM_INNER = 0.8, RIM_OUTER = 1, RIM_DEPTH = 0.3, LENS_RADIUS = 0.81;
/** What the lens refracts: the sidebar's own color, so the glass never samples the transparent canvas as black. */
const LENS_BACKDROP = new Color('#e6e9ee');
const SWAY = MathUtils.degToRad(25), SWAY_PERIOD = 14, TILT = MathUtils.degToRad(7);
/** Processing turn: one revolution about every 4 s, eased in, and a critically damped settle back to rest. */
const TURN = Math.PI * 2, SPIN_SPEED = TURN / 4, SPIN_EASE = 1.5, SETTLE_STIFFNESS = 4, SETTLE_DAMPING = 4;

/** A rounded-rectangle cross-section traced counter-clockwise, so lathe normals face outward. */
function roundedProfile(inner: number, outer: number, depth: number, corner: number, steps = 8) {
  const corners: [number, number, number][] = [
    [outer - corner, -depth / 2 + corner, -90],
    [outer - corner, depth / 2 - corner, 0],
    [inner + corner, depth / 2 - corner, 90],
    [inner + corner, -depth / 2 + corner, 180],
  ];
  const points = corners.flatMap(([cx, cy, start]) => Array.from({ length: steps + 1 }, (_, i) => {
    const a = MathUtils.degToRad(start + (90 * i) / steps);
    return new Vector2(cx + Math.cos(a) * corner, cy + Math.sin(a) * corner);
  }));
  return [...points, points[0].clone()];
}

/** A thin bi-convex lens: thicker at the centre, tapering to the rim. */
function lensProfile(radius: number, centre: number, edge: number, steps = 18) {
  const bottom = Array.from({ length: steps + 1 }, (_, i) => { const r = (radius * i) / steps; return new Vector2(r, -(edge + (centre - edge) * (1 - (r / radius) ** 2))); });
  return [...bottom, ...bottom.slice().reverse().map(p => new Vector2(p.x, -p.y))];
}

/** A short grip with a softly swelling waist and a rounded end, along +Y. */
function gripProfile(start: number, length: number, radius: number, steps = 22) {
  const side = Array.from({ length: steps + 1 }, (_, i) => { const u = i / steps; return new Vector2(radius * (0.9 + 0.12 * Math.sin(Math.PI * u)), start + length * u); });
  const end = side[side.length - 1];
  const cap = Array.from({ length: 9 }, (_, i) => { const a = (Math.PI / 2) * ((i + 1) / 9); return new Vector2(end.x * Math.cos(a), end.y + end.x * 0.7 * Math.sin(a)); });
  return [new Vector2(0, start), ...side, ...cap];
}

function Glass({ animate, spinning }: { animate: boolean; spinning: boolean }) {
  const group = useRef<Group>(null), pointer = useRef({ x: 0, y: 0 }), tilt = useRef({ x: 0, y: 0 }), clock = useRef(0);
  // Spin state lives in refs and is advanced only inside the frame loop.
  const spinGroup = useRef<Group>(null), spin = useRef<{ angle: number; velocity: number; settleTo: number | null }>({ angle: 0, velocity: 0, settleTo: null });
  const { gl, invalidate } = useThree();
  const rim = useMemo(() => new LatheGeometry(roundedProfile(RIM_INNER, RIM_OUTER, RIM_DEPTH, 0.085), 128), []);
  const lens = useMemo(() => new LatheGeometry(lensProfile(LENS_RADIUS, 0.05, 0.018), 96), []);
  const grip = useMemo(() => new LatheGeometry(gripProfile(0.4, 0.94, 0.15), 64), []);
  useEffect(() => () => { rim.dispose(); lens.dispose(); grip.dispose(); }, [rim, lens, grip]);
  // The pointer gives a slight tilt toward the cursor; the canvas itself never receives events.
  useEffect(() => {
    if (!animate) return;
    const move = (event: PointerEvent) => {
      const box = gl.domElement.getBoundingClientRect();
      pointer.current.x = MathUtils.clamp((event.clientX - (box.left + box.width / 2)) / 420, -1, 1);
      pointer.current.y = MathUtils.clamp((event.clientY - (box.top + box.height / 2)) / 420, -1, 1);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [animate, gl]);
  useEffect(() => { invalidate(); }, [animate, invalidate]);
  useFrame((_, delta) => {
    const g = group.current, outer = spinGroup.current, s = spin.current;
    if (!g || !outer) return;
    if (!animate) { s.angle = 0; s.velocity = 0; s.settleTo = null; outer.rotation.y = 0; g.rotation.set(0.1, -0.32, 0); return; }
    const dt = Math.min(delta, 0.1);
    if (spinning) {
      // Accelerate toward a steady turn; the angle is kept within one revolution, which is visually seamless.
      s.settleTo = null;
      s.velocity += (SPIN_SPEED - s.velocity) * (1 - Math.exp(-SPIN_EASE * dt));
      s.angle = (s.angle + s.velocity * dt) % TURN;
    } else if (s.velocity !== 0 || s.angle !== 0) {
      // Finish forward to the next full turn, never less than a quarter turn away, so the settle neither reverses nor overshoots.
      if (s.settleTo === null) s.settleTo = TURN - s.angle >= Math.PI / 2 ? TURN : TURN * 2;
      s.velocity += (SETTLE_STIFFNESS * (s.settleTo - s.angle) - SETTLE_DAMPING * s.velocity) * dt;
      s.angle += s.velocity * dt;
      if (Math.abs(s.settleTo - s.angle) < 1e-3 && Math.abs(s.velocity) < 1e-3) { s.angle = 0; s.velocity = 0; s.settleTo = null; }
    }
    outer.rotation.y = s.angle;
    // Idle sway and pointer tilt fade out while turning and return as the turn settles, so they never fight the spin.
    const idle = 1 - Math.min(1, Math.abs(s.velocity) / SPIN_SPEED);
    clock.current += dt;
    const ease = 1 - Math.exp(-2.5 * dt);
    tilt.current.x += (pointer.current.y * TILT - tilt.current.x) * ease;
    tilt.current.y += (pointer.current.x * TILT - tilt.current.y) * ease;
    const phase = (clock.current / SWAY_PERIOD) * Math.PI * 2;
    g.rotation.y = (Math.sin(phase) * SWAY + tilt.current.y) * idle;
    g.rotation.x = 0.08 + (Math.sin(phase * 0.5) * 0.04 + tilt.current.x) * idle;
  });
  // The outer group turns about the vertical axis through the model's visual centre; the existing pose stays inside it.
  return <group ref={spinGroup}><group ref={group}>
    {/* Offset so the lens and handle together sit centred in the frame. */}
    <group position={[-0.36, 0.36, 0]} rotation={[0, 0, 0]}>
      <mesh geometry={rim} rotation={[Math.PI / 2, 0, 0]}>
        <meshPhysicalMaterial color="#eef1f5" metalness={1} roughness={0.12} clearcoat={0.7} clearcoatRoughness={0.08} envMapIntensity={1.25} />
      </mesh>
      <mesh rotation={[0, 0, 0]} position={[0, 0, 0.035]}>
        <torusGeometry args={[RIM_INNER + 0.012, 0.022, 20, 128]} />
        <meshPhysicalMaterial color="#f6f8fb" metalness={1} roughness={0.06} envMapIntensity={1.3} />
      </mesh>
      <mesh geometry={lens} rotation={[Math.PI / 2, 0, 0]}>
        <MeshTransmissionMaterial background={LENS_BACKDROP} color="#eaf2ff" resolution={256} samples={4} transmission={1} thickness={0.35} roughness={0.08} ior={1.45} chromaticAberration={0.015} distortion={0} anisotropicBlur={0} clearcoat={0.6} clearcoatRoughness={0.03} envMapIntensity={0.7} toneMapped={false} />
      </mesh>
      <group position={[Math.SQRT1_2 * (RIM_OUTER - 0.06), -Math.SQRT1_2 * (RIM_OUTER - 0.06), 0]} rotation={[0, 0, (-3 * Math.PI) / 4]}>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.085, 0.1, 0.3, 40]} />
          <meshPhysicalMaterial color="#e9eef4" metalness={1} roughness={0.14} clearcoat={0.5} envMapIntensity={1.15} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.155, 0.155, 0.09, 48]} />
          <meshPhysicalMaterial color="#f3f6f9" metalness={1} roughness={0.08} envMapIntensity={1.25} />
        </mesh>
        <mesh geometry={grip}>
          <meshPhysicalMaterial color="#c8d1dc" metalness={1} roughness={0.26} clearcoat={0.4} clearcoatRoughness={0.2} envMapIntensity={1.1} />
        </mesh>
      </group>
    </group>
  </group></group>;
}

/** Soft studio: broad white panels, a pale floor bounce and one restrained blue rim panel. */
function Studio() {
  return <Environment resolution={256} frames={1}>
    {/* A cool mid-gray base keeps polished metal defined without ever reflecting black. */}
    <color attach="background" args={['#6b7684']} />
    <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 5, 1]} rotation-x={Math.PI / 2} scale={[9, 4, 1]} />
    <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[-5, 1.5, 3]} scale={[2, 7, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[5, 0.5, 2.5]} scale={[0.8, 8, 1]} target={[0, 0, 0]} />
    <Lightformer form="circle" intensity={0.8} color="#ffffff" position={[-1.5, 1.5, 6]} scale={[2.4, 2.4, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={1.1} color="#8db3f5" position={[1, -1, -5]} scale={[9, 2, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={0.8} color="#dfe6ef" position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
  </Environment>;
}

export default function MagnifyingGlass3D({ active, reduced, spinning = false, onReady, onError }: { active: boolean; reduced: boolean; spinning?: boolean; onReady: () => void; onError: () => void }) {
  const animate = active && !reduced;
  return <Canvas
    frameloop={animate ? 'always' : 'demand'}
    dpr={[1, 1.75]}
    gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    camera={{ position: [0, 0, 6.2], fov: 30 }}
    style={{ pointerEvents: 'none' }}
    onCreated={({ gl }) => {
      gl.setClearColor(0x000000, 0);
      gl.domElement.setAttribute('aria-hidden', 'true');
      gl.domElement.tabIndex = -1;
      gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); onError(); }, { once: true });
      requestAnimationFrame(() => requestAnimationFrame(onReady));
    }}
  >
    <directionalLight position={[3, 4, 5]} intensity={0.55} />
    <directionalLight position={[-3, 1.5, -4]} intensity={0.9} color="#9cc0ff" />
    <Studio />
    <Glass animate={animate} spinning={spinning} />
  </Canvas>;
}
