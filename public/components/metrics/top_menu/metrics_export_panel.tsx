/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCompressedComboBox,
  EuiCompressedFieldText,
  EuiFlexGroup,
  EuiCompressedFormRow,
  EuiFlexItem,
  EuiForm,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { MetricType } from '../../../../common/types/metrics';
import { fetchPanels } from '../../../../public/components/custom_panels/redux/panel_slice';

interface MetricsExportPanelProps {
  metricsToExport: MetricType[];
  setMetricsToExport: React.Dispatch<React.SetStateAction<MetricType[]>>;
  availableDashboards: any[];
  selectedPanelOptions: any[];
  setSelectedPanelOptions: React.Dispatch<React.SetStateAction<any[]>>;
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
  availableDashboards,
  selectedPanelOptions,
  setSelectedPanelOptions,
}: MetricsExportPanelProps) => {
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
      <EuiTitle size="xs">
        <h3>SAVE THE VIEW AS VISUALIZATION</h3>
      </EuiTitle>
      <EuiHorizontalRule margin="s" />

      {metricsToExport.length > 0 && (
        <div
          style={{
            maxHeight: '30vh',
            overflowY: 'scroll',
            width: 'auto',
            overflowX: 'hidden',
            marginBottom: '16px',
          }}
        >
          {metricsToExport.map((metaData: any, index: number) => {
            return (
              <EuiForm component="form" key={`save-panel-id-${index}`}>
                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiCompressedFormRow label={'Metric ' + (index + 1)}>
                      <EuiCompressedFieldText
                        key={`metric-name-input-id-${index}`}
                        value={metaData.name}
                        onChange={(e) => onNameChange(index, e.target.value)}
                        data-test-subj="metrics__querySaveName"
                      />
                    </EuiCompressedFormRow>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiForm>
            );
          })}
        </div>
      )}

      <EuiFlexGroup direction="column" gutterSize="none">
        {!(metricsToExport.length > 0) && (
          <EuiFlexItem style={{ maxWidth: '400px' }}>
            <EuiText size="s" color="subdued">
              <p>
                Save the view as visualization. You can add it to custom operational dashboards or
                applications.
              </p>
            </EuiText>
            <EuiSpacer size="m" />
          </EuiFlexItem>
        )}

        {metricsToExport.length > 0 && (
          <EuiFlexItem>
            <EuiText size="s">
              <p>
                <strong>Add to custom operational dashboards or applications.</strong>
              </p>
            </EuiText>
          </EuiFlexItem>
        )}

        <EuiFlexItem style={{ maxWidth: '400px' }}>
          <EuiCompressedFormRow label="Dashboards and applications - optional">
            <EuiCompressedComboBox
              placeholder="Select dashboards/applications"
              onChange={(newOptions) => {
                setSelectedPanelOptions(newOptions);
              }}
              selectedOptions={selectedPanelOptions}
              options={
                availableDashboards?.map((option: any) => ({
                  panel: option,
                  label: option.title,
                })) ?? []
              }
              isClearable={true}
              data-test-subj="eventExplorer__querySaveComboBox"
            />
          </EuiCompressedFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
