/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FinancialTooltip } from '../components/Tooltip.tsx';
import {
  UtensilsCrossed,
  Search,
  Plus,
  SlidersHorizontal,
  Edit2,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  X,
  Sparkles,
  Info,
} from 'lucide-react';

interface MenuIntelligenceProps {
  menuItems: any[];
  currencySymbol: string;
  onAddItem: (itemData: any) => Promise<void>;
  onUpdateItem: (id: string, itemData: any) => Promise<void>;
  onOverridePrice: (id: string, newPrice: number, reason: string) => Promise<void>;
  onNavigateToSimulator: (item: any) => void;
  onOpenCopilot?: (prompt?: string) => void;
}

export const MenuIntelligenceView: React.FC<MenuIntelligenceProps> = ({
  menuItems,
  currencySymbol = '₹',
  onAddItem,
  onUpdateItem,
  onOverridePrice,
  onNavigateToSimulator,
  onOpenCopilot,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [overrideItem, setOverrideItem] = useState<any | null>(null);
  const [overridePriceVal, setOverridePriceVal] = useState<number>(0);
  const [overrideReasonVal, setOverrideReasonVal] = useState('');
  const [overrideError, setOverrideError] = useState('');

  // Add Item State
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<any>('Curries & Gravies');
  const [newCurrentPrice, setNewCurrentPrice] = useState(280);
  const [newIngredientCost, setNewIngredientCost] = useState(130);
  const [newPackagingCost, setNewPackagingCost] = useState(15);
  const [newMinContribution, setNewMinContribution] = useState(60);
  const [newPortionGrams, setNewPortionGrams] = useState(400);
  const [newDescription, setNewDescription] = useState('');
  const [addError, setAddError] = useState('');

  const categories = [
    'All',
    'Biryani & Rice',
    'Curries & Gravies',
    'Tandoor & Starters',
    'Breads',
    'Beverages & Desserts',
  ];

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    try {
      await onAddItem({
        name: newName,
        category: newCategory,
        currentPrice: Number(newCurrentPrice),
        ingredientCost: Number(newIngredientCost),
        packagingCost: Number(newPackagingCost),
        minContribution: Number(newMinContribution),
        portionGrams: Number(newPortionGrams),
        description: newDescription,
      });
      setShowAddModal(false);
      setNewName('');
      setNewDescription('');
    } catch (err: any) {
      setAddError(err.message || 'Failed to add menu item');
    }
  };

  const handleConfirmOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError('');
    try {
      await onOverridePrice(overrideItem.id, Number(overridePriceVal), overrideReasonVal);
      setOverrideItem(null);
    } catch (err: any) {
      setOverrideError(err.message || 'Override failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Introduction */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#DDD7CA]">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight">
            Menu Intelligence & Unit Margins
          </h1>
          <p className="text-xs text-[#4A5164] mt-1.5 font-sans-ui max-w-xl">
            Granular unit economics, prime food cost breakdown, guaranteed economic floors, and contribution margin profiles for {menuItems.length} active culinary offerings.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenCopilot && (
            <button
              onClick={() => onOpenCopilot('Identify our bottom 3 contribution margin dishes and suggest repricing')}
              className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#1B1F2A] border border-[#CBC4B3] transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#2447D4]" />
              <span>AI Margin Audit</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#2447D4] hover:bg-[#4D6BEA] text-[#F6F3ED] text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu SKU</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#E8E3D8] text-[#1B1F2A] border border-[#CBC4B3]'
                  : 'text-[#5F667A] hover:text-[#1B1F2A]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#5F667A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search dish or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#1B1F2A] placeholder-[#5F667A] focus:outline-none focus:border-[#2447D4]"
          />
        </div>
      </div>

      {/* Main Table Layout */}
      <div className="overflow-x-auto rounded-xl border border-[#DDD7CA] enterprise-panel">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#DDD7CA] bg-[#F0ECE3] text-[#5F667A] font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Menu Item & SKU</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4 font-mono-tech">Current Price</th>
              <th className="py-3 px-4 font-mono-tech">Variable Cost</th>
              <th className="py-3 px-4 font-mono-tech">Economic Floor</th>
              <th className="py-3 px-4 font-mono-tech">Contribution / Order</th>
              <th className="py-3 px-4 font-mono-tech">Margin %</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDD7CA]">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-xs text-[#5F667A]">
                  <UtensilsCrossed className="w-6 h-6 text-[#5F667A]/40 mx-auto mb-2" />
                  <div>No menu items found for category "{selectedCategory}" or search query.</div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const contribution = item.currentPrice - item.totalVariableCost;
                const marginPct = item.currentPrice > 0 ? Math.round((contribution / item.currentPrice) * 1000) / 10 : 0;
                const floor = item.totalVariableCost + item.minContribution;
                const isCostUnverified = !item.ingredientCost || item.ingredientCost <= 0;

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="hover:bg-[#F0ECE3] cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#1B1F2A] group-hover:text-[#2447D4] transition-colors flex items-center gap-2">
                        <span>{item.name}</span>
                        {isCostUnverified && (
                          <span className="px-1.5 py-0.2 rounded bg-[#A8650F]/10 text-[#A8650F] text-[9px] font-mono-tech border border-[#A8650F]/20">
                            Cost Unverified
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono-tech text-[#5F667A]">
                        {item.sku} • {item.portionGrams}g
                      </div>
                    </td>

                    <td className="py-3 px-4 text-[#4A5164]">
                      {item.category}
                    </td>

                    <td className="py-3 px-4 font-mono-tech font-bold text-[#1B1F2A]">
                      {currencySymbol}{item.currentPrice}
                    </td>

                    <td className="py-3 px-4 font-mono-tech text-[#4A5164]">
                      {currencySymbol}{item.totalVariableCost}
                      <span className="text-[10px] text-[#5F667A] block">
                        food: {currencySymbol}{item.ingredientCost}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono-tech">
                      <span className="px-1.5 py-0.5 rounded bg-[#14806A]/10 text-[#14806A] text-[10px] border border-[#14806A]/20 font-semibold">
                        {currencySymbol}{floor}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono-tech font-medium text-[#1B1F2A]">
                      {currencySymbol}{contribution}
                    </td>

                    <td className="py-3 px-4 font-mono-tech">
                      <span className={marginPct > 45 ? 'text-[#2447D4] font-semibold' : 'text-[#4A5164]'}>
                        {marginPct}%
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onNavigateToSimulator(item)}
                          title="Simulate Elasticity"
                          className="p-1.5 rounded-lg enterprise-panel hover:text-[#2447D4] text-[#5F667A]"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setOverrideItem(item);
                            setOverridePriceVal(item.currentPrice);
                            setOverrideReasonVal('');
                            setOverrideError('');
                          }}
                          title="Manual Price Override"
                          className="p-1.5 rounded-lg enterprise-panel hover:text-[#2447D4] text-[#5F667A]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Item Detail Slide-Over Inspector */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-[#1B1F2A]/45 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg h-full enterprise-panel-elevated p-6 space-y-5 overflow-y-auto border-l border-[#CBC4B3] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-4">
              <div>
                <span className="text-[10px] uppercase font-mono-tech tracking-wider text-[#2447D4]">
                  SKU Financial Anatomy
                </span>
                <h3 className="font-serif-display text-xl text-[#1B1F2A] mt-0.5">
                  {selectedItem.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg enterprise-panel text-[#5F667A] hover:text-[#1B1F2A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#4A5164] leading-relaxed">
              {selectedItem.description}
            </p>

            {/* Economic Floor Verification Box */}
            <div className="p-4 enterprise-raised rounded-xl space-y-2 border border-[#CBC4B3]">
              <div className="flex items-center justify-between text-xs font-semibold text-[#1B1F2A]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#14806A]" />
                  Guaranteed Economic Floor
                </span>
                <span className="text-[#14806A] font-mono-tech text-sm">
                  {currencySymbol}{selectedItem.totalVariableCost + selectedItem.minContribution}
                </span>
              </div>
              <div className="text-[11px] text-[#5F667A] leading-relaxed font-mono-tech">
                Formula: Variable Cost ({currencySymbol}{selectedItem.totalVariableCost}) + Min Required Contribution ({currencySymbol}{selectedItem.minContribution})
              </div>
            </div>

            {/* Unit Economics Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#4A5164] uppercase tracking-wider">
                Unit Economics Breakdown
              </h4>
              <div className="p-3.5 enterprise-panel space-y-2 text-xs font-mono-tech">
                <div className="flex justify-between text-[#4A5164]">
                  <span>Current Price:</span>
                  <span className="text-[#1B1F2A] font-bold">{currencySymbol}{selectedItem.currentPrice}</span>
                </div>
                <div className="flex justify-between text-[#5F667A]">
                  <span>Raw Ingredient Food Cost:</span>
                  <span>{currencySymbol}{selectedItem.ingredientCost}</span>
                </div>
                <div className="flex justify-between text-[#5F667A]">
                  <span>Packaging & Seal Material:</span>
                  <span>{currencySymbol}{selectedItem.packagingCost}</span>
                </div>
                <div className="flex justify-between text-[#1B1F2A] pt-2 border-t border-[#DDD7CA] font-bold">
                  <span>Net Contribution per Order:</span>
                  <span className="text-[#2447D4]">
                    {currencySymbol}{selectedItem.currentPrice - selectedItem.totalVariableCost}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#DDD7CA]">
              <button
                onClick={() => {
                  const itm = selectedItem;
                  setSelectedItem(null);
                  onNavigateToSimulator(itm);
                }}
                className="px-4 py-2 rounded-xl bg-[#2447D4] text-[#F6F3ED] text-xs font-semibold"
              >
                Simulate Elasticity →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Override Modal */}
      {overrideItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-sm">
          <div className="w-full max-w-md enterprise-panel-elevated p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-3">
              <div>
                <span className="text-[10px] text-[#2447D4] uppercase font-mono-tech">
                  Operator Manual Price Override
                </span>
                <h3 className="font-serif-display text-base text-[#1B1F2A]">
                  {overrideItem.name}
                </h3>
              </div>
              <button onClick={() => setOverrideItem(null)} className="text-[#5F667A] hover:text-[#1B1F2A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {overrideError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {overrideError}
              </div>
            )}

            <form onSubmit={handleConfirmOverride} className="space-y-3.5 text-xs">
              <div className="p-3 enterprise-panel space-y-1 font-mono-tech text-[11px]">
                <div className="flex justify-between text-[#5F667A]">
                  <span>Current Price:</span>
                  <span className="text-[#1B1F2A] font-bold">{currencySymbol}{overrideItem.currentPrice}</span>
                </div>
                <div className="flex justify-between text-[#14806A] pt-1 border-t border-[#DDD7CA]">
                  <span>Guaranteed Floor:</span>
                  <span>{currencySymbol}{overrideItem.totalVariableCost + overrideItem.minContribution}</span>
                </div>
              </div>

              <div>
                <label className="block text-[#4A5164] mb-1 font-semibold">New Price ({currencySymbol})</label>
                <input
                  type="number"
                  required
                  value={overridePriceVal}
                  onChange={(e) => setOverridePriceVal(Number(e.target.value))}
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A] font-mono-tech text-sm focus:outline-none focus:border-[#2447D4]"
                />
              </div>

              <div>
                <label className="block text-[#4A5164] mb-1 font-semibold">Operator Justification (Audited)</label>
                <textarea
                  rows={2}
                  required
                  value={overrideReasonVal}
                  onChange={(e) => setOverrideReasonVal(e.target.value)}
                  placeholder="e.g. Special festive package pricing agreed with corporate group."
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setOverrideItem(null)}
                  className="px-4 py-2 rounded-xl enterprise-panel text-[#4A5164]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#2447D4] text-[#F6F3ED] font-semibold"
                >
                  Confirm Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1F2A]/45 backdrop-blur-sm">
          <div className="w-full max-w-lg enterprise-panel-elevated p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-3">
              <h3 className="font-serif-display text-base text-[#1B1F2A] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#2447D4]" />
                <span>Add Culinary Menu SKU</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#5F667A] hover:text-[#1B1F2A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {addError}
              </div>
            )}

            <form onSubmit={handleCreateItem} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#4A5164] mb-1 font-semibold">Dish Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Kashmiri Dum Aloo"
                  className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A] focus:outline-none focus:border-[#2447D4]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#4A5164] mb-1 font-semibold">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A]"
                  >
                    <option value="Biryani & Rice">Biryani & Rice</option>
                    <option value="Curries & Gravies">Curries & Gravies</option>
                    <option value="Tandoor & Starters">Tandoor & Starters</option>
                    <option value="Breads">Breads</option>
                    <option value="Beverages & Desserts">Beverages & Desserts</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#4A5164] mb-1 font-semibold">Portion Size (g)</label>
                  <input
                    type="number"
                    value={newPortionGrams}
                    onChange={(e) => setNewPortionGrams(Number(e.target.value))}
                    className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A] font-mono-tech"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 font-mono-tech">
                <div>
                  <label className="block text-[#4A5164] mb-1 font-sans-ui">Price ({currencySymbol})</label>
                  <input
                    type="number"
                    required
                    value={newCurrentPrice}
                    onChange={(e) => setNewCurrentPrice(Number(e.target.value))}
                    className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A]"
                  />
                </div>
                <div>
                  <label className="block text-[#4A5164] mb-1 font-sans-ui">Food Cost</label>
                  <input
                    type="number"
                    required
                    value={newIngredientCost}
                    onChange={(e) => setNewIngredientCost(Number(e.target.value))}
                    className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A]"
                  />
                </div>
                <div>
                  <label className="block text-[#4A5164] mb-1 font-sans-ui">Min Contrib</label>
                  <input
                    type="number"
                    value={newMinContribution}
                    onChange={(e) => setNewMinContribution(Number(e.target.value))}
                    className="w-full bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3 py-2 text-[#1B1F2A]"
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
                  Save & Validate SKU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
