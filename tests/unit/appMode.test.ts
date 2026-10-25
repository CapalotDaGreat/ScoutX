import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useMockData } from '../../src/config/appMode.ts';

test('mock bootstrap is opt-in development only and cannot bypass production initialization', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  const oldFlag = process.env.EXPO_PUBLIC_USE_MOCK_DATA;
  try {
    process.env.EXPO_PUBLIC_USE_MOCK_DATA = 'true';
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    assert.equal(useMockData(), false);
    Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
    assert.equal(useMockData(), true);
    process.env.EXPO_PUBLIC_USE_MOCK_DATA = 'false';
    assert.equal(useMockData(), false);
    delete (globalThis as Record<string, unknown>).__DEV__;
    process.env.EXPO_PUBLIC_USE_MOCK_DATA = 'true';
    // Unknown runtimes must not silently become demos.
    assert.equal(useMockData(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, '__DEV__', previous);
    else delete (globalThis as Record<string, unknown>).__DEV__;
    if (oldFlag === undefined) delete process.env.EXPO_PUBLIC_USE_MOCK_DATA;
    else process.env.EXPO_PUBLIC_USE_MOCK_DATA = oldFlag;
  }
});
