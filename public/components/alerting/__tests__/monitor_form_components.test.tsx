/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';

import {
  AnnotationEditor,
  DatasourceTargetSelector,
  LabelEditor,
} from '../monitor_form_components';
import type { Datasource } from '../../../../common/types/alerting';

describe('monitor_form_components', () => {
  describe('LabelEditor', () => {
    it('renders a row per existing label with key and value populated', () => {
      const { getByDisplayValue } = render(
        <LabelEditor
          labels={[
            { key: 'service', value: 'api-gateway' },
            { key: 'team', value: 'infra' },
          ]}
          onChange={jest.fn()}
        />
      );
      expect(getByDisplayValue('service')).toBeInTheDocument();
      expect(getByDisplayValue('api-gateway')).toBeInTheDocument();
      expect(getByDisplayValue('team')).toBeInTheDocument();
      expect(getByDisplayValue('infra')).toBeInTheDocument();
    });

    it('fires onChange with an appended empty row when "Add label" is clicked', () => {
      const onChange = jest.fn();
      const labels = [{ key: 'service', value: 'api-gateway' }];
      const { getByText } = render(<LabelEditor labels={labels} onChange={onChange} />);

      fireEvent.click(getByText('Add label'));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([
        { key: 'service', value: 'api-gateway' },
        { key: '', value: '' },
      ]);
    });

    it('fires onChange with the updated value when a value field is edited', () => {
      const onChange = jest.fn();
      const { getByDisplayValue } = render(
        <LabelEditor labels={[{ key: 'service', value: 'api-gateway' }]} onChange={onChange} />
      );

      fireEvent.change(getByDisplayValue('api-gateway'), { target: { value: 'api-gateway-v2' } });

      expect(onChange).toHaveBeenCalledWith([{ key: 'service', value: 'api-gateway-v2' }]);
    });
  });

  describe('AnnotationEditor', () => {
    it('renders a textarea for the description annotation and fires onChange on edit', () => {
      const onChange = jest.fn();
      const { getByDisplayValue } = render(
        <AnnotationEditor
          annotations={[{ key: 'description', value: 'short text' }]}
          onChange={onChange}
        />
      );

      const textarea = getByDisplayValue('short text');
      expect(textarea.tagName).toBe('TEXTAREA');

      fireEvent.change(textarea, { target: { value: 'updated text' } });
      expect(onChange).toHaveBeenCalledWith([{ key: 'description', value: 'updated text' }]);
    });
  });

  describe('DatasourceTargetSelector', () => {
    const datasources: Datasource[] = [
      { id: 'ds-prom', name: 'prom', type: 'prometheus', url: '', enabled: true },
      {
        id: 'ds-os',
        name: 'my-os',
        type: 'opensearch',
        url: '',
        enabled: true,
        workspaceName: 'prod',
      },
    ];

    it('invokes onChange with the datasource id AND its backend type when a different option is selected', () => {
      const onChange = jest.fn();
      const { getByLabelText } = render(
        <DatasourceTargetSelector
          datasources={datasources}
          selectedId="ds-prom"
          onChange={onChange}
        />
      );

      fireEvent.change(getByLabelText('Target datasource'), { target: { value: 'ds-os' } });

      expect(onChange).toHaveBeenCalledWith('ds-os', 'opensearch');
    });
  });
});
