import assert from 'node:assert/strict';
import test from 'node:test';

import { formatTipTime, statusLabel } from '../src/lib/format.js';

test('formatTipTime converts November tips to New Zealand daylight time', () => {
  const game = { date: '2026-11-06T02:00:00Z', status: { state: 'pre', detail: '9:00 PM EST' } };
  assert.equal(formatTipTime(game), '3:00 PM NZDT');
});

test('formatTipTime converts July tips to New Zealand standard time', () => {
  const game = { date: '2026-07-15T02:00:00Z', status: { state: 'pre' } };
  assert.equal(formatTipTime(game), '2:00 PM NZST');
});

test('formatTipTime handles a missing or invalid date safely', () => {
  assert.equal(formatTipTime({ status: { state: 'pre' } }), 'Tip time TBD');
  assert.equal(formatTipTime({ date: 'not-a-date' }), 'Tip time TBD');
});

test('upcoming status labels use New Zealand time', () => {
  const game = {
    date: '2026-11-06T02:00:00Z',
    status: { state: 'pre', detail: '9:00 PM EST' },
  };
  assert.equal(statusLabel(game), '3:00 PM NZDT');
});
