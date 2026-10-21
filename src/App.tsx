/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PanelSpotlight } from './components/PanelSpotlight.tsx';
import React, { useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BrandLogo } from './components/BrandLogo.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { AICopilotDrawer } from './components/AICopilotDrawer.tsx';
import { ImmersiveEntryView } from './views/ImmersiveEntryView.tsx';
import { OverviewDashboard } from './views/OverviewDashboard.tsx';
import { PricingRecommendationsView } from './views/PricingRecommendationsView.tsx';
import { MenuIntelligenceView } from './views/MenuIntelligenceView.tsx';
import { CompetitiveIntelligenceView } from './views/CompetitiveIntelligenceView.tsx';
import { PricingSimulatorView } from './views/PricingSimulatorView.tsx';
import { DemandForecastingView } from './views/DemandForecastingView.tsx';
import { InventoryManagementView } from './views/InventoryManagementView.tsx';
import { AIAgentCenterView } from './views/AIAgentCenterView.tsx';
import { ApprovalsAuditLogView } from './views/ApprovalsAuditLogView.tsx';
import { SettingsPolicyView } from './views/SettingsPolicyView.tsx';
import { CustomerTrustView } from './views/CustomerTrustView.tsx';
import {
  LayoutDashboard,
  TrendingUp,
  UtensilsCrossed,
  Radar,
  SlidersHorizontal,
  CalendarCheck,
  Package,
  Bot,
  ShieldCheck,
  Settings,
  Sparkles,
  Search,
  Bell,
  RefreshCw,
  Building2,
  ChevronDown,
  Menu,
  X,
  Compass,
  Cpu,
  UserCheck,
  ShieldAlert,
  Lock,
} from 'lucide-react';

const VIEW_KEYS = ['overview', 'recommendations', 'menu', 'competitors', 'simulator', 'forecasting', 'inventory', 'agents', 'trust', 'audit', 'settings'];
gsap.registerPlugin(ScrollTrigger);

/** `/` is the landing page; `/app` and `/app/<view>` are the application. */
function parsePath(pathname: string): { experience: 'entry' | 'command_center'; view: string } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'app') return { experience: 'entry', view: 'overview' };
  const v = parts[1];
  return { experience: 'command_center', view: v && VIEW_KEYS.includes(v) ? v : 'overview' };
}

function pathForRoute(route: { experience: 'entry' | 'command_center'; view: string }) {
  if (route.experience === 'entry') return '/';
  return route.view === 'overview' ? '/app' : `/app/${route.view}`;
}

