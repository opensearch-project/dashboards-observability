/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiDataGrid,
  EuiDataGridColumn,
  EuiDataGridSorting,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHighlight,
  EuiIcon,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
  EuiText,
  EuiTextColor,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import React, { useMemo, useState } from 'react';
import { NoMatchMessage } from '../helper_functions';
import {
  TRACE_TABLE_OPTIONS,
  TRACE_TABLE_TITLES,
  TRACE_TABLE_TYPE_KEY,
} from '../../../../../../common/constants/trace_analytics';
import { useInjectElementsIntoGrid } from './component_helper_functions';
import { uiSettingsService } from '../../../../../../common/utils';

const MAX_DISPLAY_ROWS = 10000;
interface FullScreenWrapperProps {
  children: React.ReactNode;
  onClose: () => void;
  isFullScreen: boolean;
}

// EUI Data grid full screen button is currently broken, this is a workaround
const FullScreenWrapper: React.FC<FullScreenWrapperProps> = ({
  children,
  onClose,
  isFullScreen,
}) => {
  if (!isFullScreen) return <>{children}</>;
  return (
    <EuiOverlayMask>
      <div className="full-screen-wrapper">
        <EuiButtonIcon
          iconType="cross"
          aria-label="Close full screen"
          onClick={onClose}
          display="empty"
          className="full-screen-close-icon"
        />
        <div className="full-screen-content">{children}</div>
      </div>
    </EuiOverlayMask>
  );
};

interface PaginationParams {
  pageIndex: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onChangePage: (page: number) => void;
  onChangeItemsPerPage: (size: number) => void;
}

interface RenderCellValueProps {
  rowIndex: number;
  columnId: string;
  disableInteractions: boolean;
}

interface RenderCustomDataGridParams {
  columns: EuiDataGridColumn[];
  renderCellValue: (props: RenderCellValueProps) => React.ReactNode;
  rowCount: number;
  sorting?: EuiDataGridSorting;
  pagination?: PaginationParams;
  toolbarButtons?: React.ReactNode[];
  fullScreen?: boolean;
  availableWidth?: number;
  noMatchMessageSize?: string;
  defaultHeight?: string;
  visibleColumns?: string[];
  isTableDataLoading?: boolean;
  tracesTableMode?: string;
  setTracesTableMode?: (mode: string) => void;
  maxTraces: number;
  setMaxTraces: (max: number) => void;
}

