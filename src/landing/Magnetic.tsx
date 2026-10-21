import React, { useRef } from 'react';
import gsap from 'gsap';

/** Wraps a child and pulls it toward the pointer (Igloo/Hatam-style bouncy hover). */
export const Magnetic: React.FC<{ children: React.ReactElement; strength?: number }> = ({ children, strength = 0.35 }) => {
  const wrap = useRef<HTMLSpanElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = wrap.current; if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const b = el.getBoundingClientRect();
    gsap.to(el, { x: (e.clientX - (b.left + b.width / 2)) * strength, y: (e.clientY - (b.top + b.height / 2)) * strength, duration: 0.4, ease: 'power3.out' });
  };
  const onLeave = () => { if (wrap.current) gsap.to(wrap.current, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' }); };
  return <span ref={wrap} onMouseMove={onMove} onMouseLeave={onLeave} className="inline-block">{children}</span>;
};
