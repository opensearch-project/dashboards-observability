/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverFooter,
  EuiSelect,
  EuiSpacer,
  EuiSuperDatePicker,
  OnTimeChangeProps,
  ShortDate,
} from '@elastic/eui';
import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CoreStart } from '../../../../../../src/core/public';
import { CUSTOM_PANELS_API_PREFIX } from '../../../../common/constants/custom_panels';
import { resolutionOptions } from '../../../../common/constants/metrics';
import { MetricType } from '../../../../common/types/metrics';
import { uiSettingsService } from '../../../../common/utils';
import { getSavedObjectsClient } from '../../../services/saved_objects/saved_object_client/client_factory';
import { OSDSavedVisualizationClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/saved_visualization';
import { addMultipleVizToPanels, uuidRx } from '../../custom_panels/redux/panel_slice';
import { sortMetricLayout, updateMetricsWithSelections } from '../helpers/utils';
import {
  dateSpanFilterSelector,
  metricsLayoutSelector,
  setRefresh,
  updateDateSpan,
  updateStartEndDate,
} from '../redux/slices/metrics_slice';
import { MetricsExportPanel } from './metrics_export_panel';
import './top_menu.scss';

interface TopMenuProps {
  IsTopPanelDisabled: boolean;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setEditActionType: React.Dispatch<React.SetStateAction<string>>;
  panelVisualizations: MetricType[];
  setPanelVisualizations: React.Dispatch<React.SetStateAction<MetricType[]>>;
  setToast: (title: string, color?: string, text?: any, side?: string) => void;
}

export const TopMenu = ({
  IsTopPanelDisabled,
  editMode,
  setEditActionType,
  setEditMode,
  panelVisualizations,
  setPanelVisualizations,
  setToast,
}: TopMenuProps) => {
  // Redux tools
  const dispatch = useDispatch();
  const metricsLayout = useSelector(metricsLayoutSelector);
  const sortedMetricsLayout = sortMetricLayout([...metricsLayout]);
  const dateSpanFilter = useSelector(dateSpanFilterSelector);

  const [visualizationsMetaData, setVisualizationsMetaData] = useState<any>([]);
  const [originalPanelVisualizations, setOriginalPanelVisualizations] = useState<MetricType[]>([]);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [selectedPanelOptions, setSelectedPanelOptions] = useState<
    Array<EuiComboBoxOptionOption<unknown>> | undefined
  >([]);

  // toggle between panel edit mode
  const editPanel = (editType: string) => {
    setEditMode(!editMode);
    switch (editType) {
      case 'edit': {
        if (panelVisualizations.length > 0) {
          setOriginalPanelVisualizations([...panelVisualizations]);
        } else {
          setOriginalPanelVisualizations([]);
        }
        break;
      }
      case 'cancel': {
        setPanelVisualizations(originalPanelVisualizations);
        setOriginalPanelVisualizations([]);
        break;
      }
      default: {
        break;
      }
    }
    setEditActionType(editType);
  };

  const cancelButton = (
    <EuiButton size="s" iconType="cross" color="danger" onClick={() => editPanel('cancel')}>
      Cancel
    </EuiButton>
  );

  const saveButton = (
    <EuiButton
      size="s"
      iconType="save"
      data-test-subj="metrics__saveView"
      onClick={() => editPanel('save')}
    >
      Save view
    </EuiButton>
  );

  const editButton = (
    <EuiButton
      size="s"
      data-test-subj="metrics__editView"
      iconType="pencil"
      onClick={() => editPanel('edit')}
      isDisabled={IsTopPanelDisabled}
    >
      Edit view
    </EuiButton>
  );

  const Savebutton = (
    <EuiButton
      iconSide="right"
      onClick={() => {
        setIsSavePanelOpen((staleState) => !staleState);
      }}
      data-test-subj="metrics__saveManagementPopover"
      iconType="arrowDown"
      isDisabled={IsTopPanelDisabled}
    >
      Save
    </EuiButton>
  );

  const handleSavingObjects = async () => {
    let savedMetricIds = [];

    try {
      savedMetricIds = await Promise.all(
        sortedMetricsLayout.map(async (metricLayout, index) => {
          const updatedMetric = updateMetricsWithSelections(
            visualizationsMetaData[index],
            dateSpanFilter.start,
            dateSpanFilter.end,
            dateSpanFilter.span + dateSpanFilter.resolution
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

        dispatch(addMultipleVizToPanels(soPanels, allMetricIds));
      } catch (e) {
        const message = 'Issue in saving metrics to panels';
        console.error(message, e);
        setToast('Issue in saving metrics', 'danger');
      }
      setToast('Saved metrics to Dashboards successfully!');
    }
  };

  return (
    <>
      <EuiFlexGroup gutterSize="s" justifyContent={'flexEnd'}>
        <EuiFlexItem grow={false}>
          <div className="resolutionSelect">
            <EuiFieldText
              className="resolutionSelectText"
              prepend="Span Interval"
              value={dateSpanFilter.span}
              isInvalid={dateSpanFilter.span < 1}
              onChange={(e) => dispatch(updateDateSpan({ span: e.target.value }))}
              data-test-subj="metrics__spanValue"
              append={
                <EuiSelect
                  className="resolutionSelectOption"
                  options={resolutionOptions}
                  value={dateSpanFilter.resolution}
                  onChange={(e) => dispatch(updateDateSpan({ resolution: e.target.value }))}
                  aria-label="resolutionSelect"
                  data-test-subj="metrics__spanResolutionSelect"
                />
              }
              disabled={IsTopPanelDisabled}
              aria-label="resolutionField"
            />
          </div>
        </EuiFlexItem>
        <EuiFlexItem className="metrics-search-bar-datepicker">
          <EuiSuperDatePicker
            dateFormat={uiSettingsService.get('dateFormat')}
            start={dateSpanFilter.start}
            end={dateSpanFilter.end}
            onTimeChange={(e) => dispatch(updateStartEndDate(e))}
            recentlyUsedRanges={dateSpanFilter.recentlyUsedRanges}
            isDisabled={IsTopPanelDisabled}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPopover
            button={Savebutton}
            isOpen={isSavePanelOpen}
            closePopover={() => setIsSavePanelOpen(false)}
          >
            <MetricsExportPanel
              visualizationsMetaData={visualizationsMetaData}
              setVisualizationsMetaData={setVisualizationsMetaData}
              sortedMetricsLayout={sortedMetricsLayout}
              selectedPanelOptions={selectedPanelOptions}
              setSelectedPanelOptions={setSelectedPanelOptions}
            />
            <EuiPopoverFooter>
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
            </EuiPopoverFooter>
          </EuiPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
        {editMode ? (
          <>
            <EuiFlexItem grow={false}>{cancelButton}</EuiFlexItem>
            <EuiFlexItem grow={false}>{saveButton}</EuiFlexItem>
          </>
        ) : (
          <EuiFlexItem grow={false}>{editButton}</EuiFlexItem>
        )}
      </EuiFlexGroup>
    </>
  );
};
