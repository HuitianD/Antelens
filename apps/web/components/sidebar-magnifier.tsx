'use client';
import dynamic from 'next/dynamic';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

const MagnifyingGlass3D = dynamic(() => import('./magnifying-glass-3d'), { ssr: false, loading: () => null });

/** Fixed size tiers keep the accent stable when the navigation above it grows or shrinks. */
export function accentSize(width: number, height: number): number {
  if (width >= 172 && height >= 188) return 156;
  if (width >= 132 && height >= 136) return 116;
  return 0;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}

class AccentBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Used when WebGL is unavailable or the scene fails. */
export function StaticMagnifier() {
  return <svg className="accent-static" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="accent-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbfcfd" /><stop offset=".45" stopColor="#b9c3cf" /><stop offset=".7" stopColor="#eef2f6" /><stop offset="1" stopColor="#8e9bab" /></linearGradient>
      <radialGradient id="accent-lens" cx=".38" cy=".34" r=".75"><stop offset="0" stopColor="#ffffff" stopOpacity=".9" /><stop offset=".55" stopColor="#dfe9f8" stopOpacity=".55" /><stop offset="1" stopColor="#b8cdee" stopOpacity=".45" /></radialGradient>
      <linearGradient id="accent-grip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8c99a9" /><stop offset=".45" stopColor="#e3e8ee" /><stop offset="1" stopColor="#97a4b3" /></linearGradient>
    </defs>
    <g transform="rotate(-45 107 107)"><rect x="98" y="98" width="18" height="10" rx="2" fill="#d5dce4" /><rect x="95" y="107" width="24" height="46" rx="12" fill="url(#accent-grip)" /></g>
    <circle cx="66" cy="66" r="44" fill="url(#accent-lens)" />
    <circle cx="66" cy="66" r="44" fill="none" stroke="url(#accent-rim)" strokeWidth="11" />
    <circle cx="66" cy="66" r="38.5" fill="none" stroke="#ffffff" strokeOpacity=".8" strokeWidth="1.2" />
    <path d="M40 52a30 30 0 0 1 22-18" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeOpacity=".85" />
  </svg>;
}

/**
 * Decorative magnifying glass for the sidebar's free space. It is hidden from assistive technology,
 * never focusable, pauses when not visible, and stays still under reduced motion.
 */
export function SidebarMagnifier({ processing = false }: { processing?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0), [mode, setMode] = useState<'pending' | 'webgl' | 'static'>('pending');
  const [visible, setVisible] = useState(true), [reduced, setReduced] = useState(false), [ready, setReady] = useState(false);
  useEffect(() => { setMode(supportsWebGL() ? 'webgl' : 'static'); }, []);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize(accentSize(entry.contentRect.width, entry.contentRect.height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    let onScreen = true;
    const update = () => setVisible(onScreen && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; update(); });
    observer.observe(node); document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const fallback = <StaticMagnifier />;
  return <div ref={frame} className="sidebar-accent" aria-hidden="true">
    {size > 0 && mode !== 'pending' && <div className={`sidebar-accent-stage${ready || mode === 'static' ? ' ready' : ''}`} style={{ width: size, height: size }}>
      {mode === 'static' ? fallback : <AccentBoundary fallback={fallback} onError={() => setMode('static')}><MagnifyingGlass3D active={visible} reduced={reduced} spinning={processing} onReady={() => setReady(true)} onError={() => setMode('static')} /></AccentBoundary>}
    </div>}
  </div>;
}
