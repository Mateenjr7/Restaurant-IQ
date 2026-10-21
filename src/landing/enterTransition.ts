import gsap from 'gsap';

let running = false;

/**
 * Shared-palette circular wipe that survives the route change and reveals the application.
 * It only blocks input while it is covering the screen (~0.7s) and is skipped for reduced motion.
 */
export function wipeTo(x: number, y: number, swap: () => void) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { swap(); return; }
  if (running) return; // ignore double clicks while a wipe is in flight
  running = true;

  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `position:fixed;inset:0;z-index:200;background:var(--color-cobalt);pointer-events:all;clip-path:circle(0px at ${x}px ${y}px)`;
  const mark = document.createElement('div');
  mark.textContent = 'RestaurantIQ';
  mark.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:italic 400 clamp(2.5rem,8vw,6rem)/1 "Instrument Serif",serif;color:var(--color-paper);opacity:0;transform:translateY(12px)';
  el.appendChild(mark);
  document.body.appendChild(el);

  const far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 40;
  const tl = gsap.timeline({ onComplete: () => { el.remove(); running = false; } });
  tl.to(el, { clipPath: `circle(${far}px at ${x}px ${y}px)`, duration: 0.65, ease: 'power3.inOut' })
    .to(mark, { opacity: 1, y: 0, duration: 0.25 }, '-=0.25')
    .add(() => { swap(); window.scrollTo(0, 0); })
    // the application is now mounted underneath: stop capturing input and lift the cover
    .add(() => { el.style.pointerEvents = 'none'; })
    .to(mark, { opacity: 0, duration: 0.2 }, '+=0.1')
    .to(el, { opacity: 0, duration: 0.45, ease: 'power2.out' }, '-=0.1');
}
