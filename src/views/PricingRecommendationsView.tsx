/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FinancialTooltip } from '../components/Tooltip.tsx';
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Filter,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
  RefreshCw,
  Info,
  DollarSign,
  Send,
  Eye,
  Check,
  X,
  AlertOctagon,
  Lock,
} from 'lucide-react';

interface PricingRecommendationsProps {
  recommendations: any[];
  currencySymbol?: string;
  onApprove: (id: string, allowStepOverride?: boolean) => Promise<void> | void;
  onApply: (id: string) => Promise<void> | void;
  onReject: (id: string, reason: string) => Promise<void> | void;
  onRegenerate: () => void;
  onOpenCopilot: (prompt?: string) => void;
  onNavigateToSimulator: (rec: any) => void;
}

export const PricingRecommendationsView: React.FC<PricingRecommendationsProps> = ({
  recommendations,
  currencySymbol = '₹',
  onApprove,
  onApply,
  onReject,
  onRegenerate,
  onOpenCopilot,
  onNavigateToSimulator,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'applied' | 'rejected'>('pending');
  const [selectedRec, setSelectedRec] = useState<any | null>(null);
  const [rejectModalRecId, setRejectModalRecId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [overrideModalRec, setOverrideModalRec] = useState<any | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState<string | null>(null);

  const filtered = recommendations.filter((r) => r.status === activeTab);

  const handleApprove = async (id: string, allowStepOverride: boolean = false) => {
    setActionError(null);
    try {
      setIsApproving(id);
      await onApprove(id, allowStepOverride);
      if (selectedRec && selectedRec.id === id) {
        setSelectedRec({ ...selectedRec, status: 'approved' });
      }
      setOverrideModalRec(null);
    } catch (err: any) {
      setActionError(err.message || 'Approval failed');
    } finally {
      setIsApproving(null);
    }
  };

  const handleApply = async (id: string) => {
    setActionError(null);
    try {
      setIsApplying(id);
      await onApply(id);
      if (selectedRec && selectedRec.id === id) {
        setSelectedRec({ ...selectedRec, status: 'applied' });
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to apply recommendation to POS');
    } finally {
      setIsApplying(null);
    }
  };

  const handleConfirmReject = async () => {
    setActionError(null);
    if (rejectModalRecId) {
      try {
        await onReject(rejectModalRecId, rejectReason || 'Operator judged current price optimal for patron loyalty.');
        if (selectedRec && selectedRec.id === rejectModalRecId) {
          setSelectedRec({ ...selectedRec, status: 'rejected' });
        }
        setRejectModalRecId(null);
        setRejectReason('');
      } catch (err: any) {
        setActionError(err.message || 'Rejection failed');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Introduction */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#DDD7CA]">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight">
            Dynamic Pricing & Approvals
          </h1>
          <p className="text-xs text-[#4A5164] mt-1.5 font-sans-ui max-w-xl">
            Deterministic price recommendations derived from bounded elasticity models and local competitor medians. No price changes are applied without operator authorization.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onOpenCopilot('Analyze our pending price recommendations and explain the expected contribution impact')}
            className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#1B1F2A] border border-[#CBC4B3] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2447D4]" />
            <span>AI Reasoning Assistant</span>
          </button>

          <button
            onClick={onRegenerate}
            className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#2447D4] border border-[#CBC4B3] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recalculate Cycle</span>
          </button>
        </div>
      </div>

      {/* Global Action Error Banner */}
      {actionError && (
        <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="p-1 text-red-300 hover:text-[#1B1F2A]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#DDD7CA] pb-3 text-xs">
        {[
          { key: 'pending', label: 'Needs Review', count: recommendations.filter((r) => r.status === 'pending').length },
          { key: 'approved', label: 'Approved (Ready for POS)', count: recommendations.filter((r) => r.status === 'approved').length },
          { key: 'applied', label: 'Applied in POS', count: recommendations.filter((r) => r.status === 'applied').length },
          { key: 'rejected', label: 'Rejected', count: recommendations.filter((r) => r.status === 'rejected').length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === tab.key
                ? 'bg-[#E8E3D8] text-[#1B1F2A] border border-[#CBC4B3]'
                : 'text-[#5F667A] hover:text-[#1B1F2A]'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono-tech ${
              activeTab === tab.key ? 'bg-[#2447D4] text-[#F6F3ED] font-bold' : 'bg-[#F0ECE3] text-[#5F667A]'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Main List */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center enterprise-panel space-y-2 border border-[#DDD7CA]">
          <CheckCircle2 className="w-8 h-8 text-[#5F667A]/50 mx-auto" />
          <h3 className="font-serif-display text-base text-[#1B1F2A]">No items in {activeTab}</h3>
          <p className="text-xs text-[#5F667A]">
            All recommendations in this queue have been processed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((rec) => {
            const isBlocked = rec.isBlocked;
            const requiresOverride = rec.requiresStepOverride;

            return (
              <div
                key={rec.id}
                className={`p-5 enterprise-panel transition-all space-y-4 border ${
                  isBlocked
                    ? 'border-red-500/30 bg-red-950/10'
                    : requiresOverride
                    ? 'border-[#A8650F]/40 bg-[#A8650F]/5'
                    : 'border-[#DDD7CA] hover:border-[#CBC4B3]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono-tech text-[#5F667A] uppercase px-2 py-0.5 rounded bg-[#F0ECE3]">
                        {rec.category}
                      </span>
                      <h3 className="font-serif-display text-base text-[#1B1F2A]">
                        {rec.menuItemName}
                      </h3>
                      {isBlocked && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-red-500/20 text-red-300 border border-red-500/40 font-bold flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          BLOCKED BY POLICY
                        </span>
                      )}
                      {requiresOverride && !isBlocked && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-[#A8650F]/20 text-[#A8650F] border border-[#A8650F]/40 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          STEP OVERRIDE REQUIRED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#4A5164] leading-relaxed max-w-2xl">
                      {rec.reason}
                    </p>

                    {/* Flag Reasons list if present */}
                    {rec.flagReasons && rec.flagReasons.length > 0 && (
                      <div className="pt-1 space-y-1">
                        {rec.flagReasons.map((reason: string, idx: number) => (
                          <div
                            key={idx}
                            className={`text-[11px] font-mono-tech flex items-center gap-1.5 ${
                              isBlocked ? 'text-red-300' : 'text-[#A8650F]'
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Price Shift Summary */}
                  <div className="flex items-center gap-6 shrink-0 bg-[#F6F3ED] px-5 py-3 rounded-xl border border-[#DDD7CA]">
                    <div>
                      <div className="text-[10px] uppercase font-mono-tech text-[#5F667A]">Current</div>
                      <div className="text-sm font-mono-tech font-bold text-[#4A5164]">
                        {currencySymbol}{rec.currentPrice}
                      </div>
                      <div className="text-[10px] text-[#5F667A] font-mono-tech">
                        Margin: {rec.currentContributionMarginPct}%
                      </div>
                    </div>

                    <ArrowRight className="w-3.5 h-3.5 text-[#2447D4]" />

                    <div>
                      <div className="text-[10px] uppercase font-mono-tech text-[#2447D4] font-semibold">Recommended</div>
                      <div className="text-lg font-serif-display text-[#2447D4] tabular-nums">
                        {currencySymbol}{rec.suggestedPrice}
                      </div>
                      <div className="text-[10px] text-[#14806A] font-mono-tech">
                        +{currencySymbol}{rec.priceDelta} ({rec.priceDeltaPct > 0 ? '+' : ''}{rec.priceDeltaPct}%)
                      </div>
                    </div>

                    <div className="hidden sm:block pl-4 border-l border-[#DDD7CA]">
                      <div className="text-[10px] uppercase font-mono-tech text-[#5F667A]">New Contribution</div>
                      <div className="text-sm font-mono-tech font-bold text-[#1B1F2A]">
                        {currencySymbol}{rec.suggestedContribution}
                      </div>
                      <div className="text-[10px] text-[#14806A] font-mono-tech">
                        Margin: {rec.suggestedContributionMarginPct}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-[11px]">
                  <div className="rounded-lg border border-[#DDD7CA] p-3">
                    <div className="text-[10px] uppercase text-[#5F667A]">Actual price history</div>
                    <div className="mt-1 text-[#1B1F2A]">
                      Last change: {rec.lastActualPriceChangeAt ? new Date(rec.lastActualPriceChangeAt).toLocaleDateString() : 'No verified event'}
                    </div>
                    <div className="mt-1 text-[#5F667A]">
                      {rec.recentPriceChanges?.length || 0} applied change(s) · {Number(rec.cumulativeIncreasePct || 0).toFixed(1)}% cumulative increase
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#DDD7CA] p-3">
                    <div className="text-[10px] uppercase text-[#5F667A]">Stability policy</div>
                    <div className={`mt-1 font-semibold ${rec.stabilityPolicyStatus === 'blocked' ? 'text-red-600' : rec.stabilityPolicyStatus === 'warning' ? 'text-[#A8650F]' : 'text-[#14806A]'}`}>
                      {(rec.stabilityPolicyStatus || 'insufficient_data').replace('_', ' ')}
                    </div>
                    <div className="mt-1 text-[#5F667A]">Economic floor {currencySymbol}{rec.economicFloor} · policy ceiling {currencySymbol}{rec.policyCeiling}</div>
                  </div>
                  <div className="rounded-lg border border-[#DDD7CA] p-3 md:col-span-2">
                    <div className="text-[10px] uppercase text-[#5F667A]">Customer-trust risk</div>
                    <div className="mt-1 font-semibold capitalize text-[#1B1F2A]">
                      {rec.customerTrustRisk?.riskLevel || 'insufficient data'} · pricing-stability assessment
                    </div>
                    <div className="mt-1 text-[#5F667A]">{rec.customerTrustRisk?.explanation || 'Insufficient applied-price history for a reliable assessment.'}</div>
                    {rec.customerTrustRisk?.evidence?.map((evidence: string, index: number) => (
                      <div key={index} className="mt-1 text-[#5F667A]">Evidence: {evidence}</div>
                    ))}
                    {rec.customerTrustRisk?.periodExamined && <div className="mt-1 text-[#5F667A]">{rec.customerTrustRisk.periodExamined}</div>}
                    {rec.customerTrustRisk?.limitations?.[0] && <div className="mt-1 text-[#5F667A]">{rec.customerTrustRisk.limitations[0]}</div>}
                  </div>
                </div>

                {/* Economic Safeguards & Actions Row */}
                <div className="pt-3 border-t border-[#DDD7CA] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4 text-[#5F667A] font-mono-tech text-[11px]">
                    <span className={`flex items-center gap-1.5 ${isBlocked ? 'text-red-400' : 'text-[#14806A]'}`}>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Economic Floor: {currencySymbol}{rec.economicFloor} ({isBlocked ? 'Conflict' : 'Passed'})
                    </span>
                    <span>•</span>
                    <span>Competitor Median: {currencySymbol}{rec.competitorMedian}</span>
                    <span>•</span>
                    <span>Confidence: {Math.round(rec.confidenceScore * 100)}%</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedRec(rec)}
                      className="px-3 py-1.5 rounded-lg enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#1B1F2A] flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#2447D4]" />
                      <span>Calculation & Candidates</span>
                    </button>

                    <button
                      onClick={() => onNavigateToSimulator(rec)}
                      className="px-3 py-1.5 rounded-lg enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#5F667A] hover:text-[#1B1F2A] flex items-center gap-1 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Simulator</span>
                    </button>

                    {rec.status === 'pending' && (
                      <>
                        <button
                          onClick={() => setRejectModalRecId(rec.id)}
                          className="px-3 py-1.5 rounded-lg enterprise-panel text-[#C23B34] hover:bg-[#C23B34]/10 text-xs font-medium cursor-pointer"
                        >
                          Reject
                        </button>

                        {isBlocked ? (
                          <button
                            disabled
                            title="Cannot approve blocked recommendation"
                            className="px-4 py-1.5 rounded-lg bg-red-900/30 text-red-400 text-xs font-semibold cursor-not-allowed border border-red-500/30 flex items-center gap-1.5"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Blocked by Policy</span>
                          </button>
                        ) : requiresOverride ? (
                          <button
                            onClick={() => setOverrideModalRec(rec)}
                            disabled={isApproving === rec.id}
                            className="px-4 py-1.5 rounded-lg bg-[#A8650F] hover:bg-[#1C3AB5] text-[#F6F3ED] text-xs font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Authorize Override & Approve</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleApprove(rec.id)}
                            disabled={isApproving === rec.id}
                            className="px-4 py-1.5 rounded-lg bg-[#2447D4] hover:bg-[#4D6BEA] disabled:opacity-50 text-[#F6F3ED] text-xs font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            {isApproving === rec.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Approve</span>
                          </button>
                        )}
                      </>
                    )}

                    {rec.status === 'approved' && (
                      <button
                        onClick={() => handleApply(rec.id)}
                        disabled={isApplying === rec.id}
                        className="px-4 py-1.5 rounded-lg bg-[#14806A] hover:bg-[#14806A] text-[#F6F3ED] text-xs font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        {isApplying === rec.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Push to Toast POS</span>
                      </button>
                    )}

                    {rec.status === 'applied' && (
                      <span className="px-3 py-1 rounded-lg bg-[#14806A]/10 text-[#14806A] text-xs font-semibold flex items-center gap-1 font-mono-tech border border-[#14806A]/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Live in POS Terminal
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Step Override Authorization Modal */}
      {overrideModalRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg enterprise-panel-elevated p-6 space-y-4 shadow-2xl border border-[#A8650F]/40">
            <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-3">
              <div className="flex items-center gap-2 text-[#A8650F]">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-serif-display text-base text-[#1B1F2A]">
                  Authorize Price Movement Step Override
                </h3>
              </div>
              <button onClick={() => setOverrideModalRec(null)} className="text-[#5F667A] hover:text-[#1B1F2A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#4A5164] leading-relaxed">
              The economic floor for <strong className="text-[#1B1F2A]">{overrideModalRec.menuItemName}</strong> requires a price adjustment of{' '}
              <strong className="text-[#2447D4]">+{overrideModalRec.priceDeltaPct}%</strong> (from {currencySymbol}{overrideModalRec.currentPrice} to {currencySymbol}{overrideModalRec.suggestedPrice}), which exceeds your configured maximum step limit of 15%.
            </p>

            <div className="p-3 rounded-xl bg-[#F0ECE3] border border-[#CBC4B3] space-y-1.5 text-xs font-mono-tech">
              <div className="flex justify-between text-[#4A5164]">
                <span>Variable Cost:</span>
                <span className="text-[#1B1F2A] font-bold">{currencySymbol}{overrideModalRec.variableCost}</span>
              </div>
              <div className="flex justify-between text-[#14806A]">
                <span>Economic Floor:</span>
                <span className="font-bold">{currencySymbol}{overrideModalRec.economicFloor}</span>
              </div>
              <div className="flex justify-between text-[#A8650F]">
                <span>Suggested Price:</span>
                <span className="font-bold">{currencySymbol}{overrideModalRec.suggestedPrice}</span>
              </div>
            </div>

            <p className="text-[11px] text-[#5F667A]">
              Authorizing this override will allow the recommendation to be approved and applied to POS to prevent selling below your minimum contribution threshold.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setOverrideModalRec(null)}
                className="px-4 py-2 rounded-xl enterprise-panel text-xs text-[#4A5164]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApprove(overrideModalRec.id, true)}
                className="px-5 py-2 rounded-xl bg-[#A8650F] text-[#F6F3ED] text-xs font-semibold"
              >
                Confirm Authorized Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deep Financial Reasoning & Candidate Price Search Inspector */}
      {selectedRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl enterprise-panel-elevated p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-4">
              <div>
                <span className="text-[10px] uppercase font-mono-tech tracking-wider text-[#2447D4]">
                  Deterministic Pricing Rationale & Candidate Search
                </span>
                <h3 className="font-serif-display text-xl text-[#1B1F2A]">
                  {selectedRec.menuItemName}
                </h3>
              </div>
              <button onClick={() => setSelectedRec(null)} className="text-[#5F667A] hover:text-[#1B1F2A] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Economic Floor Formula */}
            <div className="p-4 enterprise-raised rounded-xl space-y-2 border border-[#CBC4B3]">
              <div className="text-xs font-semibold text-[#1B1F2A] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#14806A]" />
                <span>Economic Floor Formula Enforcement</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-xs font-mono-tech pt-1">
                <div className="p-2 rounded-lg bg-[#F0ECE3]">
                  <span className="text-[10px] text-[#5F667A] block font-sans-ui">Variable Cost (C)</span>
                  <span className="font-bold text-[#1B1F2A] mt-0.5 block">{currencySymbol}{selectedRec.variableCost}</span>
                </div>
                <div className="p-2 rounded-lg bg-[#F0ECE3]">
                  <span className="text-[10px] text-[#5F667A] block font-sans-ui">Min Margin (M_min)</span>
                  <span className="font-bold text-[#1B1F2A] mt-0.5 block">{currencySymbol}{selectedRec.economicFloor - selectedRec.variableCost}</span>
                </div>
                <div className="p-2 rounded-lg bg-[#14806A]/10 border border-[#14806A]/20">
                  <span className="text-[10px] text-[#14806A] block font-sans-ui">Guaranteed Floor (P_floor)</span>
                  <span className="font-bold text-[#14806A] mt-0.5 block">{currencySymbol}{selectedRec.economicFloor}</span>
                </div>
              </div>
              <p className="text-[11px] text-[#5F667A] leading-relaxed pt-1 font-mono-tech">
                Floor = max(Cost + Min Contribution, Policy Floor). The candidate price cannot be set lower under any circumstances.
              </p>
            </div>

            {/* Candidate Price Search Table */}
            {selectedRec.candidates && selectedRec.candidates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <h4 className="font-semibold text-[#1B1F2A]">
                    Candidate Price Spectrum & Contribution Maximization
                  </h4>
                  <span className="text-[10px] text-[#5F667A] font-mono-tech">
                    Dining Elasticity (|ε| = 1.25)
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[#DDD7CA]">
                  <table className="w-full text-left border-collapse text-xs font-mono-tech">
                    <thead>
                      <tr className="bg-[#F0ECE3] border-b border-[#DDD7CA] text-[#5F667A] text-[10px] uppercase">
                        <th className="py-2.5 px-3">Candidate Price</th>
                        <th className="py-2.5 px-3">Expected Orders</th>
                        <th className="py-2.5 px-3">Unit Margin</th>
                        <th className="py-2.5 px-3">Expected Total Contrib</th>
                        <th className="py-2.5 px-3">Feasibility</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DDD7CA]">
                      {selectedRec.candidates.map((c: any, i: number) => {
                        const isRecommended = c.candidatePrice === selectedRec.suggestedPrice;
                        return (
                          <tr
                            key={i}
                            className={isRecommended ? 'bg-[#2447D4]/10 font-bold' : 'hover:bg-[#F0ECE3]'}
                          >
                            <td className="py-2 px-3 text-[#1B1F2A]">
                              {currencySymbol}{c.candidatePrice}
                              {isRecommended && (
                                <span className="ml-1.5 text-[9px] px-1 py-0.2 rounded bg-[#2447D4] text-[#F6F3ED]">
                                  OPTIMAL
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[#4A5164]">{c.expectedDemand} orders</td>
                            <td className="py-2 px-3 text-[#1B1F2A]">{currencySymbol}{c.contributionPerOrder}</td>
                            <td className="py-2 px-3 text-[#2447D4]">{currencySymbol}{c.expectedTotalContribution.toLocaleString()}</td>
                            <td className="py-2 px-3">
                              {c.isFeasible ? (
                                <span className="text-[#14806A] text-[10px]">Feasible</span>
                              ) : (
                                <span className="text-[#C23B34] text-[10px]">Violates Floor</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#DDD7CA]">
              <button
                onClick={() => setSelectedRec(null)}
                className="px-4 py-2 rounded-xl enterprise-panel text-xs text-[#1B1F2A] cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModalRecId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-sm">
          <div className="w-full max-w-md enterprise-panel-elevated p-6 space-y-4 shadow-2xl">
            <h3 className="font-serif-display text-base text-[#1B1F2A]">
              Reject Pricing Recommendation
            </h3>
            <p className="text-xs text-[#4A5164]">
              Record the business reason for rejecting this proposed price change. This event is logged in the permanent audit trail.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Current price anchors neighborhood value perception; deferring until next quarter."
              rows={3}
              className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl p-3 text-xs text-[#1B1F2A] placeholder-[#5F667A] focus:outline-none focus:border-[#2447D4]"
            />
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setRejectModalRecId(null)}
                className="px-4 py-2 rounded-xl enterprise-panel text-xs text-[#4A5164] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-[#C23B34] text-[#FFFFFF] text-xs font-semibold cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
