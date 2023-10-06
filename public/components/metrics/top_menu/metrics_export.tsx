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
  ShortDate,
} from '@elastic/eui';
import { MetricsExportPanel } from './metrics_export_panel';
import React, { createContext, useContext, useEffect } from 'react';
import { updateMetricsWithSelections, updatePrometheusMetric } from '../helpers/utils';
import { OSDSavedVisualizationClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_visualization';
import { getSavedObjectsClient } from '../../../services/saved_objects/saved_object_client/client_factory';
import { addMultipleVizToPanels, uuidRx } from '../../custom_panels/redux/panel_slice';
import { MetricType } from '../../../../common/types/metrics';
import { selectedMetricsSelector } from '../redux/slices/metrics_slice';
import { useDispatch, useSelector } from 'react-redux';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../common/constants/metrics';
import { coreRefs } from '../../../framework/core_refs';

interface ExportContextInterface {
  isPanelOpen: boolean;
  setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  metricsToExport: MetricType[];
  setMetricsToExport: React.Dispatch<React.SetStateAction<MetricType[]>>;
  selectedPanelOptions: any[];
  setSelectedPanelOptions: React.Dispatch<React.SetStateAction<any[]>>;
}

export const MetricsExportContext = createContext<ExportContextInterface>({});
const MetricsExportProvider = ({ selectedMetrics, children }) => {
  const [isPanelOpen, setIsPanelOpen] = React.useState(false);
  const [metricsToExport, setMetricsToExport] = React.useState<MetricType[]>(selectedMetrics);
  const [selectedPanelOptions, setSelectedPanelOptions] = React.useState<any[]>([]);
  return (
    <MetricsExportContext.Provider
      value={{
        isPanelOpen,
        setIsPanelOpen,
        metricsToExport,
        setMetricsToExport,
        selectedPanelOptions,
        setSelectedPanelOptions,
      }}
    >
      {children}
    </MetricsExportContext.Provider>
  );
};

const Savebutton = () => {
  const { setIsPanelOpen } = useContext(MetricsExportContext);

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

const MetricsExportPopOver = ({
  startTime,
  endTime,
  spanValue,
  resolutionValue,
}: {
  startTime: ShortDate;
  endTime: ShortDate;
  spanValue: number;
  resolutionValue: string;
}) => {
  const {
    isPanelOpen,
    setIsPanelOpen,
    metricsToExport,
    setMetricsToExport,
    selectedPanelOptions,
  } = useContext(MetricsExportContext);
  const dispatch = useDispatch();
  const selectedMetrics = useSelector(selectedMetricsSelector);
  const { toasts } = coreRefs;

  useEffect(() => {
    setMetricsToExport(selectedMetrics);
  }, [selectedMetrics]);

  const handleSavingObjects = async () => {
    let savedMetricIds = [];

    try {
      savedMetricIds = await Promise.all(
        selectedMetrics.map(async (metric, index) => {
          if (metric.catalog === OBSERVABILITY_CUSTOM_METRIC) {
            const updatedMetric = updateMetricsWithSelections(
              metric,
              startTime,
              endTime,
              spanValue + resolutionValue
            );

            return getSavedObjectsClient({
              objectId: updatedMetric.id,
              objectType: 'savedVisualization',
            }).update({
              ...updatedMetric,
              objectId: updatedMetric.id,
            });
          } else {
            const updatedMetric = updatePrometheusMetric(
              metric,
              startTime,
              endTime,
              spanValue + resolutionValue
            );

            return OSDSavedVisualizationClient.getInstance().create(updatedMetric);
          }
        })
      );
    } catch (e) {
      const message = 'Issue in saving metrics';
      console.error(message, e);
      toasts?.addDanger(message);
      return;
    }

    toasts?.addSuccess('Saved metrics successfully!');

    if (selectedPanelOptions.length > 0) {
      try {
        const allMetricIds = savedMetricIds.map((metric) => metric.objectId);
        const soPanels = selectedPanelOptions.filter((panel) => uuidRx.test(panel.panel.id));

        dispatch(addMultipleVizToPanels(soPanels, allMetricIds));
      } catch (e) {
        const message = 'Issue in saving metrics to panels';
        console.error(message, e);
        toasts?.addDanger('Issue in saving metrics');
      }
      toasts?.addSuccess('Saved metrics to Dashboards successfully!');
    }
  };

  return (
    <EuiPopover
      button={<Savebutton />}
      isOpen={isPanelOpen}
      closePopover={() => setIsPanelOpen(false)}
    >
      <MetricsExportPanel selectedMetrics={metricsToExport} />
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

export const MetricsExport = ({
  selectedMetrics,
  startTime,
  endTime,
  spanValue,
  resolutionValue,
}: {
  selectedMetrics: MetricType[];
  startTime: ShortDate;
  endTime: ShortDate;
  spanValue: number;
  resolutionValue: string;
}) => {
  return (
    <MetricsExportProvider selectedMetrics={selectedMetrics}>
      <MetricsExportPopOver
        selectedMetrics={selectedMetrics}
        startTime={startTime}
        endTime={endTime}
        spanValue={spanValue}
        resolutionValue={resolutionValue}
      />
    </MetricsExportProvider>
  );
};
