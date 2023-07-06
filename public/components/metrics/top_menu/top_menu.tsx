/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiComboBoxOptionOption,
  EuiContextMenu,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPopover,
  EuiSelect,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiText,
  OnTimeChangeProps,
  ShortDate,
} from '@elastic/eui';
import { DurationRange } from '@elastic/eui/src/components/date_picker/types';
import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { CoreStart } from '../../../../../../src/core/public';
import { CUSTOM_PANELS_API_PREFIX } from '../../../../common/constants/custom_panels';
import { resolutionOptions } from '../../../../common/constants/metrics';
import { MetricType } from '../../../../common/types/metrics';
import { uiSettingsService } from '../../../../common/utils';
import SavedObjects from '../../../services/saved_objects/event_analytics/saved_objects';
import {
  allAvailableMetricsSelector,
  metricsLayoutSelector,
  selectMetric,
} from '../redux/slices/metrics_slice';
import { SearchBar } from '../sidebar/search_bar';
import { MetricsExportPanel } from './metrics_export_panel';
import './top_menu.scss';

interface TopMenuProps {
  http: CoreStart['http'];
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
  savedObjects: SavedObjects;
  setToast: (title: string, color?: string, text?: any, side?: string) => void;
  setSearch: any;
}

export const TopMenu = ({
  http,
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
  savedObjects,
  setToast,
  setSearch,
}: TopMenuProps) => {
  // Redux tools
  const dispatch = useDispatch();
  const allAvailableMetrics = useSelector(allAvailableMetricsSelector);
  const handleAddMetric = (metric: any) => dispatch(selectMetric(metric));

  const [originalPanelVisualizations, setOriginalPanelVisualizations] = useState<MetricType[]>([]);
  const [isSavePanelOpen, setIsSavePanelOpen] = useState(false);
  const [isPopoverOpen, setPopover] = useState(false);

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

  function flattenPanelTree(tree, array = []) {
    array.push(tree);

    if (tree.items) {
      tree.items.forEach((item) => {
        if (item.panel) {
          flattenPanelTree(item.panel, array);
          item.panel = item.panel.id;
        }
      });
    }

    return array;
  }

  const createPanelTree = (SaveContent) => {
    return flattenPanelTree({
      id: 0,
      title: 'Actions',
      items: [
        {
          name: 'Save',
          icon: 'save',
          panel: {
            id: 1,
            width: 400,
            title: 'See more',
            content: <SaveContent />,
          },
        },
        {
          name: 'Edit',
          icon: 'edit',
          onClick: () => {
            closePopover();
          },
        },
        {
          isSeparator: true,
          key: 'sep',
        },
      ],
    });
  };

  const metricExportPanel = useMemo(() => {
    console.log('rendering metric panel');
    return (
      <MetricsExportPanel
        setIsSavePanelOpen={setIsSavePanelOpen}
        startTime={startTime}
        endTime={endTime}
        resolutionValue={resolutionValue}
        spanValue={spanValue}
      />
    );
  }, [setIsSavePanelOpen, startTime, endTime, resolutionValue, spanValue]);

  const panels = createPanelTree(() => (
    <EuiText style={{ padding: 24 }} textAlign="center">
      {metricExportPanel}
    </EuiText>
  ));

  const closePopover = () => {
    setPopover(false);
  };

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
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

  const button = (
    <EuiButton iconType="arrowDown" iconSide="right" onClick={onButtonClick}>
      Actions
    </EuiButton>
  );

  return (
    <>
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem grow={10}>
          <SearchBar setSearch={setSearch} />
        </EuiFlexItem>
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
          <EuiPopover
            id="contextMenuNormal"
            button={button}
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            panelPaddingSize="none"
            anchorPosition="upLeft"
          >
            <EuiContextMenu initialPanelId={0} panels={panels} />
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
