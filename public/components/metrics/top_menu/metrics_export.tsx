/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverFooter,
} from '@elastic/eui';
import React, { useEffect } from 'react';
import { dispatch, useSelector } from 'react-redux';
import { MetricsExportPanel } from './metrics_export_panel';
import { OSDSavedVisualizationClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_visualization';
import { getSavedObjectsClient } from '../../../services/saved_objects/saved_object_client/client_factory';
import {
  addMultipleVizToPanels,
  fetchPanels,
  isUuid,
  uuidRx,
} from '../../custom_panels/redux/panel_slice';
import { MetricType } from '../../../../common/types/metrics';
import { dateSpanFilterSelector, selectedMetricsSelector } from '../redux/slices/metrics_slice';
import { coreRefs } from '../../../framework/core_refs';
import { selectPanelList } from '../../../../public/components/custom_panels/redux/panel_slice';
import { SAVED_VISUALIZATION } from '../../../../common/constants/explorer';
import { SavedVisualization } from '../../../../common/types/explorer';
import { visualizationFromMetric } from '../helpers/utils';
import { updateCatalogVisualizationQuery } from '../../custom_panels/helpers/utils';
import { PROMQL_METRIC_SUBTYPE } from '../../../../common/constants/shared';

const Savebutton = ({
  setIsPanelOpen,
}: {
  setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <EuiButton
      iconSide="right"
      onClick={() => {
        setIsPanelOpen((staleState) => !staleState);
      }}
      data-test-subj="metrics__saveManagementPopover"
      iconType="arrowDown"
    >
      Save
    </EuiButton>
  );
};

const MetricsExportPopOver = () => {
  const availableDashboards = useSelector(selectPanelList);

  const [isPanelOpen, setIsPanelOpen] = React.useState(false);

  const selectedMetrics = useSelector(selectedMetricsSelector);
  const dateSpanFilter = useSelector(dateSpanFilterSelector);
  const [metricsToExport, setMetricsToExport] = React.useState<MetricType[]>([]);

  const [selectedPanelOptions, setSelectedPanelOptions] = React.useState<any[]>([]);

  const { toasts } = coreRefs;

  useEffect(() => {
    setMetricsToExport(selectedMetrics);
  }, [selectedMetrics]);

  const osdSavedVisFromMetric = (metric) => ({
    ...metric,
    fields: '',
    timestamp: '@timestamp',
    type: SAVED_VISUALIZATION,
    dateRange: [],
    subType: 'metric',
    userConfigs: {
      dateConfig: {
        type: 'line',
        fillOpacity: 0,
        lineWidth: 2,
      },
    },
  });

  const savedObjectInputFromObject = (currentObject: SavedVisualization) => {
    return {
      ...currentObject,
      dateRange: ['now-1d', 'now'],
      fields: '',
      timestamp: '@timestamp',
    };
  };

  const updateSavedVisualization = async (metric: MetricType): string => {
    const client = getSavedObjectsClient({
      objectId: metric.savedVisualizationId,
      objectType: 'savedVisualization',
    });
    const res = await client.get({ objectId: metric.savedVisualizationId });
    const currentObject = res.observabilityObjectList[0];

    await client.update(
      {
        object_id: metric.savedVisualizationId,
        object: {
          ...currentObject.savedVisualization,
          name: metric.name,
        },
      },
      true
    );
    return metric.savedVisualizationId;
  };

  const datasourceMetaFrom = (catalog) =>
    JSON.stringify([
      { name: catalog, title: catalog, id: catalog, label: catalog, type: 'prometheus' },
    ]);

  const createSavedVisualization = async (metric): Promise<string> => {
    const [ds, index] = metric.index.split('.');
    const queryMetaData = {
      catalogSourceName: ds,
      catalogTableName: index,
      aggregation: metric.aggregation,
      attributesGroupBy: metric.attributesGroupBy,
    };
    const visMetaData = visualizationFromMetric(
      {
        ...metric,
        dataSources: datasourceMetaFrom(metric.catalog),
        query: updateCatalogVisualizationQuery({
          ...queryMetaData,
          ...dateSpanFilter,
        }),
        queryMetaData,
        subType: PROMQL_METRIC_SUBTYPE,
        dateRange: ['now-1d', 'now'],
        fields: '',
        timestamp: '@timestamp',
      },
      dateSpanFilter.span,
      dateSpanFilter.reoslution
    );
    console.log('createSavedVisualization', {
      metric,
      visMetaData,
    });

    const savedObject = await OSDSavedVisualizationClient.getInstance().create(visMetaData);
    return savedObject.objectId;
  };

  // const createSavedVisualization = async (metric: MetricType): Promise<string> => {
  //   const visMetaData = visualizationFromMetric(
  //     { ...metric, dateRange: ['now-1d', 'now'], fields: '', timestamp: '@timestamp' },
  //     dateSpanFilter
  //   );

  //   const savedObject = await OSDSavedVisualizationClient.getInstance().create(visMetaData);
  //   return savedObject.objectId;
  // };

  const handleSavingObjects = async () => {
    let savedMetricIds = [];

    try {
      savedMetricIds = await Promise.all(
        metricsToExport.map(async (metric, index) => {
          if (metric.savedVisualizationId === undefined) {
            return createSavedVisualization(metric);
          } else {
            return updateSavedVisualization(metric);
          }
        })
      );
    } catch (e) {
      const message = 'Issue in saving metrics';
      console.error(message, e);
      toasts!.addDanger(message);
      return;
    }

    toasts!.add('Saved metrics successfully!');

    console.log('metrics export', { selectedPanelOptions });
    if (selectedPanelOptions.length > 0) {
      try {
        await addMultipleVizToPanels(selectedPanelOptions, savedMetricIds);
      } catch (e) {
        const message = 'Issue in saving metrics to panels';
        console.error(message, e);
        toasts!.addDanger('Issue in saving metrics');
      }
      toasts!.add('Saved metrics to Dashboards successfully!');
    }
  };

  return (
    <EuiPopover
      button={<Savebutton setIsPanelOpen={setIsPanelOpen} />}
      isOpen={isPanelOpen}
      closePopover={() => setIsPanelOpen(false)}
    >
      <MetricsExportPanel
        availableDashboards={availableDashboards ?? []}
        metricsToExport={metricsToExport ?? []}
        setMetricsToExport={setMetricsToExport}
        selectedPanelOptions={selectedPanelOptions}
        setSelectedPanelOptions={setSelectedPanelOptions}
      />
      <EuiPopoverFooter>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              onClick={() => setIsPanelOpen(false)}
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
                handleSavingObjects().then(() => setIsPanelOpen(false));
              }}
              data-test-subj="metrics__SaveConfirm"
            >
              Save
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPopoverFooter>
    </EuiPopover>
  );
};

export const MetricsExport = () => {
  return <MetricsExportPopOver />;
};
