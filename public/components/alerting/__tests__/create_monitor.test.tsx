/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('../promql_editor', () => ({
  PromQLEditor: ({ value }: { value: string }) => (
    <textarea data-test-subj="promql-mock" defaultValue={value} />
  ),
  validatePromQL: () => [],
}));

jest.mock('../metric_browser', () => ({
  MetricBrowser: () => <div data-test-subj="metric-browser-mock" />,
}));

jest.mock('../monitor_form_components', () => ({
  LabelEditor: () => <div />,
  AnnotationEditor: () => <div />,
  DatasourceTargetSelector: ({ onChange }: { onChange: (id: string, type: string) => void }) => (
    <button data-test-subj="ds-selector" onClick={() => onChange('ds-os', 'opensearch')}>
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
      data-test-subj="ppl-destination-picker"
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
    expect(document.body.textContent).toContain('Create');
    expect(document.body.textContent).toContain('Monitor');
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

  it('toggling to Custom condition swaps the controls', () => {
    render(
      <CreateMonitor
        onSave={jest.fn()}
        onCancel={jest.fn()}
        datasources={[osDs]}
        selectedDsIds={['ds-os']}
      />
    );

    const customRadio = screen.getByLabelText('Custom condition') as HTMLInputElement;
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

    fireEvent.change(screen.getByLabelText('Monitor name'), {
      target: { value: 'monitor-1' },
    });

    const saveBtn = screen.getAllByText(/^Save Monitor$/i)[0];
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0][0] as OpenSearchFormState;
    expect(arg.datasourceType).toBe('opensearch');
    expect(arg.monitorType).toBe('ppl_monitor');
    expect(arg.name).toBe('monitor-1');
    expect(arg.pplTriggers).toHaveLength(1);
    expect(arg.pplTriggers[0].type).toBe('number_of_results');
  });
});
