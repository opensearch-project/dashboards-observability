/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CUSTOM_PANELS_API_PREFIX } from '../../../../common/constants/custom_panels';
import React, { useEffect, useState } from 'react';
import { CoreStart } from '../../../../../../src/core/public';
import {
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFlexGroup,
  EuiFormRow,
  EuiFlexItem,
  EuiForm,
} from '@elastic/eui';
import { createPrometheusMetricById } from '../helpers/utils';
import { MetricType } from '../../../../common/types/metrics';
import { fetchVisualizationById } from '../../custom_panels/helpers/utils';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchPanels,
  selectPanelList,
} from '../../../../public/components/custom_panels/redux/panel_slice';

interface MetricsExportPanelProps {
  http: CoreStart['http'];
  visualizationsMetaData: any;
  setVisualizationsMetaData: React.Dispatch<any>;
  sortedMetricsLayout: MetricType[];
  selectedPanelOptions: EuiComboBoxOptionOption<unknown>[] | undefined;
  setSelectedPanelOptions: React.Dispatch<
    React.SetStateAction<EuiComboBoxOptionOption<unknown>[] | undefined>
  >;
}

interface CustomPanelOptions {
  id: string;
  name: string;
  dateCreated: string;
  dateModified: string;
}

export const MetricsExportPanel = ({
  http,
  visualizationsMetaData,
  setVisualizationsMetaData,
  sortedMetricsLayout,
  selectedPanelOptions,
  setSelectedPanelOptions,
}: MetricsExportPanelProps) => {
  const [options, setOptions] = useState([]);

  const [errorResponse, setErrorResponse] = useState('');

  const customPanels = useSelector(selectPanelList);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchPanels());
  }, []);

  // useEffect(() => {
  //   setOptions(customPanels || []);
  // }, [customPanels]);

  const fetchAllvisualizationsById = async () => {
    let tempVisualizationsMetaData = await Promise.all(
      sortedMetricsLayout.map(async (metricLayout) => {
        return metricLayout.metricType === 'savedCustomMetric'
          ? await fetchVisualizationById(http, metricLayout.id, setErrorResponse)
          : createPrometheusMetricById(metricLayout.id);
      })
    );
    setVisualizationsMetaData(tempVisualizationsMetaData);
  };

  useEffect(() => {
    fetchAllvisualizationsById();
  }, []);

  const onNameChange = (index: number, name: string) => {
    let tempVisualizationsMetaData = [...visualizationsMetaData];
    tempVisualizationsMetaData[index].name = name;
    setVisualizationsMetaData(tempVisualizationsMetaData);
  };

  return (
    <div style={{ minWidth: '15vw' }}>
      <EuiFormRow
        label="Custom operational dashboards/application"
        helpText="Search existing dashboards or applications by name"
      >
        <EuiComboBox
          placeholder="Select dashboards/applications"
          onChange={(options) => {
            setSelectedPanelOptions(options);
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

      {visualizationsMetaData.length > 0 && (
        <div style={{ maxHeight: '30vh', overflowY: 'scroll', width: 'auto', overflowX: 'hidden' }}>
          {visualizationsMetaData.map((metaData: any, index: number) => {
            return (
              <EuiForm component="form">
                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiFormRow label={'Metric Name #' + (index + 1)}>
                      <EuiFieldText
                        key={'save-panel-id'}
                        value={visualizationsMetaData[index].name}
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
