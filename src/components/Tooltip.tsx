/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  term: string;
  definition: string;
  formula?: string;
  children?: React.ReactNode;
}

export const FinancialTooltip: React.FC<TooltipProps> = ({
  term,
  definition,
  formula,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center gap-1 cursor-help group"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {children || <span>{term}</span>}
      <HelpCircle className="w-3.5 h-3.5 text-[#5B7253]/70 hover:text-[#C2512F] transition-colors" />

      {isOpen && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg bg-[#F0ECE3] border border-[#C2512F]/30 text-xs text-[#1B1F2A] shadow-xl z-50 pointer-events-none block animate-in fade-in zoom-in-95 duration-150">
          <span className="font-semibold text-[#C2512F] block mb-1">{term}</span>
          <span className="text-[#1B1F2A]/85 block leading-relaxed">{definition}</span>
          {formula && (
            <span className="mt-2 pt-1.5 border-t border-[#1B1F2A]/10 block font-mono text-[11px] text-[#5B7253]">
              Formula: {formula}
            </span>
          )}
        </span>
      )}
    </span>
  );
};
