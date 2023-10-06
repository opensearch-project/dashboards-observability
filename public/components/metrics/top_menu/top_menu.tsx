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
import { metricsLayoutSelector, selectedMetricsSelector } from '../redux/slices/metrics_slice';
import { MetricsExportPanel } from './metrics_export_panel';
import './top_menu.scss';
import { MetricsExport } from './metrics_export';

interface TopMenuProps {
  IsTopPanelDisabled: boolean;
  startTime: ShortDate;
  endTime: ShortDate;
  onDatePickerChange: (props: OnTimeChangeProps) => void;
  recentlyUsedRanges: DurationRange[];
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setEditActionType: React.Dispatch<React.SetStateAction<string>>;
  panelVisualizations: MetricType[];
  setPanelVisualizations: React.Dispatch<React.SetStateAction<MetricType[]>>;
  resolutionValue: string;
  setResolutionValue: React.Dispatch<React.SetStateAction<string>>;
  spanValue: number;
  setSpanValue: React.Dispatch<React.SetStateAction<number>>;
  resolutionSelectId: string;
  setToast: (title: string, color?: string, text?: any, side?: string) => void;
}

export const TopMenu = ({
  IsTopPanelDisabled,
  startTime,
  endTime,
  onDatePickerChange,
  recentlyUsedRanges,
  editMode,
  setEditActionType,
  setEditMode,
  panelVisualizations,
  setPanelVisualizations,
  resolutionValue,
  setResolutionValue,
  spanValue,
  setSpanValue,
  resolutionSelectId,
  setToast,
}: TopMenuProps) => {
  // Redux tools
  const dispatch = useDispatch();
  const selectedMetrics = useSelector(selectedMetricsSelector);

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

  const onResolutionChange = (e) => {
    setResolutionValue(e.target.value);
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

  return (
    <>
      <EuiFlexGroup gutterSize="s" justifyContent={'flexEnd'}>
        <EuiFlexItem grow={false}>
          <div className="resolutionSelect">
            <EuiFieldText
              className="resolutionSelectText"
              prepend="Span Interval"
              value={spanValue}
              isInvalid={spanValue < 1}
              onChange={(e) => setSpanValue(e.target.value)}
              data-test-subj="metrics__spanValue"
              append={
                <EuiSelect
                  className="resolutionSelectOption"
                  id={resolutionSelectId}
                  options={resolutionOptions}
                  value={resolutionValue}
                  onChange={(e) => onResolutionChange(e)}
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
            start={startTime}
            end={endTime}
            onTimeChange={onDatePickerChange}
            recentlyUsedRanges={recentlyUsedRanges}
            isDisabled={IsTopPanelDisabled}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <MetricsExport
            start={startTime}
            end={endTime}
            spanValue={spanValue}
            resolutionValue={resolutionValue}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
