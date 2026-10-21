import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { sceneState } from './sceneState.ts';

/** Custom cursor: ring that follows with inertia, grows with a label over any [data-cursor] element. */
export const Cursor: React.FC = () => {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const r = ring.current!, d = dot.current!;
    const rx = gsap.quickTo(r, 'x', { duration: 0.45, ease: 'power3' });
    const ry = gsap.quickTo(r, 'y', { duration: 0.45, ease: 'power3' });
    const dx = gsap.quickTo(d, 'x', { duration: 0.08 });
    const dy = gsap.quickTo(d, 'y', { duration: 0.08 });
    gsap.set([r, d], { x: -100, y: -100 });

    const move = (e: MouseEvent) => {
      rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY);
      sceneState.mouseX = e.clientX / window.innerWidth;
      sceneState.mouseY = 1 - e.clientY / window.innerHeight;
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-cursor]') as HTMLElement | null;
      if (el) {
        label.current!.textContent = el.dataset.cursor || '';
        r.classList.add('is-active');
        d.style.opacity = '0';
      } else {
        r.classList.remove('is-active');
        d.style.opacity = '1';
      }
    };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseover', over, { passive: true });
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', over);
    };
  }, []);

  return (
    <>
      <div ref={ring} className="riq-cursor" aria-hidden="true"><span ref={label} /></div>
      <div ref={dot} className="riq-cursor-dot" aria-hidden="true" />
    </>
  );
};
