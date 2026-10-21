import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** A restaurant scene assembled from the project's own dish and venue imagery. */
export const ImageShowcase: React.FC = () => {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootEl = root.current;
    const stageEl = stage.current;
    if (!rootEl || !stageEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo('.culinary-heading h2', { y: 42, opacity: 0.35 }, {
        y: 0,
        opacity: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '.culinary-heading',
          start: 'top 86%',
          end: 'top 48%',
          scrub: 0.6,
        },
      });

      const story = gsap.timeline({
        scrollTrigger: {
          trigger: stageEl,
          start: 'top 82%',
          end: 'center 42%',
          scrub: 0.8,
        },
      });

      story
        .fromTo('.dish-reveal-motion', { y: 150, scale: 0.78, rotate: -12, opacity: 0 }, { y: 0, scale: 1, rotate: 0, opacity: 1, ease: 'power2.out' }, 0)
        .fromTo('.kitchen-layer', { x: -100, y: 45, rotate: -12, opacity: 0, clipPath: 'inset(18% 18% 18% 18% round 28px)' }, { x: 0, y: 0, rotate: -6, opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'power2.out' }, 0.08)
        .fromTo('.room-layer', { x: 110, y: 50, rotate: 10, opacity: 0, clipPath: 'inset(18% 18% 18% 18% round 28px)' }, { x: 0, y: 0, rotate: 5, opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'power2.out' }, 0.12)
        .fromTo('.dish-note', { y: 28, opacity: 0, filter: 'blur(6px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', stagger: 0.08, ease: 'power2.out' }, 0.2);

      gsap.utils.toArray<HTMLElement>('.culinary-orbit').forEach((orbit, i) => {
        gsap.fromTo(orbit, { rotate: i === 0 ? -24 : 18, scale: 0.82, opacity: 0 }, {
          rotate: i === 0 ? 0 : 0,
          scale: 1,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: stageEl,
            start: 'top 80%',
            end: 'center 42%',
            scrub: 0.8,
          },
        });
      });

      gsap.to('.kitchen-layer', {
        z: -34,
        rotateY: -4,
        ease: 'none',
        scrollTrigger: { trigger: stageEl, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      });
      gsap.to('.room-layer', {
        z: -82,
        rotateY: 5,
        ease: 'none',
        scrollTrigger: { trigger: stageEl, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      });
      gsap.to('.dish-reveal-motion', {
        z: 64,
        rotateY: -2,
        ease: 'none',
        scrollTrigger: { trigger: stageEl, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      });
    }, rootEl);

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const layerHandlers: Array<() => void> = [];
    if (finePointer) {
      const dish = stageEl.querySelector<HTMLElement>('.dish-hover-plane');
      const kitchen = stageEl.querySelector<HTMLElement>('.kitchen-hover-plane');
      const room = stageEl.querySelector<HTMLElement>('.room-hover-plane');
      const hoverPlanes = [dish, kitchen, room].filter((el): el is HTMLElement => Boolean(el));
      hoverPlanes.forEach((plane, index) => {
        const qx = gsap.quickTo(plane, '--scene-tilt-y', { duration: 0.7, ease: 'power3.out' });
        const qy = gsap.quickTo(plane, '--scene-tilt-x', { duration: 0.7, ease: 'power3.out' });
        const lift = gsap.quickTo(plane, '--scene-lift', { duration: 0.7, ease: 'power3.out' });
        const move = (event: PointerEvent) => {
          const bounds = plane.getBoundingClientRect();
          const px = (event.clientX - bounds.left) / bounds.width - 0.5;
          const py = (event.clientY - bounds.top) / bounds.height - 0.5;
          const strength = index === 0 ? 9 : 5;
          qx(px * strength);
          qy(-py * strength);
          lift(-3);
          plane.style.setProperty('--spot-x', `${(px + 0.5) * 100}%`);
          plane.style.setProperty('--spot-y', `${(py + 0.5) * 100}%`);
          plane.classList.add('is-hovered');
        };
        const leave = () => {
          qx(0);
          qy(0);
          lift(0);
          plane.classList.remove('is-hovered');
        };
        plane.addEventListener('pointermove', move, { passive: true });
        plane.addEventListener('pointerleave', leave);
        layerHandlers.push(() => {
          plane.removeEventListener('pointermove', move);
          plane.removeEventListener('pointerleave', leave);
          gsap.killTweensOf(plane);
        });
      });
    }

    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(refreshFrame);
      layerHandlers.forEach((remove) => remove());
      ctx.revert();
    };
  }, []);

  return (
    <section ref={root} className="culinary-story px-5 sm:px-10 py-24 sm:py-36 max-w-[1500px] mx-auto" aria-labelledby="culinary-story-title">
      <div className="culinary-heading grid gap-6 md:grid-cols-12 md:items-end">
        <div className="md:col-span-8">
          <p className="font-mono-tech text-[11px] uppercase tracking-[0.2em] text-slate">The room, the plate, the numbers</p>
          <h2 id="culinary-story-title" className="mt-5 max-w-4xl font-serif-display text-[clamp(2.8rem,7vw,6.5rem)] leading-[0.94] tracking-[-0.025em] text-charcoal">
            Every plate has
            <br />
            <em className="text-cobalt">a story in the numbers.</em>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-slate md:col-span-4 md:justify-self-end md:pb-2">
          One dish. A busy kitchen. A room full of signals. RestaurantIQ brings them into focus—without losing sight of the people behind the plate.
        </p>
      </div>

      <div ref={stage} className="culinary-stage relative mt-12 min-h-[52rem] overflow-hidden rounded-[2rem] border border-rule bg-white/45 sm:mt-16 md:min-h-[45rem]">
        <div className="culinary-stage-wash pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="culinary-stage-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="culinary-orbit culinary-orbit-one pointer-events-none absolute left-1/2 top-1/2 h-[24rem] w-[24rem] rounded-full border border-cobalt/15 md:h-[34rem] md:w-[34rem]" aria-hidden="true" />
        <div className="culinary-orbit culinary-orbit-two pointer-events-none absolute left-1/2 top-1/2 h-[29rem] w-[29rem] rounded-full border border-dashed border-persimmon/20 md:h-[41rem] md:w-[41rem]" aria-hidden="true" />

        <figure className="kitchen-layer culinary-photo-layer absolute left-[5%] top-[13%] z-10 w-[34%] max-w-[19rem] sm:left-[9%] md:top-[17%] md:w-[25%]">
          <div className="kitchen-hover-plane culinary-interactive-plane culinary-photo-card overflow-hidden rounded-2xl border border-white/80 bg-sand shadow-[0_24px_60px_-36px_color-mix(in_srgb,var(--color-charcoal)_48%,transparent)]">
            <img src="/assets/img/kitchen.jpg" alt="" loading="lazy" className="h-40 w-full object-cover sm:h-52 md:h-64" />
            <figcaption className="border-t border-rule bg-white/85 px-3 py-2.5 sm:px-4 sm:py-3">
              <span className="font-mono-tech text-[9px] uppercase tracking-[0.16em] text-cobalt">01 / Kitchen</span>
              <span className="mt-1 block font-serif-display text-base leading-tight text-charcoal sm:text-xl">Ready before the rush</span>
            </figcaption>
          </div>
        </figure>

        <figure className="room-layer culinary-photo-layer absolute right-[4%] top-[18%] z-10 w-[34%] max-w-[20rem] sm:right-[8%] md:right-[10%] md:top-[14%] md:w-[27%]">
          <div className="room-hover-plane culinary-interactive-plane culinary-photo-card overflow-hidden rounded-2xl border border-white/80 bg-sand shadow-[0_24px_60px_-36px_color-mix(in_srgb,var(--color-charcoal)_48%,transparent)]">
            <img src="/assets/img/ambience.jpg" alt="" loading="lazy" className="h-36 w-full object-cover sm:h-48 md:h-60" />
            <figcaption className="border-t border-rule bg-white/85 px-3 py-2.5 sm:px-4 sm:py-3">
              <span className="font-mono-tech text-[9px] uppercase tracking-[0.16em] text-persimmon">02 / Dining room</span>
              <span className="mt-1 block font-serif-display text-base leading-tight text-charcoal sm:text-xl">A full room, in focus</span>
            </figcaption>
          </div>
        </figure>

        <figure className="dish-reveal absolute left-1/2 top-[42%] z-20 w-[min(82vw,35rem)] -translate-x-1/2 -translate-y-1/2" data-cursor="Explore">
          <div className="dish-reveal-motion">
            <div className="dish-hover-plane culinary-interactive-plane relative aspect-square">
              <div className="dish-shadow pointer-events-none absolute inset-[18%] rounded-full bg-charcoal/15 blur-3xl" aria-hidden="true" />
              <img
                src="/assets/img/plate.jpg"
                alt="Illustrated overhead view of a richly garnished biryani in a serving dish"
                loading="lazy"
                className="dish-cutout pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
              <span className="dish-index absolute left-[14%] top-[25%] font-mono-tech text-[9px] uppercase tracking-[0.18em] text-charcoal/60 sm:text-[10px]">House signature / 01</span>
            </div>
          </div>
        </figure>

        <div className="dish-note dish-note-demand absolute left-[5%] top-[57%] z-30 max-w-[10rem] rounded-xl border border-rule bg-white/90 p-3 shadow-[0_16px_36px_-24px_color-mix(in_srgb,var(--color-charcoal)_40%,transparent)] backdrop-blur-md sm:left-[12%] sm:top-[62%] sm:max-w-[12rem] sm:p-4">
          <span className="block font-mono-tech text-[9px] uppercase tracking-[0.16em] text-slate">Friday dinner · demo</span>
          <span className="mt-1 block font-serif-display text-2xl text-charcoal sm:text-3xl">1.48<span className="text-cobalt">×</span></span>
          <span className="block text-[10px] text-slate">demand forecast</span>
        </div>
        <div className="dish-note dish-note-margin absolute bottom-[9%] right-[5%] z-30 max-w-[11rem] rounded-xl border border-rule bg-white/90 p-3 shadow-[0_16px_36px_-24px_color-mix(in_srgb,var(--color-charcoal)_40%,transparent)] backdrop-blur-md sm:bottom-[12%] sm:right-[11%] sm:max-w-[13rem] sm:p-4">
          <span className="block font-mono-tech text-[9px] uppercase tracking-[0.16em] text-slate">Margin guard · demo</span>
          <span className="mt-1 block font-serif-display text-2xl text-charcoal sm:text-3xl">₹190<span className="ml-1 text-xs font-sans-ui text-teal">safe floor</span></span>
          <span className="block text-[10px] text-slate">the minimum this dish should sell for</span>
        </div>

        <div className="absolute inset-x-5 bottom-4 z-30 flex items-center justify-between border-t border-rule/80 pt-3 font-mono-tech text-[9px] uppercase tracking-[0.15em] text-slate sm:inset-x-8 sm:bottom-6 sm:text-[10px]">
          <span>Product intelligence / Hyderabad</span>
          <span className="hidden sm:inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-teal" /> One decision, fully in view</span>
        </div>
      </div>
    </section>
  );
};
