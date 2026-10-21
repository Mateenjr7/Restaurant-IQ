import { useEffect } from 'react';

/** Cursor-following glow on every panel (Hatam/Igloo-style light), via CSS vars — no re-renders. */
export function PanelSpotlight() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.('.enterprise-panel,.enterprise-raised') as HTMLElement | null;
      if (!el) return;
      const b = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - b.left}px`);
      el.style.setProperty('--my', `${e.clientY - b.top}px`);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);
  return null;
}
