// @ts-check
/**
 * Monta o DashboardData completo de um closer + período a partir das reuniões brutas.
 * Ponto único que liga scoring → métricas → insights (puro, testável).
 */
import { scoreMeetings } from './scoring.js';
import {
  meetingsInRange, calculatePeriodAverages, calculateKpis, calculateDistribution, calculateDimensionStats,
  calculateQuarterStats, calculateSparkline, calculateStreak, calculateLevel, trendSlope, evaluatedMeetings, mean,
} from './metrics.js';
import { previousPeriod } from './periods.js';
import { buildInsights } from './insights.js';
import { TARGET_SCORE } from './config.js';

/** @typedef {import('./types.js').Closer} Closer */
/** @typedef {import('./types.js').Meeting} Meeting */
/** @typedef {import('./types.js').Period} Period */
/** @typedef {import('./types.js').DashboardData} DashboardData */

export const SPARKLINE_LENGTH = 8;

/**
 * @param {Object} args
 * @param {Closer} args.closer
 * @param {Meeting[]} args.meetings          Reuniões do closer (qualquer intervalo que cubra o necessário).
 * @param {Meeting[]} [args.teamMeetings]    Reuniões do time no período (para a média do time).
 * @param {Period} args.period
 * @param {Date} [args.now]
 * @param {number} [args.target]
 * @returns {DashboardData}
 */
export function buildDashboard({ closer, meetings, teamMeetings = [], period, now = new Date(), target = TARGET_SCORE }) {
  const scored = scoreMeetings(meetings.filter((m) => m.closerId === closer.id));
  const prev = previousPeriod(period);
  const current = meetingsInRange(scored, period);
  const previous = meetingsInRange(scored, prev);

  const kpis = calculateKpis(current, previous, target);
  const trend = calculatePeriodAverages(current, period, now);
  const dimensions = calculateDimensionStats(current, previous);
  const teamScored = meetingsInRange(scoreMeetings(teamMeetings), period);
  const teamAverage = mean(evaluatedMeetings(teamScored).map((m) => m.score?.value));
  const streak = calculateStreak(scored.filter((m) => new Date(m.date) < period.end), target);
  const recent = [...current].sort((a, b) => b.date.localeCompare(a.date));

  return {
    closer,
    period,
    previousPeriod: prev,
    kpis,
    trend,
    distribution: calculateDistribution(current),
    dimensions,
    quarters: calculateQuarterStats(scored, period, now),
    recent,
    insights: buildInsights({
      period, kpis, dimensions, trend, slope: trendSlope(trend), streak, meetings: current, teamAverage, target,
    }),
    level: calculateLevel(kpis.average),
    teamAverage,
    streak,
    sparkline: calculateSparkline(scored, period, SPARKLINE_LENGTH).map((v) => v ?? NaN),
  };
}
