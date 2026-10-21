/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ArrowRight, ArrowUpRight, Radar, Sparkles } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { IntelligenceOrb3D } from '../components/IntelligenceOrb3D.tsx';
import { ShaderBackdrop } from '../landing/ShaderBackdrop.tsx';
import { Cursor } from '../landing/Cursor.tsx';
import { Magnetic } from '../landing/Magnetic.tsx';
import { FloorPlayground } from '../landing/FloorPlayground.tsx';
import { PipelineMotif } from '../landing/PipelineMotifs.tsx';
import { ImageShowcase } from '../landing/ImageShowcase.tsx';
import { SignalJourney } from '../landing/SignalJourney.tsx';
import { sceneState } from '../landing/sceneState.ts';
import { wipeTo } from '../landing/enterTransition.ts';

gsap.registerPlugin(ScrollTrigger);

interface ImmersiveEntryViewProps {
  /** Called after the wipe transition. `role` is set when the visitor chose "Enter as …". */
  onEnterCommandCenter: (role?: string) => void;
}

const SIGNALS = [
  { tag: 'Market', text: 'Spice Route Bistro raised Dum Biryani to ₹380 (+11.7%)' },
  { tag: 'Demand', text: 'Friday & Saturday dinner volume index forecast at 1.48×' },
  { tag: 'Margin', text: 'Wholesale chicken +14.5% — economic floor recalibrated' },
];

const STAGES = [
  { name: 'Market Intelligence', out: 'competitor_observations[]', body: 'Scans rival menus within 1.5–5 km and records every price with its source and timestamp.' },
  { name: 'Menu Matching', out: 'portion_normalised_matches[]', body: "Matches dishes like-for-like and scales for portion weight — a 550 g handi isn't a 400 g bowl." },
  { name: 'Demand Forecasting', out: 'forecast + MAE / RMSE', body: 'Holt-Winters with weekly seasonality, validated on a 14-day held-out window. No fake confidence.' },
  { name: 'Pricing Strategy', out: 'candidate_price', body: 'Blends market median, elasticity, stock pressure and platform commission into a candidate price.' },
  { name: 'Profit & Policy Guard', out: 'allow | block', body: 'A deterministic check on floor, step limit and rounding. Unsafe prices are blocked — not just warned about.' },
  { name: 'Pricing Orchestrator', out: 'audit_event → POS', body: 'Runs the chain, writes the tamper-evident audit trail, and pushes approved prices to your POS.' },
];

const ROLES = [
  { role: 'admin', title: 'Owner / Admin', body: 'Policy, overrides, outlet switching and final approvals.', tint: 'var(--color-persimmon)' },
  { role: 'revenue_manager', title: 'Revenue Manager', body: 'Reviews recommendations, approves and applies price changes.', tint: 'var(--color-cobalt)' },
  { role: 'kitchen_ops', title: 'Kitchen Ops', body: 'Stock audits and recipe costs that feed the floor.', tint: 'var(--color-teal)' },
  { role: 'auditor', title: 'Auditor', body: 'Read-only window into every decision ever made.', tint: 'var(--color-slate)' },
];

const MANIFESTO =
  'Most restaurants price by instinct. RestaurantIQ prices by evidence. It watches your rivals, forecasts tomorrow’s demand, and refuses — mathematically — to ever sell below the margin you set.'.split(' ');

const Label: React.FC<{ n: string; children: React.ReactNode }> = ({ n, children }) => (
  <div data-reveal className="flex items-center gap-4 font-mono-tech text-[11px] uppercase tracking-[0.22em] text-slate">
    <span className="text-cobalt">{n}</span>
    <span className="h-px w-10 bg-rule" />
    <span>{children}</span>
  </div>
);

const Lines: React.FC<{ lines: React.ReactNode[]; className?: string; as?: 'h1' | 'h2' }> = ({ lines, className = '', as: Tag = 'h2' }) => (
  <Tag className={className}>
    {lines.map((l, i) => (
      <span key={i} className="line-mask"><span className="line-inner">{l}</span></span>
    ))}
  </Tag>
);

