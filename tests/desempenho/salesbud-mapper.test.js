// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapSalesbudCall, mapSalesbudSeller, mapStatus, unmappedDimensions } from '../../desempenho/data/salesbud-mapper.js';
import { scoreMeetings } from '../../desempenho/lib/scoring.js';

test('mapeia uma call com avaliação de IA e manual', () => {
  const m = mapSalesbudCall({
    id: 42, seller_id: 7, started_at: '2026-11-10T14:00:00Z', duration_seconds: 1830, status: 'completed',
    contact_name: 'Maria', company_name: 'Loja X',
    ai_evaluation: { score: 8, criteria: [{ name: 'Diagnóstico', score: 7 }, { name: 'Contorno de objeções', score: 6 }, { name: 'Desconhecido', score: 1 }], strengths: ['a'] },
    manual_evaluation: { score: 9, comment: 'Boa call', evaluator_name: 'Paula' },
  });
  assert.equal(m.id, '42');
  assert.equal(m.closerId, '7');
  assert.equal(m.durationMin, 31);
  assert.equal(m.status, 'realizada');
  assert.deepEqual(m.evaluation?.ai?.dimensions, { diagnostico: 7, negociacao: 6 });
  assert.equal(m.evaluation?.human?.evaluator, 'Paula');
  assert.equal(m.evaluation?.feedback, 'Boa call');
  assert.equal(scoreMeetings([m])[0].score?.value, 8.5);
});

test('call sem avaliação e status variados', () => {
  const m = mapSalesbudCall({ id: 'a', seller_id: 'b', started_at: '2026-11-10T14:00:00Z', status: 'no_show' });
  assert.equal(m.evaluation, null);
  assert.equal(m.status, 'no_show');
  assert.equal(mapStatus('cancelled'), 'cancelada');
  assert.equal(mapStatus(undefined), 'realizada');
});

test('nota geral calculada pelos critérios quando falta score', () => {
  const m = mapSalesbudCall({ id: 1, seller_id: 1, started_at: '2026-11-10T14:00:00Z', ai_evaluation: { criteria: [{ name: 'Fechamento', score: 9 }] } });
  assert.equal(m.evaluation?.ai?.overall, 9);
});

test('vendedor e cobertura do mapa de critérios', () => {
  assert.deepEqual(mapSalesbudSeller({ id: 3, name: 'Ana', email: 'ANA@suri.ai' }), { id: '3', name: 'Ana', email: 'ana@suri.ai', team: 'Closers' });
  assert.deepEqual(unmappedDimensions(), []);
});
