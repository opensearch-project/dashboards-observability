/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PplLookbackEditor lives in the Query card and anchors on the query toolbar's
 * Time field — there is no separate timestamp picker. These tests pin that
 * contract, the Time-field auto-pick rules (once per index selection, never
 * after the user clears it, never from stale mappings), the not-a-date-field
 * warning, the overlap callout for user-written time filters, and the disabled
 * state.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PplLookbackEditor, PplLookbackEditorProps } from '../ppl_lookback_editor';

let mockFieldsByType: Record<string, string[]> = {};
let mockIsStale = false;
jest.mock('../../../hooks/use_index_mappings', () => ({
  useIndexMappings: () => ({
    fieldsByType: mockFieldsByType,
    isLoading: false,
    error: null,
    isStale: mockIsStale,
  }),
}));

const baseProps = (onUpdate: jest.Mock): PplLookbackEditorProps => ({
  dsId: 'ds-1',
  indices: ['logs-*'],
  useLookBackWindow: true,
  lookBackAmount: 1,
  lookBackUnit: 'hours',
  timeField: '@timestamp',
  query: 'source = logs-*',
  onUpdate,
});

const renderEditor = (overrides: Partial<PplLookbackEditorProps> = {}) => {
  const onUpdate = jest.fn();
  const props = { ...baseProps(onUpdate), ...overrides };
  const utils = render(<PplLookbackEditor {...props} />);
  const rerenderWith = (next: Partial<PplLookbackEditorProps>) =>
    utils.rerender(<PplLookbackEditor {...props} {...next} />);
  return { ...utils, onUpdate, rerenderWith };
};

const byTestSubj = (s: string) => document.querySelector(`[data-test-subj="${s}"]`);
const checkbox = () => byTestSubj('alertManagerPplUseLookBack') as HTMLInputElement;

