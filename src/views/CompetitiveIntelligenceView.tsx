/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FinancialTooltip } from '../components/Tooltip.tsx';
import {
  Radar,
  Building2,
  Search,
  Plus,
  TrendingUp,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Filter,
  Sparkles,
  MapPin,
  Star,
  Upload,
  AlertCircle,
  XCircle,
  X,
  Check,
  ChevronRight,
} from 'lucide-react';

interface CompetitiveIntelligenceProps {
  competitors: any[];
  observations: any[];
  menuItems: any[];
  menuMatches?: any[];
  currencySymbol: string;
  activeOutlet?: any;
  onAddObservation: (obsData: any) => Promise<void>;
  onImportMenu?: (competitorId: string, rows: any[]) => Promise<void>;
  onUpdateMatchStatus?: (matchId: string, status: string) => Promise<void>;
  onOpenCopilot: (prompt?: string) => void;
}

export const CompetitiveIntelligenceView: React.FC<CompetitiveIntelligenceProps> = ({
  competitors,
  observations,
  menuItems,
  menuMatches = [],
  currencySymbol = '₹',
  activeOutlet,
  onAddObservation,
  onImportMenu,
  onUpdateMatchStatus,
  onOpenCopilot,
}) => {
  const [activeTab, setActiveTab] = useState<'radar' | 'matching' | 'import'>('radar');
  const [selectedRadius, setSelectedRadius] = useState<number>(2.5);
  const [selectedCompetitor, setSelectedCompetitor] = useState<any | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // New observation state
  const [modalCompId, setModalCompId] = useState(competitors[0]?.id || '');
  const [modalMenuItemId, setModalMenuItemId] = useState(menuItems[0]?.id || '');
  const [modalDishName, setModalDishName] = useState('');
  const [modalObsPrice, setModalObsPrice] = useState(350);
  const [modalPortionGrams, setModalPortionGrams] = useState(500);
  const [modalSource, setModalSource] = useState<'direct_api' | 'verified_order' | 'manual_audit'>('manual_audit');
  const [modalError, setModalError] = useState('');

  // CSV Import State
  const [csvText, setCsvText] = useState(
    'Special Dum Chicken Biryani,370,550\nKadhai Paneer Silk,310,400\nTandoori Butter Naan,75,110'
  );
  const [importCompId, setImportCompId] = useState(competitors[0]?.id || '');
  const [importStatus, setImportStatus] = useState('');

  const [sortField, setSortField] = useState<'item' | 'comp' | 'ourPrice' | 'compPrice' | 'diff' | 'confidence' | 'freshness'>('freshness');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredCompetitors = competitors.filter((comp) => {
    const withinRadius = comp.distanceKm <= selectedRadius;
    const matchesSearch = comp.name.toLowerCase().includes(search.toLowerCase());
    return withinRadius && matchesSearch;
  });

  const filteredObservations = observations.filter((obs) => {
    const matchesComp = !selectedCompetitor || obs.competitorId === selectedCompetitor.id;
    const matchesSource = selectedSource === 'all' || obs.source === selectedSource;
    const matchesSearch =
      obs.dishName.toLowerCase().includes(search.toLowerCase()) ||
      obs.menuItemName.toLowerCase().includes(search.toLowerCase());
    return matchesComp && matchesSource && matchesSearch;
  });

  const sortedObservations = [...filteredObservations].sort((a, b) => {
    let valA: any = 0;
    let valB: any = 0;
    const itemA = menuItems.find((m) => m.id === a.menuItemId);
    const itemB = menuItems.find((m) => m.id === b.menuItemId);
    const ourPriceA = itemA?.currentPrice || 0;
    const ourPriceB = itemB?.currentPrice || 0;

    if (sortField === 'item') {
      valA = a.menuItemName;
      valB = b.menuItemName;
    } else if (sortField === 'comp') {
      valA = a.competitorName;
      valB = b.competitorName;
    } else if (sortField === 'ourPrice') {
      valA = ourPriceA;
      valB = ourPriceB;
    } else if (sortField === 'compPrice') {
      valA = a.observedPrice;
      valB = b.observedPrice;
    } else if (sortField === 'diff') {
      valA = ourPriceA - a.observedPrice;
      valB = ourPriceB - b.observedPrice;
    } else if (sortField === 'confidence') {
      valA = a.confidenceScore;
      valB = b.confidenceScore;
    } else if (sortField === 'freshness') {
      valA = new Date(a.freshnessTimestamp || 0).getTime();
      valB = new Date(b.freshnessTimestamp || 0).getTime();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleToggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    try {
      await onAddObservation({
        competitorId: modalCompId,
        menuItemId: modalMenuItemId,
        dishName: modalDishName,
        observedPrice: Number(modalObsPrice),
        portionGrams: Number(modalPortionGrams),
        source: modalSource,
      });
      setShowAddModal(false);
      setModalDishName('');
    } catch (err: any) {
      setModalError(err.message || 'Failed to record competitor observation');
    }
  };

  const handleExecuteImport = async () => {
    if (!onImportMenu) return;
    setImportStatus('');
    try {
      const rows = csvText
        .trim()
        .split('\n')
        .map((line) => {
          const [dishName, price, portionGrams] = line.split(',');
          return {
            dishName: dishName?.trim(),
            price: Number(price?.trim()),
            portionGrams: portionGrams ? Number(portionGrams?.trim()) : 450,
          };
        })
        .filter((r) => r.dishName && !isNaN(r.price));

      if (rows.length === 0) {
        setImportStatus('Invalid CSV format. Expected: dishName,price,portionGrams');
        return;
      }

      await onImportMenu(importCompId, rows);
      setImportStatus(`Successfully ingested ${rows.length} competitor dish prices.`);
      setTimeout(() => setShowImportModal(false), 1500);
    } catch (err: any) {
      setImportStatus(`Import failed: ${err.message}`);
    }
  };

  const getSourceBadge = (source: string, isSimulated: boolean) => {
    if (isSimulated || source === 'demo_dataset' || source === 'demo_data') {
      return { label: 'Seeded Demonstration Data', color: 'text-[#4A5164] bg-[#E8E3D8] border-[#CBC4B3]' };
    }
    if (source === 'verified_order') {
      return { label: 'Verified Mystery Order', color: 'text-[#14806A] bg-[#14806A]/10 border-[#14806A]/20' };
    }
    if (source === 'direct_api' || source === 'digital_pos') {
      return { label: 'Authorized Partner API', color: 'text-[#2447D4] bg-[#2447D4]/10 border-[#2447D4]/20' };
    }
    if (source === 'uploaded_csv') {
      return { label: 'Imported CSV Menu', color: 'text-[#9A4B2B] bg-[#9A4B2B]/10 border-[#9A4B2B]/20' };
    }
    return { label: 'Manual Physical Audit', color: 'text-[#14806A] bg-[#14806A]/10 border-[#14806A]/20' };
  };

  return (
    <div className="space-y-6">
      {/* Header Introduction */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#DDD7CA]">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight">
            Competitor Radar
          </h1>
          <p className="text-xs text-[#4A5164] mt-1.5 font-sans-ui max-w-xl">
            Location-aware market intelligence across local radius in {activeOutlet?.city || 'Hyderabad'}. Verified against portion weights and culinary preparation style.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onOpenCopilot('Compare our prices against Spice Route Bistro and Saffron Courtyard')}
            className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#1B1F2A] border border-[#CBC4B3] transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2447D4]" />
            <span>AI Market Synthesis</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#1B1F2A] border border-[#CBC4B3] transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-[#2447D4]" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#2447D4] hover:bg-[#4D6BEA] text-[#F6F3ED] text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Observation</span>
          </button>
        </div>
      </div>

      {/* Workspace Sub-Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('radar')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'radar'
                ? 'bg-[#E8E3D8] text-[#1B1F2A] border border-[#CBC4B3]'
                : 'text-[#5F667A] hover:text-[#1B1F2A]'
            }`}
          >
            Market Observations ({observations.length})
          </button>
          <button
            onClick={() => setActiveTab('matching')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'matching'
                ? 'bg-[#E8E3D8] text-[#1B1F2A] border border-[#CBC4B3]'
                : 'text-[#5F667A] hover:text-[#1B1F2A]'
            }`}
          >
            <span>Dish Matching Review</span>
            <span className="px-1.5 py-0.2 rounded bg-[#2447D4]/20 text-[#2447D4] text-[10px]">
              {menuMatches.length}
            </span>
          </button>
        </div>

        {/* Geographic Radius & Source Filters */}
        <div className="flex items-center gap-2">
          <span className="text-[#5F667A] text-[11px]">Radius:</span>
          {[1.5, 2.5, 5.0].map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRadius(r)}
              className={`px-2 py-1 rounded text-[11px] font-mono-tech transition-colors ${
                selectedRadius === r
                  ? 'bg-[#2447D4] text-[#F6F3ED] font-semibold'
                  : 'enterprise-panel text-[#4A5164] hover:text-[#1B1F2A]'
              }`}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: Main Radar & Competitor Comparison Table */}
      {activeTab === 'radar' && (
        <div className="space-y-5">
          {/* Competitor Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredCompetitors.map((comp) => {
              const compObs = observations.filter((o) => o.competitorId === comp.id);
              const isSelected = selectedCompetitor?.id === comp.id;

              return (
                <div
                  key={comp.id}
                  onClick={() => setSelectedCompetitor(isSelected ? null : comp)}
                  className={`p-4 enterprise-panel cursor-pointer transition-all border ${
                    isSelected
                      ? 'border-[#2447D4] bg-[#F0ECE3]'
                      : 'border-[#DDD7CA] hover:border-[#CBC4B3]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono-tech text-[#5F667A] uppercase tracking-wider">
                      {comp.priceTier}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-[#A8650F]">
                      <Star className="w-3 h-3 fill-[#A8650F]" />
                      <span className="font-mono-tech">{comp.rating}</span>
                    </div>
                  </div>

                  <h3 className="font-serif-display text-sm text-[#1B1F2A] mt-1.5 truncate">
                    {comp.name}
                  </h3>

                  <div className="flex items-center gap-1.5 text-[11px] text-[#4A5164] mt-1 font-mono-tech">
                    <MapPin className="w-3 h-3 text-[#2447D4]" />
                    <span>{comp.distanceKm} km away</span>
                  </div>

                  <div className="pt-2.5 mt-2.5 border-t border-[#DDD7CA] flex items-center justify-between text-[11px]">
                    <span className="text-[#5F667A]">{compObs.length} Observations</span>
                    <span className="text-[#2447D4] font-medium">
                      {isSelected ? 'Clear Filter' : 'Inspect'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#4A5164]">
                {selectedCompetitor ? (
                  <span>Filtered: <strong className="text-[#1B1F2A]">{selectedCompetitor.name}</strong></span>
                ) : (
                  <span>Showing all local observations within <strong>{selectedRadius}km</strong></span>
                )}
              </span>
              {selectedCompetitor && (
                <button
                  onClick={() => setSelectedCompetitor(null)}
                  className="text-xs text-[#2447D4] hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#5F667A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search dish or competitor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#1B1F2A] placeholder-[#5F667A] focus:outline-none focus:border-[#2447D4]"
              />
            </div>
          </div>

          {/* Observations Table */}
          <div className="overflow-x-auto rounded-xl border border-[#DDD7CA] enterprise-panel">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#DDD7CA] bg-[#F0ECE3] text-[#5F667A] font-semibold uppercase tracking-wider text-[10px]">
                  <th
                    onClick={() => handleToggleSort('item')}
                    className="py-3 px-4 cursor-pointer hover:text-[#1B1F2A] transition-colors"
                  >
                    Our Menu Item {sortField === 'item' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleToggleSort('comp')}
                    className="py-3 px-4 cursor-pointer hover:text-[#1B1F2A] transition-colors"
                  >
                    Competitor & Dish {sortField === 'comp' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleToggleSort('ourPrice')}
                    className="py-3 px-4 font-mono-tech cursor-pointer hover:text-[#1B1F2A] transition-colors"
                  >
                    Our Price {sortField === 'ourPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleToggleSort('compPrice')}
                    className="py-3 px-4 font-mono-tech cursor-pointer hover:text-[#1B1F2A] transition-colors"
                  >
                    Competitor Price {sortField === 'compPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleToggleSort('diff')}
                    className="py-3 px-4 font-mono-tech cursor-pointer hover:text-[#1B1F2A] transition-colors"
                  >
                    Variance {sortField === 'diff' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleToggleSort('confidence')}
                    className="py-3 px-4 font-mono-tech cursor-pointer hover:text-[#1B1F2A] transition-colors"
                  >
                    Confidence {sortField === 'confidence' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleToggleSort('freshness')}
                    className="py-3 px-4 font-mono-tech cursor-pointer hover:text-[#1B1F2A] transition-colors"
                  >
                    Observed At {sortField === 'freshness' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="py-3 px-4">Data Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD7CA]">
                {sortedObservations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[#5F667A]">
                      <AlertCircle className="w-6 h-6 text-[#5F667A]/40 mx-auto mb-2" />
                      <div>No competitor observations match the active search or radius criteria.</div>
                      <div className="text-[10px] text-[#5F667A] mt-1 font-mono-tech">
                        Try expanding the radius to 5.0km or clearing search filters.
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedObservations.map((obs) => {
                    const menuItem = menuItems.find((m) => m.id === obs.menuItemId);
                    const ourPrice = menuItem?.currentPrice || 0;
                    const diff = ourPrice - obs.observedPrice;
                    const diffPct = obs.observedPrice > 0 ? Math.round((diff / obs.observedPrice) * 100) : 0;
                    const badge = getSourceBadge(obs.source, obs.isSimulated);
                    const obsDate = new Date(obs.freshnessTimestamp || 0);
                    const daysAgo = Math.floor((Date.now() - obsDate.getTime()) / (1000 * 60 * 60 * 24));
                    const isStale = daysAgo >= 3;

                    return (
                      <tr key={obs.id} className="hover:bg-[#F0ECE3] transition-colors">
                        <td className="py-3 px-4 font-medium text-[#1B1F2A]">
                          {obs.menuItemName}
                          <span className="text-[10px] text-[#5F667A] block font-mono-tech">
                            Our portion: {menuItem?.portionGrams || 450}g
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-[#1B1F2A]">{obs.dishName}</div>
                          <div className="text-[10px] text-[#2447D4] font-mono-tech">
                            {obs.competitorName} ({obs.portionGrams}g)
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono-tech font-bold text-[#1B1F2A]">
                          {currencySymbol}{ourPrice}
                        </td>

                        <td className="py-3 px-4 font-mono-tech font-bold text-[#2447D4]">
                          {currencySymbol}{obs.observedPrice}
                        </td>

                        <td className="py-3 px-4 font-mono-tech">
                          <span className={diff > 0 ? 'text-[#A8650F]' : diff < 0 ? 'text-[#14806A]' : 'text-[#5F667A]'}>
                            {diff > 0 ? `+${currencySymbol}${diff}` : diff < 0 ? `-${currencySymbol}${Math.abs(diff)}` : 'Parity'}
                            <span className="text-[10px] ml-1">({diffPct > 0 ? '+' : ''}{diffPct}%)</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono-tech text-[#14806A]">
                          {Math.round(obs.confidenceScore * 100)}%
                        </td>

                        <td className="py-3 px-4 font-mono-tech text-[11px] text-[#4A5164]">
                          <div>{obsDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                          {isStale && (
                            <span className="text-[9px] text-[#A8650F] block">Stale ({daysAgo}d ago)</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono-tech border ${badge.color}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Dish Matching & Normalization Engine */}
      {activeTab === 'matching' && (
        <div className="space-y-4">
          <div className="p-4 enterprise-panel text-xs text-[#4A5164] space-y-1">
            <h3 className="font-serif-display text-sm text-[#1B1F2A]">
              Automated Dish Normalization & Semantic Pairing
            </h3>
            <p>
              Restaurants assign varied culinary names to similar dishes. The engine normalizes prices to gram weight, flags portion mismatches, and prevents comparing single portions with bulk family packs.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {menuMatches.map((m) => (
              <div
                key={m.id}
                className="p-4 enterprise-panel flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#DDD7CA]"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#1B1F2A]">{m.menuItemName}</span>
                    <span className="text-[#5F667A]">vs</span>
                    <span className="font-serif-display text-sm text-[#2447D4]">
                      {m.competitorDishName} ({m.competitorName})
                    </span>
                  </div>

                  <p className="text-xs text-[#4A5164] leading-relaxed">
                    {m.explanation}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] font-mono-tech text-[#5F667A] pt-1">
                    <span>Our Portion: <strong>{m.portionInternalGrams}g</strong></span>
                    <span>•</span>
                    <span>Competitor: <strong>{m.portionCompetitorGrams}g</strong></span>
                    <span>•</span>
                    <span>Observed: <strong>{currencySymbol}{m.observedPrice}</strong></span>
                    <span>•</span>
                    <span>Normalized Parity: <strong className="text-[#2447D4]">{currencySymbol}{m.normalizedPrice}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2.5 py-1 rounded text-[10px] font-mono-tech uppercase font-bold border ${
                    m.matchStatus === 'high_confidence'
                      ? 'bg-[#14806A]/10 text-[#14806A] border-[#14806A]/20'
                      : m.matchStatus === 'needs_review'
                      ? 'bg-[#A8650F]/10 text-[#A8650F] border-[#A8650F]/20'
                      : 'bg-[#C23B34]/10 text-[#C23B34] border-[#C23B34]/20'
                  }`}>
                    {m.matchStatus.replace('_', ' ')}
                  </span>

                  {onUpdateMatchStatus && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onUpdateMatchStatus(m.id, 'high_confidence')}
                        title="Accept match"
                        className="p-1.5 rounded-lg enterprise-panel hover:text-[#14806A] text-[#5F667A]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onUpdateMatchStatus(m.id, 'rejected')}
                        title="Reject pairing"
                        className="p-1.5 rounded-lg enterprise-panel hover:text-[#C23B34] text-[#5F667A]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-sm">
          <div className="w-full max-w-lg enterprise-panel-elevated p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-3">
              <h3 className="font-serif-display text-base text-[#1B1F2A] flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#2447D4]" />
                <span>Import Competitor Menu (CSV Format)</span>
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-[#5F667A] hover:text-[#1B1F2A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#4A5164]">
              Paste menu rows exported from point-of-sale or menu sheets. Format: <code className="text-[#2447D4]">dishName, price, portionGrams</code>
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#4A5164] mb-1">Target Competitor</label>
              <select
                value={importCompId}
                onChange={(e) => setImportCompId(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-xs text-[#1B1F2A]"
              >
                {competitors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl p-3 text-xs font-mono-tech text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
            />

            {importStatus && (
              <div className="p-3 rounded-lg bg-[#F0ECE3] border border-[#CBC4B3] text-xs text-[#2447D4]">
                {importStatus}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl enterprise-panel text-xs text-[#4A5164]"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                className="px-5 py-2 rounded-xl bg-[#2447D4] text-[#F6F3ED] text-xs font-semibold"
              >
                Ingest & Match Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Observation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-sm">
          <div className="w-full max-w-md enterprise-panel-elevated p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-3">
              <h3 className="font-serif-display text-base text-[#1B1F2A] flex items-center gap-2">
                <Radar className="w-4 h-4 text-[#2447D4]" />
                <span>Record Physical Menu Observation</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#5F667A] hover:text-[#1B1F2A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveObservation} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#4A5164] mb-1">Competitor Venue</label>
                <select
                  value={modalCompId}
                  onChange={(e) => setModalCompId(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A]"
                >
                  {competitors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.distanceKm} km)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#4A5164] mb-1">Matched Internal SKU</label>
                <select
                  value={modalMenuItemId}
                  onChange={(e) => setModalMenuItemId(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A]"
                >
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({currencySymbol}{m.currentPrice})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#4A5164] mb-1">Competitor Dish Name</label>
                <input
                  type="text"
                  required
                  value={modalDishName}
                  onChange={(e) => setModalDishName(e.target.value)}
                  placeholder="e.g. Special Dum Biryani"
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono-tech">
                <div>
                  <label className="block text-[#4A5164] mb-1 font-sans-ui">Observed Price ({currencySymbol})</label>
                  <input
                    type="number"
                    required
                    value={modalObsPrice}
                    onChange={(e) => setModalObsPrice(Number(e.target.value))}
                    className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
                  />
                </div>
                <div>
                  <label className="block text-[#4A5164] mb-1 font-sans-ui">Portion Weight (g)</label>
                  <input
                    type="number"
                    value={modalPortionGrams}
                    onChange={(e) => setModalPortionGrams(Number(e.target.value))}
                    className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl enterprise-panel text-[#4A5164]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#2447D4] text-[#F6F3ED] font-semibold"
                >
                  Save Observation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
