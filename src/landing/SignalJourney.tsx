import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const CHAPTERS = [
  {
    index: '01',
    label: 'Read the room',
    title: 'Know what the market is doing.',
    description: 'Competitor observations are matched to comparable dishes, portions, sources and timestamps—so the reference point means something.',
    note: 'Nearby prices · Portion-normalised matches',
    image: '/assets/img/market-comparison.jpg',
    alt: 'Overhead view of two restaurant dishes beside a printed menu.',
    kind: 'room',
    accent: 'cobalt',
  },
  {
    index: '02',
    label: 'Anticipate demand',
    title: 'See the rush before it arrives.',
    description: 'Weekly demand patterns inform the next seven days. The forecasting model is checked against held-out history, not presented as certainty.',
    note: '7-day outlook · MAE / RMSE validation',
    image: '/assets/img/kitchen.jpg',
    alt: 'Kitchen light representing preparation for changing restaurant demand',
    kind: 'kitchen',
    accent: 'teal',
  },
  {
    index: '03',
    label: 'Know every dish',
    title: 'Price from the real cost up.',
    description: 'Ingredient, preparation, discount and delivery costs shape an economic floor for each menu item before market recommendations are considered.',
    note: 'Recipe cost · Commission · Minimum margin',
    image: '/assets/img/plate.jpg',
    alt: 'Illustrated overhead view of a richly garnished biryani in a serving dish',
    kind: 'dish',
    accent: 'persimmon',
  },
  {
    index: '04',
    label: 'Make it defensible',
    title: 'Every recommendation has a reason.',
    description: 'A deterministic policy check bounds each proposed move. Approvals and outcomes are recorded so your team can trace what happened and why.',
    note: 'Policy guard · Human approval · Audit trail',
    image: '/assets/img/data-glow.jpg',
    alt: 'Soft market-signal visualization representing a decision being brought into focus',
    kind: 'signal',
    accent: 'cobalt',
  },
];

interface SignalJourneyProps {
  onExploreGuardrail: () => void;
}

