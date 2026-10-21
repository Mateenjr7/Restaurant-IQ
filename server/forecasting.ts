/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DemandForecastItem, DemandForecastPoint, MenuItem } from './types.ts';
import { db } from './db.ts';

/**
 * Holt-Winters Additive Seasonality Time Series Forecaster
 * 
 * Mathematical Specification:
 * - Periodicity: L = 7 (Day-of-Week weekly seasonality)
 * - Model equations for level l_t, trend b_t, seasonal s_t:
 *     l_t = alpha * (y_t - s_{t-L}) + (1 - alpha) * (l_{t-1} + b_{t-1})
 *     b_t = beta * (l_t - l_{t-1}) + (1 - beta) * b_{t-1}
 *     s_t = gamma * (y_t - l_t) + (1 - gamma) * s_{t-L}
 * - Out-of-sample validation:
 *     Split historical observations into Training (first N - 14 days) and Validation (last 14 days).
 *     Fit parameters on training set, generate predictions for validation set,
 *     and calculate actual prediction residuals: e_t = y_t - y_hat_t.
 *     MAE = (1/n) * sum(|e_t|)
 *     RMSE = sqrt((1/n) * sum(e_t^2))
 * - When observations are insufficient (< 14 days), MAE and RMSE are set to null,
 *   and validationStatus reports "Validation metrics unavailable".
 * - Forecasts are explicitly labeled as estimates with documented assumptions.
 */
