/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

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

import { CreateMonitor } from '../create_monitor';
import type { Datasource } from '../../../../common/types/alerting';

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
