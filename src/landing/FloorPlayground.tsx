import React, { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';

/**
 * Interactive version of the engine's real economic-floor formula (see README §2):
 *   P_floor = ceil( (C_var + M_min) / ((1 - discount) * (1 - feeRate)) )
 * Recommended price = competitor median, clamped into [floor, current * (1 ± L)].
 */
const COMPETITOR_MEDIAN = 340;
const STEP_LIMIT = 0.15;

interface SliderProps { label: string; hint: string; value: number; min: number; max: number; step?: number; fmt: (n: number) => string; onChange: (n: number) => void }
const Slider: React.FC<SliderProps> = ({ label, hint, value, min, max, step = 1, fmt, onChange }) => (
  <label className="block group" data-cursor="Drag">
    <div className="flex items-baseline justify-between mb-3">
      <span className="text-sm text-charcoal">{label}<span className="block text-[11px] text-mist font-mono-tech mt-0.5">{hint}</span></span>
      <span className="font-mono-tech text-lg text-persimmon tabular-nums">{fmt(value)}</span>
    </div>
    <input className="riq-range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
  </label>
);

export const FloorPlayground: React.FC = () => {
  const [cost, setCost] = useState(150);
  const [minMargin, setMinMargin] = useState(45);
  const [discount, setDiscount] = useState(10);
  const [fee, setFee] = useState(22);
  const [current, setCurrent] = useState(320);

  const r = useMemo(() => {
    const floor = Math.ceil((cost + minMargin) / ((1 - discount / 100) * (1 - fee / 100)));
    const lo = current * (1 - STEP_LIMIT);
    const hi = current * (1 + STEP_LIMIT);
    const stepBlocked = floor > hi;
    const lower = Math.max(floor, lo);
    const rec = Math.round(Math.min(Math.max(COMPETITOR_MEDIAN, lower), Math.max(hi, lower)));
    const net = rec * (1 - discount / 100) * (1 - fee / 100);
    const contribution = net - cost;
    const status: 'safe' | 'step' | 'below' = stepBlocked ? 'step' : floor > COMPETITOR_MEDIAN ? 'below' : 'safe';
    return { floor, lo, hi, rec, net, contribution, margin: net > 0 ? (contribution / net) * 100 : 0, status };
  }, [cost, minMargin, discount, fee, current]);

  const axisMin = 100, axisMax = 700;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - axisMin) / (axisMax - axisMin)) * 100))}%`;

  const statusMeta = {
    safe: { Icon: ShieldCheck, text: 'Safe to apply', cls: 'text-teal border-teal/30 bg-teal/10' },
    below: { Icon: AlertTriangle, text: 'Market is below your floor — hold at floor', cls: 'text-persimmon border-persimmon/30 bg-persimmon/10' },
    step: { Icon: ShieldAlert, text: 'Blocked — needs admin step override', cls: 'text-[#C23B34] border-[#C23B34]/30 bg-[#C23B34]/10' },
  }[r.status];

  return (
    <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
      <div className="lg:col-span-5 space-y-8">
        <Slider label="Ingredient + prep cost" hint="C_variable per portion" value={cost} min={40} max={400} step={5} fmt={(n) => `₹${n}`} onChange={setCost} />
        <Slider label="Minimum profit you accept" hint="M_min per portion" value={minMargin} min={0} max={150} step={5} fmt={(n) => `₹${n}`} onChange={setMinMargin} />
        <Slider label="Customer discount" hint="discountPct" value={discount} min={0} max={30} fmt={(n) => `${n}%`} onChange={setDiscount} />
        <Slider label="Delivery + payment fees" hint="commission 20% + processing 2%" value={fee} min={0} max={35} fmt={(n) => `${n}%`} onChange={setFee} />
        <Slider label="Today's menu price" hint="P_current" value={current} min={150} max={600} step={5} fmt={(n) => `₹${n}`} onChange={setCurrent} />
      </div>

      <div className="lg:col-span-7">
        <div className="glass-panel rounded-3xl p-6 sm:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono-tech text-[11px] uppercase tracking-[0.2em] text-slate">Live engine output</span>
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${statusMeta.cls}`} role="status">
              <statusMeta.Icon className="w-3.5 h-3.5" /> {statusMeta.text}
            </span>
          </div>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-6">
            <div>
              <div className="font-mono-tech text-[10px] uppercase tracking-widest text-mist">Economic floor</div>
              <div className="font-serif-display text-5xl sm:text-6xl text-charcoal tabular-nums">₹{r.floor}</div>
            </div>
            <div>
              <div className="font-mono-tech text-[10px] uppercase tracking-widest text-mist">Recommended</div>
              <div className="font-serif-display text-5xl sm:text-6xl text-cobalt tabular-nums italic">₹{r.rec}</div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="font-mono-tech text-[10px] uppercase tracking-widest text-mist">You keep / portion</div>
              <div className={`font-serif-display text-5xl sm:text-6xl tabular-nums ${r.contribution >= minMargin ? 'text-persimmon' : 'text-[#C23B34]'}`}>₹{Math.round(r.contribution)}</div>
              <div className="font-mono-tech text-[11px] text-mist">{r.margin.toFixed(1)}% net margin</div>
            </div>
          </div>

          {/* Price ladder */}
          <div className="mt-12 mb-5 relative h-20" aria-hidden="true">
            <div className="absolute left-0 right-0 top-10 h-px bg-rule" />
            {/* allowed step window */}
            <div className="absolute top-[34px] h-3 rounded-full bg-slate/25 border border-slate/40 transition-all duration-300" style={{ left: pos(r.lo), width: `calc(${pos(r.hi)} - ${pos(r.lo)})` }} />
            {/* forbidden zone */}
            <div className="absolute top-[30px] h-5 left-0 rounded-l-full bg-[repeating-linear-gradient(135deg,rgba(194,59,52,.35)_0_4px,transparent_4px_8px)] transition-all duration-300" style={{ width: pos(r.floor) }} />
            {[
              { v: r.floor, c: '#C23B34', up: false },
              { v: current, c: '#1B1F2A', up: true },
              { v: COMPETITOR_MEDIAN, c: '#4A5164', up: false },
              { v: r.rec, c: '#2447D4', up: true },
            ].map((m, i) => (
              <span key={i} className="absolute -translate-x-1/2 transition-all duration-300 block w-3 h-3 rounded-full" style={{ left: pos(m.v), top: m.up ? 14 : 52, background: m.c, boxShadow: `0 0 14px ${m.c}`, border: '2px solid #F6F3ED' }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono-tech text-[11px] text-charcoal/70">
            {[
              ['#C23B34', 'Floor', r.floor],
              ['#1B1F2A', 'Today', current],
              ['#4A5164', 'Market median', COMPETITOR_MEDIAN],
              ['#2447D4', 'Recommended', r.rec],
            ].map(([c, t, v]) => (
              <span key={t as string} className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: c as string }} />{t} ₹{Math.round(v as number)}</span>
            ))}
          </div>

          <p className="mt-8 text-sm text-charcoal/65 leading-relaxed max-w-xl">
            The engine never recommends below the red zone, and never moves more than ±{STEP_LIMIT * 100}% in a cycle (green band). Market median here is a fixed ₹{COMPETITOR_MEDIAN}; in the product it comes from portion-normalised competitor observations.
          </p>
          <code className="mt-5 block font-mono-tech text-[11px] text-slate bg-sand border border-rule rounded-xl px-4 py-3 overflow-x-auto whitespace-nowrap">
            P_floor = ⌈ (C_var + M_min) / ((1 − discount) × (1 − fee)) ⌉ = ⌈ ({cost} + {minMargin}) / ({(1 - discount / 100).toFixed(2)} × {(1 - fee / 100).toFixed(2)}) ⌉ = ₹{r.floor}
          </code>
        </div>
      </div>
    </div>
  );
};
