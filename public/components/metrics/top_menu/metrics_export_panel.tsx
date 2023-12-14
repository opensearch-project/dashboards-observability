/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import {
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFormRow,
  EuiFlexItem,
  EuiForm,
} from '@elastic/eui';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { createPrometheusMetricById, createOtelMetric } from '../helpers/utils';
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

  // const fetchAllvisualizationsById = async () => {
  //   const tempVisualizationsMetaData = await Promise.all(
  //     sortedMetricsLayout.map(async (metricLayout) => {
  //       console.log('metricLayout in fetch: ', metricLayout);
  //       // return metricLayout.metricType === 'savedCustomMetric'
  //       //   ? await fetchVisualizationById(http, metricLayout.id, setErrorResponse)
  //       //   : createPrometheusMetricById(metricLayout.id);
  //       if (metricLayout.metricType === 'savedCustomMetric') {
  //         return await fetchVisualizationById(http, metricLayout.id, setErrorResponse);
  //       } else if (metricLayout.metricType === 'openTelemetryMetric') {
  //         // Add the logic for openTelemetryMetric
  //         // For now, assuming a function createOpenTelemetryMetricById
  //         return createOtelMetric(metricLayout.metric);
  //       } else {
  //         // Assuming a default case or additional conditions
  //         // If needed, adjust this part based on your specific requirements
  //         return createPrometheusMetricById(metricLayout.id);
  //       }
  //     })
  //   );
  //   setVisualizationsMetaData(tempVisualizationsMetaData);
  // };

  // useEffect(() => {
  //   fetchAllvisualizationsById();
  // }, []);

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
          options={
            availableDashboards?.map((option: any) => {
              return {
                panel: option,
                label: option.title,
              };
            }) ?? []
          }
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
