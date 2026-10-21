/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { CountUp } from '../components/CountUp.tsx';
import { FinancialTooltip } from '../components/Tooltip.tsx';
import { Magnetic } from '../landing/Magnetic.tsx';
import { ArrowRight, ChevronRight, RefreshCw, Building2, Sparkles, AlertCircle } from 'lucide-react';

interface OverviewDashboardProps {
  metrics: any;
  recommendations: any[];
  menuItems?: any[];
  agents: any[];
  inventory: any[];
  currencySymbol: string;
  activeOutlet?: any;
  onNavigate: (view: string) => void;
  onApproveRec: (id: string) => Promise<void> | void;
  onOpenCopilot: (prompt?: string) => void;
  onRefreshData?: () => void;
}

type DayPoint = { date: string; sales: number; profit: number; orders: number };
type ForecastPoint = { date: string; label: string; sales: number; low: number; high: number };

const RANGES = [14, 30, 60] as const;
const CATEGORY_COLORS = ['#2447D4', '#C2512F', '#14806A', '#A8650F', '#4A5164'];
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const shortDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/* ───────────────────────── Sales trend chart ───────────────────────── */

interface TrendChartProps {
  actual: DayPoint[];
  forecast: ForecastPoint[];
  showSales: boolean;
  showProfit: boolean;
  showForecast: boolean;
  currencySymbol: string;
  rangeKey: number;
}

const W = 720, H = 300, PL = 52, PR = 14, PT = 14, PB = 30;

