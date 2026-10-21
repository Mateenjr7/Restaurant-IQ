/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FinancialTooltip } from '../components/Tooltip.tsx';
import {
  Package,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  SlidersHorizontal,
  Edit2,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  X,
} from 'lucide-react';

interface InventoryManagementProps {
  inventory: any[];
  currencySymbol: string;
  onAdjustStock: (id: string, newStockQty: number, reason: string) => Promise<void>;
  onOpenCopilot: (prompt?: string) => void;
}

export const InventoryManagementView: React.FC<InventoryManagementProps> = ({
  inventory,
  currencySymbol = '₹',
  onAdjustStock,
  onOpenCopilot,
}) => {
  const [selectedInv, setSelectedInv] = useState<any | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const lowStockCount = inventory.filter((i) => i.status === 'low_stock' || i.status === 'critical').length;
  const inflationSurges = inventory.filter((i) => i.priceChangeLast30DaysPct > 10);

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInv) return;
    setAdjustError('');
    try {
      await onAdjustStock(
        selectedInv.id,
        Number(adjustQty),
        adjustReason || 'Routine physical inventory count audit'
      );
      setSelectedInv(null);
    } catch (err: any) {
      setAdjustError(err.message || 'Failed to adjust stock');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1B1F2A]/10">
        <div>
          <h1 className="text-3xl font-serif-display font-normal text-[#1B1F2A] flex items-center gap-2.5">
            <Package className="w-6 h-6 text-[#C2512F]" />
            <span>Inventory & Wholesale Cost Surge Radar</span>
          </h1>
          <p className="text-xs text-[#5B7253] mt-1">
            Track key culinary raw ingredients, wholesale supply shocks, and stockout risks that dictate dynamic price floors.
          </p>
        </div>

        <button
          onClick={() => onOpenCopilot('Analyze the wholesale price surge on poultry and goat meat and suggest menu mitigations')}
          className="px-3.5 py-2 rounded-xl bg-[#1B1F2A]/5 hover:bg-[#1B1F2A]/10 border border-[#1B1F2A]/10 text-xs font-semibold text-[#1B1F2A] flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C2512F]" />
          <span>AI Food Cost Analysis</span>
        </button>
      </div>

      {/* Inflation Alert Banner */}
      {inflationSurges.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/20 via-[#F0ECE3] to-[#FFFFFF] border border-red-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1B1F2A]">
                Wholesale Price Shock Alert: {inflationSurges.map((s) => `${s.name} (+${s.priceChangeLast30DaysPct}%)`).join(', ')}
              </div>
              <p className="text-xs text-[#5B7253] mt-0.5">
                The pricing engine has automatically elevated the economic floors across linked curries to prevent margin compression.
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/40 shrink-0">
            AUTO-RECALIBRATED
          </span>
        </div>
      )}

      {/* Inventory Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {inventory.map((item) => {
          const isLow = item.status === 'low_stock' || item.status === 'critical';
          const isSurplus = item.status === 'surplus';

          return (
            <div
              key={item.id}
              className="p-5 rounded-2xl glass-panel border border-[#1B1F2A]/10 hover:border-[#1B1F2A]/20 transition-all space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5B7253] px-2 py-0.5 rounded bg-[#1B1F2A]/5">
                    {item.category}
                  </span>
                  <h3 className="font-semibold text-sm text-[#1B1F2A] mt-1">
                    {item.name}
                  </h3>
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isLow
                    ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                    : isSurplus
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}>
                  {item.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              {/* Stock Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#1B1F2A]/65">Stock on Hand:</span>
                  <span className="font-bold text-[#1B1F2A] font-mono">
                    {item.stockQty} {item.unit}
                    <span className="text-[#5B7253] text-[11px] font-normal ml-1">
                      (Safety threshold: {item.reorderPoint} {item.unit})
                    </span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#1B1F2A]/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isLow ? 'bg-red-500' : isSurplus ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, (item.stockQty / (item.reorderPoint * 2.5)) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Cost & 30-Day Wholesale Inflation */}
              <div className="pt-2 border-t border-[#1B1F2A]/5 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-[#1B1F2A]/55 block">Wholesale Unit Cost</span>
                  <span className="font-mono font-bold text-[#1B1F2A]">
                    {currencySymbol}{item.costPerUnit}/{item.unit}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-[#1B1F2A]/55 block">30-Day Inflation</span>
                  <span className={`font-mono font-bold inline-flex items-center gap-0.5 ${
                    item.priceChangeLast30DaysPct > 10 ? 'text-red-400' : 'text-[#5B7253]'
                  }`}>
                    <TrendingUp className="w-3 h-3" />
                    +{item.priceChangeLast30DaysPct}%
                  </span>
                </div>
              </div>

              {/* Linked SKUs & Stock Action */}
              <div className="pt-2 border-t border-[#1B1F2A]/5 flex items-center justify-between text-[11px]">
                <span className="text-[#5B7253]">
                  Affects {item.linkedMenuItemIds.length} menu items
                </span>
                <button
                  onClick={() => {
                    setSelectedInv(item);
                    setAdjustQty(item.stockQty);
                    setAdjustReason('');
                    setAdjustError('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#1B1F2A]/5 hover:bg-[#1B1F2A]/10 text-[#1B1F2A] font-medium flex items-center gap-1 transition-colors"
                >
                  <Edit2 className="w-3 h-3 text-[#C2512F]" />
                  <span>Count Audit</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Adjust Inventory Stock Modal */}
      {selectedInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#F0ECE3] border border-[#C2512F]/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1B1F2A]/10 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#C2512F]">Physical Count Audit</span>
                <h3 className="text-base font-bold text-[#1B1F2A]">{selectedInv.name}</h3>
              </div>
              <button onClick={() => setSelectedInv(null)} className="text-[#1B1F2A]/60 hover:text-[#1B1F2A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {adjustError && (
              <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleConfirmAdjustment} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#1B1F2A]/75 mb-1 font-semibold">
                  New Stock Count ({selectedInv.unit})
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  className="w-full bg-[#F6F3ED] border border-[#1B1F2A]/15 rounded-xl px-3 py-2 text-[#1B1F2A] font-mono text-sm focus:outline-none focus:border-[#C2512F]"
                />
              </div>

              <div>
                <label className="block text-[#1B1F2A]/75 mb-1 font-semibold">
                  Adjustment Reason (Audited)
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Received fresh delivery batch #802 from vendor."
                  className="w-full bg-[#F6F3ED] border border-[#1B1F2A]/15 rounded-xl px-3 py-2 text-[#1B1F2A] focus:outline-none focus:border-[#C2512F]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedInv(null)}
                  className="px-4 py-2 rounded-xl bg-[#1B1F2A]/5 text-[#1B1F2A]/75 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#C2512F] hover:bg-[#D4633F] text-[#FFFFFF] font-semibold"
                >
                  Save & Update Signals
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