export const RenderCustomDataGrid: React.FC<RenderCustomDataGridParams> = ({
  columns,
  renderCellValue,
  rowCount,
  sorting,
  pagination,
  toolbarButtons = [],
  fullScreen = false,
  availableWidth,
  noMatchMessageSize = 'xl',
  defaultHeight = '500px',
  visibleColumns,
  isTableDataLoading,
  tracesTableMode,
  setTracesTableMode,
  setMaxTraces,
}) => {
  const defaultVisibleColumns = useMemo(() => {
    return columns
      .filter((col) => !col.id.includes('attributes') && !col.id.includes('instrumentation'))
      .map((col) => col.id);
  }, [columns]);

  const [localVisibleColumns, setLocalVisibleColumns] = useState(
    visibleColumns ?? defaultVisibleColumns
  );

  const [isFullScreen, setIsFullScreen] = useState(fullScreen);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const displayedRowCount = rowCount > MAX_DISPLAY_ROWS ? MAX_DISPLAY_ROWS : rowCount;

  const isDarkMode = uiSettingsService.get('theme:darkMode');

  const tableOptions = tracesTableMode
    ? TRACE_TABLE_OPTIONS.map((obj) =>
        obj.key === tracesTableMode ? { ...obj, checked: 'on' } : obj
      )
    : [];

  useInjectElementsIntoGrid(rowCount, MAX_DISPLAY_ROWS, tracesTableMode ?? '', () => {
    setMaxTraces((prevMax: number) => Math.min(prevMax + 500, MAX_DISPLAY_ROWS));
  });

  const disableInteractions = useMemo(() => isFullScreen, [isFullScreen]);

  const tableModeSelector =
    setTracesTableMode && tracesTableMode ? (
      <EuiPopover
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        panelStyle={{ width: '350px' }}
        button={
          <EuiFlexGroup alignItems="center" gutterSize="s" direction="row">
            <EuiFlexGroup alignItems="center" gutterSize="xs" direction="row">
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <EuiTextColor
                    data-test-subj="trace-table-mode-selector"
                    color="success"
                    onClick={() => setIsPopoverOpen(!isPopoverOpen)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    {TRACE_TABLE_TITLES[tracesTableMode]} ({displayedRowCount})
                    <EuiIcon type="arrowDown" size="s" color="success" style={{ marginLeft: 4 }} />
                  </EuiTextColor>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiFlexItem grow={false} />
          </EuiFlexGroup>
        }
      >
        <EuiPopoverTitle>Select trace table filter</EuiPopoverTitle>
        <EuiSelectable
          singleSelection="always"
          options={tableOptions}
          listProps={{ rowHeight: 80 }}
          renderOption={(option, searchValue) => (
            <div style={{ padding: '6px 10px', width: '100%' }}>
              <EuiHighlight search={searchValue}>{TRACE_TABLE_TITLES[option.key]}</EuiHighlight>
              <br />
              <EuiTextColor color="subdued" className="popOverSelectableItem">
                <small>{option['aria-describedby'] || 'No description available'}</small>
              </EuiTextColor>
            </div>
          )}
          onChange={(newOptions) => {
            const selectedMode = newOptions.find((option) => option.checked === 'on')?.key;
            if (selectedMode && selectedMode !== tracesTableMode) {
              setTracesTableMode(selectedMode);
              sessionStorage.setItem(TRACE_TABLE_TYPE_KEY, selectedMode);
            }
            setIsPopoverOpen(false);
          }}
        >
          {(list) => list}
        </EuiSelectable>
      </EuiPopover>
    ) : null;

  const toolbarControls = useMemo(() => {
    const controls = [];

    if (tableModeSelector) {
      controls.push(tableModeSelector);
    }

    if (tracesTableMode === 'traces' || tracesTableMode === undefined) {
      controls.push(
        <EuiButtonEmpty
          size="xs"
          onClick={() => setIsFullScreen((prev) => !prev)}
          key="fullScreen"
          color="text"
          iconType={isFullScreen ? 'cross' : 'fullScreen'}
          data-test-subj="fullScreenButton"
        >
          {isFullScreen
            ? i18n.translate('toolbarControls.exitFullScreen', {
                defaultMessage: 'Exit full screen',
              })
            : i18n.translate('toolbarControls.fullScreen', {
                defaultMessage: 'Full screen',
              })}
        </EuiButtonEmpty>
      );
    }

    controls.push(...toolbarButtons);

    return controls;
  }, [isFullScreen, toolbarButtons, tracesTableMode]);

  const gridStyle = useMemo(
    () => ({
      border: 'horizontal',
      stripes: false,
      rowHover: 'highlight',
      header: 'underline',
      fontSize: 's',
      cellPadding: 's',
      footer: 'overline',
    }),
    []
  );

  return (
    <>
      <FullScreenWrapper isFullScreen={isFullScreen} onClose={() => setIsFullScreen(false)}>
        <div
          className={[
            isFullScreen ? 'full-wrapper' : 'normal-wrapper',
            isFullScreen && isDarkMode && 'dark-mode-enabled',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            position: 'relative',
            minHeight: isTableDataLoading && rowCount === 0 ? '100px' : undefined,
          }}
        >
          <EuiDataGrid
            aria-labelledby="custom-data-grid"
            columns={columns}
            columnVisibility={{
              visibleColumns: localVisibleColumns,
              setVisibleColumns: setLocalVisibleColumns,
            }}
            rowCount={displayedRowCount}
            renderCellValue={(props) =>
              renderCellValue({
                ...props,
                disableInteractions,
              })
            }
            sorting={sorting}
            toolbarVisibility={{
              showColumnSelector: true,
              showSortSelector: !!sorting,
              showFullScreenSelector: false,
              additionalControls: toolbarControls,
            }}
            pagination={pagination}
            gridStyle={gridStyle}
            style={{
              width: isFullScreen ? '100%' : availableWidth ? `${availableWidth}px` : '100%',
              height: isFullScreen ? '100%' : pagination ? 'auto' : defaultHeight,
            }}
          />
          {isTableDataLoading && (
            <div className="grid-loading-overlay">
              <EuiLoadingSpinner size="xl" />
            </div>
          )}
        </div>
      </FullScreenWrapper>
      {rowCount === 0 && <NoMatchMessage size={noMatchMessageSize} />}
    </>
  );
};