const TrendChart: React.FC<TrendChartProps> = ({ actual, forecast, showSales, showProfit, showForecast, currencySymbol, rangeKey }) => {
  const [hover, setHover] = useState<number | null>(null);
  const frame = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const fc = showForecast && showSales ? forecast : [];
  const total = actual.length + fc.length;
  const compact = useMemo(() => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }), []);

  const maxVal = useMemo(() => {
    const vals: number[] = [];
    if (showSales) actual.forEach((p) => vals.push(p.sales));
    if (showProfit) actual.forEach((p) => vals.push(p.profit));
    fc.forEach((p) => vals.push(p.high));
    const m = Math.max(1, ...vals);
    const mag = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / mag) * mag; // round up to a tidy ceiling
  }, [actual, fc, showSales, showProfit]);

  const x = (i: number) => PL + (total <= 1 ? 0 : (i / (total - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - v / maxVal) * (H - PT - PB);
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const salesPath = line(actual.map((p) => p.sales));
  const profitPath = line(actual.map((p) => p.profit));
  const lastActual = actual.length - 1;
  const forecastPath = fc.length
    ? `M${x(lastActual).toFixed(1)} ${y(actual[lastActual].sales).toFixed(1)} ` +
      fc.map((p, i) => `L${x(lastActual + 1 + i).toFixed(1)} ${y(p.sales).toFixed(1)}`).join(' ')
    : '';
  const band = fc.length
    ? `M${x(lastActual).toFixed(1)} ${y(actual[lastActual].sales).toFixed(1)} ` +
      fc.map((p, i) => `L${x(lastActual + 1 + i).toFixed(1)} ${y(p.high).toFixed(1)}`).join(' ') +
      ' ' +
      [...fc].reverse().map((p, i) => `L${x(lastActual + fc.length - i).toFixed(1)} ${y(p.low).toFixed(1)}`).join(' ') +
      ' Z'
    : '';
  const areaPath = showSales ? `${salesPath} L${x(lastActual).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : '';

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxVal);
  const labelEvery = Math.max(1, Math.ceil(total / 6));

  const pointAt = (i: number) => {
    if (i <= lastActual) {
      const p = actual[i];
      return { date: p.date, sales: p.sales, profit: p.profit, isForecast: false, low: 0, high: 0 };
    }
    const f = fc[i - lastActual - 1];
    return { date: f.date, sales: f.sales, profit: 0, isForecast: true, low: f.low, high: f.high };
  };

  const setFromClientX = (clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const px = ((clientX - b.left) / b.width) * W;
    const idx = Math.round(((px - PL) / (W - PL - PR)) * (total - 1));
    const clamped = Math.max(0, Math.min(total - 1, idx));
    setHover((cur) => (cur === clamped ? cur : clamped));
  };
  const onMove = (e: React.PointerEvent) => {
    const cx = e.clientX;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setFromClientX(cx));
  };
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(total - 1, (h ?? -1) + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? total) - 1)); }
    if (e.key === 'Escape') setHover(null);
  };

  const hp = hover !== null && hover < total ? pointAt(hover) : null;
  const money = (n: number) => `${currencySymbol}${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <div
      ref={wrap}
      className="relative rounded-xl"
      tabIndex={0}
      role="group"
      aria-label={`Daily sales chart. ${actual.length} days of history${fc.length ? ` and a ${fc.length}-day forecast` : ''}. Use the left and right arrow keys to read each day.`}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible select-none" aria-hidden="true">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="#1B1F2A" strokeOpacity={i === 0 ? 0.25 : 0.08} strokeWidth="1" />
            <text x={PL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5F667A" fontFamily="JetBrains Mono, monospace">
              {currencySymbol}{compact.format(t)}
            </text>
          </g>
        ))}

        {Array.from({ length: total }, (_, i) => i).filter((i) => i % labelEvery === 0 || i === total - 1).map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === total - 1 ? 'end' : 'middle'} fontSize="11" fill="#5F667A" fontFamily="JetBrains Mono, monospace">
            {shortDate(pointAt(i).date)}
          </text>
        ))}

        {fc.length > 0 && <rect x={x(lastActual)} y={PT} width={x(total - 1) - x(lastActual)} height={H - PT - PB} fill="#2447D4" fillOpacity="0.04" />}
        {band && <path d={band} fill="#2447D4" fillOpacity="0.14" />}

        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B1F2A" stopOpacity="0.12" />
            <stop offset="1" stopColor="#1B1F2A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path key={`a${rangeKey}`} d={areaPath} fill="url(#salesFill)" />}
        {showSales && <path key={`s${rangeKey}`} d={salesPath} pathLength={1} className="chart-draw" fill="none" stroke="#1B1F2A" strokeWidth="2" strokeLinejoin="round" />}
        {showProfit && <path key={`p${rangeKey}`} d={profitPath} pathLength={1} className="chart-draw" fill="none" stroke="#2447D4" strokeWidth="2.25" strokeLinejoin="round" />}
        {forecastPath && <path d={forecastPath} fill="none" stroke="#2447D4" strokeWidth="2" strokeDasharray="5 4" />}

        {hp && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="#1B1F2A" strokeOpacity="0.3" strokeDasharray="3 3" />
            {showSales && <circle cx={x(hover)} cy={y(hp.sales)} r="4.5" fill="#F6F3ED" stroke="#1B1F2A" strokeWidth="2" />}
            {showProfit && !hp.isForecast && <circle cx={x(hover)} cy={y(hp.profit)} r="4.5" fill="#F6F3ED" stroke="#2447D4" strokeWidth="2" />}
          </g>
        )}
      </svg>

      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[10rem] rounded-xl border border-[#DDD7CA] bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{ left: `${Math.min(70, Math.max(2, (x(hover) / W) * 100 + 2))}%` }}
        >
          <div className="font-mono-tech text-[10px] text-[#5F667A]">{shortDate(hp.date)}{hp.isForecast ? ' · forecast' : ''}</div>
          <div className="mt-1 flex justify-between gap-4"><span className="text-[#4A5164]">{hp.isForecast ? 'Expected sales' : 'Sales'}</span><span className="font-semibold tabular-nums">{money(hp.sales)}</span></div>
          {hp.isForecast ? (
            <div className="flex justify-between gap-4 text-[#5F667A]"><span>Likely range</span><span className="tabular-nums">{money(hp.low)}–{money(hp.high)}</span></div>
          ) : (
            <div className="flex justify-between gap-4"><span className="text-[#2447D4]">Profit kept</span><span className="font-semibold tabular-nums text-[#2447D4]">{money(hp.profit)}</span></div>
          )}
        </div>
      )}
    </div>
  );
};

