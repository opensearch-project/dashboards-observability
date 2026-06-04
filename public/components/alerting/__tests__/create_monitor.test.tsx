/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('../promql_editor', () => ({
  PromQLEditor: ({ value }: { value: string }) => (
    <textarea data-test-subj="promqlMock" defaultValue={value} />
  ),
  validatePromQL: () => [],
}));

jest.mock('../metric_browser', () => ({
  MetricBrowser: () => <div data-test-subj="metricBrowserMock" />,
}));

jest.mock('../monitor_form_components', () => ({
  LabelEditor: () => <div />,
  AnnotationEditor: () => <div />,
  DatasourceTargetSelector: ({ onChange }: { onChange: (id: string, type: string) => void }) => (
    <button data-test-subj="dsSelector" onClick={() => onChange('ds-os', 'opensearch')}>
      Select DS
    </button>
  ),
}));

jest.mock('../monitor_template_wizard', () => ({
  MonitorTemplateWizard: () => <div />,
}));

jest.mock('../create_monitor/sections/destination_picker', () => ({
  DestinationPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input
      data-test-subj="pplDestinationPicker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

jest.mock('../create_monitor/sections/query_toolbar', () => ({
  QueryToolbar: ({
    selectedIndices,
    onIndicesChange,
    selectedTimeField,
    onTimeFieldChange,
  }: {
    selectedIndices: string[];
    onIndicesChange: (next: string[]) => void;
    selectedTimeField: string;
    onTimeFieldChange: (v: string) => void;
  }) => (
    <div data-test-subj="queryToolbarMock">
      <input
        data-test-subj="indexPickerMock"
        value={selectedIndices.join(',')}
        onChange={(e) =>
          onIndicesChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
      />
      <input
        data-test-subj="timeFieldSelectorMock"
        value={selectedTimeField}
        onChange={(e) => onTimeFieldChange(e.target.value)}
      />
    </div>
  ),
}));

jest.mock('../create_monitor/sections/ppl_query_editor', () => ({
  PplQueryEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-test-subj="pplQueryEditorMock"
      aria-label="PPL query"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { CreateMonitor } from '../create_monitor';
import type { Datasource } from '../../../../common/types/alerting';
import type { OpenSearchFormState } from '../create_monitor/create_monitor_types';

const promDs: Datasource = {
  id: 'ds-prom',
  name: 'Prom',
  type: 'prometheus',
  url: '',
  enabled: true,
};
const osDs: Datasource = { id: 'ds-os', name: 'Local', type: 'opensearch', url: '', enabled: true };

describe('CreateMonitor', () => {
  it('renders flyout with create title', () => {
    render(
      <CreateMonitor
        onSave={jest.fn()}
        onCancel={jest.fn()}
        datasources={[promDs]}
        selectedDsIds={['ds-prom']}
      />
    );
    expect(document.body.textContent).toContain('Create metrics rule');
  });

  it('calls onCancel when flyout close is clicked', () => {
    const onCancel = jest.fn();
    render(
      <CreateMonitor
        onSave={jest.fn()}
        onCancel={onCancel}
        datasources={[osDs]}
        selectedDsIds={['ds-os']}
      />
    );
    const closeBtn = document.querySelector('[data-test-subj="euiFlyoutCloseButton"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('CreateMonitor — PPL form', () => {
  it('renders a default PPL trigger with the number-of-results controls', () => {
    render(
      <CreateMonitor
        onSave={jest.fn()}
        onCancel={jest.fn()}
        datasources={[osDs]}
        selectedDsIds={['ds-os']}
      />
    );

    expect(screen.getByText(/Triggers \(1\)/i)).toBeTruthy();
    expect(screen.getByLabelText('Threshold value')).toBeTruthy();
    expect(screen.queryByLabelText('Custom PPL where clause')).toBeNull();
  });

  it('toggling to Custom swaps to the where-clause control', () => {
    render(
      <CreateMonitor
        onSave={jest.fn()}
        onCancel={jest.fn()}
        datasources={[osDs]}
        selectedDsIds={['ds-os']}
      />
    );

    // Default is number_of_results; switch to custom.
    const customRadio = screen.getByRole('radio', {
      name: /custom/i,
    }) as HTMLInputElement;
    fireEvent.click(customRadio);

    expect(screen.getByLabelText('Custom PPL where clause')).toBeTruthy();
    expect(screen.queryByLabelText('Threshold value')).toBeNull();
  });

  it('save dispatches onSave with PPL fields populated', () => {
    const onSave = jest.fn();
    render(
      <CreateMonitor
        onSave={onSave}
        onCancel={jest.fn()}
        datasources={[osDs]}
        selectedDsIds={['ds-os']}
      />
    );

    fireEvent.change(screen.getByLabelText('Rule name'), {
      target: { value: 'monitor-1' },
    });
    // The default form starts with an empty query — the user types one.
    fireEvent.change(screen.getByLabelText('PPL query'), {
      target: { value: 'source = logs-* | stats count() as cnt' },
    });

    const saveBtn = screen.getByText(/^Save & enable$/i);
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0][0] as OpenSearchFormState;
    expect(arg.datasourceType).toBe('opensearch');
    expect(arg.monitorType).toBe('ppl_monitor');
    expect(arg.name).toBe('monitor-1');
    expect(arg.query).toContain('source = logs-*');
    expect(arg.pplTriggers).toHaveLength(1);
    expect(arg.pplTriggers[0].type).toBe('number_of_results');
  });
});

describe('CreateMonitor — double-save prevention', () => {
  it('disables save buttons after first click to prevent duplicate submissions', () => {
    const onSave = jest.fn();
    render(
      <CreateMonitor
        onSave={onSave}
        onCancel={jest.fn()}
        datasources={[osDs]}
        selectedDsIds={['ds-os']}
      />
    );

    fireEvent.change(screen.getByLabelText('Rule name'), {
      target: { value: 'double-click-test' },
    });
    fireEvent.change(screen.getByLabelText('PPL query'), {
      target: { value: 'source = logs-* | stats count() as cnt' },
    });

    // Default form has `enabled: true`, so the single save button reads
    // "Save & enable". The double-save guard (`isSaving`) is what we're
    // exercising here — only the first click should reach `onSave`.
    const saveBtn = screen.getByText(/^Save & enable$/i);
    // First click — should call onSave
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);

    // Second click — should NOT call onSave again (isSaving guard)
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('re-enables the save button when an async onSave rejects', async () => {
    // Regression for the H1 review finding: setIsSaving(true) was set before
    // calling onSave but never reset on the error path, leaving the footer
    // button stuck spinning after a backend rejection (e.g. PPL parse
    // error). The fix awaits onSave and resets in `finally`.
    // `<CreateMonitor>` swallows the rejection internally (production
    // callers do their own try/catch + toast); this test only cares that
    // `isSaving` flips back to false regardless.
    let reject!: (err: Error) => void;
    const onSave = jest.fn(
      () =>
        new Promise<void>((_, rej) => {
          reject = rej;
        })
    );

    render(
      <CreateMonitor
        onSave={onSave}
        onCancel={jest.fn()}
        datasources={[osDs]}
        selectedDsIds={['ds-os']}
      />
    );

    fireEvent.change(screen.getByLabelText('Rule name'), {
      target: { value: 'fail-test' },
    });
    fireEvent.change(screen.getByLabelText('PPL query'), {
      target: { value: 'source = logs-* | stats count() as cnt' },
    });

    const saveBtn = screen.getByText(/^Save & enable$/i).closest('button')!;
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);

    // While the promise is pending, the button is disabled (isSaving=true).
    expect(saveBtn).toBeDisabled();

    // Reject — the `finally` should flip isSaving back to false.
    await act(async () => {
      reject(new Error('backend rejected'));
      // Let the microtask queue drain so the `finally` runs.
      await Promise.resolve();
    });

    expect(saveBtn).not.toBeDisabled();
  });
});