export function generateDemandForecast(menuItemId: string): DemandForecastItem {
  const item = db.menuItems.find((m) => m.id === menuItemId);
  if (!item) throw new Error('Menu item not found');
  const sourceHistory = item.dailySalesHistory || [];
  const history = [...sourceHistory].sort((a, b) => a.date.localeCompare(b.date));
  const validDates = new Set<string>();
  const historyIsValid = history.every((day, index) => {
    const parsedDate = new Date(`${day.date}T00:00:00Z`);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === day.date;
    if (
      !validDate ||
      validDates.has(day.date) ||
      !Number.isFinite(day.orders) ||
      day.orders < 0 ||
      !Number.isFinite(day.revenue) ||
      day.revenue < 0
    ) return false;
    validDates.add(day.date);
    if (index > 0) {
      const previousDate = new Date(`${history[index - 1].date}T00:00:00Z`);
      if (parsedDate.getTime() - previousDate.getTime() !== 86400000) return false;
    }
    return true;
  });

  // Day names helper
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  // If historical time-series data is insufficient (< 14 observations),
  // NEVER fabricate validation metrics!
  if (!historyIsValid || history.length < 14) {
    const recordedAggregateOrders = Number.isFinite(item.historicalSalesLast30Days)
      ? Math.max(0, item.historicalSalesLast30Days)
      : 0;
    const hasForecastData = recordedAggregateOrders > 0;
    const baselineDaily = hasForecastData ? Math.round(recordedAggregateOrders / 30) : 0;
    const dayOfWeekFactors = [1.35, 0.78, 0.84, 0.92, 1.05, 1.42, 1.55]; // Sun..Sat
    const trendFactor = item.demandTrend === 'surging' ? 1.08 : item.demandTrend === 'softening' ? 0.94 : 1.0;

    const next7DaysForecast: DemandForecastPoint[] = [];
    for (let i = 1; hasForecastData && i <= 7; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(today.getDate() + i);
      const dayIndex = forecastDate.getDay();
      const baseOrders = Math.round(baselineDaily * dayOfWeekFactors[dayIndex] * trendFactor);
      const margin = Math.round(baseOrders * 0.15);

      next7DaysForecast.push({
        date: forecastDate.toISOString().split('T')[0],
        dayOfWeek: dayNames[dayIndex],
        forecastedOrders: baseOrders,
        lowerBound: Math.max(0, baseOrders - margin),
        upperBound: baseOrders + margin,
      });
    }

    return {
      menuItemId: item.id,
      itemName: item.name,
      historicalDailyAverage: baselineDaily,
      next7DaysForecast,
      hasForecastData,
      isSyntheticDemoData: Boolean(item.isSyntheticDemoData),
      mae: null,
      rmse: null,
      validationStatus: !hasForecastData
        ? 'Forecast unavailable (no valid daily series or positive order baseline is recorded)'
        : historyIsValid
          ? 'Validation metrics unavailable (insufficient out-of-sample historical observations)'
          : 'Validation metrics unavailable (daily history contains invalid, duplicate, or missing dates)',
      isEstimate: true,
      modelType: 'Heuristic Day-of-Week Seasonality Baseline (Estimate)',
      trend: item.demandTrend,
      evaluationWindow: 'None (Requires at least 14 consecutive, valid daily historical order observations)',
      assumptions: [
        hasForecastData
          ? 'Heuristic baseline: Day-of-week multipliers applied to the recorded 30-day order aggregate'
          : 'No forecast values are generated without a valid daily series or recorded order baseline',
        historyIsValid
          ? 'Validation metrics omitted because historical daily data is insufficient for out-of-sample testing'
          : 'Daily history is invalid or has gaps; observations were not interpolated or treated as zero-order days',
        'Subject to restaurant operating capacity and seasonal holidays',
      ],
      methodDescription: hasForecastData
        ? 'Heuristic seasonal multiplier baseline. Validation metrics are unavailable until sufficient consecutive, valid daily sales history is recorded.'
        : 'No forecast is returned because the item has no usable historical order baseline.',
    };
  }

  // --- GENUINE HOLT-WINTERS EXPONENTIAL SMOOTHING ---
  const orderSeries = history.map((h) => h.orders);
  const totalObs = orderSeries.length;
  const validationDays = Math.min(14, Math.floor(totalObs / 3));
  const trainObs = totalObs - validationDays;
  const seasonLength = 7; // Weekly periodicity

  const alpha = 0.25; // Level smoothing parameter
  const beta = 0.08;  // Trend smoothing parameter
  const gamma = 0.30; // Seasonal smoothing parameter

  // Helper function to initialize and run Holt-Winters on a slice of data
  function fitHoltWinters(series: number[], L: number) {
    const N = series.length;
    // Initial level: mean of first season
    let level = series.slice(0, L).reduce((sum, v) => sum + v, 0) / L;

    // Initial trend: average change between corresponding points in first two seasons if available
    let trend = 0;
    if (N >= 2 * L) {
      trend = (series.slice(L, 2 * L).reduce((sum, v) => sum + v, 0) - series.slice(0, L).reduce((sum, v) => sum + v, 0)) / (L * L);
    }

    // Initial seasonal indices
    const seasonal = new Array(L).fill(0);
    for (let i = 0; i < L; i++) {
      seasonal[i] = series[i] - level;
    }
    // Normalize seasonal indices to sum to zero
    const seasonMean = seasonal.reduce((sum, v) => sum + v, 0) / L;
    for (let i = 0; i < L; i++) {
      seasonal[i] -= seasonMean;
    }

    // Run recursion through series
    for (let t = 0; t < N; t++) {
      const sIndex = t % L;
      const prevLevel = level;
      const prevTrend = trend;
      const prevSeason = seasonal[sIndex];

      const yt = series[t];
      level = alpha * (yt - prevSeason) + (1 - alpha) * (prevLevel + prevTrend);
      trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
      seasonal[sIndex] = gamma * (yt - level) + (1 - gamma) * prevSeason;
    }

    return { finalLevel: level, finalTrend: trend, seasonalIndices: seasonal };
  }

  // 1. Train on training split (series[0 ... trainObs - 1])
  const trainSeries = orderSeries.slice(0, trainObs);
  const trainModel = fitHoltWinters(trainSeries, seasonLength);

  // 2. Predict out-of-sample on validation split and calculate REAL prediction errors
  const valSeries = orderSeries.slice(trainObs);
  const actualErrors: number[] = [];

  for (let k = 0; k < valSeries.length; k++) {
    const stepAhead = k + 1;
    const seasonIdx = (trainObs + k) % seasonLength;
    const yHat = Math.max(0, trainModel.finalLevel + stepAhead * trainModel.finalTrend + trainModel.seasonalIndices[seasonIdx]);
    const actual = valSeries[k];
    const residual = actual - yHat;
    actualErrors.push(residual);
  }

  // Calculate actual MAE and RMSE from out-of-sample predictions
  const realMAE = actualErrors.reduce((sum, e) => sum + Math.abs(e), 0) / actualErrors.length;
  const realMSE = actualErrors.reduce((sum, e) => sum + e * e, 0) / actualErrors.length;
  const realRMSE = Math.sqrt(realMSE);

  // 3. Re-fit across ALL observations up to today to forecast forward 7 days
  const fullModel = fitHoltWinters(orderSeries, seasonLength);
  const lastObsDate = new Date(history[history.length - 1].date);

  const next7DaysForecast: DemandForecastPoint[] = [];
  const residualStdDev = realRMSE; // Empirical standard deviation of out-of-sample forecast errors

  for (let h = 1; h <= 7; h++) {
    const fDate = new Date(lastObsDate);
    fDate.setDate(lastObsDate.getDate() + h);
    const dayIndex = fDate.getDay();
    const seasonIdx = (totalObs + h - 1) % seasonLength;

    // Holt-Winters Point Forecast: y_hat = level + h * trend + seasonal
    const pointForecast = Math.max(
      1,
      Math.round(fullModel.finalLevel + h * fullModel.finalTrend + fullModel.seasonalIndices[seasonIdx])
    );

    // 95% Confidence Prediction Interval (z = 1.96) widening over forecast horizon h
    const horizonMultiplier = Math.sqrt(1 + 0.08 * h);
    const margin = Math.max(1, Math.round(1.96 * residualStdDev * horizonMultiplier));

    next7DaysForecast.push({
      date: fDate.toISOString().split('T')[0],
      dayOfWeek: dayNames[dayIndex],
      forecastedOrders: pointForecast,
      lowerBound: Math.max(0, pointForecast - margin),
      upperBound: pointForecast + margin,
    });
  }

  const baselineDaily = Math.round(orderSeries.reduce((s, v) => s + v, 0) / orderSeries.length);

  return {
    menuItemId: item.id,
    itemName: item.name,
    historicalDailyAverage: baselineDaily,
    next7DaysForecast,
    hasForecastData: true,
    isSyntheticDemoData: Boolean(item.isSyntheticDemoData),
    mae: Math.round(realMAE * 10) / 10,
    rmse: Math.round(realRMSE * 10) / 10,
    validationStatus: `Evaluated on ${valSeries.length}-day held-out out-of-sample historical validation split${item.isSyntheticDemoData ? '; input is synthetic demonstration data' : ''}`,
    isEstimate: true,
    modelType: 'Holt-Winters Additive Exponential Smoothing (L=7 Seasonality)',
    trend: item.demandTrend,
    evaluationWindow: `Out-of-sample test split: last ${valSeries.length} recorded days`,
    assumptions: [
      '7-day weekly cyclical seasonality (L=7 days)',
      'Additive Holt-Winters parameters: alpha=0.25 (level), beta=0.08 (trend), gamma=0.30 (seasonality)',
      `MAE and RMSE calculated strictly from actual prediction residuals over ${valSeries.length} held-out validation days`,
      '95% prediction intervals computed from out-of-sample residual variance with horizon dispersion',
    ],
    methodDescription: 'Additive Holt-Winters exponential smoothing separating base level, trend velocity, and weekly cyclical seasonality. Prediction error metrics derived strictly from out-of-sample historical backtest.',
  };
}

export function getAllDemandForecasts(): DemandForecastItem[] {
  return db.menuItems.map((item) => generateDemandForecast(item.id));
}
