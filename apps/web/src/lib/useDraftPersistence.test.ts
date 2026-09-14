// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackFriction = vi.fn();

vi.mock('./retention', () => ({ trackFriction }));

describe('useDraftPersistence', () => {
  beforeEach(() => {
    localStorage.clear();
    trackFriction.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('restores a dirty draft and clears on clear()', async () => {
    localStorage.setItem('azf_draft_test', JSON.stringify({ text: 'hello' }));
    const onRestore = vi.fn();
    const { useDraftPersistence } = await import('./useDraftPersistence');

    const { result, rerender } = renderHook(
      ({ value }: { value: { text: string } }) =>
        useDraftPersistence({
          storageKey: 'azf_draft_test',
          value,
          isDirty: (v) => v.text.trim().length > 0,
          surface: 'coach',
          onRestore,
        }),
      { initialProps: { value: { text: '' } } },
    );

    expect(onRestore).toHaveBeenCalledWith({ text: 'hello' });

    rerender({ value: { text: 'hello' } });
    expect(localStorage.getItem('azf_draft_test')).toContain('hello');

    act(() => {
      result.current.clear();
    });
    expect(localStorage.getItem('azf_draft_test')).toBeNull();
  });
});
