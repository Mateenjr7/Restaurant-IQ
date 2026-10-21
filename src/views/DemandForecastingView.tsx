/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FinancialTooltip } from '../components/Tooltip.tsx';
import {
  CalendarCheck,
  TrendingUp,
  BarChart3,
  Sparkles,
  Info,
  Clock,
  ChevronRight,
  Flame,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { DemandForecastItem } from '../../server/types.ts';

interface DemandForecastingProps {
  menuItems: any[];
  currencySymbol?: string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onOpenCopilot: (prompt?: string) => void;
}

export const DemandForecastingView: React.FC<DemandForecastingProps> = ({
  menuItems,
  currencySymbol = '₹',
  authFetch,
  onOpenCopilot,
}) => {
  const [selectedItemId, setSelectedItemId] = useState(menuItems[0]?.id || '');
  const [forecast, setForecast] = useState<DemandForecastItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeItem = menuItems.find((m) => m.id === selectedItemId) || menuItems[0];

  useEffect(() => {
    if (!selectedItemId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    authFetch(`/api/forecasting?itemId=${encodeURIComponent(selectedItemId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch demand forecast`);
        return res.json();
      })
      .then((data: DemandForecastItem) => {
        if (isMounted) {
          setForecast(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Forecast retrieval error');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedItemId, authFetch]);

  const dailyBaseline = forecast
    ? forecast.historicalDailyAverage
    : Math.round((activeItem?.historicalSalesLast30Days || 0) / 30);

  const timeSlots = [
    { slot: '12:00 - 15:00 (Lunch Rush)', share: 35, orders: Math.round(dailyBaseline * 0.35) },
    { slot: '15:00 - 18:30 (Afternoon Tea/Snacks)', share: 12, orders: Math.round(dailyBaseline * 0.12) },
    { slot: '18:30 - 23:00 (Prime Dinner Feast)', share: 48, orders: Math.round(dailyBaseline * 0.48) },
    { slot: '23:00 - 01:00 (Late Night Cravings)', share: 5, orders: Math.round(dailyBaseline * 0.05) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDD7CA]">
        <div>
          <div className="inline-flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-serif-display text-[#1B1F2A] flex items-center gap-2.5">
              <CalendarCheck className="w-6 h-6 text-[#2447D4]" />
              <span>Demand Forecasting & Seasonality Engine</span>
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-[#F0ECE3] text-[#2447D4] border border-[#CBC4B3]">
              Out-of-Sample Validated
            </span>
          </div>
          <p className="text-xs text-[#4A5164] font-sans-ui max-w-2xl">
            Deterministic Holt-Winters additive time series model capturing weekly 7-day seasonality, meal velocity curves, and batch prep scheduling.
          </p>
        </div>

        <button
          onClick={() => onOpenCopilot(`Analyze demand surge patterns for ${activeItem?.name}`)}
          className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] border border-[#CBC4B3] text-xs font-semibold text-[#1B1F2A] flex items-center gap-1.5 transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#2447D4]" />
          <span>AI Forecast Insights</span>
        </button>
      </div>

      {/* Model Transparency & Evaluation Card */}
      <div className="p-5 enterprise-panel border border-[#CBC4B3] flex flex-col md:flex-row md:items-center justify-between gap-5 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E8E3D8] border border-[#CBC4B3] flex items-center justify-center text-[#2447D4] shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-[#1B1F2A] flex items-center gap-2">
              <span>Model: {forecast?.modelType || 'Holt-Winters Additive Seasonality'}</span>
              {forecast?.isSyntheticDemoData && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#FFF4E5] text-[#8A5700] border border-[#E6C995]">
                  Synthetic demo data
                </span>
              )}
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#2447D4]/10 text-[#2447D4] font-mono-tech">
                Modelled Estimate
              </span>
            </div>
            <div className="text-[11px] text-[#4A5164] mt-0.5 font-mono-tech">
              {forecast?.validationStatus || 'Evaluating held-out historical observations...'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 font-mono-tech text-xs">
          <div>
            <span className="text-[#5F667A] block text-[10px] uppercase">Mean Absolute Error (MAE)</span>
            {forecast?.mae !== null && forecast?.mae !== undefined ? (
              <span className="text-[#14806A] font-bold text-sm">{forecast.mae} orders/day</span>
            ) : (
              <span className="text-[#4A5164] text-xs italic">Validation metrics unavailable</span>
            )}
          </div>
          <div className="pl-6 border-l border-[#DDD7CA]">
            <span className="text-[#5F667A] block text-[10px] uppercase">Root Mean Sq Error (RMSE)</span>
            {forecast?.rmse !== null && forecast?.rmse !== undefined ? (
              <span className="text-[#14806A] font-bold text-sm">{forecast.rmse} orders/day</span>
            ) : (
              <span className="text-[#4A5164] text-xs italic">Validation metrics unavailable</span>
            )}
          </div>
          <div className="pl-6 border-l border-[#DDD7CA]">
            <span className="text-[#5F667A] block text-[10px] uppercase">Forecast Interval</span>
            <span className="text-[#2447D4] font-bold text-sm">95% Empirical CI</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Item Selector & 7-Day Day-of-Week Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Item Selector & 7-Day Velocity Ribbon (7 cols) */}
        <div className="lg:col-span-7 space-y-5 p-6 enterprise-panel border border-[#DDD7CA]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#4A5164] font-mono-tech">
              Select Culinary SKU for Velocity Forecast
            </label>
            <span className="text-xs text-[#2447D4] font-semibold font-mono-tech">
              Trend: {activeItem?.demandTrend?.toUpperCase() || 'STEADY'}
            </span>
          </div>

          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="w-full bg-[#F0ECE3] border border-[#CBC4B3] rounded-xl px-4 py-2.5 text-xs text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
          >
            {menuItems.map((item) => (
              <option key={item.id} value={item.id} className="bg-[#FFFFFF] text-[#1B1F2A]">
                {item.name} ({item.historicalSalesLast30Days} orders/mo) — {item.category}
              </option>
            ))}
          </select>

          {/* 7-Day Day of Week Forecast Cards */}
          <div className="space-y-3 pt-3">
            <div className="flex items-center justify-between text-xs font-semibold text-[#1B1F2A]">
              <span>7-Day Forward Order Trajectory</span>
              <span className="text-[#4A5164] font-mono-tech">Baseline: {dailyBaseline} orders/day</span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-[#5F667A] space-y-2">
                <RefreshCw className="w-5 h-5 text-[#2447D4] animate-spin" />
                <span>Generating Holt-Winters forward horizon...</span>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : forecast?.hasForecastData === false ? (
              <div className="py-12 text-center text-xs text-[#5F667A]">
                No forecast is available because this item has no valid historical order series or recorded order baseline.
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {(forecast?.next7DaysForecast || []).map((d, idx) => {
                  const isHigh = d.forecastedOrders >= dailyBaseline * 1.25;
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl text-center space-y-1 transition-all ${
                        isHigh
                          ? 'bg-[#2447D4]/15 border border-[#2447D4]/40 shadow-sm'
                          : 'enterprise-raised border border-[#CBC4B3]'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-[#1B1F2A]">{d.dayOfWeek}</div>
                      <div className={`text-base font-serif-display font-bold ${isHigh ? 'text-[#2447D4]' : 'text-[#1B1F2A]'}`}>
                        {d.forecastedOrders}
                      </div>
                      <div className="text-[9px] font-mono-tech text-[#5F667A]">
                        [{d.lowerBound}–{d.upperBound}]
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model Assumptions & Kitchen Implications */}
          <div className="p-4 rounded-xl enterprise-raised space-y-2 text-xs border border-[#CBC4B3]">
            <div className="font-semibold text-[#1B1F2A] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#14806A]" />
              <span>Documented Model Assumptions</span>
            </div>
            <ul className="text-[11px] text-[#4A5164] space-y-1 list-disc list-inside leading-relaxed font-sans-ui">
              {(forecast?.assumptions || [
                'Additive Holt-Winters parameters: alpha=0.25 (level), beta=0.08 (trend), gamma=0.30 (seasonality)',
                'MAE and RMSE calculated strictly from actual prediction residuals over held-out validation segment',
                'Forecasts are estimates governed by restaurant seating capacity and delivery aggregator availability',
              ]).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: Time-of-Day Meal Slots & Dynamic Yield Opportunity (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="p-6 enterprise-panel space-y-4 border border-[#DDD7CA]">
            <h3 className="text-sm font-semibold text-[#1B1F2A] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2447D4]" />
              <span>Illustrative Time-of-Day Allocation</span>
            </h3>
            <p className="text-[10px] text-[#5F667A]">
              Assumed planning shares, not measured hourly sales. {forecast?.isSyntheticDemoData ? 'Displayed volume uses synthetic demo data.' : ''}
            </p>
            <div className="space-y-3">
              {timeSlots.map((ts, idx) => (
                <div key={idx} className="p-3.5 enterprise-raised rounded-xl space-y-1.5 border border-[#CBC4B3]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#1B1F2A]">{ts.slot}</span>
                    <span className="font-mono-tech text-[#2447D4] font-semibold">{ts.share}% of daily sales</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#E8E3D8] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#2447D4] to-[#4D6BEA] rounded-full"
                      style={{ width: `${ts.share}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-[#5F667A] flex justify-between font-mono-tech pt-0.5">
                    <span>{forecast?.hasForecastData ? `Est. volume: ~${ts.orders} orders` : 'Volume estimate unavailable'}</span>
                    <span className={ts.share > 40 ? 'text-[#14806A]' : 'text-[#5F667A]'}>
                      {ts.share > 40 ? 'Peak Dinner Yield' : 'Off-peak slot'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
