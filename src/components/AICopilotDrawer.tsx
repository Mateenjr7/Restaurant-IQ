/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Send, X, Bot, RefreshCw, ChefHat, AlertTriangle, ArrowUpRight } from 'lucide-react';

interface AICopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

export const AICopilotDrawer: React.FC<AICopilotDrawerProps> = ({
  isOpen,
  onClose,
  initialPrompt = '',
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [response, setResponse] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ source?: string; modelUsed?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const samplePrompts = [
    'Which menu items have the greatest contribution opportunity?',
    'Explain today\'s pricing recommendations and candidate search.',
    'How sensitive is chicken biryani demand to a ₹20 price increase?',
    'Analyze wholesale inflation across poultry and dairy inputs.',
  ];

  const handleAsk = async (queryText?: string) => {
    const q = queryText || prompt;
    if (!q.trim()) return;

    setLoading(true);
    setResponse(null);
    setMeta(null);

    try {
      const res = await fetch('/api/ai/strategic-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q }),
      });
      const data = await res.json();
      setResponse(data.advice || 'No strategic advice generated.');
      setMeta({ source: data.source, modelUsed: data.modelUsed });
    } catch (err: any) {
      setResponse(`Error generating strategic analysis: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-[#1B1F2A]/45 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl h-full enterprise-panel-elevated border-l border-[#CBC4B3] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#DDD7CA] flex items-center justify-between bg-[#F0ECE3]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E8E3D8] border border-[#CBC4B3] flex items-center justify-center text-[#2447D4]">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-serif-display text-[#1B1F2A] flex items-center gap-2">
                <span>RestaurantIQ Strategic Copilot</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#2447D4]/10 text-[#2447D4] font-mono-tech border border-[#2447D4]/20">
                  Gemini 2.5 Flash
                </span>
              </h2>
              <p className="text-[11px] text-[#5F667A]">
                Culinary economics & price elasticity intelligence advisor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg enterprise-panel text-[#5F667A] hover:text-[#1B1F2A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Quick Prompts */}
          <div>
            <div className="text-[10px] font-mono-tech uppercase tracking-widest text-[#5F667A] mb-2 flex items-center gap-1.5 font-semibold">
              <ChefHat className="w-3.5 h-3.5 text-[#2447D4]" />
              Strategic Inquiries
            </div>
            <div className="grid grid-cols-1 gap-2">
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(p);
                    handleAsk(p);
                  }}
                  className="text-left p-2.5 rounded-xl enterprise-raised hover:border-[#2447D4]/30 border border-[#DDD7CA] text-xs text-[#1B1F2A] transition-all flex items-center justify-between group"
                >
                  <span>{p}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#5F667A] group-hover:text-[#2447D4] shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* AI Output Card */}
          {loading && (
            <div className="p-6 rounded-2xl enterprise-panel flex flex-col items-center justify-center text-center space-y-2.5 animate-pulse border border-[#CBC4B3]">
              <RefreshCw className="w-5 h-5 text-[#2447D4] animate-spin" />
              <div className="text-xs font-medium text-[#1B1F2A]">
                Synthesizing POS sales data, competitor benchmarks, and elasticity curves...
              </div>
              <div className="text-[10px] text-[#5F667A] font-mono-tech">
                Running via Gemini 2.5 Flash with live database context
              </div>
            </div>
          )}

          {response && !loading && (
            <div className="p-5 rounded-2xl enterprise-panel border border-[#CBC4B3] space-y-3">
              <div className="flex items-center justify-between text-xs text-[#2447D4] font-semibold">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  <span className="font-serif-display text-sm">Strategic Advisory Synthesis</span>
                </div>
                {meta?.modelUsed && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono-tech bg-[#FFFFFF] border border-[#CBC4B3] text-[#4A5164]">
                    {meta.modelUsed}
                  </span>
                )}
              </div>
              <div className="text-xs text-[#1B1F2A]/90 leading-relaxed whitespace-pre-wrap font-sans-ui">
                {response}
              </div>
              <div className="pt-3 border-t border-[#DDD7CA] flex items-center justify-between text-[10px] text-[#5F667A] font-mono-tech">
                <span>Governed by deterministic economic floors</span>
                <span>Requires explicit operator approval</span>
              </div>
            </div>
          )}

          {!response && !loading && (
            <div className="p-5 rounded-2xl border border-dashed border-[#DDD7CA] text-center text-xs text-[#5F667A] space-y-1.5">
              <AlertTriangle className="w-4 h-4 mx-auto text-[#2447D4]/60" />
              <p>Ask any operational question or select an inquiry above.</p>
              <p className="text-[10px] text-[#5F667A]">
                Accesses live outlet data, candidate pricing models, and local competitor benchmarks.
              </p>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-[#DDD7CA] bg-[#F0ECE3]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask about margins, price elasticity, or cost surges..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 bg-[#FFFFFF] border border-[#CBC4B3] rounded-xl px-3.5 py-2 text-xs text-[#1B1F2A] placeholder-[#5F667A] focus:outline-none focus:border-[#2447D4]"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="px-4 py-2 rounded-xl bg-[#2447D4] hover:bg-[#4D6BEA] disabled:opacity-50 text-[#F6F3ED] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
