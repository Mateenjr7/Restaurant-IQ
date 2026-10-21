/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  UserCheck,
  FileText,
} from 'lucide-react';

interface ApprovalsAuditLogProps {
  auditEvents: any[];
  currencySymbol: string;
}

export const ApprovalsAuditLogView: React.FC<ApprovalsAuditLogProps> = ({
  auditEvents,
  currencySymbol = '₹',
}) => {
  const [filterAction, setFilterAction] = useState('ALL');
  const [search, setSearch] = useState('');

  const filteredEvents = auditEvents.filter((ev) => {
    const matchesAction = filterAction === 'ALL' || ev.action === filterAction;
    const matchesSearch =
      (ev.menuItemName || '').toLowerCase().includes(search.toLowerCase()) ||
      ev.rationale.toLowerCase().includes(search.toLowerCase()) ||
      ev.actor.toLowerCase().includes(search.toLowerCase());
    return matchesAction && matchesSearch;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'PRICE_APPLIED':
        return 'bg-[#14806A]/10 text-[#14806A] border-[#14806A]/20';
      case 'PRICE_APPROVED':
        return 'bg-[#2447D4]/10 text-[#2447D4] border-[#2447D4]/30';
      case 'PRICE_REJECTED':
        return 'bg-[#C23B34]/10 text-[#C23B34] border-[#C23B34]/30';
      case 'PRICE_BLOCKED':
        return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'MANUAL_OVERRIDE':
        return 'bg-[#A8650F]/10 text-[#A8650F] border-[#A8650F]/20';
      case 'STOCK_ADJUSTED':
        return 'bg-[#4A5164]/10 text-[#4A5164] border-[#4A5164]/20';
      default:
        return 'bg-[#E8E3D8] text-[#4A5164] border-[#CBC4B3]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#DDD7CA]">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-[#2447D4]" />
            <span>Governance & Audit Trail</span>
          </h1>
          <p className="text-xs text-[#4A5164] mt-1.5 font-sans-ui max-w-xl">
            Immutable log of all price approvals, manual overrides, POS synchronizations, and policy modifications.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#4A5164] font-mono-tech px-3.5 py-2 rounded-xl enterprise-panel border border-[#CBC4B3]">
          <UserCheck className="w-3.5 h-3.5 text-[#14806A]" />
          <span>Operator: <strong>Owner (Authenticated)</strong></span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          {['ALL', 'PRICE_APPLIED', 'PRICE_APPROVED', 'PRICE_REJECTED', 'PRICE_BLOCKED', 'MANUAL_OVERRIDE', 'STOCK_ADJUSTED', 'POLICY_UPDATED'].map((act) => (
            <button
              key={act}
              onClick={() => setFilterAction(act)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filterAction === act
                  ? 'bg-[#E8E3D8] text-[#1B1F2A] border border-[#CBC4B3] font-semibold'
                  : 'text-[#5F667A] hover:text-[#1B1F2A]'
              }`}
            >
              {act.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#5F667A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit trail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#1B1F2A] placeholder-[#5F667A] focus:outline-none focus:border-[#2447D4]"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="overflow-x-auto rounded-xl border border-[#DDD7CA] enterprise-panel">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#DDD7CA] bg-[#F0ECE3] text-[#5F667A] font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Timestamp & Actor</th>
              <th className="py-3 px-4">Event Type</th>
              <th className="py-3 px-4">Subject</th>
              <th className="py-3 px-4 font-mono-tech">Price Transition</th>
              <th className="py-3 px-4">Audited Rationale</th>
              <th className="py-3 px-4">Policy Safeguard</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDD7CA]">
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-xs text-[#5F667A]">
                  <FileText className="w-6 h-6 text-[#5F667A]/40 mx-auto mb-2" />
                  <div>No audit events found matching the selected filter.</div>
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-[#F0ECE3] transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-[#1B1F2A]">
                      {ev.actor}
                    </div>
                    <div className="text-[10px] text-[#5F667A] font-mono-tech flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-[#2447D4]" />
                      <span>{new Date(ev.timestamp).toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono-tech font-bold border ${getActionBadge(ev.action)}`}>
                      {ev.action.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-[#1B1F2A]">
                    {ev.menuItemName || 'System Policy'}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tech">
                    {ev.previousPrice !== undefined && ev.newPrice !== undefined ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#5F667A]">{currencySymbol}{ev.previousPrice}</span>
                        <ArrowRight className="w-3 h-3 text-[#2447D4]" />
                        <span className="text-[#14806A] font-bold">{currencySymbol}{ev.newPrice}</span>
                      </div>
                    ) : (
                      <span className="text-[#5F667A]">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-[#4A5164] max-w-xs leading-relaxed">
                    {ev.rationale}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#14806A] font-semibold font-mono-tech">
                      {ev.policyChecksPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5 text-red-500" />}
                      {ev.policyChecksPassed ? 'Passed' : 'Blocked'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