export const ImmersiveEntryView: React.FC<ImmersiveEntryViewProps> = ({ onEnterCommandCenter }) => {
  const root = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const [preloading, setPreloading] = useState(() => {
    try { return sessionStorage.getItem('riq_seen') !== '1'; } catch { return true; }
  });

  const go = (role: string | undefined, e: React.MouseEvent | null) => {
    const x = e ? e.clientX : window.innerWidth / 2;
    const y = e ? e.clientY : window.innerHeight / 2;
    try { sessionStorage.setItem('riq_seen', '1'); } catch { /* ignore */ }
    wipeTo(x, y, () => onEnterCommandCenter(role));
  };

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -20, duration: 1.6 });
    else el.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo(0, 0);

    // ── Smooth scroll (Lenis) driving GSAP's ticker ─────────────────────────
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: !reduce, wheelMultiplier: 0.95 });
    lenisRef.current = lenis;
    const syncScene = (e: { velocity: number }) => {
      ScrollTrigger.update();
      sceneState.vel = Math.max(-1, Math.min(1, e.velocity / 40));
    };
    lenis.on('scroll', syncScene);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    if (preloading) lenis.stop();

    if (reduce) {
      return () => {
        lenis.off('scroll', syncScene);
        gsap.ticker.remove(tick);
        lenis.destroy();
        lenisRef.current = null;
        sceneState.scroll = 0;
        sceneState.vel = 0;
        sceneState.boost = 0;
      };
    }

    let removeExternalListeners = () => {};
    const ctx = gsap.context(() => {
      // Page progress → shader + top progress bar
      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: (s) => { sceneState.scroll = s.progress; },
      });
      gsap.to('.progress-bar', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.2 } });

      // Header glass state
      ScrollTrigger.create({
        start: 60, end: 'max',
        onToggle: (s) => root.current?.querySelector('.site-header')?.classList.toggle('is-scrolled', s.isActive),
      });

      // Separate depth planes move at different rates as the opening scene exits.
      gsap.to('.hero-content', {
        yPercent: -14, opacity: 0.0, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 20%', scrub: true },
      });
      gsap.to('.hero-depth-back', {
        yPercent: -20, scale: 1.08, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('.hero-depth-front', {
        yPercent: 28, rotation: 8, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('.hero-depth-scene', {
        yPercent: 18, scale: 0.88, opacity: 0.22, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });

      // The final orbital scene recedes as the invitation enters, tying the story to the scroll.
      gsap.to('.closing-visual', {
        yPercent: -14, scale: 0.88, rotation: 3, ease: 'none',
        scrollTrigger: { trigger: '.closing-visual', start: 'top bottom', end: 'bottom 20%', scrub: true },
      });

      // Generic reveals
      gsap.utils.toArray<HTMLElement>('.split-lines').forEach((el) => {
        gsap.from(el.querySelectorAll('.line-inner'), {
          yPercent: 110, rotate: 2, duration: 1.2, ease: 'expo.out', stagger: 0.1,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          y: 36, opacity: 0, duration: 1, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        });
      });

      // Marquee reacts to scroll velocity (skew + speed)
      const skew = gsap.quickTo('.marquee-track', 'skewX', { duration: 0.5, ease: 'power3' });
      const onMarqueeScroll = (e: { velocity: number }) => skew(Math.max(-14, Math.min(14, -e.velocity * 0.5)));
      lenis.on('scroll', onMarqueeScroll);

      // Manifesto — word-by-word scrubbed reveal
      gsap.to('.manifesto .word', {
        opacity: 1, ease: 'none', stagger: 0.12,
        scrollTrigger: { trigger: '.manifesto', start: 'top 72%', end: 'bottom 62%', scrub: 0.6 },
      });

      // Pipeline — pinned horizontal track on desktop, vertical stack on mobile
      const mm = gsap.matchMedia();
      mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
        const track = root.current!.querySelector<HTMLElement>('.pipe-track')!;
        const dist = () => track.scrollWidth - window.innerWidth + window.innerWidth * 0.08;
        const tween = gsap.to(track, {
          x: () => -dist(), ease: 'none',
          scrollTrigger: {
            trigger: '.pipe-pin', pin: true, scrub: 0.8, start: 'top top',
            end: () => '+=' + dist(), invalidateOnRefresh: true,
          },
        });
        gsap.to('.pipe-progress', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.pipe-pin', start: 'top top', end: () => '+=' + dist(), scrub: true } });
        gsap.utils.toArray<HTMLElement>('.pipe-card').forEach((card) => {
          gsap.from(card.querySelector('.pipe-motif'), {
            rotate: -18, scale: 0.8, opacity: 0.2, ease: 'none',
            scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 90%', end: 'left 40%', scrub: true },
          });
        });
      });

      // Stat counters
      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
        const end = Number(el.dataset.count);
        const o = { v: 0 };
        gsap.to(o, {
          v: end, duration: 1.8, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: () => { el.textContent = String(Math.round(o.v)); },
        });
      });

      // CTA — energy burst on hover
      const cta = root.current!.querySelector('.cta-btn');
      const on = () => gsap.to(sceneState, { boost: 1, duration: 0.6 });
      const off = () => gsap.to(sceneState, { boost: 0, duration: 1.2 });
      cta?.addEventListener('mouseenter', on);
      cta?.addEventListener('mouseleave', off);
      removeExternalListeners = () => {
        lenis.off('scroll', onMarqueeScroll);
        cta?.removeEventListener('mouseenter', on);
        cta?.removeEventListener('mouseleave', off);
        gsap.killTweensOf(sceneState);
      };
    }, root);

    // Tilt cards (roles)
    const tiltHandlers: Array<() => void> = [];
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce) {
      root.current!.querySelectorAll<HTMLElement>('.tilt').forEach((card) => {
        const move = (e: MouseEvent) => {
          const b = card.getBoundingClientRect();
          const px = (e.clientX - b.left) / b.width - 0.5;
          const py = (e.clientY - b.top) / b.height - 0.5;
          gsap.to(card, { rotateY: px * 10, rotateX: -py * 10, y: -6, duration: 0.5, ease: 'power3.out', transformPerspective: 900 });
          card.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
          card.style.setProperty('--my', `${(py + 0.5) * 100}%`);
        };
        const leave = () => gsap.to(card, { rotateY: 0, rotateX: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.45)' });
        card.addEventListener('mousemove', move);
        card.addEventListener('mouseleave', leave);
        tiltHandlers.push(() => {
          card.removeEventListener('mousemove', move);
          card.removeEventListener('mouseleave', leave);
          gsap.killTweensOf(card);
        });
      });
    }

    document.fonts?.ready.then(() => {
      if (root.current) ScrollTrigger.refresh();
    });

    return () => {
      tiltHandlers.forEach((fn) => fn());
      ctx.revert();
      removeExternalListeners();
      lenis.off('scroll', syncScene);
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
      sceneState.scroll = 0;
      sceneState.vel = 0;
      sceneState.boost = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Preloader → hero intro ───────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { sessionStorage.setItem('riq_seen', '1'); } catch { /* ignore */ }
      setPreloading(false);
      return;
    }
    const intro = () => {
      gsap.set('.hero .line-inner', { yPercent: 110 });
      gsap.timeline({ defaults: { ease: 'expo.out' } })
        .to('.hero .line-inner', { yPercent: 0, duration: 1.5, stagger: 0.12 })
        .from('.hero-fade', { y: 24, opacity: 0, duration: 1.1, stagger: 0.1, ease: 'power3.out' }, '-=1.0')
        .from('.site-header > *', { y: -20, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' }, '-=1.2');
    };
    if (!preloading) { intro(); return; }

    const o = { v: 0 };
    const tl = gsap.timeline();
    tl.to(o, {
      v: 100, duration: 1.7, ease: 'power2.inOut',
      onUpdate: () => { if (counterRef.current) counterRef.current.textContent = String(Math.round(o.v)).padStart(3, '0'); },
    })
      .to('.pre-label', { opacity: 0, y: -10, duration: 0.3 }, '-=0.1')
      .to('.preloader', { yPercent: -100, duration: 1.0, ease: 'expo.inOut' })
      .add(() => { setPreloading(false); lenisRef.current?.start(); try { sessionStorage.setItem('riq_seen', '1'); } catch { /* ignore */ } intro(); }, '-=0.55');
    return () => { tl.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} className="landing has-cursor relative text-charcoal selection:bg-cobalt selection:text-white overflow-x-clip">
      <style>{`
        .site-header { background: color-mix(in srgb, var(--color-porcelain) 78%, transparent); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid color-mix(in srgb, var(--color-rule) 70%, transparent); transition: background .4s, backdrop-filter .4s, border-color .4s; }
        .site-header.is-scrolled { background: color-mix(in srgb, var(--color-porcelain) 88%, transparent); border-color: color-mix(in srgb, var(--color-rule) 80%, transparent); }
        .nav-link { position: relative; }
        .nav-link::after { content:''; position:absolute; left:0; right:0; bottom:-4px; height:1px; background:var(--color-persimmon); transform:scaleX(0); transform-origin:right; transition: transform .45s cubic-bezier(.16,1,.3,1); }
        .nav-link:hover::after { transform:scaleX(1); transform-origin:left; }
        .tilt { transform-style: preserve-3d; will-change: transform; }
        .tilt::before { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; opacity:0; transition:opacity .4s;
          background: radial-gradient(420px circle at var(--mx,50%) var(--my,50%), color-mix(in srgb, var(--tint, var(--color-cobalt)) 14%, transparent), transparent 60%); }
        .tilt:hover::before { opacity:1; }
        @media (max-width: 899px) { .pipe-pin { height:auto !important; } .pipe-track { flex-direction: column; width: 100% !important; padding: 0 1.25rem !important; } .pipe-card { width: 100% !important; } }
      `}</style>

      <ShaderBackdrop />
      <div className="grain-overlay" />
      <Cursor />
      <div className="progress-bar fixed top-0 left-0 right-0 h-[2px] z-[95] origin-left bg-gradient-to-r from-cobalt to-cobalt-soft" style={{ transform: 'scaleX(0)' }} />

      {/* Preloader */}
      {preloading && (
        <div className="preloader fixed inset-0 z-[150] bg-porcelain flex flex-col justify-between p-6 sm:p-10" role="status" aria-label="Loading">
          <div className="pre-label flex items-center justify-between font-mono-tech text-[11px] uppercase tracking-[0.22em] text-mist">
            <BrandLogo size="md" />
            <span>Revenue Intelligence</span>
          </div>
          <div className="flex items-end justify-between">
            <span ref={counterRef} className="font-serif-display text-[clamp(6rem,24vw,20rem)] leading-[0.8] text-charcoal tabular-nums">000</span>
            <span className="pre-label hidden sm:block font-mono-tech text-xs uppercase tracking-[0.22em] text-cobalt pb-4">Calibrating floors…</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="site-header fixed top-0 inset-x-0 z-50">
        <div className="max-w-[1500px] mx-auto px-5 sm:px-10 h-[72px] flex items-center justify-between">
          <a href="#top" onClick={(e) => { e.preventDefault(); lenisRef.current?.scrollTo(0, { duration: 1.6 }); }} aria-label="RestaurantIQ home" data-cursor="Top">
            <BrandLogo size="md" />
          </a>
          <nav aria-label="Primary" className="hidden md:flex items-center gap-9 text-[13px] text-charcoal/75">
            {[['pipeline', 'Pipeline'], ['playground', 'Guardrail'], ['access', 'Access']].map(([id, label]) => (
              <button key={id} onClick={() => scrollToId(id)} className="nav-link hover:text-cobalt transition-colors">{label}</button>
            ))}
          </nav>
          <Magnetic strength={0.25}>
            <button
              onClick={(e) => go(undefined, e)}
              data-cursor="Enter"
              className="group px-5 py-2.5 rounded-full bg-cobalt text-white text-[13px] font-semibold flex items-center gap-2 hover:bg-cobalt/90 transition-colors"
            >
              <span className="hidden sm:inline">Open Command Center</span>
              <span className="sm:hidden">Open app</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </Magnetic>
        </div>
      </header>

      <main id="top" className="relative z-10">
        {/* ═════ HERO ═════ */}
        <section className="hero relative min-h-[100svh] flex flex-col justify-end px-5 sm:px-10 pt-32 pb-8 sm:pb-10 max-w-[1500px] mx-auto">
          <div className="hero-depth-scene" aria-hidden="true">
            <div className="hero-depth-back">
              <span className="hero-depth-halo" />
              <span className="hero-depth-orbit hero-depth-orbit-one" />
              <span className="hero-depth-orbit hero-depth-orbit-two" />
              <span className="hero-depth-core" />
            </div>
            <div className="hero-depth-front">
              <span className="hero-depth-node hero-depth-node-one" />
              <span className="hero-depth-node hero-depth-node-two" />
              <span className="hero-depth-coordinate">MARKET / SIGNAL / MARGIN</span>
            </div>
          </div>
          <div className="hero-content">
            <div className="hero-fade inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel text-[11px] font-mono-tech uppercase tracking-[0.18em] text-cobalt-soft">
              <Sparkles className="w-3.5 h-3.5" /> Autonomous culinary market intelligence
            </div>

            <Lines
              as="h1"
              className="mt-7 font-serif-display text-[clamp(3.6rem,13.5vw,12.5rem)] leading-[0.88] tracking-[-0.03em]"
              lines={[
                'Price with',
                <span key="c"><em className="text-transparent bg-clip-text bg-gradient-to-r from-cobalt via-cobalt-soft to-persimmon pr-[0.08em]">certainty.</em></span>,
              ]}
            />

            <div className="mt-10 grid lg:grid-cols-12 gap-8 items-end">
              <p className="hero-fade lg:col-span-5 text-base sm:text-lg text-charcoal/75 leading-relaxed max-w-md">
                RestaurantIQ benchmarks your rivals, forecasts demand and enforces a hard margin floor — so every price change is explainable, bounded and safe.
              </p>
              <div className="hero-fade lg:col-span-7 flex flex-wrap items-center gap-4 lg:justify-end">
                <Magnetic>
                  <button onClick={(e) => go(undefined, e)} data-cursor="Enter" className="cta-btn group px-8 py-4 rounded-full bg-gradient-to-r from-cobalt to-cobalt-soft text-white text-sm font-semibold flex items-center gap-3 shadow-[0_20px_60px_-15px_rgba(36,71,212,.32)]">
                    Launch Command Center <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </Magnetic>
                <button onClick={() => scrollToId('pipeline')} data-cursor="Scroll" className="px-6 py-4 rounded-full glass-panel text-sm text-charcoal hover:bg-sand transition-colors">
                  See how it works
                </button>
              </div>
            </div>
          </div>

          {/* signal ticker */}
          <div className="hero-fade mt-12 border-t border-rule pt-4 flex items-center gap-6 overflow-hidden">
            <span className="shrink-0 flex items-center gap-2 font-mono-tech text-[10px] uppercase tracking-[0.2em] text-cobalt">
              <span className="w-1.5 h-1.5 rounded-full bg-cobalt animate-pulse" /> Live signals · demo data
            </span>
            <div className="flex gap-3 overflow-x-auto scrollbar-none">
              {SIGNALS.map((s) => (
                <span key={s.tag} className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/75 border border-rule text-xs">
                  <span className="font-mono-tech text-[10px] uppercase text-slate">{s.tag}</span>
                  <span className="text-charcoal/80">{s.text}</span>
                </span>
              ))}
            </div>
            <span className="hidden md:flex shrink-0 items-center gap-2 font-mono-tech text-[10px] uppercase tracking-[0.2em] text-mist">
              Scroll <span className="block w-px h-6 bg-gradient-to-b from-charcoal to-transparent" />
            </span>
          </div>
        </section>

        {/* ═════ MARQUEE ═════ */}
        <section aria-hidden="true" className="py-14 sm:py-20 overflow-hidden border-y border-rule bg-sand/70 backdrop-blur-[2px]">
          <div className="marquee-track flex w-max animate-marquee will-change-transform">
            {[0, 1].map((k) => (
              <div key={k} className="flex shrink-0 items-center">
                {['Competitor Radar', 'Demand Forecasting', 'Economic Floor', 'Audit Trail', 'Dynamic Pricing'].map((t, i) => (
                  <React.Fragment key={t}>
                    <span className={`px-8 font-serif-display text-[clamp(3rem,9vw,8rem)] leading-none whitespace-nowrap ${i % 2 ? 'outline-text' : 'text-charcoal'}`}>{t}</span>
                    <span className="text-cobalt text-4xl">✦</span>
                  </React.Fragment>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ═════ MANIFESTO ═════ */}
        <section className="manifesto px-5 sm:px-10 py-32 sm:py-48 max-w-[1300px] mx-auto">
          <Label n="01">The idea</Label>
          <p className="mt-10 font-serif-display text-[clamp(2rem,5.6vw,5rem)] leading-[1.08] tracking-[-0.015em] text-balance">
            {MANIFESTO.map((w, i) => (
              <React.Fragment key={i}>
                <span className={`word ${/instinct|evidence|mathematically/.test(w) ? 'italic text-cobalt-soft' : ''}`}>{w}</span>{' '}
              </React.Fragment>
            ))}
          </p>
        </section>

        {/* ═════ PIPELINE (horizontal) ═════ */}
        <ImageShowcase />
        <SignalJourney onExploreGuardrail={() => scrollToId('playground')} />

        <section id="pipeline" className="relative">
          <div className="pipe-pin h-screen flex flex-col justify-center overflow-hidden">
            <div className="px-5 sm:px-10 max-w-[1500px] mx-auto w-full mb-8 sm:mb-12 flex items-end justify-between gap-6">
              <div>
                <Label n="02">The pipeline</Label>
                <Lines className="split-lines mt-6 font-serif-display text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.02em]" lines={['Six agents.', <em key="e" className="text-persimmon">One decision you can defend.</em>]} />
              </div>
              <span className="hidden lg:block font-mono-tech text-[11px] uppercase tracking-[0.2em] text-mist pb-3">Scroll → </span>
            </div>

            <div className="pipe-track flex gap-5 sm:gap-8 pl-5 sm:pl-10 pr-[8vw] w-max will-change-transform">
              {STAGES.map((s, i) => (
                <article key={s.name} className="pipe-card tilt-none relative w-[82vw] sm:w-[560px] shrink-0 rounded-[28px] glass-panel p-7 sm:p-10 flex flex-col justify-between min-h-[380px] sm:min-h-[430px]" data-cursor="Drag">
                  <div className="flex items-start justify-between">
                    <span className="font-serif-display text-[7rem] sm:text-[9rem] leading-[0.8] text-transparent" style={{ WebkitTextStroke: '1px rgba(36,71,212,.35)' }}>0{i + 1}</span>
                    <PipelineMotif index={i} className="pipe-motif w-28 h-28 sm:w-40 sm:h-40 text-cobalt" />
                  </div>
                  <div>
                    <h3 className="font-serif-display text-3xl sm:text-4xl text-charcoal">{s.name}</h3>
                    <p className="mt-3 text-sm sm:text-[15px] text-charcoal/65 leading-relaxed max-w-sm">{s.body}</p>
                    <div className="mt-5 inline-block font-mono-tech text-[11px] text-slate bg-sand border border-rule rounded-lg px-3 py-1.5">→ {s.out}</div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden md:block px-10 max-w-[1500px] mx-auto w-full mt-10">
              <div className="h-px bg-rule"><div className="pipe-progress h-px bg-cobalt origin-left" style={{ transform: 'scaleX(0)' }} /></div>
            </div>
          </div>
        </section>

        {/* ═════ GUARDRAIL PLAYGROUND ═════ */}
        <section id="playground" className="px-5 sm:px-10 py-28 sm:py-44 max-w-[1300px] mx-auto">
          <Label n="03">The guardrail</Label>
          <Lines className="split-lines mt-6 font-serif-display text-[clamp(2.6rem,7vw,6.5rem)] leading-[0.95] tracking-[-0.02em]" lines={['Try it.', <em key="e" className="text-cobalt-soft">Watch it refuse to lose money.</em>]} />
          <p data-reveal className="mt-6 max-w-xl text-charcoal/65 leading-relaxed">
            This is the engine's real floor formula running in your browser. Change the costs and fees — the recommended price re-bounds itself instantly.
          </p>
          <div data-reveal className="mt-14"><FloorPlayground /></div>
        </section>

        {/* ═════ NUMBERS ═════ */}
        <section className="px-5 sm:px-10 py-20 max-w-[1500px] mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-rule">
            {[
              { n: 6, suf: '', label: 'coordinated agents' },
              { n: 15, suf: '%', pre: '±', label: 'max price move per cycle' },
              { n: 7, suf: '-day', label: 'seasonality in the forecast' },
              { n: 0, suf: '', label: 'prices sent below your floor' },
            ].map((s, i) => (
              <div key={i} data-reveal className="py-10 sm:py-14 pr-6 border-b border-rule lg:border-b-0 lg:border-r last:border-r-0 lg:pl-8 first:pl-0">
                <div className="font-serif-display text-[clamp(3.5rem,8vw,7rem)] leading-none text-charcoal">
                  {s.pre}<span data-count={s.n}>0</span><span className="text-cobalt">{s.suf}</span>
                </div>
                <div className="mt-3 font-mono-tech text-[11px] uppercase tracking-[0.18em] text-slate">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ═════ ROLES ═════ */}
        <section id="access" className="px-5 sm:px-10 py-28 sm:py-40 max-w-[1500px] mx-auto">
          <Label n="04">Access</Label>
          <Lines className="split-lines mt-6 font-serif-display text-[clamp(2.6rem,7vw,6.5rem)] leading-[0.95] tracking-[-0.02em]" lines={['Everyone sees', <em key="e" className="text-persimmon">exactly what they should.</em>]} />
          <p data-reveal className="mt-6 max-w-xl text-charcoal/65 leading-relaxed">Pick a role and step straight into the live command center — permissions are enforced by the server, not just hidden in the UI.</p>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5" style={{ perspective: 1200 }}>
            {ROLES.map((r) => (
              <button
                key={r.role}
                onClick={(e) => go(r.role, e)}
                data-cursor="Enter"
                data-reveal
                style={{ ['--tint' as string]: r.tint }}
                className="tilt relative text-left rounded-3xl glass-panel p-7 min-h-[260px] flex flex-col justify-between overflow-hidden group"
              >
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-full border flex items-center justify-center font-serif-display text-xl"                   style={{ borderColor: `color-mix(in srgb, ${r.tint} 40%, transparent)`, color: r.tint }}>{r.title[0]}</span>
                  <ArrowUpRight className="w-5 h-5 text-mist group-hover:text-cobalt group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <div className="relative">
                  <div className="font-mono-tech text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: r.tint }}>{r.role.replace('_', ' ')}</div>
                  <h3 className="font-serif-display text-3xl">{r.title}</h3>
                  <p className="mt-2 text-sm text-charcoal/60 leading-relaxed">{r.body}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ═════ CTA ═════ */}
        <section className="relative px-5 sm:px-10 pt-16 pb-24 sm:pb-32 max-w-[1500px] mx-auto text-center">
          <div className="closing-visual relative mx-auto w-[min(70vw,380px)] aspect-square" aria-hidden="true">
            <div className="absolute inset-0 rounded-full bg-cobalt/15 blur-[90px] animate-pulse-glow" />
            <IntelligenceOrb3D interactive size="hero" intensity={1.2} className="w-full h-full" />
          </div>
          <Lines className="split-lines -mt-4 font-serif-display text-[clamp(3rem,11vw,10rem)] leading-[0.9] tracking-[-0.03em]" lines={['Understand your market.', <em key="e" className="text-transparent bg-clip-text bg-gradient-to-r from-cobalt to-persimmon pr-[0.08em]">Protect your margins.</em>]} />
          <div data-reveal className="mt-12 flex justify-center">
            <Magnetic strength={0.4}>
              <button onClick={(e) => go(undefined, e)} data-cursor="Enter" className="cta-btn group px-10 py-5 rounded-full bg-cobalt text-white text-base font-semibold flex items-center gap-3 hover:bg-cobalt/90 transition-colors">
                Enter the Command Center <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
              </button>
            </Magnetic>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-rule bg-sand/75 backdrop-blur-md">
        <div className="max-w-[1500px] mx-auto px-5 sm:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono-tech text-[11px] uppercase tracking-[0.15em] text-mist">
          <span className="flex items-center gap-2"><Radar className="w-3.5 h-3.5 text-cobalt" /> RestaurantIQ · runs on a demonstration dataset</span>
          <span>Gemini 2.5 Flash + deterministic math</span>
          <button onClick={() => lenisRef.current?.scrollTo(0, { duration: 1.8 })} data-cursor="Top" className="hover:text-charcoal transition-colors">Back to top ↑</button>
        </div>
      </footer>
    </div>
  );
};
