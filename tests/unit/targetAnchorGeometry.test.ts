import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containImageRect, containPointToNormalized, cornersToNormalizedBox, parseNormalizedTargetBox } from '../../src/features/match-analysis/services/targetAnchorGeometry.ts';

test('strict normalized boxes accept full image and edge bounds without mutating input', () => {
  const box = { x: 0, y: 0, width: 1, height: 1 };
  assert.deepEqual(parseNormalizedTargetBox(box), box);
  assert.notEqual(parseNormalizedTargetBox(box), box);
  assert.deepEqual(parseNormalizedTargetBox({ x: 0.5, y: 0.75, width: 0.5, height: 0.25 }), { x: 0.5, y: 0.75, width: 0.5, height: 0.25 });
});

test('rejects missing, extra, symbol keys, arrays and nonnumeric or nonfinite bounds', () => {
  const valid = { x: 0, y: 0, width: 0.5, height: 0.5 };
  for (const value of [null, undefined, [], 'box', {}, { ...valid, extra: 1 }, { ...valid, [Symbol('extra')]: 1 }, { x: 0, y: 0, width: 1 }]) {
    assert.equal(parseNormalizedTargetBox(value), null);
  }
  for (const key of ['x', 'y', 'width', 'height']) {
    for (const value of [NaN, Infinity, -Infinity, '0.2', null, undefined, -0.1, 1.1]) {
      assert.equal(parseNormalizedTargetBox({ ...valid, [key]: value }), null);
    }
  }
  for (const box of [{ ...valid, width: 0 }, { ...valid, height: 0 }, { ...valid, x: 0.75 }, { ...valid, y: 0.75 }]) {
    assert.equal(parseNormalizedTargetBox(box), null);
  }
});

test('contain fit maps landscape image and rejects horizontal letterbox bands', () => {
  const container = { width: 200, height: 200 };
  const image = { width: 400, height: 200 };
  assert.deepEqual(containImageRect(container, image), { x: 0, y: 50, width: 200, height: 100 });
  assert.deepEqual(containPointToNormalized({ x: 100, y: 100 }, container, image), { x: 0.5, y: 0.5 });
  assert.deepEqual(containPointToNormalized({ x: 0, y: 50 }, container, image), { x: 0, y: 0 });
  assert.deepEqual(containPointToNormalized({ x: 200, y: 150 }, container, image), { x: 1, y: 1 });
  for (const point of [{ x: 100, y: 49 }, { x: 100, y: 151 }, { x: -1, y: 100 }, { x: 201, y: 100 }, { x: NaN, y: 100 }, { x: 100, y: Infinity }]) {
    assert.equal(containPointToNormalized(point, container, image), null);
  }
});

test('contain fit maps portrait image with side margins and same-aspect image', () => {
  const container = { width: 200, height: 200 };
  const image = { width: 100, height: 200 };
  assert.deepEqual(containImageRect(container, image), { x: 50, y: 0, width: 100, height: 200 });
  assert.deepEqual(containPointToNormalized({ x: 75, y: 150 }, container, image), { x: 0.25, y: 0.75 });
  assert.equal(containPointToNormalized({ x: 49, y: 100 }, container, image), null);
  assert.equal(containPointToNormalized({ x: 151, y: 100 }, container, image), null);
  assert.deepEqual(containImageRect(container, container), { x: 0, y: 0, width: 200, height: 200 });
});

test('invalid image and container dimensions never produce a mapping', () => {
  const valid = { width: 200, height: 100 };
  for (const key of ['width', 'height']) {
    for (const n of [0, -1, NaN, Infinity, -Infinity]) {
      const invalid = { ...valid, [key]: n };
      assert.equal(containImageRect(invalid, valid), null);
      assert.equal(containImageRect(valid, invalid), null);
      assert.equal(containPointToNormalized({ x: 0, y: 0 }, valid, invalid), null);
    }
  }
});

test('corners work in all directions, preserve edges and reject degenerate or outside rectangles', () => {
  for (const [a, b] of [[{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }], [{ x: 0.75, y: 0.25 }, { x: 0.25, y: 0.75 }]]) {
    assert.deepEqual(cornersToNormalizedBox(a, b), { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    assert.deepEqual(cornersToNormalizedBox(b, a), cornersToNormalizedBox(a, b));
  }
  assert.deepEqual(cornersToNormalizedBox({ x: 1, y: 1 }, { x: 0, y: 0 }), { x: 0, y: 0, width: 1, height: 1 });
  for (const point of [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: -0.1, y: 1 }, { x: 1.1, y: 1 }, { x: NaN, y: 1 }, { x: 1, y: Infinity }]) {
    assert.equal(cornersToNormalizedBox({ x: 0, y: 0 }, point), null);
  }
});