/* ───────────────────────────── Overview ───────────────────────────── */

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  metrics,
  recommendations,
  menuItems = [],
  agents,
  inventory,
  currencySymbol = '₹',
  activeOutlet,
  onNavigate,
  onApproveRec,
  onOpenCopilot,
  onRefreshData,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLElement>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [showSales, setShowSales] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [showForecast, setShowForecast] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastPoint[] | null>(null);
  const [forecastFailed, setForecastFailed] = useState(false);
  const [hoverCat, setHoverCat] = useState<string | null>(null);

  const pendingRecs = recommendations.filter((r) => r.status === 'pending');
  const opportunityAmount: number | undefined = metrics?.expectedMonthlyOpportunity;
  const money = (n: number) => `${currencySymbol}${Math.round(n).toLocaleString('en-IN')}`;
  const loading = !metrics && menuItems.length === 0;

  /* One orchestrated entrance, cleaned up with the component. */
  useEffect(() => {
    if (loading || prefersReducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('[data-intro-line]', { yPercent: 105, duration: 0.8, stagger: 0.09 })
        .from('[data-intro-fade]', { opacity: 0, y: 12, duration: 0.6, stagger: 0.07 }, '-=0.45')
        .from('[data-stage]', { opacity: 0, y: 28, duration: 0.8, stagger: 0.12 }, '-=0.5');
    }, root);
    return () => ctx.revert();
  }, [loading]);

  /* Cursor-driven depth in the intro: soft light + layered rings. Pointer state never touches React. */
  useEffect(() => {
    const el = intro.current;
    if (loading || !el || prefersReducedMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const rings = Array.from(el.querySelectorAll<HTMLElement>('[data-depth]'));
    const qx = rings.map((r) => gsap.quickTo(r, 'x', { duration: 1.1, ease: 'power3.out' }));
    const qy = rings.map((r) => gsap.quickTo(r, 'y', { duration: 1.1, ease: 'power3.out' }));
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      const nx = (e.clientX - b.left) / b.width - 0.5;
      const ny = (e.clientY - b.top) / b.height - 0.5;
      el.style.setProperty('--lx', `${e.clientX - b.left}px`);
      el.style.setProperty('--ly', `${e.clientY - b.top}px`);
      rings.forEach((r, i) => {
        const d = Number(r.dataset.depth || 0);
        qx[i](-nx * d);
        qy[i](-ny * d);
      });
    };
    el.addEventListener('pointermove', move, { passive: true });
    return () => el.removeEventListener('pointermove', move);
  }, [loading]);

  /* Real daily series: every menu item's last-60-day orders × its current price (same method as the KPI totals). */
  const daily = useMemo<DayPoint[]>(() => {
    const byDate = new Map<string, DayPoint>();
    menuItems.forEach((item) => {
      const history = item.dailySalesLast60Days?.length ? item.dailySalesLast60Days : item.dailySalesHistory || [];
      history.forEach((d: { date: string; orders: number }) => {
        const row = byDate.get(d.date) || { date: d.date, sales: 0, profit: 0, orders: 0 };
        row.sales += d.orders * item.currentPrice;
        row.profit += d.orders * (item.currentPrice - item.totalVariableCost);
        row.orders += d.orders;
        byDate.set(d.date, row);
      });
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [menuItems]);

  const shown = useMemo(() => daily.slice(-range), [daily, range]);

  /* Seven-day outlook from the server's Holt-Winters forecast, summed across the menu. */
  useEffect(() => {
    if (menuItems.length === 0) return;
    let live = true;
    setForecastFailed(false);
    fetch('/api/forecasting')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((items: any[]) => {
        if (!live) return;
        const byDate = new Map<string, ForecastPoint>();
        items.forEach((f) => {
          const price = menuItems.find((m) => m.id === f.menuItemId)?.currentPrice ?? 0;
          (f.next7DaysForecast || []).forEach((p: any) => {
            const row = byDate.get(p.date) || { date: p.date, label: p.dayOfWeek, sales: 0, low: 0, high: 0 };
            row.sales += p.forecastedOrders * price;
            row.low += p.lowerBound * price;
            row.high += p.upperBound * price;
            byDate.set(p.date, row);
          });
        });
        const today = new Date().toISOString().slice(0, 10);
        setForecast(
          Array.from(byDate.values())
            .filter((point) => point.date > today)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 7)
        );
      })
      .catch(() => { if (live) setForecastFailed(true); });
    return () => { live = false; };
  }, [menuItems]);

  const categoryStats = useMemo(() => {
    if (!menuItems || menuItems.length === 0) return [];
    const grouped: Record<string, { revenue: number; cost: number }> = {};
    menuItems.forEach((item) => {
      const cat = item.category || 'Other';
      if (!grouped[cat]) grouped[cat] = { revenue: 0, cost: 0 };
      const qty = item.historicalSalesLast30Days || 0;
      grouped[cat].revenue += item.currentPrice * qty;
      grouped[cat].cost += item.totalVariableCost * qty;
    });
    const totalRev = Object.values(grouped).reduce((sum, g) => sum + g.revenue, 0) || 1;
    return Object.entries(grouped)
      .map(([name, g]) => ({
        name,
        revenue: g.revenue,
        share: (g.revenue / totalRev) * 100,
        margin: g.revenue > 0 ? ((g.revenue - g.cost) / g.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.share - a.share)
      .map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [menuItems]);

  const handleQuickApprove = async (id: string) => {
    try {
      setApprovingId(id);
      setApproveError(null);
      await onApproveRec(id);
    } catch (err: any) {
      setApproveError(err?.message || 'Could not approve this price. Open the full list to see why.');
    } finally {
      setApprovingId(null);
    }
  };

  const revChange: number | undefined = metrics?.revenueChangePct;
  const periodRev: number = metrics?.periodRevenue ?? 0;
  const diffRevenue = revChange ? Math.round(periodRev * (revChange / (100 + revChange))) : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const headline =
    revChange === undefined || revChange === 0
      ? ['Here is how the', 'last 30 days went.']
      : revChange > 0
        ? [`Sales are up ${revChange}%`, 'on the 30 days before.']
        : [`Sales are down ${Math.abs(revChange)}%`, 'on the 30 days before.'];

  const changeChip = (v?: number) =>
    v === undefined ? null : (
      <span className={`font-mono-tech text-xs ${v >= 0 ? 'text-[#14806A]' : 'text-[#C23B34]'}`}>
        {v >= 0 ? '+' : '−'}{Math.abs(v)}%
      </span>
    );

  const lowStock = inventory.filter((i) => i.status === 'low_stock' || i.status === 'critical');

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-live="polite">
        <div className="h-10 w-2/3 rounded-xl bg-[#E8E3D8] animate-pulse" />
        <div className="h-64 rounded-3xl bg-[#E8E3D8]/70 animate-pulse" />
        <span className="sr-only">Loading your numbers…</span>
      </div>
    );
  }

  return (
    <div ref={root} className="overview-page space-y-10">
      {/* ── Intro ─────────────────────────────────────────── */}
      <section ref={intro} className="overview-intro relative isolate pt-2" style={{ ['--lx' as any]: '70%', ['--ly' as any]: '20%' }}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-6 -top-6 bottom-0 -z-10 rounded-[2rem]"
          style={{ background: 'radial-gradient(420px circle at var(--lx) var(--ly), rgba(36,71,212,.10), transparent 65%)' }}
        />
        <div aria-hidden="true" className="overview-visual pointer-events-none absolute right-0 top-0 hidden h-[17rem] w-[19rem] md:block xl:right-5 xl:h-[19rem] xl:w-[22rem]">
          <div data-depth="18" className="absolute -right-3 -top-5 h-40 w-40 rounded-full border border-dashed border-[#C2512F]/45" />
          <div data-depth="34" className="absolute -right-7 top-8 h-52 w-52 rounded-full border border-[#2447D4]/25" />
          <div data-depth="18" className="overview-photo absolute inset-x-4 bottom-2 top-4 overflow-hidden rounded-[45%_45%_24px_24px] border border-white/70 bg-[#E8E3D8] shadow-[0_30px_70px_-38px_rgba(27,31,42,.5)]">
            <img src="/assets/img/ambience.jpg" alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#101820]/70 via-transparent to-[#2447D4]/10" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-white">
              <div>
                <span className="font-mono-tech text-[9px] uppercase tracking-[.2em] text-white/70">Your restaurant, in focus</span>
                <p className="mt-1 font-serif-display text-2xl leading-none">{activeOutlet?.name?.split('(')[0] || 'The dining room'}</p>
              </div>
              <span className="mb-0.5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[9px] font-mono-tech uppercase tracking-wider backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A8E5C2]" /> In view
              </span>
            </div>
          </div>
          <div data-depth="52" className="absolute left-0 top-24 grid h-12 w-12 place-items-center rounded-full bg-[#2447D4] text-white shadow-lg shadow-[#2447D4]/25">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <div data-intro-fade className="flex flex-wrap items-center gap-3 text-xs text-[#4A5164]">
          <span className="font-mono-tech text-[10px] uppercase tracking-[.2em] text-[#2447D4]">Restaurant intelligence / 01</span>
          <span aria-hidden="true" className="h-3 w-px bg-[#CBC4B3]" />
          <span>{greeting}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD7CA] bg-white/70 px-3 py-1">
            <Building2 className="h-3.5 w-3.5 text-[#2447D4]" aria-hidden="true" />
            <span className="font-medium text-[#1B1F2A]">{activeOutlet?.name?.split('(')[0] || 'Your restaurant'}</span>
          </span>
          <button
            onClick={onRefreshData}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD7CA] bg-white/70 px-3 py-1 transition-colors hover:border-[#2447D4]/50 hover:text-[#1B1F2A]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Refresh numbers
          </button>
        </div>

        <h1 className="overview-headline mt-5 max-w-3xl font-serif-display text-5xl leading-[1.02] tracking-tight text-[#1B1F2A] sm:text-6xl lg:text-7xl">
          {headline.map((l, i) => (
            <span key={i} className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
              <span data-intro-line className="block">{l}</span>
            </span>
          ))}
        </h1>

        <p data-intro-fade className="mt-5 max-w-xl text-sm leading-relaxed text-[#4A5164]">
          {pendingRecs.length > 0 ? (
            <>
              {pendingRecs.length} price {pendingRecs.length === 1 ? 'suggestion is' : 'suggestions are'} waiting for you
              {opportunityAmount ? <>, worth about <strong className="text-[#1B1F2A]">{money(opportunityAmount)}</strong> extra a month (estimate)</> : null}.
              {' '}Nothing changes until you approve it, and no price goes below your safe minimum.
            </>
          ) : (
            <>Nothing is waiting for your review. Run the assistants to look for new price changes.</>
          )}
        </p>

        <div data-intro-fade className="mt-6 flex flex-wrap items-center gap-3">
          <Magnetic strength={0.2}>
            <button
              onClick={() => onNavigate('recommendations')}
              className="inline-flex items-center gap-2 rounded-full bg-[#2447D4] px-6 py-3 text-sm font-semibold text-[#F6F3ED] shadow-[0_16px_30px_-16px_rgba(36,71,212,.8)] transition-colors hover:bg-[#1C3AB5]"
            >
              {pendingRecs.length > 0 ? `Review ${pendingRecs.length} price ${pendingRecs.length === 1 ? 'suggestion' : 'suggestions'}` : 'Open pricing & margins'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </Magnetic>
          <button
            onClick={() => onOpenCopilot('Summarize the top contribution margin opportunities across our menu')}
            className="inline-flex items-center gap-2 rounded-full border border-[#CBC4B3] bg-white/70 px-5 py-3 text-sm font-medium text-[#1B1F2A] transition-colors hover:border-[#2447D4]/50"
          >
            <Sparkles className="h-4 w-4 text-[#2447D4]" aria-hidden="true" />
            Explain it simply
          </button>
        </div>
      </section>

      {/* ── Trend + headline numbers ─────────────────────── */}
      <section className="overview-atlas grid gap-6 lg:grid-cols-12">
        <div data-stage className="overview-chart-panel enterprise-panel p-5 sm:p-7 lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 font-mono-tech text-[10px] uppercase tracking-[.2em] text-[#2447D4]">Performance atlas / 30-day view</div>
              <h2 className="font-serif-display text-3xl leading-tight text-[#1B1F2A] sm:text-4xl">The shape of your business</h2>
              <p className="mt-1 max-w-md text-xs text-[#5F667A]">
                Sales are orders × current menu price. The shaded band is the likely range for the next seven days.
              </p>
            </div>
            <div role="group" aria-label="Time range" className="inline-flex rounded-full border border-[#DDD7CA] bg-[#F0ECE3] p-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${range === r ? 'bg-white text-[#1B1F2A] shadow-sm' : 'text-[#5F667A] hover:text-[#1B1F2A]'}`}
                >
                  {r} days
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {[
              { label: 'Sales', on: showSales, set: setShowSales, swatch: '#1B1F2A' },
              { label: 'Profit kept', on: showProfit, set: setShowProfit, swatch: '#2447D4' },
              { label: 'Next 7 days', on: showForecast, set: setShowForecast, swatch: '#4D6BEA' },
            ].map((s) => (
              <button
                key={s.label}
                aria-pressed={s.on}
                onClick={() => s.set(!s.on)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${s.on ? 'border-[#CBC4B3] bg-white text-[#1B1F2A]' : 'border-transparent bg-transparent text-[#5F667A] line-through'}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s.swatch, opacity: s.on ? 1 : 0.35 }} aria-hidden="true" />
                {s.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {shown.length === 0 ? (
              <div className="grid h-56 place-items-center rounded-2xl border border-dashed border-[#CBC4B3] text-center text-sm text-[#5F667A]">
                <div>
                  <AlertCircle className="mx-auto mb-2 h-5 w-5 text-[#A8650F]" aria-hidden="true" />
                  No daily sales history yet.<br />Add menu items with sales to see the trend.
                </div>
              </div>
            ) : (
              <TrendChart
                actual={shown}
                forecast={forecast || []}
                showSales={showSales}
                showProfit={showProfit}
                showForecast={showForecast && !!forecast && forecast.length > 0}
                currencySymbol={currencySymbol}
                rangeKey={range}
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F667A]">
            <span>Sample data for the demo restaurant, not live POS sales.</span>
            {forecastFailed && <span className="text-[#C23B34]">The forecast could not be loaded. Showing history only.</span>}
            <button onClick={() => onNavigate('forecasting')} className="inline-flex items-center gap-1 font-medium text-[#2447D4] hover:underline">
              See the full forecast <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="overview-signal-stack space-y-4 lg:col-span-4 lg:-mt-16">
          <div data-stage className="relative overflow-hidden rounded-3xl bg-[#2447D4] p-6 text-[#F6F3ED] shadow-[0_30px_60px_-30px_rgba(36,71,212,.9)]">
            <div aria-hidden="true" className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-white/25" />
            <div aria-hidden="true" className="absolute -right-2 top-2 h-24 w-24 rounded-full border border-dashed border-white/30" />
            <FinancialTooltip
              term="Contribution Margin %"
              definition="Portion of sales revenue remaining after direct food and packaging costs."
              formula="(Revenue − Variable Costs) / Revenue × 100"
            >
              <span className="text-sm font-medium text-[#F6F3ED]">Profit kept after food costs</span>
            </FinancialTooltip>
            <div className="mt-3 font-serif-display text-7xl leading-none tabular-nums">
              {metrics?.contributionMarginPct !== undefined ? <CountUp value={metrics.contributionMarginPct} decimals={1} suffix="%" /> : '—'}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/25 pt-3 text-xs">
              <span className="text-[#F6F3ED]/80">Total profit, 30 days</span>
              <span className="font-mono-tech">{metrics?.periodContribution !== undefined ? money(metrics.periodContribution) : '—'}</span>
            </div>
          </div>

          <div data-stage className="enterprise-panel divide-y divide-[#DDD7CA] p-2">
            <div className="p-4">
              <div className="flex items-center justify-between text-xs text-[#4A5164]">
                <FinancialTooltip term="Net Recognized Revenue" definition="Gross customer sales across dine-in and delivery platforms before food costs." formula="Sum(Price × Quantity Sold)">
                  <span className="font-medium text-[#1B1F2A]">Sales, 30 days</span>
                </FinancialTooltip>
                {changeChip(revChange)}
              </div>
              <div className="mt-1 font-serif-display text-4xl tabular-nums text-[#1B1F2A]">
                {metrics?.periodRevenue !== undefined ? <CountUp prefix={currencySymbol} value={metrics.periodRevenue} /> : '—'}
              </div>
              {revChange ? (
                <div className="mt-1 text-[11px] text-[#5F667A]">
                  {diffRevenue >= 0 ? '+' : '−'}{money(Math.abs(diffRevenue))} compared with the 30 days before
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 divide-x divide-[#DDD7CA]">
              <div className="p-4">
                <FinancialTooltip term="Average Order Value" definition="Average gross revenue generated per completed customer check." formula="Total Revenue / Total Orders">
                  <span className="text-xs font-medium text-[#1B1F2A]">Average bill</span>
                </FinancialTooltip>
                <div className="mt-1 font-serif-display text-3xl tabular-nums">{metrics?.averageCheckSize !== undefined ? money(metrics.averageCheckSize) : '—'}</div>
                <div className="mt-0.5">{changeChip(metrics?.checkSizeChangePct)}</div>
              </div>
              <div className="p-4">
                <span className="text-xs font-medium text-[#1B1F2A]">Orders</span>
                <div className="mt-1 font-serif-display text-3xl tabular-nums">{metrics?.totalOrders !== undefined ? metrics.totalOrders.toLocaleString('en-IN') : '—'}</div>
                <div className="mt-0.5">{changeChip(metrics?.ordersChangePct)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Categories + approvals ───────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div data-stage className="enterprise-panel p-5 sm:p-7 lg:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif-display text-2xl text-[#1B1F2A]">Which parts of your menu earn the most</h2>
            <button onClick={() => onNavigate('menu')} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[#2447D4] hover:underline">
              Open your menu <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {categoryStats.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-[#CBC4B3] py-8 text-center text-sm text-[#5F667A]">
              No menu items yet. Add a dish to see how each category earns.
            </p>
          ) : (
            <>
              <div className="mt-6 flex h-4 w-full overflow-hidden rounded-full bg-[#E8E3D8]" role="img" aria-label="Share of sales by category">
                {categoryStats.map((c) => (
                  <div
                    key={c.name}
                    style={{ width: `${c.share}%`, background: c.color, opacity: hoverCat && hoverCat !== c.name ? 0.25 : 1 }}
                    className="h-full transition-opacity duration-300"
                  />
                ))}
              </div>
              <ul className="mt-5 divide-y divide-[#DDD7CA]">
                {categoryStats.map((c) => (
                  <li
                    key={c.name}
                    onPointerEnter={() => setHoverCat(c.name)}
                    onPointerLeave={() => setHoverCat(null)}
                    onFocus={() => setHoverCat(c.name)}
                    onBlur={() => setHoverCat(null)}
                    tabIndex={0}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span className="flex items-center gap-3 font-medium text-[#1B1F2A]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                      {c.name}
                    </span>
                    <span className="flex items-center gap-5 tabular-nums">
                      <span className="hidden text-[#5F667A] sm:inline">{c.share.toFixed(0)}% of sales</span>
                      <span className="w-24 text-right text-[#4A5164]">{money(c.revenue)}</span>
                      <span className="w-20 text-right font-semibold text-[#2447D4]">{c.margin.toFixed(1)}% kept</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div data-stage className="enterprise-panel p-5 sm:p-7">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif-display text-2xl text-[#1B1F2A]">Waiting for you</h2>
              <span className="text-xs text-[#5F667A]">{pendingRecs.length} to review</span>
            </div>

            {approveError && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#C23B34]/30 bg-[#C23B34]/5 p-3 text-xs text-[#C23B34]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{approveError}</span>
              </div>
            )}

            {pendingRecs.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-dashed border-[#CBC4B3] py-8 text-center text-sm text-[#5F667A]">
                You are all caught up. New suggestions appear here after the assistants run.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {pendingRecs.slice(0, 3).map((rec) => (
                  <li key={rec.id} className="enterprise-raised space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium text-[#1B1F2A]">{rec.menuItemName}</div>
                      <div className="flex shrink-0 items-center gap-2 font-mono-tech text-xs">
                        <span className="text-[#5F667A] line-through">{currencySymbol}{rec.currentPrice}</span>
                        <span className="rounded bg-[#2447D4]/10 px-1.5 py-0.5 font-bold text-[#2447D4]">{currencySymbol}{rec.suggestedPrice}</span>
                      </div>
                    </div>
                    <div className="text-[10px] font-mono-tech text-[#5F667A]">
                      {rec.priceDeltaPct > 0 ? '+' : ''}{rec.priceDeltaPct}% · Floor {currencySymbol}{rec.economicFloor} · Last actual change {rec.lastActualPriceChangeAt ? new Date(rec.lastActualPriceChangeAt).toLocaleDateString() : 'not recorded'}
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-[#4A5164]">{rec.reason}</p>
                    {(rec.flagReasons?.length > 0 || rec.customerTrustRisk?.riskLevel) && (
                      <div className={`text-[10px] leading-relaxed ${rec.isBlocked ? 'text-red-600' : 'text-[#A8650F]'}`}>
                        <strong>{rec.isBlocked ? 'Blocked' : `Trust risk: ${rec.customerTrustRisk?.riskLevel || 'insufficient data'}`}</strong>
                        {rec.flagReasons?.length > 0 && <> · {rec.flagReasons.join('; ')}</>}
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-[#DDD7CA] pt-2 text-xs">
                      <span className={`font-mono-tech ${rec.isBlocked ? 'text-red-600' : 'text-[#14806A]'}`}>
                        Floor {currencySymbol}{rec.economicFloor} · {rec.stabilityPolicyStatus || 'insufficient data'} · {Number(rec.cumulativeIncreasePct || 0).toFixed(1)}% cumulative
                      </span>
                      <button
                        onClick={() => handleQuickApprove(rec.id)}
                        disabled={approvingId === rec.id || rec.isBlocked}
                        title={rec.isBlocked ? 'Blocked by mandatory pricing policy' : undefined}
                        className="inline-flex items-center gap-1 rounded-full bg-[#2447D4] px-3.5 py-1.5 text-xs font-semibold text-[#F6F3ED] transition-colors hover:bg-[#1C3AB5] disabled:opacity-50"
                      >
                        {approvingId === rec.id ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> : <>{rec.isBlocked ? 'Blocked' : 'Approve price'}</>}
                        <span className="sr-only"> for {rec.menuItemName}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => onNavigate('recommendations')}
              className="mt-4 w-full rounded-full border border-[#CBC4B3] py-2.5 text-xs font-semibold text-[#1B1F2A] transition-colors hover:border-[#2447D4]/50"
            >
              Open all price suggestions
            </button>
          </div>

          <div data-stage className="enterprise-panel p-5 sm:p-7">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif-display text-2xl text-[#1B1F2A]">
                {agents.length > 0 ? `${agents.length} assistants at work` : 'Assistants'}
              </h2>
              <button onClick={() => onNavigate('agents')} className="text-xs font-medium text-[#2447D4] hover:underline">See what they did</button>
            </div>
            {agents.length === 0 ? (
              <p className="mt-4 text-sm text-[#5F667A]">No assistant activity yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#DDD7CA]">
                {agents.slice(0, 4).map((agent) => (
                  <li key={agent.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-[#1B1F2A]">{agent.name}</div>
                      <div className="truncate text-[#5F667A]">{agent.outputSummary}</div>
                    </div>
                    <span className="shrink-0 font-mono-tech text-[#5F667A]">{agent.lastRun}</span>
                  </li>
                ))}
              </ul>
            )}
            {lowStock.length > 0 && (
              <button
                onClick={() => onNavigate('inventory')}
                className="mt-3 flex w-full items-center gap-2 rounded-xl bg-[#A8650F]/10 px-3 py-2 text-left text-xs text-[#A8650F]"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {lowStock.length} {lowStock.length === 1 ? 'ingredient is' : 'ingredients are'} running low. Check inventory.
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
