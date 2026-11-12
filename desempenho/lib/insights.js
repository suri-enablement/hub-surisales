// @ts-check
/**
 * Insights em linguagem natural a partir das métricas já calculadas.
 * Cada regra é independente; o painel mostra as mais relevantes (até `limit`).
 */
import { DIMENSIONS, TARGET_SCORE } from './config.js';
import { GRANULARITY_LABELS } from './periods.js';
import { fmtScore, fmtDelta, plural } from './format.js';

/** @typedef {import('./types.js').Insight} Insight */
/** @typedef {import('./types.js').KpiSummary} KpiSummary */
/** @typedef {import('./types.js').DimensionStat} DimensionStat */
/** @typedef {import('./types.js').Bucket} Bucket */
/** @typedef {import('./types.js').ScoredMeeting} ScoredMeeting */
/** @typedef {import('./types.js').Period} Period */

/**
 * @typedef {Object} InsightInput
 * @property {Period} period
 * @property {KpiSummary} kpis
 * @property {DimensionStat[]} dimensions
 * @property {Bucket[]} trend
 * @property {number | null} slope
 * @property {number} streak
 * @property {ScoredMeeting[]} meetings       Reuniões do período.
 * @property {number | null} teamAverage
 * @property {number} [target]
 * @property {number} [limit]
 */

/** @param {InsightInput} input @returns {Insight[]} */
export function buildInsights(input) {
  const { period, kpis, dimensions, slope, streak, meetings, teamAverage } = input;
  const target = input.target ?? TARGET_SCORE;
  const limit = input.limit ?? 4;
  const g = GRANULARITY_LABELS[period.granularity];
  /** @type {(Insight & { weight: number })[]} */
  const out = [];

  if (kpis.evaluated === 0) return [];

  // 1. Evolução vs. período anterior
  if (kpis.delta !== null && Math.abs(kpis.delta) >= 0.2) {
    const up = kpis.delta > 0;
    out.push({
      id: 'delta', weight: 9 + Math.abs(kpis.delta),
      tone: up ? 'positive' : 'negative',
      title: up ? `Você evoluiu ${fmtDelta(kpis.delta)} pts` : `Sua média caiu ${fmtDelta(kpis.delta)} pts`,
      body: up
        ? `Média de ${fmtScore(kpis.average)} contra ${fmtScore(kpis.previousAverage)} n${g.article} ${g.previous}. Continue repetindo o que funcionou.`
        : `Média de ${fmtScore(kpis.average)} contra ${fmtScore(kpis.previousAverage)} n${g.article} ${g.previous}. Vale revisar as reuniões abaixo da meta.`,
    });
  }

  // 2. Ponto mais forte e ponto de atenção
  const ranked = dimensions
    .filter(/** @returns {d is DimensionStat & { average: number }} */ (d) => d.average !== null)
    .sort((a, b) => b.average - a.average);
  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    out.push({
      id: 'strength', weight: 6, tone: 'positive',
      title: `Seu ponto forte: ${best.label}`,
      body: `Média ${fmtScore(best.average)} neste subcritério${best.delta !== null && best.delta > 0.1 ? `, ${fmtDelta(best.delta)} vs. ${g.previous}` : ''}.`,
    });
    if (best.average - worst.average >= 0.5) {
      const training = DIMENSIONS.find((d) => d.key === worst.key)?.training;
      out.push({
        id: 'focus', weight: 8 + (best.average - worst.average), tone: 'tip',
        title: `Foco de evolução: ${worst.label}`,
        body: `É o subcritério com a menor média (${fmtScore(worst.average)}), ${fmtScore(best.average - worst.average)} pts abaixo do seu melhor. Subir aqui é o caminho mais rápido para a média geral.`,
        action: training,
      });
    }
  }

  // 3. Sequência na meta
  if (streak >= 3) {
    out.push({
      id: 'streak', weight: 7 + streak / 2, tone: 'positive',
      title: `${plural(streak, 'reunião seguida', 'reuniões seguidas')} na meta`,
      body: `Suas últimas ${streak} reuniões avaliadas ficaram com nota ${fmtScore(target)} ou mais.`,
    });
  }

  // 4. Tendência dentro do período
  if (slope !== null && Math.abs(slope) >= 0.08) {
    out.push({
      id: 'trend', weight: 5 + Math.abs(slope) * 10,
      tone: slope > 0 ? 'positive' : 'negative',
      title: slope > 0 ? 'Curva de evolução em alta' : 'Curva em queda neste período',
      body: slope > 0
        ? `Suas notas vêm subindo ao longo d${g.article} ${g.unit}: em média ${fmtDelta(slope)} pt a cada ponto do gráfico.`
        : `As notas recuaram ao longo d${g.article} ${g.unit} (${fmtDelta(slope)} pt por ponto do gráfico). Identifique o que mudou nas últimas calls.`,
    });
  }

  // 5. Diferença IA x humano
  if (kpis.aiAverage !== null && kpis.humanAverage !== null) {
    const gap = kpis.humanAverage - kpis.aiAverage;
    if (Math.abs(gap) >= 0.4) {
      out.push({
        id: 'calibration', weight: 4 + Math.abs(gap), tone: 'neutral',
        title: gap > 0 ? 'Avaliadores humanos te dão mais pontos que a IA' : 'A IA te avalia acima dos avaliadores humanos',
        body: `Humano ${fmtScore(kpis.humanAverage)} vs. IA ${fmtScore(kpis.aiAverage)} (${fmtDelta(gap)}). ${gap > 0
          ? 'A IA pode estar perdendo nuances de condução: confira os pontos de melhoria que ela aponta.'
          : 'Leia o feedback humano das calls: ele costuma trazer o que a transcrição não mostra.'}`,
      });
    }
  }

  // 6. Comparação com o time
  if (teamAverage !== null && kpis.average !== null) {
    const gap = kpis.average - teamAverage;
    if (Math.abs(gap) >= 0.2) {
      out.push({
        id: 'team', weight: 5, tone: gap > 0 ? 'positive' : 'neutral',
        title: gap > 0 ? `${fmtDelta(gap)} pts acima da média do time` : `${fmtDelta(gap)} pts em relação à média do time`,
        body: `A média do time n${g.article} ${g.unit} é ${fmtScore(teamAverage)}.`,
      });
    }
  }

  // 7. Melhor reunião
  const best = meetings
    .filter((m) => m.score !== null)
    .sort((a, b) => (b.score?.value ?? 0) - (a.score?.value ?? 0))[0];
  if (best?.score && best.score.value >= 9) {
    out.push({
      id: 'best', weight: 3, tone: 'positive',
      title: `Melhor call: ${best.company}`,
      body: `Nota ${fmtScore(best.score.value)} com ${best.leadName}. Ouça de novo para entender o que você fez diferente.`,
    });
  }

  // 8. Pendências de avaliação humana
  if (kpis.pendingHuman > 0) {
    out.push({
      id: 'pending', weight: 2, tone: 'neutral',
      title: `${plural(kpis.pendingHuman, 'reunião aguarda', 'reuniões aguardam')} avaliação humana`,
      body: 'Até lá, a nota exibida é só a da IA (provisória) e pode mudar.',
    });
  }

  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(({ weight, ...rest }) => rest);
}
