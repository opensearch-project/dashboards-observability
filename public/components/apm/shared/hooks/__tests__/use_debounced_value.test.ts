/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '../use_debounced_value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 150));
    expect(result.current).toBe('initial');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 'first', delay: 150 },
    });

    expect(result.current).toBe('first');

    // Update the value
    rerender({ value: 'second', delay: 150 });

    // Value should not have changed yet
    expect(result.current).toBe('first');

    // Fast-forward time by 150ms
    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Now the value should be updated
    expect(result.current).toBe('second');
  });

  it('should cancel pending updates when value changes rapidly', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 'a', delay: 150 },
    });

    expect(result.current).toBe('a');

    // Rapid value changes
    rerender({ value: 'b', delay: 150 });
    act(() => {
      jest.advanceTimersByTime(50);
    });

    rerender({ value: 'c', delay: 150 });
    act(() => {
      jest.advanceTimersByTime(50);
    });

    rerender({ value: 'd', delay: 150 });
    act(() => {
      jest.advanceTimersByTime(50);
    });

    // Value should still be 'a' (not enough time has passed)
    expect(result.current).toBe('a');

    // Fast-forward remaining time
    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Should have final value 'd', skipping intermediate values
    expect(result.current).toBe('d');
  });

  it('should use default delay of 150ms', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    // Advance by 100ms (less than default 150ms)
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe('initial');

    // Advance remaining 50ms
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current).toBe('updated');
  });

  it('should work with different types', () => {
    // Test with number
    const { result: numberResult, rerender: numberRerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 42 } }
    );

    numberRerender({ value: 100 });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(numberResult.current).toBe(100);

    // Test with object
    const initialObj = { name: 'test' };
    const { result: objResult, rerender: objRerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: initialObj } }
    );

    const newObj = { name: 'updated' };
    objRerender({ value: newObj });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(objResult.current).toEqual({ name: 'updated' });
  });

  it('should handle custom delay', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
      initialProps: { value: 'initial', delay: 500 },
    });

    rerender({ value: 'updated', delay: 500 });

    // Advance by 400ms (less than 500ms)
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current).toBe('initial');

    // Advance remaining 100ms
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe('updated');
  });
});