export default function App() {
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  const currentExperience = route.experience;
  const activeView = route.view;

  const navigate = (path: string) => {
    if (path !== window.location.pathname) window.history.pushState(null, '', path);
    setRoute(parsePath(path));
  };
  const setActiveView = (view: string) => navigate(view === 'overview' ? '/app' : `/app/${view}`);
  const setCurrentExperience = (exp: 'entry' | 'command_center') => navigate(exp === 'entry' ? '/' : '/app');

  // Browser back / forward
  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Keep direct links and history navigation on a canonical, refresh-safe URL.
  useEffect(() => {
    const canonicalPath = pathForRoute(route);
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState(null, '', canonicalPath);
    }
  }, [route]);

  // Modals & Panels
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simulatorItemData, setSimulatorItemData] = useState<any | null>(null);

  // Authentication & RBAC Operator State
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [demoAccounts, setDemoAccounts] = useState<any[]>([]);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [globalBannerError, setGlobalBannerError] = useState<string | null>(null);

  // App Data State
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [menuMatches, setMenuMatches] = useState<any[]>([]);
  const [outlets, setOutlets] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [policy, setPolicy] = useState<any | null>(null);
  const [customerTrust, setCustomerTrust] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Scroll-linked depth is scoped to the active view and follows the document scroll.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const view = document.querySelector<HTMLElement>('.app-main .view-enter');
    if (!view) return;

    const travel = window.matchMedia('(pointer: coarse)').matches ? 8 : 18;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('section:not(.overview-intro)', view).forEach((section) => {
        gsap.fromTo(section, { y: travel, opacity: 0.94 }, {
          y: 0,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top 94%',
            end: 'top 70%',
            scrub: 0.45,
          },
        });
      });

      gsap.utils.toArray<HTMLElement>('.enterprise-panel', view)
        .filter((panel) => {
          const bounds = panel.getBoundingClientRect();
          return bounds.width > 260 && bounds.height > 120;
        })
        .forEach((panel) => {
          gsap.fromTo(panel, { opacity: 0.94 }, {
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: panel,
              start: 'top 94%',
              end: 'top 72%',
              scrub: 0.35,
            },
          });
        });

      if (activeView === 'overview') {
        const intro = view.querySelector<HTMLElement>('.overview-intro');
        const visual = view.querySelector<HTMLElement>('.overview-visual');
        if (intro) {
          gsap.to(intro, {
            yPercent: -4,
            scale: 0.985,
            opacity: 0.92,
            ease: 'none',
            scrollTrigger: {
              trigger: intro,
              start: 'top top',
              end: 'bottom top',
              scrub: true,
            },
          });
        }
        if (intro && visual) {
          gsap.to(visual, {
            yPercent: 16,
            ease: 'none',
            scrollTrigger: {
              trigger: intro,
              start: 'top top',
              end: 'bottom top',
              scrub: true,
            },
          });
        }
      }
    }, view);

    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(refreshFrame);
      ctx.revert();
    };
  }, [activeView, route.experience, loading]);

  // Authenticated fetch wrapper that attaches genuine Bearer session token
  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    const token = authToken || localStorage.getItem('restaurantiq_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      const data = await res.clone().json().catch(() => ({}));
      const msg = data.error || (res.status === 403 ? 'Forbidden: Insufficient privileges' : 'Authentication required');
      setGlobalBannerError(msg);
    }
    return res;
  }, [authToken]);

  // Switch operator profile by obtaining a genuine server-signed JWT session
  const switchOperatorRole = async (role: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setAuthToken(data.token);
        setCurrentUser(data.user);
        setActiveView('overview');
        localStorage.setItem('restaurantiq_token', data.token);
        setUserDropdownOpen(false);
        setGlobalBannerError(null);
      } else {
        setGlobalBannerError(data.error || `Authentication failed (${res.status})`);
      }
    } catch (err) {
      setGlobalBannerError(err instanceof Error ? err.message : 'Failed to authenticate with RestaurantIQ');
    }
  };

  // Initial Authentication Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        const demoRes = await fetch('/api/auth/demo-accounts');
        if (demoRes.ok) {
          const accounts = await demoRes.json();
          setDemoAccounts(accounts);
        }

        const savedToken = localStorage.getItem('restaurantiq_token');
        if (savedToken) {
          const sessionRes = await fetch('/api/auth/session', {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          const sessionData = await sessionRes.json();
          if (sessionData.authenticated && sessionData.user) {
            setAuthToken(savedToken);
            setCurrentUser(sessionData.user);
            return;
          }
        }
        localStorage.removeItem('restaurantiq_token');

        // Default initial session: Revenue Manager
        await switchOperatorRole('revenue_manager');
      } catch (err) {
        setGlobalBannerError(err instanceof Error ? err.message : 'RestaurantIQ authentication could not be initialized');
      }
    };

    initAuth();
  }, []);

  // Load all live data from backend APIs
  const fetchAllData = async () => {
    try {
      if (!currentUser) return;
      const isRevenueRole = ['admin', 'revenue_manager'].includes(currentUser.role);
      const isAuditRole = currentUser.role === 'auditor';
      const requests: Array<[string, string]> = [
        ['menu', '/api/menu'],
        ['inventory', '/api/inventory'],
      ];
      if (isRevenueRole) {
        requests.push(
          ['recommendations', '/api/recommendations'],
          ['competitors', '/api/competitors'],
          ['observations', '/api/competitors/observations'],
          ['matches', '/api/matches'],
          ['outlets', '/api/outlets'],
          ['metrics', '/api/dashboard/metrics'],
          ['forecasting', '/api/forecasting']
        );
      } else if (currentUser.role === 'kitchen_ops' || isAuditRole) {
        requests.push(['forecasting', '/api/forecasting']);
      }
      if (isRevenueRole || isAuditRole) {
        requests.push(
          ['agents', '/api/agents'],
          ['audit', '/api/audit'],
          ['policy', '/api/policy'],
          ['customerTrust', '/api/customer-trust']
        );
      }

      const results = await Promise.all(requests.map(async ([key, url]) => {
        const response = await authFetch(url);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load ${key} (${response.status})`);
        }
        return [key, await response.json()] as const;
      }));

      for (const [key, data] of results) {
        switch (key) {
          case 'menu': setMenuItems(data || []); break;
          case 'recommendations': setRecommendations(data || []); break;
          case 'competitors': setCompetitors(data || []); break;
          case 'observations': setObservations(data || []); break;
          case 'matches': setMenuMatches(data || []); break;
          case 'outlets': setOutlets(data || []); break;
          case 'inventory': setInventory(data || []); break;
          case 'agents': setAgents(data || []); break;
          case 'audit': setAuditEvents(data || []); break;
          case 'metrics': setMetrics(data || null); break;
          case 'policy': setPolicy(data || null); break;
          case 'customerTrust': setCustomerTrust(data || null); break;
        }
      }
    } catch (err) {
      console.error('Error fetching live data from RestaurantIQ API:', err);
      setGlobalBannerError(err instanceof Error ? err.message : 'Failed to load RestaurantIQ data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken && currentUser) void fetchAllData();
  }, [authToken, currentUser]);

  useEffect(() => {
    document.title =
      currentExperience === 'entry'
        ? 'RestaurantIQ — Dynamic Pricing & Intelligence Engine'
        : `${activeView.charAt(0).toUpperCase() + activeView.slice(1)} · RestaurantIQ`;
  }, [currentExperience, activeView]);

  // Keyboard shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Action Handlers with Authorization
  const handleApproveRec = async (id: string, allowStepOverride: boolean = false) => {
    const res = await authFetch(`/api/recommendations/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowStepOverride }),
    });
    const data = await res.json();
    if (!res.ok) {
      await fetchAllData();
      throw new Error(data.error || 'Failed to approve recommendation');
    }
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'approved' } : r))
    );
    await fetchAllData();
    return data.recommendation;
  };

  const handleApplyRec = async (id: string) => {
    const res = await authFetch(`/api/recommendations/${id}/apply`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      await fetchAllData();
      throw new Error(data.error || 'Failed to apply recommendation to POS');
    }
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'applied' } : r))
    );
    await fetchAllData();
    return data;
  };

  const handleRejectRec = async (id: string, reason: string) => {
    try {
      const res = await authFetch(`/api/recommendations/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        setRecommendations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: 'rejected' } : r))
        );
        fetchAllData();
      }
    } catch (err) {
      console.error('Failed to reject recommendation:', err);
    }
  };

  const handleRunCycle = async () => {
    try {
      const res = await authFetch('/api/agents/run-cycle', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to execute agent cycle');
      }
      await fetchAllData();
    } catch (err: any) {
      console.error('Failed to run agent cycle:', err);
      setGlobalBannerError(err.message);
    }
  };

  const handleAddMenuItem = async (itemData: any) => {
    const res = await authFetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create item');
    }
    await fetchAllData();
  };

  const handleUpdateMenuItem = async (id: string, itemData: any) => {
    const res = await authFetch(`/api/menu/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update item');
    }
    await fetchAllData();
  };

  const handleOverridePrice = async (id: string, newPrice: number, reason: string) => {
    const res = await authFetch(`/api/menu/${id}/override-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPrice, reason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to override price');
    }
    await fetchAllData();
  };

  const handleAddObservation = async (obsData: any) => {
    const res = await authFetch('/api/competitors/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obsData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add observation');
    }
    await fetchAllData();
  };

  const handleImportMenu = async (competitorId: string, rows: any[]) => {
    const res = await authFetch('/api/competitors/import-menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitorId, rows }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to import menu');
    }
    await fetchAllData();
  };

  const handleUpdateMatchStatus = async (matchId: string, status: string) => {
    const res = await authFetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update match status');
    }
    await fetchAllData();
  };

  const handleAdjustStock = async (id: string, newStockQty: number, reason: string) => {
    const res = await authFetch(`/api/inventory/${id}/adjust`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStockQty, reason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to adjust stock');
    }
    await fetchAllData();
  };

  const handleUpdatePolicy = async (updatedPolicy: any) => {
    const res = await authFetch('/api/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPolicy),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update policy');
    }
    await fetchAllData();
  };

  const handleSwitchOutlet = async (outletId: string) => {
    const res = await authFetch('/api/outlets/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to switch outlet');
    }
    await fetchAllData();
  };

  const handleOpenCopilot = (prompt?: string) => {
    if (!currentUser || !['admin', 'revenue_manager'].includes(currentUser.role)) {
      setGlobalBannerError('Strategic AI advice is available to administrators and revenue managers.');
      return;
    }
    setCopilotInitialPrompt(prompt || '');
    setCopilotOpen(true);
  };

  const handleNavigateToSimulator = (itemOrRec: any) => {
    setSimulatorItemData(itemOrRec);
    setActiveView('simulator');
  };

  // If user is viewing Experience A (Brand Showcase / 3D Entry)
  if (currentExperience === 'entry') {
    return (
      <>
        <ImmersiveEntryView
          onEnterCommandCenter={(role) => {
            if (role && role !== currentUser?.role) switchOperatorRole(role);
            setCurrentExperience('command_center');
          }}
        />
      </>
    );
  }

  // Active outlet details
  const activeOutlet = outlets.find((o) => o.id === policy?.activeOutletId) || outlets[0];
  const currencySymbol = policy?.currencySymbol || '₹';

  interface NavItem {
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string | null;
    badgeColor?: string;
  }

  interface NavGroup {
    group: string;
    items: NavItem[];
  }

  // Grouped Navigation Structure
  const navGroups: NavGroup[] = [
    {
      group: 'OVERVIEW',
      items: [
        { key: 'overview', label: 'Command Center', icon: LayoutDashboard, badge: null },
      ],
    },
    {
      group: 'INTELLIGENCE',
      items: [
        { key: 'competitors', label: 'Nearby Restaurants', icon: Radar, badge: competitors.length },
        { key: 'menu', label: 'Your Menu', icon: UtensilsCrossed, badge: null },
        { key: 'forecasting', label: 'Busy-Day Forecast', icon: CalendarCheck, badge: null },
      ],
    },
    {
      group: 'REVENUE',
      items: [
        {
          key: 'recommendations',
          label: 'Pricing & Margins',
          icon: TrendingUp,
          badge: recommendations.filter((r) => r.status === 'pending').length,
          badgeColor: 'bg-[#2447D4] text-[#F6F3ED] font-bold',
        },
        { key: 'simulator', label: 'What-If Prices', icon: SlidersHorizontal, badge: null },
      ],
    },
    {
      group: 'OPERATIONS',
      items: [
        {
          key: 'inventory',
          label: 'Inventory & Food Cost',
          icon: Package,
          badge: inventory.filter((i) => i.status === 'low_stock' || i.status === 'critical').length,
          badgeColor: 'bg-[#C23B34]/20 text-[#C23B34]',
        },
        { key: 'agents', label: 'Assistants', icon: Bot, badge: '6 Pipeline' },
      ],
    },
    {
      group: 'GOVERNANCE',
      items: [
        { key: 'trust', label: 'Customer Trust', icon: ShieldCheck, badge: customerTrust?.summary?.approachingLimits || null, badgeColor: 'bg-[#A8650F]/10 text-[#A8650F]' },
        { key: 'audit', label: 'History', icon: ShieldCheck, badge: null },
        { key: 'settings', label: 'Rules & Settings', icon: Settings, badge: null },
      ],
    },
  ];
  const revenueRoles = ['admin', 'revenue_manager'];
  const viewRoles: Record<string, string[]> = {
    overview: ['admin', 'revenue_manager', 'kitchen_ops', 'auditor'],
    competitors: revenueRoles,
    menu: ['admin', 'revenue_manager', 'kitchen_ops', 'auditor'],
    forecasting: ['admin', 'revenue_manager', 'kitchen_ops', 'auditor'],
    recommendations: revenueRoles,
    simulator: revenueRoles,
    inventory: ['admin', 'revenue_manager', 'kitchen_ops', 'auditor'],
    agents: ['admin', 'revenue_manager', 'auditor'],
    trust: ['admin', 'revenue_manager', 'auditor'],
    audit: ['admin', 'revenue_manager', 'auditor'],
    settings: revenueRoles,
  };
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => viewRoles[item.key]?.includes(currentUser?.role)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="app-shell min-h-screen bg-transparent text-[#1B1F2A] flex flex-col font-sans-ui antialiased">
      <PanelSpotlight />
      {/* Subtle Grain Overlay */}
      <div className="grain-overlay" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#2447D4] focus:text-[#F6F3ED] text-xs font-semibold">Skip to content</a>

      {/* Global Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={(view) => {
          if (viewRoles[view]?.includes(currentUser?.role)) setActiveView(view);
          else setGlobalBannerError('Your current operator role cannot access that section.');
        }}
        onTriggerCopilot={handleOpenCopilot}
        onRunCycle={handleRunCycle}
      />

      {/* AI Strategic Copilot Drawer */}
      <AICopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        initialPrompt={copilotInitialPrompt}
        authFetch={authFetch}
      />

      {/* Refined Enterprise Top Navigation Bar */}
      <header className="app-header sticky top-0 z-30 h-14 bg-[#F6F3ED]/60 backdrop-blur-xl border-b border-[#DDD7CA] px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg enterprise-panel text-[#4A5164] hover:text-[#1B1F2A]"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <BrandLogo size="md" />

          {/* Active Outlet Dropdown */}
          <div className="app-outlet hidden xl:flex items-center gap-2 pl-4 border-l border-[#DDD7CA]">
            <Building2 className="w-3.5 h-3.5 text-[#2447D4]" />
            <select
              value={policy?.activeOutletId || 'outlet-1'}
              onChange={(e) => handleSwitchOutlet(e.target.value)}
              className="bg-transparent text-xs font-medium text-[#1B1F2A] focus:outline-none cursor-pointer hover:text-[#2447D4] transition-colors"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id} className="bg-[#FFFFFF] text-[#1B1F2A]">
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* Data-Source Connection Status */}
          <div className="hidden 2xl:flex items-center gap-2 text-[11px] font-mono-tech text-[#5F667A] pl-3 border-l border-[#DDD7CA] whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2447D4]" />
            <span>Environment: Demonstration Sandbox (Persisted) • Economic Safeguards: Enforced</span>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-3">
          {/* Command Search */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="app-search hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg enterprise-panel text-xs text-[#5F667A] hover:text-[#1B1F2A] border border-[#DDD7CA] hover:border-[#CBC4B3] transition-colors whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5 text-[#2447D4]" />
            <span className="hidden lg:inline">Search commands or SKUs…</span><span className="lg:hidden">Search…</span>
            <kbd className="px-1.5 py-0.2 rounded bg-[#F0ECE3] text-[10px] font-mono-tech text-[#4A5164]">⌘K</kbd>
          </button>

          {/* AI Copilot Button */}
          <button
            onClick={() => handleOpenCopilot()}
            className="px-3.5 py-1.5 rounded-lg enterprise-panel text-xs font-medium text-[#1B1F2A] border border-[#CBC4B3] hover:border-[#2447D4]/40 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2447D4]" />
            <span className="hidden sm:inline">Ask AI Copilot</span>
            <span className="sm:hidden">Copilot</span>
          </button>

          {/* Brand Showcase Switcher */}
          <button
            onClick={() => setCurrentExperience('entry')}
            title="Switch to 3D Brand Showcase"
            className="px-3 py-1.5 rounded-lg enterprise-panel text-xs text-[#5F667A] hover:text-[#1B1F2A] flex items-center gap-1.5 transition-colors border border-[#DDD7CA] whitespace-nowrap shrink-0"
          >
            <Compass className="w-3.5 h-3.5 text-[#2447D4]" />
            <span className="hidden md:inline">Brand Showcase</span>
          </button>

          {/* Interactive Role-Based Operator Switcher */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="px-2.5 py-1.5 rounded-lg enterprise-panel border border-[#CBC4B3] hover:border-[#2447D4]/50 flex items-center gap-2 text-xs transition-colors cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-[#E8E3D8] text-[#2447D4] flex items-center justify-center font-bold text-[10px]">
                {currentUser?.role === 'admin' ? 'A' : currentUser?.role === 'revenue_manager' ? 'R' : currentUser?.role === 'kitchen_ops' ? 'K' : 'G'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[11px] font-semibold text-[#1B1F2A] leading-tight flex items-center gap-1">
                  <span>{currentUser?.name?.split(' ')[0] || 'Operator'}</span>
                  <ChevronDown className="w-3 h-3 text-[#5F667A]" />
                </div>
                <div className="text-[9px] font-mono-tech text-[#2447D4] uppercase leading-none">
                  {currentUser?.role || 'Guest'}
                </div>
              </div>
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#F0ECE3] border border-[#CBC4B3] shadow-2xl p-2 z-50 text-xs animate-in fade-in">
                <div className="px-3 py-2 border-b border-[#DDD7CA] mb-1">
                  <div className="text-[10px] uppercase font-mono-tech text-[#5F667A] font-semibold">Active Operator Role</div>
                  <div className="font-semibold text-[#1B1F2A] mt-0.5">{currentUser?.name}</div>
                  <div className="text-[10px] text-[#4A5164] font-mono-tech">{currentUser?.email}</div>
                </div>

                <div className="space-y-1">
                  {demoAccounts.map((account) => {
                    const isActive = currentUser?.role === account.role;
                    return (
                      <button
                        key={account.role}
                        onClick={() => switchOperatorRole(account.role)}
                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#2447D4]/15 text-[#2447D4] font-semibold'
                            : 'hover:bg-[#E8E3D8] text-[#4A5164] hover:text-[#1B1F2A]'
                        }`}
                      >
                        <div>
                          <div className="text-xs">{account.name}</div>
                          <div className="text-[10px] font-mono-tech uppercase text-[#5F667A]">
                            {account.role}
                          </div>
                        </div>
                        {isActive && <UserCheck className="w-3.5 h-3.5 text-[#2447D4]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global RBAC Security Banner Notification */}
      {globalBannerError && (
        <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2.5 text-xs text-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{globalBannerError}</span>
          </div>
          <button
            onClick={() => setGlobalBannerError(null)}
            className="p-1 text-red-300 hover:text-[#1B1F2A]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Layout Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Grouped Sidebar Navigation */}
        <aside
          className={`app-sidebar fixed lg:static inset-y-0 left-0 z-20 w-64 bg-[#F6F3ED] lg:bg-[#FFFFFF]/40 border-r border-[#DDD7CA] flex flex-col justify-between p-4 transition-transform duration-200 overflow-y-auto ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="space-y-5">
            {visibleNavGroups.map((grp) => (
              <div key={grp.group} className="space-y-1">
                <div className="px-3 text-[10px] uppercase tracking-[0.18em] font-mono-tech text-[#5F667A] font-semibold">
                  {grp.group}
                </div>

                {grp.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.key;

                  return (
                    <button
                      key={item.key}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => {
                        setActiveView(item.key);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-wide transition-all ${
                        isActive
                          ? 'bg-[#E8E3D8] text-[#2447D4] border-l-2 border-[#2447D4] pl-2.5 shadow-sm'
                          : 'text-[#4A5164] hover:text-[#1B1F2A] hover:bg-[#F0ECE3]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#2447D4]' : 'text-[#5F667A]'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== null && item.badge !== undefined && (
                        <span
                          className={`text-[10px] font-mono-tech px-1.5 py-0.2 rounded ${
                            item.badgeColor || 'bg-[#E8E3D8] text-[#4A5164]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Bottom Sidebar Status Card */}
          <div className="pt-4 border-t border-[#DDD7CA] space-y-2">
            <div className="p-3 rounded-xl enterprise-raised space-y-1 border border-[#CBC4B3]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#1B1F2A] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#14806A]" />
                  <span>{activeOutlet?.name?.split('(')[0] || 'Flagship'}</span>
                </span>
                <span className="text-[10px] font-mono-tech text-[#2447D4]">Active</span>
              </div>
              <div className="text-[10px] text-[#5F667A] font-mono-tech flex justify-between">
                <span>Comm: {activeOutlet?.deliveryCommissionPct || 20}%</span>
                <span>Proc: 2%</span>
              </div>
            </div>

            <div className="text-[10px] font-mono-tech text-[#5F667A] flex items-center justify-between px-1">
              <span>RestaurantIQ v1.4</span>
              <span>Enterprise RBAC</span>
            </div>
          </div>
        </aside>

        {/* Main Content Workspace */}
        <main id="main" className="app-main flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div key={activeView} className="max-w-7xl mx-auto view-enter">
            {activeView === 'overview' && (
              <OverviewDashboard
                metrics={metrics}
                recommendations={recommendations}
                menuItems={menuItems}
                agents={agents}
                inventory={inventory}
                currencySymbol={currencySymbol}
                activeOutlet={activeOutlet}
                onNavigate={(view) => setActiveView(view)}
                onApproveRec={handleApproveRec}
                onOpenCopilot={handleOpenCopilot}
                onRefreshData={fetchAllData}
                authFetch={authFetch}
              />
            )}

            {activeView === 'recommendations' && (
              <PricingRecommendationsView
                recommendations={recommendations}
                currencySymbol={currencySymbol}
                onApprove={handleApproveRec}
                onApply={handleApplyRec}
                onReject={handleRejectRec}
                onRegenerate={handleRunCycle}
                onOpenCopilot={handleOpenCopilot}
                onNavigateToSimulator={handleNavigateToSimulator}
              />
            )}

            {activeView === 'menu' && (
              <MenuIntelligenceView
                menuItems={menuItems}
                currencySymbol={currencySymbol}
                onAddItem={handleAddMenuItem}
                onUpdateItem={handleUpdateMenuItem}
                onOverridePrice={handleOverridePrice}
                onNavigateToSimulator={handleNavigateToSimulator}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeView === 'competitors' && (
              <CompetitiveIntelligenceView
                competitors={competitors}
                observations={observations}
                menuItems={menuItems}
                menuMatches={menuMatches}
                currencySymbol={currencySymbol}
                activeOutlet={activeOutlet}
                onAddObservation={handleAddObservation}
                onImportMenu={handleImportMenu}
                onUpdateMatchStatus={handleUpdateMatchStatus}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeView === 'simulator' && (
              <PricingSimulatorView
                initialRec={simulatorItemData}
                menuItems={menuItems}
                currencySymbol={currencySymbol}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeView === 'forecasting' && (
              <DemandForecastingView
                menuItems={menuItems}
                currencySymbol={currencySymbol}
                authFetch={authFetch}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeView === 'inventory' && (
              <InventoryManagementView
                inventory={inventory}
                currencySymbol={currencySymbol}
                onAdjustStock={handleAdjustStock}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeView === 'agents' && (
              <AIAgentCenterView
                agents={agents}
                onRunCycle={handleRunCycle}
                onOpenCopilot={handleOpenCopilot}
              />
            )}

            {activeView === 'audit' && (
              <ApprovalsAuditLogView
                auditEvents={auditEvents}
                currencySymbol={currencySymbol}
              />
            )}

            {activeView === 'trust' && (
              <CustomerTrustView dashboard={customerTrust} currencySymbol={currencySymbol} />
            )}

            {activeView === 'settings' && (
              <SettingsPolicyView
                policy={policy}
                outlets={outlets}
                menuItems={menuItems}
                activeOutlet={activeOutlet}
                onUpdatePolicy={handleUpdatePolicy}
                onSwitchOutlet={handleSwitchOutlet}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
