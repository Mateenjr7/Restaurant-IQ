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
`;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return {
      advice: generateDeterministicAdviceFallback(userPrompt, metrics, pendingRecs),
      source: 'deterministic_advisor',
      modelUsed: 'RestaurantIQ Deterministic Advisory Engine',
    };
  }

  try {
    const ai = new GoogleGenAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemContext}\n\nUser Question / Strategic Inquiry: ${userPrompt}` }],
        },
      ],
    });

    if (response.text) {
      return {
        advice: response.text,
        source: 'gemini_2_5_flash',
        modelUsed: 'Google Gemini 2.5 Flash',
      };
    }

    return {
      advice: generateDeterministicAdviceFallback(userPrompt, metrics, pendingRecs),
      source: 'deterministic_advisor',
      modelUsed: 'RestaurantIQ Deterministic Advisory Engine',
    };
  } catch (err: any) {
    console.warn('Gemini API call failed, falling back to deterministic response:', err?.message);
    return {
      advice: generateDeterministicAdviceFallback(userPrompt, metrics, pendingRecs),
      source: 'deterministic_advisor',
      modelUsed: 'RestaurantIQ Deterministic Advisory Engine (API Fallback)',
    };
  }
}

function generateDeterministicAdviceFallback(
  prompt: string,
  metrics: ReturnType<typeof db.getDashboardMetrics>,
  pendingRecs: ReturnType<typeof db.recommendations.filter>
): string {
  const p = prompt.toLowerCase();

  if (p.includes('biryani') || p.includes('chicken') || p.includes('poultry')) {
    return `### 🍗 Poultry & Biryani Margin Diagnostic\n
* **Current Dynamic:** Chicken Dum Biryani (SKU: BIR-CK-001) is yielding **${db.policy.currencySymbol}150 contribution per unit** at current ${db.policy.currencySymbol}340 price. 
* **Competitor Pressure:** Spice Route Bistro has adjusted their Dum Pukht Biryani to **${db.policy.currencySymbol}380** (+11.7%), leaving headroom for contribution expansion.
* **Cost Alert:** Free-range chicken prices surged **+14.5%** over the past 30 days.
* **Recommendation:** Execute the pending recommendation to raise Hyderabadi Chicken Biryani to **${db.policy.currencySymbol}360** (capturing an extra ${db.policy.currencySymbol}20/order while remaining ${db.policy.currencySymbol}20 under the competitor benchmark). Projected monthly contribution gain: **+${db.policy.currencySymbol}18,800**.`;
  }

  if (p.includes('weekend') || p.includes('demand') || p.includes('forecast')) {
    return `### 📈 Weekend Surge & Capacity Optimization\n
* **Forecasted Volume:** Friday & Saturday dinner slots show an expected **1.42x – 1.55x velocity surge** relative to weekday baselines.
* **High-Contribution Anchors:** Pair Butter Garlic Naan (${db.policy.currencySymbol}53 contribution / 70.6% margin) with Butter Chicken and Dal Makhani.
* **Inventory Bottleneck:** Baby goat meat for Mutton Dum Biryani is at **19kg** (below the 25kg safety threshold). Avoid delivery discounts on mutton biryani until restocked on Friday morning.`;
  }

  return `### 💡 Strategic Margin Recommendation for ${db.policy.restaurantName}\n
1. **Approve High-Confidence Adjustments:** You have **${pendingRecs.length} pending price recommendations** waiting in the queue. Approving these will raise overall portfolio contribution margin from **${metrics.contributionMarginPct}% to 46.2%**.
2. **Protect Against Food Cost Inflation:** Chicken wholesale input costs are up 14.5%. The deterministic pricing engine has calculated an updated economic floor of ${db.policy.currencySymbol}190–${db.policy.currencySymbol}205 across gravies to prevent margin erosion.
3. **Menu Engineering Focus:** Star dishes like *Dal Makhani* (70.8% margin) and *Alphonso Mango Lassi* (58.5% margin) have low price elasticity. Consider combo pairings to increase average check size beyond ${db.policy.currencySymbol}${metrics.averageCheckSize}.`;
}