export const SignalJourney: React.FC<SignalJourneyProps> = ({ onExploreGuardrail }) => {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const rootEl = root.current;
    if (!rootEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const media = gsap.matchMedia();
    media.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
      const pin = rootEl.querySelector<HTMLElement>('.signal-journey-pin');
      const slides = gsap.utils.toArray<HTMLElement>('.signal-journey-step', rootEl);
      const photos = gsap.utils.toArray<HTMLElement>('.signal-journey-image', rootEl);
      const progress = rootEl.querySelector<HTMLElement>('.signal-journey-progress-fill');
      if (!pin || slides.length !== CHAPTERS.length || photos.length !== CHAPTERS.length) return;

      gsap.set(slides.slice(1), { autoAlpha: 0, y: 30 });
      gsap.set(photos.slice(1), { clipPath: 'inset(12% 8% 12% 8% round 24px)', scale: 1.08 });

      const story = gsap.timeline({
        scrollTrigger: {
          id: 'restaurantiq-signal-journey',
          trigger: pin,
          pin,
          start: 'top top',
          end: '+=340%',
          scrub: 0.75,
          invalidateOnRefresh: true,
        },
      });

      for (let i = 1; i < slides.length; i += 1) {
        const beat = i - 1;
        story
          .to(slides[i - 1], { autoAlpha: 0, y: -24, duration: 0.22 }, beat)
          .to(photos[i - 1], { scale: 1.1, xPercent: i % 2 ? -3 : 3, duration: 0.72 }, beat)
          .to(slides[i], { autoAlpha: 1, y: 0, duration: 0.32 }, beat + 0.12)
          .fromTo(photos[i], {
            clipPath: 'inset(12% 8% 12% 8% round 24px)',
            scale: 1.08,
            xPercent: i % 2 ? 3 : -3,
          }, {
            clipPath: 'inset(0% 0% 0% 0% round 24px)',
            scale: 1,
            xPercent: 0,
            duration: 0.72,
          }, beat + 0.08);
      }

      if (progress) {
        gsap.to(progress, {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: pin,
            start: 'top top',
            end: '+=340%',
            scrub: true,
          },
        });
      }

      return () => story.scrollTrigger?.kill();
    });

    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(refreshFrame);
      media.revert();
    };
  }, []);

  return (
    <section ref={root} className="signal-journey" aria-labelledby="signal-journey-title">
      <div className="signal-journey-pin">
        <div className="signal-journey-shell mx-auto flex min-h-[100svh] max-w-[1500px] flex-col justify-center px-5 py-16 sm:px-10 lg:py-14">
          <div className="signal-journey-heading mb-7 flex items-end justify-between gap-6 sm:mb-9">
            <div>
              <p className="font-mono-tech text-[10px] uppercase tracking-[0.2em] text-cobalt sm:text-[11px]">From signal to safe price / 04 steps</p>
              <h2 id="signal-journey-title" className="mt-3 max-w-4xl font-serif-display text-[clamp(2.5rem,5.5vw,5.3rem)] leading-[0.93] tracking-[-0.025em] text-charcoal">
                A clearer decision,
                <em className="text-cobalt"> at every step.</em>
              </h2>
            </div>
            <span className="hidden shrink-0 items-center gap-2 pb-2 font-mono-tech text-[10px] uppercase tracking-[0.16em] text-slate lg:inline-flex">
              Scroll to explore <ArrowDownRight className="h-4 w-4 text-cobalt" aria-hidden="true" />
            </span>
          </div>

          <div className="signal-journey-frame relative">
            <div className="signal-journey-track">
              {CHAPTERS.map((chapter) => (
                <article key={chapter.index} className="signal-journey-step" aria-label={`${chapter.index}: ${chapter.label}`}>
                  <div className={`signal-journey-visual signal-journey-visual-${chapter.kind}`}>
                    <div className="signal-journey-image">
                      <img src={chapter.image} alt={chapter.alt} loading="eager" />
                    </div>
                    {chapter.kind === 'dish' && <span className="signal-photo-caption">A dish, understood portion by portion</span>}
                    {chapter.kind === 'signal' && (
                      <div className="signal-decision-stamp" aria-hidden="true">
                        <span>Policy checked</span>
                        <strong>Within bounds</strong>
                        <span>Human approval stays in control</span>
                      </div>
                    )}
                    <span className={`signal-visual-index signal-visual-index-${chapter.accent}`} aria-hidden="true">{chapter.index}</span>
                  </div>

                  <div className="signal-journey-copy">
                    <div className="flex items-center gap-3 font-mono-tech text-[10px] uppercase tracking-[0.18em] text-slate">
                      <span className={`signal-step-index signal-step-index-${chapter.accent}`}>{chapter.index}</span>
                      <span>{chapter.label}</span>
                    </div>
                    <h3 className="mt-5 max-w-xl font-serif-display text-[clamp(2.4rem,4.4vw,4.8rem)] leading-[0.96] tracking-[-0.02em] text-charcoal">{chapter.title}</h3>
                    <p className="mt-5 max-w-lg text-sm leading-relaxed text-slate sm:text-base">{chapter.description}</p>
                    <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-rule bg-white/75 px-4 py-2 font-mono-tech text-[9px] uppercase tracking-[0.1em] text-charcoal sm:text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-cobalt" aria-hidden="true" />
                      {chapter.note}
                    </div>
                    {chapter.index === '04' && (
                      <button
                        type="button"
                        onClick={onExploreGuardrail}
                        className="mt-7 inline-flex items-center gap-2 rounded-full bg-cobalt px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cobalt/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cobalt"
                      >
                        Try the live price guardrail <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="signal-journey-bottom flex items-center justify-between gap-6 border-t border-rule px-5 py-4 sm:px-7">
              <span className="font-mono-tech text-[9px] uppercase tracking-[0.16em] text-slate sm:text-[10px]">One menu. Connected intelligence.</span>
              <div className="flex w-24 items-center gap-2 sm:w-36" aria-hidden="true">
                <span className="h-px flex-1 bg-rule"><span className="signal-journey-progress-fill block h-px origin-left bg-cobalt" /></span>
                <span className="font-mono-tech text-[9px] text-cobalt">04</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
