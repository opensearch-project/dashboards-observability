/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext, useEffect, useState } from 'react';
import {
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFlexGroup,
  EuiFormRow,
  EuiFlexItem,
  EuiForm,
} from '@elastic/eui';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { createPrometheusMetricById } from '../helpers/utils';
import { MetricType } from '../../../../common/types/metrics';
import { fetchVisualizationById } from '../../custom_panels/helpers/utils';
import {
  fetchPanels,
  selectPanelList,
} from '../../../../public/components/custom_panels/redux/panel_slice';
import { coreRefs } from '../../../framework/core_refs';
import { MetricsExportContext } from './metrics_export';

interface MetricsExportPanelProps {
  http: CoreStart['http'];
  setVisualizationsMetaData: React.Dispatch<any>;
  sortedMetricsLayout: MetricType[];
  selectedPanelOptions: Array<EuiComboBoxOptionOption<unknown>> | undefined;
  setSelectedPanelOptions: React.Dispatch<
    React.SetStateAction<Array<EuiComboBoxOptionOption<unknown>> | undefined>
  >;
}

interface CustomPanelOptions {
  id: string;
  name: string;
  dateCreated: string;
  dateModified: string;
}

export const MetricsExportPanel = ({}: MetricsExportPanelProps) => {
  const [options, setOptions] = useState([]);

  const [errorResponse, setErrorResponse] = useState('');

  const customPanels = useSelector(selectPanelList);

  const {
    metricsToExport,
    setMetricsToExport,
    selectedPanelOptions,
    setSelectedPanelOptions,
  } = useContext(MetricsExportContext);

  const dispatch = useDispatch();

  const { http } = coreRefs;

  useEffect(() => {
    dispatch(fetchPanels());
  }, [dispatch]);

  const onNameChange = (index: number, name: string) => {
    console.log('onNameChange', { index, name, metricsToExport });
    const updatedMetrics = metricsToExport.map((metric, idx) => {
      if (idx === index) {
        return {
          ...metric,
          name: name,
        };
      } else {
        return metric;
      }
    });

    setMetricsToExport(updatedMetrics);
  };

  return (
    <div style={{ minWidth: '15vw' }}>
      <EuiFormRow
        label="Custom operational dashboards/application"
        helpText="Search existing dashboards or applications by name"
      >
        <EuiComboBox
          placeholder="Select dashboards/applications"
          onChange={(newOptions) => {
            setSelectedPanelOptions(newOptions);
          }}
          selectedOptions={selectedPanelOptions}
          options={customPanels.map((option: any) => {
            return {
              panel: option,
              label: option.title,
            };
          })}
          isClearable={true}
          data-test-subj="eventExplorer__querySaveComboBox"
        />
      </EuiFormRow>

      {metricsToExport.length > 0 && (
        <div style={{ maxHeight: '30vh', overflowY: 'scroll', width: 'auto', overflowX: 'hidden' }}>
          {metricsToExport.map((metaData: any, index: number) => {
            return (
              <EuiForm component="form" key={index}>
                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiFormRow label={'Metric Name #' + (index + 1)}>
                      <EuiFieldText
                        key={'save-panel-id'}
                        value={metaData.name}
                        onChange={(e) => onNameChange(index, e.target.value)}
                        data-test-subj="metrics__querySaveName"
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiForm>
            );
          })}
        </div>
      )}
    </div>
  );
};
