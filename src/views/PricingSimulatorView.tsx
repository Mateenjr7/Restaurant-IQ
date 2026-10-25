/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FinancialTooltip } from '../components/Tooltip.tsx';
import {
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface PricingSimulatorProps {
  initialRec?: any;
  menuItems: any[];
  currencySymbol: string;
  loading?: boolean;
  onOpenCopilot: (prompt?: string) => void;
}

export const PricingSimulatorView: React.FC<PricingSimulatorProps> = ({
  initialRec,
  menuItems,
  currencySymbol = '₹',
  loading = false,
  onOpenCopilot,
}) => {
  const defaultItem = initialRec
    ? menuItems.find((m) => m.id === initialRec.menuItemId) || menuItems[0]
    : menuItems[0];

  const [selectedItemId, setSelectedItemId] = useState(defaultItem?.id ?? '');
  const activeItem = menuItems.find((m) => m.id === selectedItemId) || menuItems[0];

  // Simulator Inputs
  const [proposedPrice, setProposedPrice] = useState<number>(defaultItem?.currentPrice ?? 0);
  const [variableCost, setVariableCost] = useState<number>(defaultItem?.totalVariableCost ?? 0);
  const [minContribution, setMinContribution] = useState<number>(defaultItem?.minContribution || 60);
  const [competitorMedian, setCompetitorMedian] = useState<number>(Math.round((defaultItem?.currentPrice ?? 0) * 1.08));
  const [expectedBaseOrders, setExpectedBaseOrders] = useState<number>(Math.round((defaultItem?.historicalSalesLast30Days ?? 0) / 4));
  const [elasticityFactor, setElasticityFactor] = useState<number>(1.25);

  useEffect(() => {
    if (!activeItem) return;
    setProposedPrice(activeItem.currentPrice);
    setVariableCost(activeItem.totalVariableCost);
    setMinContribution(activeItem.minContribution || 60);
    setCompetitorMedian(Math.round(activeItem.currentPrice * 1.08));
    setExpectedBaseOrders(Math.round(activeItem.historicalSalesLast30Days / 4));
  }, [activeItem, selectedItemId]);

  if (!activeItem) {
    return (
      <div className="enterprise-panel border border-[#DDD7CA] rounded-2xl p-6" role="status">
        <h1 className="text-2xl font-serif-display text-[#1B1F2A]">Elasticity &amp; Margin Simulator</h1>
        <p className="mt-2 text-sm text-[#4A5164]">
          {loading ? 'Loading menu items for the simulator…' : 'No menu items are available to simulate.'}
        </p>
      </div>
    );
  }

  // Deterministic Calculations
  const economicFloor = variableCost + minContribution;
  const isFloorViolated = proposedPrice < economicFloor;

  const currentContribution = activeItem.currentPrice - variableCost;
  const currentMargin = activeItem.currentPrice > 0 ? (currentContribution / activeItem.currentPrice) * 100 : 0;

  const proposedContribution = proposedPrice - variableCost;
  const proposedMargin = proposedPrice > 0 ? (proposedContribution / proposedPrice) * 100 : 0;

  // Elasticity calculations
  const priceDeltaPct = (proposedPrice - activeItem.currentPrice) / activeItem.currentPrice;
  const volumeDeltaPct = -priceDeltaPct * elasticityFactor;
  const projectedOrders = Math.max(5, Math.round(expectedBaseOrders * (1 + volumeDeltaPct)));

  const currentTotalContribution = currentContribution * expectedBaseOrders;
  const projectedTotalContribution = proposedContribution * projectedOrders;
  const netLift = projectedTotalContribution - currentTotalContribution;

  const handleReset = () => {
    setProposedPrice(activeItem.currentPrice);
    setVariableCost(activeItem.totalVariableCost);
    setMinContribution(activeItem.minContribution || 60);
    setElasticityFactor(1.25);
  };

  return (
    <div className="space-y-6">
      {/* Header Introduction */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#DDD7CA]">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight">
            Elasticity & Margin Simulator
          </h1>
          <p className="text-xs text-[#4A5164] mt-1.5 font-sans-ui max-w-xl">
            Simulate price sensitivity, wholesale food inflation shocks, and demand elasticity with transparent financial formulas before committing to POS.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onOpenCopilot(`Simulate elasticity scenario for ${activeItem.name} at ₹${proposedPrice}`)}
            className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#1B1F2A] border border-[#CBC4B3] transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2447D4]" />
            <span>AI Scenario Audit</span>
          </button>
          <button
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#5F667A] hover:text-[#1B1F2A] border border-[#CBC4B3] transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Inputs</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Inputs vs Scenario Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Inputs (6 cols) */}
        <div className="lg:col-span-6 space-y-5 p-6 enterprise-panel border border-[#DDD7CA]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#5F667A] block mb-2 font-mono-tech">
              Target SKU to Simulate
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-[#F0ECE3] border border-[#CBC4B3] rounded-xl px-3.5 py-2.5 text-xs text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
            >
              {menuItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({currencySymbol}{item.currentPrice}) - {item.category}
                </option>
              ))}
            </select>
          </div>

          {/* Slider 1: Proposed Candidate Price */}
          <div className="space-y-2 pt-3 border-t border-[#DDD7CA]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#1B1F2A]">Candidate Price</span>
              <span className="text-base font-bold text-[#2447D4] font-mono-tech">
                {currencySymbol}{proposedPrice}
              </span>
            </div>
            <input
              type="range"
              min={Math.round(activeItem.currentPrice * 0.7)}
              max={Math.round(activeItem.currentPrice * 1.5)}
              step={5}
              value={proposedPrice}
              onChange={(e) => setProposedPrice(Number(e.target.value))}
              className="w-full accent-[#2447D4] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#5F667A] font-mono-tech">
              <span>{currencySymbol}{Math.round(activeItem.currentPrice * 0.7)}</span>
              <span>Current: {currencySymbol}{activeItem.currentPrice}</span>
              <span>{currencySymbol}{Math.round(activeItem.currentPrice * 1.5)}</span>
            </div>
          </div>

          {/* Slider 2: Variable Food Cost */}
          <div className="space-y-2 pt-3 border-t border-[#DDD7CA]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#1B1F2A]">Variable Food & Prep Cost</span>
              <span className="font-bold text-[#4A5164] font-mono-tech">
                {currencySymbol}{variableCost}
              </span>
            </div>
            <input
              type="range"
              min={Math.round(activeItem.totalVariableCost * 0.8)}
              max={Math.round(activeItem.totalVariableCost * 1.6)}
              step={5}
              value={variableCost}
              onChange={(e) => setVariableCost(Number(e.target.value))}
              className="w-full accent-[#4A5164] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#5F667A] font-mono-tech">
              <span>{currencySymbol}{Math.round(activeItem.totalVariableCost * 0.8)}</span>
              <span>Baseline: {currencySymbol}{activeItem.totalVariableCost}</span>
              <span>+60% Surge: {currencySymbol}{Math.round(activeItem.totalVariableCost * 1.6)}</span>
            </div>
          </div>

          {/* Slider 3: Price Elasticity Coefficient */}
          <div className="space-y-2 pt-3 border-t border-[#DDD7CA]">
            <div className="flex items-center justify-between text-xs">
              <FinancialTooltip
                term="Price Elasticity Coefficient"
                definition="Rate at which customer order quantity changes in response to price shifts. Typically -1.25 for casual dining."
              >
                <span className="font-medium text-[#1B1F2A]">Demand Elasticity (|ε|)</span>
              </FinancialTooltip>
              <span className="font-bold text-[#2447D4] font-mono-tech">
                {elasticityFactor.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={elasticityFactor}
              onChange={(e) => setElasticityFactor(Number(e.target.value))}
              className="w-full accent-[#2447D4] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#5F667A] font-mono-tech">
              <span>0.5x (Inelastic)</span>
              <span>1.25x (Standard Casual)</span>
              <span>2.5x (High Sensitivity)</span>
            </div>
          </div>
        </div>

        {/* Right Column: Scenario Projections (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Safeguard Floor Status */}
          {isFloorViolated ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Economic Floor Violation Alert</span>
              </div>
              <p>
                Candidate price {currencySymbol}{proposedPrice} falls below the guaranteed floor of {currencySymbol}{economicFloor} (Cost {currencySymbol}{variableCost} + Min Margin {currencySymbol}{minContribution}). This price will be blocked by policy.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#14806A]/10 border border-[#14806A]/20 text-[#14806A] text-xs flex items-center justify-between font-mono-tech">
              <span className="flex items-center gap-1.5 font-sans-ui font-medium">
                <ShieldCheck className="w-4 h-4" />
                Guaranteed Floor Satisfied ({currencySymbol}{economicFloor})
              </span>
              <span className="font-bold uppercase text-[10px]">Passed</span>
            </div>
          )}

          {/* Metric Comparison Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 enterprise-panel space-y-1">
              <div className="text-[10px] text-[#5F667A] uppercase font-mono-tech">Contribution / Order</div>
              <div className="text-2xl font-serif-display text-[#1B1F2A] tabular-nums">
                {currencySymbol}{proposedContribution}
              </div>
              <div className="text-[11px] text-[#5F667A] pt-1 border-t border-[#DDD7CA] font-mono-tech">
                Current: {currencySymbol}{currentContribution}
              </div>
            </div>

            <div className="p-4 enterprise-panel space-y-1 border-l-2 border-l-[#2447D4]">
              <div className="text-[10px] text-[#5F667A] uppercase font-mono-tech">Contribution Margin</div>
              <div className="text-2xl font-serif-display text-[#2447D4] tabular-nums">
                {Math.round(proposedMargin * 10) / 10}%
              </div>
              <div className="text-[11px] text-[#5F667A] pt-1 border-t border-[#DDD7CA] font-mono-tech">
                Current: {Math.round(currentMargin * 10) / 10}%
              </div>
            </div>

            <div className="p-4 enterprise-panel space-y-1">
              <div className="text-[10px] text-[#5F667A] uppercase font-mono-tech">Projected Weekly Volume</div>
              <div className="text-2xl font-serif-display text-[#1B1F2A] tabular-nums">
                {projectedOrders} <span className="text-xs text-[#5F667A] font-sans-ui">orders</span>
              </div>
              <div className="text-[11px] text-[#5F667A] pt-1 border-t border-[#DDD7CA] font-mono-tech">
                Shift: {Math.round(volumeDeltaPct * 100)}% volume
              </div>
            </div>

            <div className="p-4 enterprise-panel space-y-1 border border-[#CBC4B3]">
              <div className="text-[10px] text-[#2447D4] uppercase font-mono-tech font-semibold">Weekly Net Contribution Lift</div>
              <div className={`text-2xl font-serif-display tabular-nums ${netLift >= 0 ? 'text-[#14806A]' : 'text-[#C23B34]'}`}>
                {netLift >= 0 ? '+' : ''}{currencySymbol}{netLift.toLocaleString()}
              </div>
              <div className="text-[11px] text-[#5F667A] pt-1 border-t border-[#DDD7CA] font-mono-tech">
                Modelled total: {currencySymbol}{projectedTotalContribution.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
