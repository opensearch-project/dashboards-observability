/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFlexGroup,
  EuiFormRow,
  EuiFlexItem,
  EuiForm,
  EuiHorizontalRule,
  ShortDate,
} from '@elastic/eui';
import { useDispatch, useSelector } from 'react-redux';
import { CUSTOM_PANELS_API_PREFIX } from '../../../../common/constants/custom_panels';
import { CoreStart } from '../../../../../../src/core/public';
import { createPrometheusMetricById } from '../helpers/utils';

import { getSavedObjectsClient } from '../../../services/saved_objects/saved_object_client/client_factory';
import { MetricType } from '../../../../common/types/metrics';
import { fetchVisualizationById } from '../../custom_panels/helpers/utils';
import {
  addMultipleVizToPanels,
  fetchPanels,
  selectPanelList,
  uuidRx,
} from '../../../../public/components/custom_panels/redux/panel_slice';

import { coreRefs } from '../../../framework/core_refs';
import { metricsLayoutSelector } from '../redux/slices/metrics_slice';
import { sortMetricLayout, updateMetricsWithSelections } from '../helpers/utils';
import { useToast } from '../../common/toast';
import { OSDSavedVisualizationClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_visualization';

interface MetricsExportPanelProps {
  setIsSavePanelOpen: React.Dispatch<any>;
  startTime: ShortDate;
  endTime: ShortDate;
  resolutionValue: string;
  spanValue: number;
}

interface CustomPanelOptions {
  id: string;
  name: string;
  dateCreated: string;
  dateModified: string;
}

export const MetricsExportPanel = ({
  setIsSavePanelOpen,
  startTime,
  endTime,
  resolutionValue,
  spanValue,
}: MetricsExportPanelProps) => {
  const { http } = coreRefs;
  const { setToast } = useToast();

  const metricsLayout = useSelector(metricsLayoutSelector);
  const sortedMetricsLayout = sortMetricLayout([...metricsLayout]);
  const [visualizationsMetaData, setVisualizationsMetaData] = useState<any>([]);

  const [selectedPanelOptions, setSelectedPanelOptions] = useState<
    Array<EuiComboBoxOptionOption<unknown>> | undefined
  >([]);

  const [errorResponse, setErrorResponse] = useState('');

  const customPanels = useSelector(selectPanelList);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchPanels());
  }, [dispatch]);

  const fetchAllvisualizationsById = async () => {
    const tempVisualizationsMetaData = await Promise.all(
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
    const tempVisualizationsMetaData = [...visualizationsMetaData];
    tempVisualizationsMetaData[index].name = name;
    setVisualizationsMetaData(tempVisualizationsMetaData);
  };

  const handleSavingObjects = async () => {
    let savedMetricIds = [];

    try {
      savedMetricIds = await Promise.all(
        sortedMetricsLayout.map(async (metricLayout, index) => {
          const updatedMetric = updateMetricsWithSelections(
            visualizationsMetaData[index],
            startTime,
            endTime,
            spanValue + resolutionValue
          );

          if (metricLayout.metricType === 'prometheusMetric') {
            return OSDSavedVisualizationClient.getInstance().create(updatedMetric);
          } else {
            return getSavedObjectsClient({
              objectId: metricLayout.id,
              objectType: 'savedVisualization',
            }).update({
              ...updatedMetric,
              objectId: metricLayout.id,
            });
          }
        })
      );
    } catch (e) {
      const message = 'Issue in saving metrics';
      console.error(message, e);
      setToast(message, 'danger');
      return;
    }

    setToast('Saved metrics successfully!');

    if (selectedPanelOptions.length > 0) {
      try {
        const allMetricIds = savedMetricIds.map((metric) => metric.objectId);
        const soPanels = selectedPanelOptions.filter((panel) => uuidRx.test(panel.panel.id));
        const opsPanels = selectedPanelOptions.filter((panel) => !uuidRx.test(panel.panel.id));

        dispatch(addMultipleVizToPanels(soPanels, allMetricIds));
        const savedMetricsInOpsPanels = await Promise.all(
          opsPanels.map((panel) => {
            return http.post(`${CUSTOM_PANELS_API_PREFIX}/visualizations/multiple`, {
              body: JSON.stringify({
                panelId: panel.panel.id,
                savedVisualizationIds: allMetricIds,
              }),
            });
          })
        );
      } catch (e) {
        const message = 'Issue in saving metrics to panels';
        console.error(message, e);
        setToast('Issue in saving metrics', 'danger');
      }
      setToast('Saved metrics to Dashboards successfully!');
    }
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
              <EuiForm component="form" key={index}>
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
      &nbsp;
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="s"
            onClick={() => setIsSavePanelOpen(false)}
            data-test-subj="metrics__SaveCancel"
          >
            Cancel
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            fill
            onClick={() => {
              handleSavingObjects().then(() => setIsSavePanelOpen(false));
            }}
            data-test-subj="metrics__SaveConfirm"
          >
            Save
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