describe('PplLookbackEditor', () => {
  beforeEach(() => {
    mockFieldsByType = { date: ['@timestamp', 'time'] };
    mockIsStale = false;
  });

  describe('layout', () => {
    it('renders amount + unit but no separate timestamp picker', () => {
      renderEditor();
      expect(byTestSubj('alertManagerPplLookBackAmount')).toBeInTheDocument();
      expect(byTestSubj('alertManagerPplLookBackUnit')).toBeInTheDocument();
      expect(byTestSubj('alertManagerPplLookBackTimestampField')).toBeNull();
    });

    it('names the query Time field it filters on', () => {
      renderEditor({ timeField: 'time' });
      expect(screen.getByText(/where time falls within the window/)).toBeInTheDocument();
    });

    it('uses generic help text while on without a Time field', () => {
      mockFieldsByType = { date: ['@timestamp'] };
      mockIsStale = true; // no pick yet
      renderEditor({ timeField: '' });
      expect(screen.getByText(/filtered on the Time field above/)).toBeInTheDocument();
    });

    it('is disabled with a visible reason when no date field and no Time field exist', () => {
      mockFieldsByType = { keyword: ['host'] };
      renderEditor({ timeField: '' });
      expect(checkbox().disabled).toBe(true);
      expect(checkbox().checked).toBe(false);
      expect(screen.getByText(/Select indices with a date field/)).toBeInTheDocument();
      expect(byTestSubj('alertManagerPplLookBackAmount')).toBeNull();
    });
  });

  describe('Time field auto-pick', () => {
    it('picks @timestamp when on and no Time field is chosen', () => {
      const { onUpdate } = renderEditor({ timeField: '' });
      expect(onUpdate).toHaveBeenCalledWith({ timeField: '@timestamp' });
    });

    it('falls back to the first date field when @timestamp is absent', () => {
      mockFieldsByType = { date: ['event_time', 'ingest_time'], date_nanos: ['z_nanos'] };
      const { onUpdate } = renderEditor({ timeField: '' });
      expect(onUpdate).toHaveBeenCalledWith({ timeField: 'event_time' });
    });

    it('does not override a Time field the user already chose', () => {
      const { onUpdate } = renderEditor({ timeField: 'time' });
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('does not pick when the window is off', () => {
      const { onUpdate } = renderEditor({ useLookBackWindow: false, timeField: '' });
      expect(onUpdate).not.toHaveBeenCalled();
      expect(checkbox().checked).toBe(false);
    });

    it('does not pick when no indices are selected', () => {
      const { onUpdate } = renderEditor({ indices: [], timeField: '' });
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('does not pick from stale mappings (previous selection)', () => {
      mockIsStale = true;
      const { onUpdate } = renderEditor({ timeField: '' });
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('never re-picks after the user clears the Time field', () => {
      const { onUpdate, rerenderWith } = renderEditor({ timeField: '@timestamp' });
      rerenderWith({ timeField: '' }); // user clears it in the toolbar
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('never re-picks after clearing the field it picked itself', () => {
      const { onUpdate, rerenderWith } = renderEditor({ timeField: '' });
      expect(onUpdate).toHaveBeenCalledTimes(1);
      rerenderWith({ timeField: '@timestamp' }); // parent applied the pick
      rerenderWith({ timeField: '' }); // user clears it
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it('picks again for a new index selection', () => {
      const { onUpdate, rerenderWith } = renderEditor({ timeField: '@timestamp' });
      rerenderWith({ timeField: '' });
      rerenderWith({ indices: ['other-*'], timeField: '' });
      expect(onUpdate).toHaveBeenCalledWith({ timeField: '@timestamp' });
    });

    it('replaces its own pick when the new indices lack that field', () => {
      const { onUpdate, rerenderWith } = renderEditor({ timeField: '' });
      rerenderWith({ timeField: '@timestamp' }); // our pick applied
      onUpdate.mockClear();
      mockFieldsByType = { date: ['event_time'] };
      rerenderWith({ indices: ['other-*'], timeField: '@timestamp' });
      expect(onUpdate).toHaveBeenCalledWith({ timeField: 'event_time' });
    });

    it("keeps a user's field the new indices lack, and warns instead", () => {
      mockFieldsByType = { date: ['event_time'] };
      const { onUpdate } = renderEditor({ timeField: '@timestamp' });
      expect(onUpdate).not.toHaveBeenCalled();
      expect(
        screen.getByText(/@timestamp is not a date field in the selected indices/)
      ).toBeInTheDocument();
    });

    it('warns for a hand-typed non-date Time field', () => {
      const { onUpdate } = renderEditor({ timeField: 'message' });
      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.getByText(/message is not a date field/)).toBeInTheDocument();
    });

    it('does not warn while mappings are still loading for the selection', () => {
      mockIsStale = true;
      mockFieldsByType = {};
      renderEditor({ timeField: '@timestamp' });
      expect(screen.queryByText(/is not a date field/)).toBeNull();
    });
  });

  describe('user-written time filters', () => {
    it('shows an overlap callout when the query already filters on the Time field', () => {
      renderEditor({
        query: "source = logs-* | where @timestamp > '2026-01-01' and @timestamp < '2026-01-02'",
      });
      const callout = byTestSubj('alertManagerPplLookBackOverlapCallout');
      expect(callout).toBeInTheDocument();
      expect(callout!.textContent).toMatch(/already filters on @timestamp/);
      expect(callout!.textContent).toMatch(/last 1 hour/);
    });

    it('describes plural windows', () => {
      renderEditor({
        lookBackAmount: 30,
        lookBackUnit: 'minutes',
        query: 'source = logs-* | where @timestamp > NOW()',
      });
      expect(byTestSubj('alertManagerPplLookBackOverlapCallout')!.textContent).toMatch(
        /last 30 minutes/
      );
    });

    it('describes an unset (0) amount as the 1-unit default', () => {
      renderEditor({ lookBackAmount: 0, query: 'source = logs-* | where @timestamp > NOW()' });
      expect(byTestSubj('alertManagerPplLookBackOverlapCallout')!.textContent).toMatch(
        /last 1 hour/
      );
    });

    it('hides the callout when the filter is on another field or look-back is off', () => {
      const q = 'source = logs-* | where time > NOW()';
      const { rerenderWith } = renderEditor({ query: q });
      expect(byTestSubj('alertManagerPplLookBackOverlapCallout')).toBeNull();
      rerenderWith({
        query: 'source = logs-* | where @timestamp > NOW()',
        useLookBackWindow: false,
      });
      expect(byTestSubj('alertManagerPplLookBackOverlapCallout')).toBeNull();
    });
  });

  describe('controls', () => {
    it('enabling seeds amount, unit, and a Time field in one update', () => {
      const { onUpdate } = renderEditor({
        useLookBackWindow: false,
        timeField: '',
        lookBackAmount: 0,
      });
      fireEvent.click(checkbox());
      expect(onUpdate).toHaveBeenCalledWith({
        useLookBackWindow: true,
        lookBackAmount: 1,
        timeField: '@timestamp',
      });
    });

    it('enabling does not pick a Time field from stale mappings', () => {
      mockIsStale = true;
      const { onUpdate } = renderEditor({ useLookBackWindow: false, timeField: '' });
      fireEvent.click(checkbox());
      expect(onUpdate).toHaveBeenCalledWith({ useLookBackWindow: true });
    });

    it('disabling only flips the flag', () => {
      const { onUpdate } = renderEditor();
      fireEvent.click(checkbox());
      expect(onUpdate).toHaveBeenCalledWith({ useLookBackWindow: false });
    });

    it('edits the amount (empty input becomes 0) and the unit', () => {
      const { onUpdate } = renderEditor();
      const amount = byTestSubj('alertManagerPplLookBackAmount') as HTMLInputElement;
      fireEvent.change(amount, { target: { value: '45' } });
      expect(onUpdate).toHaveBeenCalledWith({ lookBackAmount: 45 });
      fireEvent.change(amount, { target: { value: '' } });
      expect(onUpdate).toHaveBeenCalledWith({ lookBackAmount: 0 });
      fireEvent.change(amount, { target: { value: '7.9' } });
      expect(onUpdate).toHaveBeenCalledWith({ lookBackAmount: 7 });
      fireEvent.change(byTestSubj('alertManagerPplLookBackUnit')!, { target: { value: 'days' } });
      expect(onUpdate).toHaveBeenCalledWith({ lookBackUnit: 'days' });
    });

    it('shows the bounds errors', () => {
      const { rerenderWith } = renderEditor({ lookBackAmount: 8, lookBackUnit: 'days' });
      expect(screen.getByText(/Must be at most 7 days/)).toBeInTheDocument();
      rerenderWith({ lookBackAmount: 0.5, lookBackUnit: 'minutes' });
      expect(screen.getByText(/Must be at least 1 minute/)).toBeInTheDocument();
    });
  });
});
