/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Search,
  LayoutDashboard,
  UtensilsCrossed,
  Radar,
  TrendingUp,
  SlidersHorizontal,
  CalendarCheck,
  Package,
  Bot,
  ShieldCheck,
  Settings,
  Sparkles,
  X,
  ArrowRight,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onTriggerCopilot: (prompt?: string) => void;
  onRunCycle: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onTriggerCopilot,
  onRunCycle,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent handles toggle
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'nav-overview',
      label: 'Open Command Center Overview',
      category: 'Navigation',
      icon: LayoutDashboard,
      action: () => {
        onNavigate('overview');
        onClose();
      },
    },
    {
      id: 'nav-recommendations',
      label: 'Review Pending Price Recommendations',
      category: 'Navigation',
      icon: TrendingUp,
      action: () => {
        onNavigate('recommendations');
        onClose();
      },
    },
    {
      id: 'nav-menu',
      label: 'Inspect Menu Catalog & Unit Margins',
      category: 'Navigation',
      icon: UtensilsCrossed,
      action: () => {
        onNavigate('menu');
        onClose();
      },
    },
    {
      id: 'nav-competitors',
      label: 'Explore Competitor Intelligence Radar',
      category: 'Navigation',
      icon: Radar,
      action: () => {
        onNavigate('competitors');
        onClose();
      },
    },
    {
      id: 'nav-simulator',
      label: 'Launch Price Elasticity Simulator',
      category: 'Navigation',
      icon: SlidersHorizontal,
      action: () => {
        onNavigate('simulator');
        onClose();
      },
    },
    {
      id: 'nav-forecasting',
      label: 'View Demand Forecast Models & Seasonality',
      category: 'Navigation',
      icon: CalendarCheck,
      action: () => {
        onNavigate('forecasting');
        onClose();
      },
    },
    {
      id: 'nav-inventory',
      label: 'Check Inventory & Ingredient Price Surges',
      category: 'Navigation',
      icon: Package,
      action: () => {
        onNavigate('inventory');
        onClose();
      },
    },
    {
      id: 'nav-agents',
      label: 'Monitor 6 AI Autonomous Agents',
      category: 'Navigation',
      icon: Bot,
      action: () => {
        onNavigate('agents');
        onClose();
      },
    },
    {
      id: 'action-cycle',
      label: 'Trigger Full Multi-Agent Intelligence Cycle',
      category: 'Actions',
      icon: Sparkles,
      action: () => {
        onRunCycle();
        onClose();
      },
    },
    {
      id: 'action-copilot-poultry',
      label: 'Ask AI Copilot: Analyze poultry wholesale inflation impact',
      category: 'AI Advisory',
      icon: Sparkles,
      action: () => {
        onTriggerCopilot('Analyze our free-range chicken wholesale inflation impact');
        onClose();
      },
    },
    {
      id: 'action-copilot-weekend',
      label: 'Ask AI Copilot: Weekend dinner surge pricing recommendations',
      category: 'AI Advisory',
      icon: Sparkles,
      action: () => {
        onTriggerCopilot('What pricing strategy should we deploy for the upcoming weekend surge?');
        onClose();
      },
    },
    {
      id: 'nav-customer-trust',
      label: 'Review Customer Trust & Pricing Health',
      category: 'Governance',
      icon: ShieldCheck,
      action: () => {
        onNavigate('trust');
        onClose();
      },
    },
    {
      id: 'nav-audit',
      label: 'Inspect Tamper-Evident Audit Trail',
      category: 'Governance',
      icon: ShieldCheck,
      action: () => {
        onNavigate('audit');
        onClose();
      },
    },
    {
      id: 'nav-settings',
      label: 'Configure Pricing Policies & POS Integrations',
      category: 'Settings',
      icon: Settings,
      action: () => {
        onNavigate('settings');
        onClose();
      },
    },
  ];

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-[#1B1F2A]/45 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#FFFFFF] border border-[#C2512F]/30 rounded-2xl shadow-2xl overflow-hidden glass-panel-elevated">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[#1B1F2A]/10 gap-3">
          <Search className="w-5 h-5 text-[#C2512F]" />
          <input
            type="text"
            placeholder="Type a command, dish name, or ask AI Copilot..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-[#1B1F2A] placeholder-white/40 text-sm focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono bg-[#1B1F2A]/10 rounded text-[#1B1F2A]/65">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#1B1F2A]/55 hover:text-[#1B1F2A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Results */}
        <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#1B1F2A]/60">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-[#1B1F2A]/5 group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#F0ECE3] border border-[#1B1F2A]/10 flex items-center justify-center text-[#C2512F] group-hover:border-[#C2512F]/50 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#1B1F2A] group-hover:text-[#1B1F2A]">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-[#5B7253]">
                        {item.category}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#1B1F2A]/35 group-hover:text-[#C2512F] group-hover:translate-x-0.5 transition-all" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 border-t border-[#1B1F2A]/5 bg-[#F6F3ED]/60 flex items-center justify-between text-[11px] text-[#1B1F2A]/60">
          <div className="flex items-center gap-2">
            <span>Navigation & Strategy</span>
            <span>•</span>
            <span className="text-[#C2512F]">Deterministic Pricing Guard Active</span>
          </div>
          <span>RestaurantIQ</span>
        </div>
      </div>
    </div>
  );
};
