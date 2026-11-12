// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPeriod, shiftPeriod, getBucketRanges, isoWeek, requiredDataRange, quartersOfYear } from '../../desempenho/lib/periods.js';

const d = (/** @type {string} */ s) => new Date(`${s}T12:00:00`);

test('semana começa na segunda e dura 7 dias', () => {
  const p = getPeriod('week', d('2026-11-12')); // quinta
  assert.equal(p.start.getDay(), 1);
  assert.equal(p.start.getDate(), 9);
  assert.equal(p.end.getDate(), 16);
  assert.equal(getBucketRanges(p).length, 7);
  assert.match(p.label, /Semana 46/);
});

test('mês, trimestre e ano', () => {
  const m = getPeriod('month', d('2026-11-12'));
  assert.equal(m.label, 'Novembro 2026');
  const q = getPeriod('quarter', d('2026-11-12'));
  assert.equal(q.shortLabel, 'Q4');
  assert.equal(q.start.getMonth(), 9);
  assert.equal(getBucketRanges(getPeriod('year', d('2026-05-01'))).length, 12);
});

test('navegação entre períodos atravessa o ano', () => {
  assert.equal(shiftPeriod(getPeriod('month', d('2026-01-15')), -1).label, 'Dezembro 2025');
  assert.equal(shiftPeriod(getPeriod('quarter', d('2026-02-01')), -1).label.startsWith('Q4 2025'), true);
  assert.equal(shiftPeriod(getPeriod('week', d('2026-01-01')), 1).start.getDate(), 5);
});

test('buckets semanais cobrem o mês sem lacunas e sem fatias de 1–2 dias nas bordas', () => {
  const p = getPeriod('month', d('2026-11-12')); // 1/11/2026 é domingo
  const b = getBucketRanges(p);
  assert.equal(b[0].start.getTime(), p.start.getTime());
  assert.equal(b[b.length - 1].end.getTime(), p.end.getTime());
  for (let i = 1; i < b.length; i++) assert.equal(b[i].start.getTime(), b[i - 1].end.getTime());
  for (const x of b) assert.ok((x.end.getTime() - x.start.getTime()) / 86400000 >= 3);
});

test('semana ISO', () => {
  assert.equal(isoWeek(d('2026-01-01')), 1);
  assert.equal(isoWeek(d('2027-01-01')), 53);
});

test('intervalo de dados cobre período anterior, sparkline e o ano', () => {
  const p = getPeriod('month', d('2026-03-10'));
  const r = requiredDataRange(p, 8);
  assert.ok(r.start <= new Date(2025, 7, 1));
  assert.equal(r.end.getTime(), new Date(2027, 0, 1).getTime());
  assert.equal(quartersOfYear(d('2026-03-10')).length, 4);
});
