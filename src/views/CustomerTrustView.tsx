/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, Clock3, ShieldCheck, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';

interface CustomerTrustViewProps {
  dashboard: any | null;
  currencySymbol: string;
}

export const CustomerTrustView: React.FC<CustomerTrustViewProps> = ({ dashboard, currencySymbol }) => {
  const summary = dashboard?.summary;
  const assessments = dashboard?.assessments || [];
  const actualChanges = assessments.flatMap((assessment: any) => assessment.recentPriceChanges || [])
    .sort((a: any, b: any) => b.changedAt.localeCompare(a.changedAt));

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-[#DDD7CA]">
        <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="w-7 h-7 text-[#2447D4]" />
          Customer Trust & Pricing Health
        </h1>
        <p className="text-xs text-[#4A5164] mt-1.5 max-w-2xl">
          Evidence-based pricing stability monitoring from actual applied-price history. This is not a customer-level churn prediction.
        </p>
      </div>

      {!dashboard ? (
        <div className="enterprise-panel border border-[#DDD7CA] p-8 text-sm text-[#5F667A]">
          Pricing health data is not available from the backend yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            {[
              ['Stable menu items', summary.stableMenuItems],
              ['Approaching limits', summary.approachingLimits],
              ['Manager review', summary.recommendationsForReview],
              ['Blocked recommendations', summary.blockedRecommendations],
              ['Applied changes', summary.actualPriceChanges],
            ].map(([label, value]) => (
              <div key={label} className="enterprise-panel border border-[#DDD7CA] p-4">
                <div className="text-[10px] uppercase tracking-wider text-[#5F667A]">{label}</div>
                <div className="mt-2 text-2xl font-mono-tech font-bold text-[#1B1F2A]">{value}</div>
              </div>
            ))}
          </div>

          <section className="enterprise-panel border border-[#DDD7CA] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif-display text-lg text-[#1B1F2A]">Rolling price movement</h2>
              <span className="text-[11px] font-mono-tech text-[#5F667A]">
                {dashboard.periodDays}-day window · Weighted upward movement: {summary.cumulativeIncreasePct.toFixed(1)}%
              </span>
            </div>
            {actualChanges.length === 0 ? (
              <p className="text-xs text-[#5F667A]">No verified actual price-change events are recorded in this window. Recommendation history is not counted as applied movement.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase text-[#5F667A] border-b border-[#DDD7CA]">
                    <tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Menu item</th><th className="py-2 pr-4">Transition</th><th className="py-2 pr-4">Source / actor</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDD7CA]">
                    {actualChanges.slice(0, 12).map((change: any) => (
                      <tr key={change.id}>
                        <td className="py-2.5 pr-4 text-[#5F667A]">{new Date(change.changedAt).toLocaleString()}</td>
                        <td className="py-2.5 pr-4 font-medium text-[#1B1F2A]">{change.menuItemName}</td>
                        <td className="py-2.5 pr-4 font-mono-tech">{currencySymbol}{change.previousPrice} → {currencySymbol}{change.newPrice}</td>
                        <td className="py-2.5 pr-4 text-[#5F667A]">{change.source.replace('_', ' ')} · {change.actor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="enterprise-panel border border-[#DDD7CA] p-5">
            <h2 className="font-serif-display text-lg text-[#1B1F2A] mb-3">Item-level stability assessment</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase text-[#5F667A] border-b border-[#DDD7CA]">
                  <tr><th className="py-2 pr-3">Menu item</th><th className="py-2 pr-3">Current price</th><th className="py-2 pr-3">Last actual change</th><th className="py-2 pr-3">Rolling increase</th><th className="py-2 pr-3">Risk & evidence</th><th className="py-2 pr-3">Order trend</th></tr>
                </thead>
                <tbody className="divide-y divide-[#DDD7CA]">
                  {assessments.map((assessment: any) => (
                    <tr key={assessment.menuItemId} className="align-top">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-[#1B1F2A]">{assessment.menuItemName}</div>
                        <div className="text-[10px] text-[#5F667A]">{assessment.category}</div>
                      </td>
                      <td className="py-3 pr-3 font-mono-tech">{currencySymbol}{assessment.currentPrice}</td>
                      <td className="py-3 pr-3 text-[#5F667A]">{assessment.lastActualPriceChangeAt ? new Date(assessment.lastActualPriceChangeAt).toLocaleDateString() : 'No recorded event'}</td>
                      <td className="py-3 pr-3 font-mono-tech">{assessment.cumulativeIncreasePct.toFixed(1)}%</td>
                      <td className="py-3 pr-3 min-w-64">
                        <div className="flex items-center gap-1.5 font-semibold text-[#1B1F2A]">
                          {assessment.customerTrustRisk.riskLevel === 'high' ? <ShieldAlert className="w-3.5 h-3.5 text-red-500" /> :
                            assessment.customerTrustRisk.riskLevel === 'medium' ? <AlertTriangle className="w-3.5 h-3.5 text-[#A8650F]" /> :
                              <ShieldCheck className="w-3.5 h-3.5 text-[#14806A]" />}
                          <span className="capitalize">{assessment.customerTrustRisk.riskLevel}</span>
                          <span className="font-normal text-[#5F667A]">· {assessment.stabilityPolicyStatus.replace('_', ' ')}</span>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#5F667A]">{assessment.customerTrustRisk.explanation}</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#5F667A]">{assessment.customerTrustRisk.dataQuality}</p>
                        <p className="mt-1 text-[10px] text-[#5F667A]">{assessment.customerTrustRisk.periodExamined}</p>
                        {assessment.customerTrustRisk.evidence.map((entry: string, index: number) => (
                          <p key={index} className="mt-1 text-[10px] leading-relaxed text-[#5F667A]">Evidence: {entry}</p>
                        ))}
                        {assessment.customerTrustRisk.limitations.map((limitation: string, index: number) => (
                          <p key={index} className="mt-1 text-[10px] leading-relaxed text-[#5F667A]">Limitation: {limitation}</p>
                        ))}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-1 text-[#5F667A]">
                          {assessment.ordersTrend === 'increasing' ? <TrendingUp className="w-3.5 h-3.5" /> :
                            assessment.ordersTrend === 'decreasing' ? <TrendingDown className="w-3.5 h-3.5" /> :
                              <Clock3 className="w-3.5 h-3.5" />}
                          <span className="capitalize">{assessment.ordersTrend}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-[#5F667A] max-w-48">{assessment.orderDataQuality}</p>
                      </td>
                    </tr>
                  ))}
                  {assessments.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-[#5F667A]">No menu items are available to assess.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[11px] text-[#5F667A] border-t border-[#DDD7CA] pt-3">
              No complaint data is persisted in this application. Existing seeded daily sales are synthetic and lack customer identifiers, so they cannot establish repeat-order or retention outcomes.
            </p>
          </section>
        </>
      )}
    </div>
  );
};
