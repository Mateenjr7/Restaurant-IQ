/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Save,
  CheckCircle2,
  Building2,
  Cpu,
  MapPin,
  Sliders,
} from 'lucide-react';

interface SettingsPolicyProps {
  policy: any;
  outlets?: any[];
  activeOutlet?: any;
  onUpdatePolicy: (updatedPolicy: any) => Promise<void>;
  onSwitchOutlet?: (outletId: string) => Promise<void>;
  menuItems?: any[];
}

export const SettingsPolicyView: React.FC<SettingsPolicyProps> = ({
  policy,
  outlets = [],
  activeOutlet,
  onUpdatePolicy,
  onSwitchOutlet,
  menuItems = [],
}) => {
  const [restaurantName, setRestaurantName] = useState(policy?.restaurantName || 'Saffron & Smoke Grand Dining');
  const [currencySymbol, setCurrencySymbol] = useState(policy?.currencySymbol || '₹');
  const [maxMovementPct, setMaxMovementPct] = useState(Math.round((policy?.maxMovementPct || 0.15) * 100));
  const [minContribution, setMinContribution] = useState(policy?.defaultMinContribution || 60);
  const [roundingStep, setRoundingStep] = useState(policy?.roundingStep || 5);
  const [maxIncreasePct, setMaxIncreasePct] = useState(Math.round((policy?.maxIncreasePct ?? policy?.maxMovementPct ?? 0.15) * 100));
  const [maxDecreasePct, setMaxDecreasePct] = useState(Math.round((policy?.maxDecreasePct ?? policy?.maxMovementPct ?? 0.15) * 100));
  const [minimumDaysBetweenPriceChanges, setMinimumDaysBetweenPriceChanges] = useState(policy?.minimumDaysBetweenPriceChanges ?? 7);
  const [cumulativeIncreaseLimitPct, setCumulativeIncreaseLimitPct] = useState(Math.round((policy?.cumulativeIncreaseLimitPct ?? 0.2) * 100));
  const [cumulativeIncreaseWindowDays, setCumulativeIncreaseWindowDays] = useState(policy?.cumulativeIncreaseWindowDays ?? 30);
  const [trustRiskReviewThresholdPct, setTrustRiskReviewThresholdPct] = useState(Math.round((policy?.trustRiskReviewThresholdPct ?? 0.1) * 100));
  const [protectedMenuItemIds, setProtectedMenuItemIds] = useState<string[]>(policy?.protectedMenuItemIds || []);
  const [protectedCategories, setProtectedCategories] = useState<string[]>(policy?.protectedCategories || []);
  const [loyaltyPriceProtection, setLoyaltyPriceProtection] = useState(Boolean(policy?.loyaltyPriceProtection));
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!policy) return;
    setRestaurantName(policy.restaurantName || '');
    setCurrencySymbol(policy.currencySymbol || '₹');
    setMaxMovementPct(Math.round((policy.maxMovementPct || 0.15) * 100));
    setMinContribution(policy.defaultMinContribution || 60);
    setRoundingStep(policy.roundingStep || 5);
    setMaxIncreasePct(Math.round((policy.maxIncreasePct ?? policy.maxMovementPct ?? 0.15) * 100));
    setMaxDecreasePct(Math.round((policy.maxDecreasePct ?? policy.maxMovementPct ?? 0.15) * 100));
    setMinimumDaysBetweenPriceChanges(policy.minimumDaysBetweenPriceChanges ?? 7);
    setCumulativeIncreaseLimitPct(Math.round((policy.cumulativeIncreaseLimitPct ?? 0.2) * 100));
    setCumulativeIncreaseWindowDays(policy.cumulativeIncreaseWindowDays ?? 30);
    setTrustRiskReviewThresholdPct(Math.round((policy.trustRiskReviewThresholdPct ?? 0.1) * 100));
    setProtectedMenuItemIds(policy.protectedMenuItemIds || []);
    setProtectedCategories(policy.protectedCategories || []);
    setLoyaltyPriceProtection(Boolean(policy.loyaltyPriceProtection));
  }, [policy]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setSaveError(null);
    try {
      await onUpdatePolicy({
        restaurantName,
        currencySymbol,
        maxMovementPct: maxMovementPct / 100,
        defaultMinContribution: Number(minContribution),
        roundingStep: Number(roundingStep),
        maxIncreasePct: maxIncreasePct / 100,
        maxDecreasePct: maxDecreasePct / 100,
        minimumDaysBetweenPriceChanges: Number(minimumDaysBetweenPriceChanges),
        cumulativeIncreaseLimitPct: cumulativeIncreaseLimitPct / 100,
        cumulativeIncreaseWindowDays: Number(cumulativeIncreaseWindowDays),
        trustRiskReviewThresholdPct: trustRiskReviewThresholdPct / 100,
        protectedMenuItemIds,
        protectedCategories,
        loyaltyPriceProtection,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save pricing policies.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Introduction */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#DDD7CA]">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight">
            Governance & Outlets
          </h1>
          <p className="text-xs text-[#4A5164] mt-1.5 font-sans-ui max-w-xl">
            Location-aware outlet configuration, delivery channel commissions, maximum step movement boundaries, and POS synchronization.
          </p>
        </div>

        {saveError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700">{saveError}</div>}

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14806A]/10 text-[#14806A] border border-[#14806A]/20 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Policy Parameters Enforced</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Outlets & Locations (6 cols) */}
        <div className="lg:col-span-6 space-y-5">
          <div className="p-6 enterprise-panel space-y-4">
            <h3 className="text-sm font-semibold text-[#1B1F2A] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#2447D4]" />
              <span>Multi-Outlet Location Hierarchy</span>
            </h3>

            <div className="space-y-3">
              {outlets.map((outlet) => {
                const isActive = outlet.id === policy?.activeOutletId;
                return (
                  <div
                    key={outlet.id}
                    onClick={() => onSwitchOutlet && onSwitchOutlet(outlet.id)}
                    className={`p-4 enterprise-panel cursor-pointer transition-all border ${
                      isActive
                        ? 'border-[#2447D4] bg-[#F0ECE3]'
                        : 'border-[#DDD7CA] hover:border-[#CBC4B3]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-serif-display text-sm text-[#1B1F2A]">{outlet.name}</span>
                      <span className={`text-[10px] font-mono-tech px-2 py-0.5 rounded ${
                        isActive ? 'bg-[#2447D4] text-[#F6F3ED] font-bold' : 'text-[#5F667A]'
                      }`}>
                        {isActive ? 'ACTIVE OUTLET' : 'SWITCH'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#4A5164] mt-1.5 font-mono-tech">
                      <MapPin className="w-3.5 h-3.5 text-[#2447D4]" />
                      <span>{outlet.locality}, {outlet.city} ({outlet.postalCode})</span>
                    </div>

                    <div className="pt-2 mt-2 border-t border-[#DDD7CA] flex items-center justify-between text-[11px] text-[#5F667A] font-mono-tech">
                      <span>Research Radius: {outlet.researchRadiusKm}km</span>
                      <span>Delivery Comm: {outlet.deliveryCommissionPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* POS Integrations */}
          <div className="p-6 enterprise-panel space-y-4">
            <h3 className="text-sm font-semibold text-[#1B1F2A] flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#2447D4]" />
              <span>Connected Data Feeds & POS Status</span>
            </h3>

            <div className="space-y-2.5">
              {[
                { name: 'Toast POS Terminal Feed', status: 'Seeded Demonstration Environment (Emulated)', active: true },
                { name: 'Manual Observation & Audit Pipeline', status: 'Active (Direct Operator Entry)', active: true },
                { name: 'Competitor Menu File / CSV Importer', status: 'Active (Supports CSV Ingestion)', active: true },
                { name: 'Delivery Aggregators (Swiggy / Zomato)', status: 'Requires Enterprise Partner API (Simulated in Demo)', active: false },
              ].map((pos, idx) => (
                <div key={idx} className="p-3 enterprise-raised rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-[#1B1F2A]">{pos.name}</div>
                    <div className="text-[10px] text-[#5F667A]">{pos.status}</div>
                  </div>
                  <span className={`text-[10px] font-mono-tech px-2 py-0.5 rounded border ${
                    pos.active ? 'bg-[#14806A]/10 text-[#14806A] border-[#14806A]/20' : 'text-[#5F667A] border-[#CBC4B3]'
                  }`}>
                    {pos.active ? 'ACTIVE' : 'DEMO SCOPE'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Pricing Engine Policy & Economic Floor (6 cols) */}
        <div className="lg:col-span-6 space-y-5">
          <form onSubmit={handleSave} className="p-6 enterprise-panel space-y-4">
            <h3 className="text-sm font-semibold text-[#1B1F2A] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2447D4]" />
              <span>Pricing Engine Boundaries</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#4A5164] mb-1 font-semibold">Restaurant Brand Name</label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3.5 py-2.5 text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
                />
              </div>

              <div>
                <label className="block text-[#4A5164] mb-1 font-semibold">Operational Currency</label>
                <div className="grid grid-cols-4 gap-2">
                  {['₹', '$', '€', '£'].map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setCurrencySymbol(curr)}
                      className={`py-2 rounded-xl border text-center font-bold text-xs transition-colors ${
                        currencySymbol === curr
                          ? 'bg-[#2447D4] text-[#F6F3ED] border-[#2447D4]'
                          : 'enterprise-panel text-[#4A5164] border-[#CBC4B3]'
                      }`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step Limit L */}
              <div className="space-y-2 pt-2 border-t border-[#DDD7CA]">
                <div className="flex justify-between">
                  <span className="font-semibold text-[#1B1F2A]">Max Step Movement Limit (L)</span>
                  <span className="font-mono-tech font-bold text-[#2447D4]">±{maxMovementPct}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={maxMovementPct}
                  onChange={(e) => setMaxMovementPct(Number(e.target.value))}
                  className="w-full accent-[#2447D4] cursor-pointer"
                />
                <p className="text-[11px] text-[#5F667A]">
                  Prevents erratic price swings. Recommendations will never exceed ±{maxMovementPct}% in one cycle.
                </p>
              </div>

              {/* Default Min Contribution M_min */}
              <div className="space-y-2 pt-2 border-t border-[#DDD7CA]">
                <div className="flex justify-between">
                  <span className="font-semibold text-[#1B1F2A]">Default Minimum Contribution (M_min)</span>
                  <span className="font-mono-tech font-bold text-[#1B1F2A]">{currencySymbol}{minContribution}</span>
                </div>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={minContribution}
                  onChange={(e) => setMinContribution(Number(e.target.value))}
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3.5 py-2 text-[#1B1F2A] font-mono-tech focus:outline-none focus:border-[#2447D4]"
                />
              </div>

              {/* Rounding Step */}
              <div className="space-y-2 pt-2 border-t border-[#DDD7CA]">
                <label className="block text-[#4A5164] font-semibold">Pricing Rounding Increment</label>
                <select
                  value={roundingStep}
                  onChange={(e) => setRoundingStep(Number(e.target.value))}
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3.5 py-2 text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
                >
                  <option value={1}>Exact minor units</option>
                  <option value={5}>Round to nearest {currencySymbol}5 (Standard Hospitality)</option>
                  <option value={10}>Round to nearest {currencySymbol}10 (Premium Clean Price)</option>
                </select>
              </div>

              <div className="space-y-3 pt-3 border-t border-[#DDD7CA]">
                <h4 className="font-semibold text-[#1B1F2A]">Customer price stability guard</h4>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-[#4A5164]">Maximum increase (%)
                    <input type="number" min={1} max={50} value={maxIncreasePct} onChange={(e) => setMaxIncreasePct(Number(e.target.value))} className="w-full bg-white border border-[#CBC4B3] rounded-lg px-3 py-2 text-[#1B1F2A]" />
                  </label>
                  <label className="space-y-1 text-[#4A5164]">Maximum decrease (%)
                    <input type="number" min={1} max={50} value={maxDecreasePct} onChange={(e) => setMaxDecreasePct(Number(e.target.value))} className="w-full bg-white border border-[#CBC4B3] rounded-lg px-3 py-2 text-[#1B1F2A]" />
                  </label>
                  <label className="space-y-1 text-[#4A5164]">Days between actual changes
                    <input type="number" min={0} max={365} value={minimumDaysBetweenPriceChanges} onChange={(e) => setMinimumDaysBetweenPriceChanges(Number(e.target.value))} className="w-full bg-white border border-[#CBC4B3] rounded-lg px-3 py-2 text-[#1B1F2A]" />
                  </label>
                  <label className="space-y-1 text-[#4A5164]">Rolling window (days)
                    <input type="number" min={1} max={365} value={cumulativeIncreaseWindowDays} onChange={(e) => setCumulativeIncreaseWindowDays(Number(e.target.value))} className="w-full bg-white border border-[#CBC4B3] rounded-lg px-3 py-2 text-[#1B1F2A]" />
                  </label>
                  <label className="space-y-1 text-[#4A5164]">Cumulative increase limit (%)
                    <input type="number" min={1} max={200} value={cumulativeIncreaseLimitPct} onChange={(e) => setCumulativeIncreaseLimitPct(Number(e.target.value))} className="w-full bg-white border border-[#CBC4B3] rounded-lg px-3 py-2 text-[#1B1F2A]" />
                  </label>
                  <label className="space-y-1 text-[#4A5164]">Manager review threshold (%)
                    <input type="number" min={1} max={50} value={trustRiskReviewThresholdPct} onChange={(e) => setTrustRiskReviewThresholdPct(Number(e.target.value))} className="w-full bg-white border border-[#CBC4B3] rounded-lg px-3 py-2 text-[#1B1F2A]" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-[#4A5164]">
                  <input type="checkbox" checked={loyaltyPriceProtection} onChange={(e) => setLoyaltyPriceProtection(e.target.checked)} className="accent-[#2447D4]" />
                  Apply loyalty-price protection to all menu items (no price changes)
                </label>
                <div className="space-y-2">
                  <div className="text-[#4A5164] font-semibold">Protected menu items</div>
                  <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {menuItems.map((item) => (
                      <label key={item.id} className="flex items-center gap-2 text-[11px] text-[#4A5164]">
                        <input type="checkbox" checked={protectedMenuItemIds.includes(item.id)} onChange={(e) => setProtectedMenuItemIds((ids) => e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} className="accent-[#2447D4]" />
                        {item.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[#4A5164] font-semibold">Protected categories</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {[...new Set(menuItems.map((item) => item.category))].map((category) => (
                      <label key={category} className="flex items-center gap-2 text-[11px] text-[#4A5164]">
                        <input type="checkbox" checked={protectedCategories.includes(category)} onChange={(e) => setProtectedCategories((categories) => e.target.checked ? [...categories, category] : categories.filter((value) => value !== category))} className="accent-[#2447D4]" />
                        {category}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl bg-[#2447D4] hover:bg-[#4D6BEA] disabled:opacity-50 text-[#F6F3ED] text-xs font-semibold shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer mt-4"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enforcing...' : 'Save & Enforce Policies'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
