/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
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
import { MetricType } from '../../../../common/types/metrics';
import {
  fetchPanels,
  selectPanelList,
} from '../../../../public/components/custom_panels/redux/panel_slice';
import { coreRefs } from '../../../framework/core_refs';

interface MetricsExportPanelProps {
  metricsToExport: MetricType[];
  setMetricsToExport: React.Dispatch<React.SetStateAction<MetricType[]>>;
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

export const MetricsExportPanel = ({
  metricsToExport,
  setMetricsToExport,
  selectedPanelOptions,
  setSelectedPanelOptions,
}: MetricsExportPanelProps) => {
  const customPanels = useSelector(selectPanelList);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchPanels());
  }, [dispatch]);

  const onNameChange = (index: number, name: string) => {
    const tempMetrics = metricsToExport.map((metric, idx) =>
      idx === index ? { ...metric, name } : metric
    );
    setMetricsToExport(tempMetrics);
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
              <EuiForm component="form" key={`save-panel-id-${index}`}>
                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiFormRow label={'Metric Name #' + (index + 1)}>
                      <EuiFieldText
                        key={`metric-name-input-id-${index}`}
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
