import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDayBounds, getLocalDateRangeBounds, validateCurrentReferenceDate } from './timezone.js';

function bounds(start: string, end: string, zone: string, expectedStart: string, expectedEnd: string) {
  const result = getLocalDateRangeBounds(start, end, zone);
  assert.equal(result.startInclusiveUTC.toISOString(), expectedStart);
  assert.equal(result.endExclusiveUTC.toISOString(), expectedEnd);
  return (result.endExclusiveUTC.getTime() - result.startInclusiveUTC.getTime()) / 3600000;
}

test('inclusive end date uses an exclusive next-day boundary, including single-day ranges', () => {
  assert.equal(bounds('2026-09-01', '2026-09-01', 'America/Fortaleza',
    '2026-09-01T03:00:00.000Z', '2026-09-02T03:00:00.000Z'), 24);
  bounds('2026-09-01', '2026-09-22', 'America/Fortaleza',
    '2026-09-01T03:00:00.000Z', '2026-09-23T03:00:00.000Z');
  bounds('2024-02-29', '2024-02-29', 'UTC', '2024-02-29T00:00:00.000Z', '2024-03-01T00:00:00.000Z');
  bounds('2025-12-31', '2025-12-31', 'Asia/Kathmandu',
    '2025-12-30T18:15:00.000Z', '2025-12-31T18:15:00.000Z');
});

test('invalid calendar dates, formats and reversed intervals fail explicitly', () => {
  for (const date of ['2025-02-29', '2024-02-30', '2026-04-31', '2026-00-10', '2026-13-01',
    '2026-01-00', '2026-1-01', '2026-09-01T00:00:00Z', ' 2026-09-01', '', '0000-01-01']) {
    assert.throws(() => getLocalDateRangeBounds(date, '2026-12-31', 'UTC'), /Data inválida/);
    assert.throws(() => getLocalDateRangeBounds('2024-01-01', date, 'UTC'), /Data inválida/);
  }
  assert.throws(() => getLocalDateRangeBounds('2026-09-22', '2026-09-21', 'UTC'), /data inicial/);
});

test('invalid zones and numeric offsets do not fall back to the server timezone', () => {
  for (const zone of ['', 'Mars/Olympus', '+03:00', '-0300', ' America/Fortaleza ', undefined]) {
    assert.throws(() => getLocalDateRangeBounds('2026-09-01', '2026-09-01', zone as string), /Fuso IANA inválido/);
  }
});

test('daylight saving produces 23- and 25-hour days and independent interval boundaries', () => {
  assert.equal(bounds('2024-03-10', '2024-03-10', 'America/New_York',
    '2024-03-10T05:00:00.000Z', '2024-03-11T04:00:00.000Z'), 23);
  assert.equal(bounds('2024-11-03', '2024-11-03', 'America/New_York',
    '2024-11-03T04:00:00.000Z', '2024-11-04T05:00:00.000Z'), 25);
  bounds('2024-03-09', '2024-03-11', 'America/New_York',
    '2024-03-09T05:00:00.000Z', '2024-03-12T04:00:00.000Z');
  assert.equal(bounds('2024-10-06', '2024-10-06', 'Australia/Lord_Howe',
    '2024-10-05T13:30:00.000Z', '2024-10-06T13:00:00.000Z'), 23.5);
});

test('missing or repeated midnight resolves to the first instant of the local day', () => {
  bounds('2018-11-04', '2018-11-04', 'America/Sao_Paulo',
    '2018-11-04T03:00:00.000Z', '2018-11-05T02:00:00.000Z');
  assert.equal(bounds('2024-11-03', '2024-11-03', 'America/Havana',
    '2024-11-03T04:00:00.000Z', '2024-11-04T05:00:00.000Z'), 25);
});

test('a selected skipped date is rejected; adjacent ranges remain contiguous', () => {
  assert.throws(() => getLocalDateRangeBounds('2011-12-30', '2011-12-31', 'Pacific/Apia'), /não existe/);
  assert.throws(() => getLocalDateRangeBounds('2011-12-29', '2011-12-30', 'Pacific/Apia'), /não existe/);
  bounds('2011-12-29', '2011-12-29', 'Pacific/Apia',
    '2011-12-29T10:00:00.000Z', '2011-12-30T10:00:00.000Z');
  bounds('2011-12-31', '2011-12-31', 'Pacific/Apia',
    '2011-12-30T10:00:00.000Z', '2011-12-31T10:00:00.000Z');
});

test('the same selected date is interpreted in the supplied zone, not a stored or current offset', () => {
  bounds('2026-09-01', '2026-09-01', 'Pacific/Kiritimati',
    '2026-08-31T10:00:00.000Z', '2026-09-01T10:00:00.000Z');
  bounds('2026-09-01', '2026-09-01', 'America/Los_Angeles',
    '2026-09-01T07:00:00.000Z', '2026-09-02T07:00:00.000Z');
});

test('legacy fixed-offset bounds retain their inclusive end and 24-hour semantics', () => {
  const result = getDayBounds('2024-03-10', 300);
  assert.equal(result.startOfDayUTC.toISOString(), '2024-03-10T05:00:00.000Z');
  assert.equal(result.endOfDayUTC.toISOString(), '2024-03-11T04:59:59.999Z');
});

test('nutrition consolidation accepts only today for the declared fixed offset', () => {
  const now = new Date('2026-09-26T02:30:00.000Z');
  assert.doesNotThrow(() => validateCurrentReferenceDate('2026-09-25', 180, now));
  assert.throws(() => validateCurrentReferenceDate('2026-09-24', 180, now), /data local atual/);
  assert.throws(() => validateCurrentReferenceDate('2026-09-26', 180, now), /data local atual/);

  assert.doesNotThrow(() => validateCurrentReferenceDate('2026-09-26', -720, now));
  assert.doesNotThrow(() => validateCurrentReferenceDate('2026-09-25', 840, now));
});
