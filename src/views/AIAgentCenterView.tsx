/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Bot,
  RefreshCw,
  Cpu,
  Layers,
  ShieldCheck,
  Radar,
  CalendarCheck,
  TrendingUp,
  Activity,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react';

interface AIAgentCenterProps {
  agents: any[];
  onRunCycle: () => Promise<void>;
  onOpenCopilot: (prompt?: string) => void;
}

export const AIAgentCenterView: React.FC<AIAgentCenterProps> = ({
  agents,
  onRunCycle,
  onOpenCopilot,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<any | null>(agents[0] || null);

  const handleTriggerCycle = async () => {
    setIsRunning(true);
    // Simulate sequential stage progress across the multi-agent graph
    for (let i = 0; i < agents.length; i++) {
      setCurrentStepIndex(i);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    try {
      await onRunCycle();
    } catch (err) {
      console.error('Cycle execution failed:', err);
    } finally {
      setIsRunning(false);
      setCurrentStepIndex(null);
    }
  };

  const getAgentIcon = (key: string) => {
    switch (key) {
      case 'market_intel':
        return Radar;
      case 'menu_match':
        return Layers;
      case 'demand_forecast':
        return CalendarCheck;
      case 'pricing_strategy':
        return TrendingUp;
      case 'policy_guard':
        return ShieldCheck;
      default:
        return Cpu;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Introduction */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#DDD7CA]">
        <div>
          <div className="inline-flex items-center gap-2 mb-1.5">
            <h1 className="text-3xl sm:text-4xl font-serif-display text-[#1B1F2A] tracking-tight">
              AI Agent Pipeline Observability
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-[#E8E3D8] text-[#4A5164] text-[10px] font-mono-tech border border-[#CBC4B3]">
              Demo Simulation
            </span>
          </div>
          <p className="text-xs text-[#4A5164] mt-1 font-sans-ui max-w-xl">
            Observable telemetry and sequential execution traces across the 6 specialized AI agents governing market observations, portion matching, and deterministic safeguards.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onOpenCopilot('Evaluate current multi-agent pipeline latency and review policy checks')}
            className="px-3.5 py-2 rounded-xl enterprise-panel hover:bg-[#E8E3D8] text-xs font-medium text-[#1B1F2A] border border-[#CBC4B3] transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2447D4]" />
            <span>AI Health Diagnostics</span>
          </button>

          <button
            onClick={handleTriggerCycle}
            disabled={isRunning}
            className="px-4 py-2 rounded-xl bg-[#2447D4] hover:bg-[#4D6BEA] disabled:opacity-50 text-[#F6F3ED] text-xs font-semibold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Executing Stages...' : 'Trigger Full Cycle'}</span>
          </button>
        </div>
      </div>

      {/* Sequential Pipeline Observability Graph */}
      <div className="p-6 enterprise-panel space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1B1F2A] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2447D4]" />
            <span>Sequential Multi-Agent Topology</span>
          </h3>
          <span className="text-xs font-mono-tech text-[#14806A] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#14806A]" />
            {isRunning ? `Running Stage ${(currentStepIndex || 0) + 1} of ${agents.length}` : 'Sequential Pipeline Active'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {agents.map((agent, idx) => {
            const Icon = getAgentIcon(agent.key);
            const isSelected = selectedAgent?.id === agent.id;
            const isCurrentlyExecuting = isRunning && currentStepIndex === idx;
            const isCompletedInRun = isRunning && currentStepIndex !== null && currentStepIndex > idx;

            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`p-3.5 rounded-xl enterprise-panel cursor-pointer transition-all border ${
                  isCurrentlyExecuting
                    ? 'border-[#2447D4] bg-[#2447D4]/10 shadow-md ring-1 ring-[#2447D4]'
                    : isSelected
                    ? 'border-[#2447D4] bg-[#F0ECE3]'
                    : 'border-[#DDD7CA] hover:border-[#CBC4B3]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono-tech text-[#5F667A]">0{idx + 1}</span>
                  {isCurrentlyExecuting ? (
                    <RefreshCw className="w-2.5 h-2.5 text-[#2447D4] animate-spin" />
                  ) : isCompletedInRun ? (
                    <CheckCircle2 className="w-2.5 h-2.5 text-[#14806A]" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#14806A]" />
                  )}
                </div>

                <div className="w-7 h-7 rounded-lg bg-[#E8E3D8] text-[#2447D4] flex items-center justify-center my-2">
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="text-xs font-semibold text-[#1B1F2A] truncate">
                  {agent.name.replace(' Agent', '')}
                </div>

                <div className="text-[10px] text-[#5F667A] mt-1 font-mono-tech">
                  {agent.durationMs}ms • {agent.itemsProcessed} processed
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Agent Inspector */}
      {selectedAgent && (
        <div className="p-6 enterprise-panel space-y-5 border border-[#CBC4B3]">
          <div className="flex items-center justify-between border-b border-[#DDD7CA] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#E8E3D8] text-[#2447D4] flex items-center justify-center border border-[#CBC4B3]">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono-tech text-[#2447D4]">Stage Observability</span>
                <h3 className="font-serif-display text-lg text-[#1B1F2A]">{selectedAgent.name}</h3>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono-tech text-[#5F667A]">
              <span>Duration: <strong className="text-[#1B1F2A]">{selectedAgent.durationMs}ms</strong></span>
              <span>•</span>
              <span>Status: <strong className="text-[#14806A]">Operational</strong></span>
              <span>•</span>
              <span className="text-[10px] text-[#4A5164]">Demo Telemetry</span>
            </div>
          </div>

          <p className="text-xs text-[#4A5164] leading-relaxed">
            {selectedAgent.role}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono-tech">
            <div className="p-4 enterprise-raised rounded-xl space-y-1.5 border border-[#CBC4B3]">
              <span className="text-[10px] uppercase text-[#5F667A] font-sans-ui block font-semibold">
                Input Telemetry Payload
              </span>
              <p className="text-[#4A5164] text-[11px] leading-relaxed">
                {selectedAgent.inputSummary}
              </p>
            </div>

            <div className="p-4 enterprise-raised rounded-xl space-y-1.5 border border-[#CBC4B3]">
              <span className="text-[10px] uppercase text-[#2447D4] font-sans-ui block font-semibold">
                Deterministic Output Artifacts
              </span>
              <p className="text-[#4A5164] text-[11px] leading-relaxed">
                {selectedAgent.outputSummary}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
