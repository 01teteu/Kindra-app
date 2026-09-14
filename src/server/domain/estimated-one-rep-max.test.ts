import assert from 'node:assert/strict';
import { estimateOneRepMax as estimate } from './estimated-one-rep-max.js';
import { eligibleEstimate, reconstructPersonalRecords } from './personal-records.js';

assert.equal(estimate(100, 1), 100);
assert.equal(estimate(100, 4), 100 * (1 + 4 / 30));
assert.equal(estimate(80, 10), 80 * (1 + 10 / 30));
assert.ok(estimate(100, 4)! > estimate(80, 10)!);
for (const [weight, reps] of [[0, 1], [100, 13], [100, 0], [100, 1.5], [Infinity, 1]]) assert.equal(estimate(weight, reps), null);
const date = new Date('2020-01-01');
const set = { id: 'a', setNumber: 1, type: 'WORKING', weight: 100.02, reps: 1, completedAt: date };
const exercise = { exerciseId: 'e', order: 0, measurementTypeSnapshot: 'WEIGHT_REPS', sets: [set] };
const rounded = reconstructPersonalRecords([exercise], new Map([['e', 100.01]]));
assert.equal(rounded.length, 1);
assert.equal(rounded[0].previousValue, rounded[0].currentValue); // UI rounding never decides PR.
assert.deepEqual(reconstructPersonalRecords([exercise], new Map()), []);
assert.equal(eligibleEstimate(set, 'TIME'), null);
assert.equal(eligibleEstimate({ ...set, completedAt: null }, 'WEIGHT_REPS'), null);
// Equal timestamps: exercise order, set number, then stable ID; running best spans duplicates.
const tied = reconstructPersonalRecords([
  { ...exercise, order: 1, sets: [{ ...set, id: 'z', weight: 120 }] },
  { ...exercise, sets: [{ ...set, id: 'b', weight: 115 }, { ...set, id: 'a', weight: 110 }, { ...set, id: 'c', setNumber: 2, weight: 113 }] },
], new Map([['e', 100]]));
assert.deepEqual(tied.map(item => item.workoutSetId), ['a', 'b', 'z']);
console.log('PASS e1RM, elegibilidade, comparação sem arredondamento e desempate estável.');
