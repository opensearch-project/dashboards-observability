/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  EuiSuperDatePicker,
} from '@elastic/eui';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resolutionOptions } from '../../../../common/constants/metrics';
import { uiSettingsService } from '../../../../common/utils';
import { dateSpanFilterSelector, setDateSpan } from '../redux/slices/metrics_slice';
import { MetricsExport } from './metrics_export';
// import { getSavedObjectsClient } from '../../../services/saved_objects/saved_object_client/client_factory';
// import { OSDSavedVisualizationClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_visualization';
// import { addMultipleVizToPanels, uuidRx } from '../../custom_panels/redux/panel_slice';
// import {
//   sortMetricLayout,
//   updateMetricsWithSelections,
//   updateOpenTelemetryMetricsWithSelections,
// } from '../helpers/utils';
// import {
//   dateSpanFilterSelector,
//   metricsLayoutSelector,
//   setRefresh,
//   updateDateSpan,
//   updateStartEndDate,
// } from '../redux/slices/metrics_slice';
// import { MetricsExportPanel } from './metrics_export_panel';
import './top_menu.scss';

export const TopMenu = () => {
  // Redux tools
  const dispatch = useDispatch();
  const dateSpanFilter = useSelector(dateSpanFilterSelector);

  // const handleSavingObjects = async () => {
  //   let savedMetricIds = [];
  //   const start = 'now-15y';
  //   const end = 'now';
  //   const span = 1;
  //   const resolution = 'hours';

  //   try {
  //     savedMetricIds = await Promise.all(
  //       sortedMetricsLayout.map(async (metricLayout, index) => {
  //         console.log('visualizationsMetaData: ', visualizationsMetaData);
  //         const updatedMetric = updateMetricsWithSelections(
  //           visualizationsMetaData[index],
  //           // dateSpanFilter.start,
  //           // dateSpanFilter.end,
  //           // dateSpanFilter.span + dateSpanFilter.resolution
  //           start,
  //           end,
  //           span + resolution
  //         );
  //         console.log('metricLayout: ', metricLayout);

  //         if (metricLayout.metricType === 'openTelemetryMetric') {
  //           const updatedOpenTelemetryMetric = updateOpenTelemetryMetricsWithSelections(
  //             visualizationsMetaData[index],
  //             start,
  //             end
  //           );
  //           console.log('updatedOpenTelemetryMetric: ', updatedOpenTelemetryMetric);
  //           return OSDSavedVisualizationClient.getInstance().create(updatedOpenTelemetryMetric);
  //         }

  //         if (metricLayout.metricType === 'prometheusMetric') {
  //           return OSDSavedVisualizationClient.getInstance().create(updatedMetric);
  //         } else {
  //           return getSavedObjectsClient({
  //             objectId: metricLayout.id,
  //             objectType: 'savedVisualization',
  //           }).update({
  //             ...updatedMetric,
  //             objectId: metricLayout.id,
  //           });
  //         }
  //       })
  //     );
  //   } catch (e) {
  //     const message = 'Issue in saving metrics';
  //     console.error(message, e);
  //     setToast(message, 'danger');
  //     return;
  //   }

  //   setToast('Saved metrics successfully!');

  //   if (selectedPanelOptions.length > 0) {
  //     try {
  //       const allMetricIds = savedMetricIds.map((metric) => metric.objectId);
  //       const soPanels = selectedPanelOptions.filter((panel) => uuidRx.test(panel.panel.id));

  //       dispatch(addMultipleVizToPanels(soPanels, allMetricIds));
  //     } catch (e) {
  //       const message = 'Issue in saving metrics to panels';
  //       console.error(message, e);
  //       setToast('Issue in saving metrics', 'danger');
  //     }
  //     setToast('Saved metrics to Dashboards successfully!');
  //   }
  // };

  return (
    dateSpanFilter && (
      <>
        <EuiFlexGroup gutterSize="s" justifyContent={'flexEnd'}>
          <EuiFlexItem grow={false}>
            <div className="resolutionSelect">
              <EuiFieldText
                className="resolutionSelectText"
                prepend="Span Interval"
                value={dateSpanFilter.span}
                isInvalid={dateSpanFilter.span < 1}
                onChange={(e) => dispatch(setDateSpan({ span: e.target.value }))}
                data-test-subj="metrics__spanValue"
                append={
                  <EuiSelect
                    className="resolutionSelectOption"
                    options={resolutionOptions}
                    value={dateSpanFilter.resolution}
                    onChange={(e) => dispatch(setDateSpan({ resolution: e.target.value }))}
                    aria-label="resolutionSelect"
                    data-test-subj="metrics__spanResolutionSelect"
                  />
                }
                aria-label="resolutionField"
              />
            </div>
          </EuiFlexItem>
          <EuiFlexItem className="metrics-search-bar-datepicker">
            <EuiSuperDatePicker
              dateFormat={uiSettingsService.get('dateFormat')}
              start={dateSpanFilter.start}
              end={dateSpanFilter.end}
              onTimeChange={(dateSpan) => dispatch(setDateSpan(dateSpan))}
              recentlyUsedRanges={dateSpanFilter.recentlyUsedRanges}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <MetricsExport />
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    )
  );
};
