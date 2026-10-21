/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { db } from './db.ts';

export interface StrategicAdviceResult {
  advice: string;
  source: 'gemini_2_5_flash' | 'deterministic_advisor';
  modelUsed: string;
}

/**
 * Server-side Gemini AI integration for strategic restaurant advice,
 * menu engineering diagnostics, and executive rationale synthesis.
 */
export async function generateStrategicAdvice(userPrompt: string): Promise<StrategicAdviceResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (/\b(customer|churn|retention|repeat order|loyalty|come back|return next time)\b/i.test(userPrompt)) {
    const relevantItem = db.menuItems.find((item) =>
      userPrompt.toLowerCase().includes(item.name.toLowerCase())
    );
    const actualChanges = relevantItem
      ? db.priceChanges.filter((change) => change.menuItemId === relevantItem.id).length
      : db.priceChanges.length;
    return {
      advice: [
        'RestaurantIQ cannot estimate whether a particular customer will return: it does not store customer identities, repeat-customer order histories, or complaint records.',
        relevantItem
          ? `For ${relevantItem.name}, ${actualChanges} actual applied price change(s) are recorded; these describe pricing exposure, not customer response.`
          : `${actualChanges} actual applied price change(s) are recorded across the menu; these describe pricing exposure, not customer response.`,
        'Aggregate order series in the demo dataset are synthetic and cannot support a customer-retention conclusion. A return-rate assessment requires reliable, privacy-conscious repeat-order and complaint data.',
      ].join('\n\n'),
      source: 'deterministic_advisor',
      modelUsed: 'RestaurantIQ Deterministic Advisory Engine',
    };
  }

  // Gather rich live context from database
  const metrics = db.getDashboardMetrics();
  const lowStock = db.inventory.filter((i) => i.status === 'low_stock' || i.status === 'critical');
  const pendingRecs = db.recommendations.filter((r) => r.status === 'pending');
  const activeOutlet = db.outlets.find((o) => o.id === db.policy.activeOutletId) || db.outlets[0];
  const topCompetitors = db.competitors.slice(0, 3);

  const systemContext = `
You are the Chief Culinary Economist and AI Strategic Advisor for "${db.policy.restaurantName}".
Location: ${activeOutlet?.locality}, ${activeOutlet?.city} (Currency: ${db.policy.currencySymbol} ${db.policy.currencyCode}).
Current Performance (Last 30 Days):
- Revenue: ${db.policy.currencySymbol}${metrics.periodRevenue.toLocaleString()} (${metrics.revenueChangePct > 0 ? '+' : ''}${metrics.revenueChangePct}%)
- Contribution Margin: ${metrics.contributionMarginPct}% (${db.policy.currencySymbol}${metrics.periodContribution.toLocaleString()})
- Average Check Size: ${db.policy.currencySymbol}${metrics.averageCheckSize} across ${metrics.totalOrders.toLocaleString()} orders
- Low Stock Ingredients: ${lowStock.map((l) => `${l.name} (${l.stockQty}${l.unit})`).join(', ') || 'All stock healthy'}
- Pending Price Approvals: ${pendingRecs.length} items (${pendingRecs.map((r) => `${r.menuItemName}: ${db.policy.currencySymbol}${r.currentPrice} -> ${db.policy.currencySymbol}${r.suggestedPrice}`).join('; ')})
- Key Competitors within ${activeOutlet?.researchRadiusKm}km: ${topCompetitors.map((c) => `${c.name} (${c.distanceKm}km, ${c.priceTier})`).join('; ')}

Instructions:
1. Provide concise, highly actionable, restaurant-native advice.
2. Structure with clear bullet points.
3. Distinguish between revenue, contribution per dish, and customer price sensitivity.
4. Highlight any food cost, platform commission, or inventory risks.
5. Treat all seeded sales, prices, stock, and competitor values as synthetic demonstration data unless provenance proves otherwise.
6. Never invent customers, repeat-customer behavior, complaints, churn rates, or causal effects of pricing on retention.
7. You are advisory only. Never claim to approve or apply a price; all prices remain subject to the deterministic server-side policy engine.
`;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return {
      advice: generateDeterministicAdviceFallback(userPrompt, metrics, pendingRecs),
      source: 'deterministic_advisor',
      modelUsed: 'RestaurantIQ Deterministic Advisory Engine',
    };
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), 20_000);
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      config: {
        systemInstruction: systemContext,
        temperature: 0.2,
        maxOutputTokens: 700,
        httpOptions: { timeout: 20_000 },
        abortSignal: abortController.signal,
      },
    });

    if (response.text?.trim() && response.text.length <= 8000) {
      return {
        advice: response.text.trim(),
        source: 'gemini_2_5_flash',
        modelUsed: 'Google Gemini 2.5 Flash',
      };
    }

    return {
      advice: generateDeterministicAdviceFallback(userPrompt, metrics, pendingRecs),
      source: 'deterministic_advisor',
      modelUsed: 'RestaurantIQ Deterministic Advisory Engine',
    };
  } catch {
    console.warn('Gemini API call failed; using the deterministic advisory fallback.');
    return {
      advice: generateDeterministicAdviceFallback(userPrompt, metrics, pendingRecs),
      source: 'deterministic_advisor',
      modelUsed: 'RestaurantIQ Deterministic Advisory Engine (API Fallback)',
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function generateDeterministicAdviceFallback(
  prompt: string,
  metrics: ReturnType<typeof db.getDashboardMetrics>,
  pendingRecs: ReturnType<typeof db.recommendations.filter>
): string {
  const promptText = prompt.toLowerCase();
  const item = db.menuItems.find((menuItem) => promptText.includes(menuItem.name.toLowerCase()));
  const pendingSummary = pendingRecs.slice(0, 5).map((rec) =>
    `${rec.menuItemName}: ${db.policy.currencySymbol}${rec.currentPrice} → ${db.policy.currencySymbol}${rec.suggestedPrice}`
  );
  const stockAlerts = db.inventory
    .filter((entry) => entry.status === 'low_stock' || entry.status === 'critical')
    .slice(0, 5)
    .map((entry) => `${entry.name} (${entry.stockQty} ${entry.unit}, ${entry.status})`);
  const facts = [
    item ? `Stored menu record: ${item.name} is currently priced at ${db.policy.currencySymbol}${item.currentPrice}; its current economic floor is recalculated during price approval/application.` : null,
    `Pending recommendations: ${pendingRecs.length}${pendingSummary.length ? ` (${pendingSummary.join('; ')})` : ''}.`,
    `Recorded inventory alerts: ${stockAlerts.length ? stockAlerts.join('; ') : 'none currently marked low or critical'}.`,
    `Stored aggregate dashboard contribution margin: ${metrics.contributionMarginPct}% across ${metrics.totalOrders} orders; these seeded/demo values are synthetic and should not be treated as verified live performance.`,
  ].filter(Boolean);

  return [
    `### ${db.policy.restaurantName} advisory`,
    ...facts.map((fact) => `- ${fact}`),
    '- Any price decision must be reviewed through RestaurantIQ’s deterministic economic-floor, movement-limit, and approval controls.',
    `- Your question was: “${prompt.slice(0, 500)}”`,
  ].join('\n');
}
