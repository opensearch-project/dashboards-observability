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
  EuiLoadingContent,
  EuiOverlayMask,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import React, { useMemo, useState } from 'react';
import { NoMatchMessage } from '../helper_functions';

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
}) => {
  const [localVisibleColumns, setLocalVisibleColumns] = useState(
    visibleColumns ?? columns.map((col) => col.id)
  );
  const [isFullScreen, setIsFullScreen] = useState(fullScreen);

  const disableInteractions = useMemo(() => isFullScreen, [isFullScreen]);

  const toolbarControls = useMemo(
    () => [
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
      </EuiButtonEmpty>,
      ...toolbarButtons,
    ],
    [isFullScreen, toolbarButtons]
  );

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

  return isTableDataLoading ? (
    <div>
      <EuiLoadingContent lines={4} />
    </div>
  ) : (
    <>
      <FullScreenWrapper isFullScreen={isFullScreen} onClose={() => setIsFullScreen(false)}>
        <div className={isFullScreen ? 'full-wrapper' : 'normal-wrapper'}>
          <EuiDataGrid
            aria-labelledby="custom-data-grid"
            columns={columns}
            columnVisibility={{
              visibleColumns: localVisibleColumns,
              setVisibleColumns: setLocalVisibleColumns,
            }}
            rowCount={rowCount}
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
        </div>
      </FullScreenWrapper>
      {rowCount === 0 && <NoMatchMessage size={noMatchMessageSize} />}
    </>
  );
};
