// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineScores, computeFinalScore, scoreMeetings, overallFromDimensions } from '../../desempenho/lib/scoring.js';
import { meeting } from './helpers.js';

test('nota final combina IA e humano com os pesos (50/50 padrão)', () => {
  const s = combineScores(8, 9);
  assert.equal(s?.value, 8.5);
  assert.equal(s?.source, 'ia+humana');
  assert.equal(s?.provisional, false);
});

test('pesos customizados são normalizados', () => {
  assert.equal(combineScores(6, 9, { weights: { ai: 1, human: 2 } })?.value, 8);
});

test('só uma avaliação: usa a disponível e marca como provisória', () => {
  assert.deepEqual(combineScores(7.5, null), { value: 7.5, source: 'ia', provisional: true, ai: 7.5, human: null });
  assert.equal(combineScores(null, 9)?.source, 'humana');
});

test('política require-both ignora notas parciais', () => {
  assert.equal(combineScores(7.5, null, { policy: 'require-both' }), null);
});

test('limita notas fora da escala e ignora NaN', () => {
  assert.equal(combineScores(12, -1)?.value, 5);
  assert.equal(combineScores(NaN, undefined), null);
});

test('reuniões não realizadas não recebem nota', () => {
  const [ok, noShow] = scoreMeetings([meeting({ ai: 8, human: 8 }), meeting({ ai: 8, human: 8, status: 'no_show' })]);
  assert.equal(ok.score?.value, 8);
  assert.equal(noShow.score, null);
  assert.equal(computeFinalScore(null), null);
});

test('nota geral pelos subcritérios usa os pesos do guia do Closer', () => {
  // pesos 15/20/15/15/25 → (10*15 + 5*75) / 90
  const v = overallFromDimensions({ abertura: 10, diagnostico: 5, apresentacao: 5, negociacao: 5, fechamento: 5 });
  assert.ok(v !== null && Math.abs(v - (10 * 15 + 5 * 75) / 90) < 1e-9);
  assert.equal(overallFromDimensions({}), null);
});
