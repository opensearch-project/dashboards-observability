/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiDataGrid,
  EuiDataGridColumn,
  EuiDataGridSorting,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiPanel,
  EuiDataGridProps,
  EuiSpacer,
} from '@elastic/eui';
import moment from 'moment';
import React, { Fragment, MutableRefObject, useEffect, useRef, useState } from 'react';
import { i18n } from '@osd/i18n';
import { HttpSetup } from '../../../../../../../src/core/public';
import {
  DATE_DISPLAY_FORMAT,
  DEFAULT_EMPTY_EXPLORER_FIELDS,
  DEFAULT_SOURCE_COLUMN,
  DEFAULT_TIMESTAMP_COLUMN,
} from '../../../../../common/constants/explorer';
import { IExplorerFields, IField } from '../../../../../common/types/explorer';
import PPLService from '../../../../services/requests/ppl';
import { useFetchEvents } from '../../hooks';
import { redoQuery } from '../../utils/utils';
import { FlyoutButton } from './docViewRow';
import { HitsCounter } from '../timechart/hits_counter';

export interface DataGridProps {
  http: HttpSetup;
  pplService: PPLService;
  rows: any[];
  explorerFields: IExplorerFields;
  timeStampField: string;
  rawQuery: string;
  totalHits: number;
  requestParams: any;
  startTime: string;
  endTime: string;
  isDefaultDataSource: boolean;
  storedSelectedColumns: IField[];
  formatGridColumn?: (columns: EuiDataGridColumn[]) => EuiDataGridColumn[];
  OuiDataGridProps?: Partial<EuiDataGridProps>;
}

const defaultFormatGrid = (columns: EuiDataGridColumn[]) => columns;

export function DataGrid(props: DataGridProps) {
  const {
    http,
    pplService,
    rows,
    explorerFields,
    timeStampField,
    rawQuery,
    totalHits,
    requestParams,
    startTime,
    endTime,
    isDefaultDataSource,
    formatGridColumn = defaultFormatGrid,
    OuiDataGridProps,
  } = props;
  const { fetchEvents } = useFetchEvents({
    pplService,
    requestParams,
  });

  const selectedColumns =
    explorerFields.selectedFields.length > 0 // if any fields are selected use that, otherwise defaults
      ? explorerFields.selectedFields
      : timeStampField && timeStampField !== '' // if theres a timestamp, include that, otherwise dont
      ? [{ name: timeStampField, type: 'timestamp' }, ...DEFAULT_EMPTY_EXPLORER_FIELDS]
      : DEFAULT_EMPTY_EXPLORER_FIELDS;
  // useRef instead of useState somehow solves the issue of user triggered sorting not
  // having any delays
  const sortingFields: MutableRefObject<EuiDataGridSorting['columns']> = useRef([]);
  const pageFields = useRef([0, 100]); // page num, row length

  const [data, setData] = useState(rows);

  useEffect(() => {
    setData(rows);
  }, [rows]);

  // setSort and setPage are used to change the query and send a direct request to get data
  const setSort = (sort: EuiDataGridSorting['columns']) => {
    sortingFields.current = sort;

    redoQuery(
      startTime,
      endTime,
      rawQuery,
      timeStampField,
      sortingFields,
      pageFields,
      fetchEvents,
      setData
    );
  };

  const setPage = (page: number[]) => {
    pageFields.current = page;
    if (!isDefaultDataSource) return; // avoid adjusting query if using s3

    redoQuery(
      startTime,
      endTime,
      rawQuery,
      timeStampField,
      sortingFields,
      pageFields,
      fetchEvents,
      setData
    );
  };

  const findTrueIndex = (rowIndex: number) => {
    // if using default ds, data given to dg will be per page, need to adjust dg expected index and actual data index
    if (isDefaultDataSource) {
      // modulo of row length, i.e. pos on current page
      rowIndex = rowIndex % pageFields.current[1];
    }
    return rowIndex;
  };

  const columnNameTranslate = (name: string) => {
    return i18n.translate(`discover.events.dataGrid.${name.toLowerCase()}Column`, {
      defaultMessage: name,
    });
  };

  // creates the header for each column listing what that column is
  const dataGridColumns = () => {
    const columns: EuiDataGridColumn[] = [];
    selectedColumns.map(({ name }) => {
      if (name === timeStampField) {
        columns.push({
          ...DEFAULT_TIMESTAMP_COLUMN,
          display: `${columnNameTranslate('Time')} (${timeStampField})`,
          id: timeStampField,
          isSortable: isDefaultDataSource, // allow sorting for default ds, dont otherwise
        });
      } else if (name === '_source') {
        columns.push({
          ...DEFAULT_SOURCE_COLUMN,
          display: columnNameTranslate('Source'),
        });
      } else {
        columns.push({
          id: name,
          display: name,
          isSortable: isDefaultDataSource,
        });
      }
    });
    return formatGridColumn(columns);
  };

  // used for which columns are visible and their order
  const dataGridColumnVisibility = () => {
    if (selectedColumns.length > 0) {
      const columns: string[] = [];
      selectedColumns.map(({ name }) => {
        columns.push(name);
      });
      return {
        visibleColumns: columns,
        setVisibleColumns: () => {
          // TODO: implement with sidebar field order (dragability) changes
        },
      };
    }
    // default shown fields
    throw new Error('explorer data grid stored columns empty');
  };

  // sets the very first column, which is the button used for the flyout of each row
  const dataGridLeadingColumns = () => {
    return [
      {
        id: 'inspectCollapseColumn',
        headerCellRender: () => null,
        rowCellRender: ({ rowIndex }: { rowIndex: number }) => {
          return (
            <FlyoutButton
              ref={null}
              http={http}
              key={null}
              docId={'undefined'}
              doc={data[findTrueIndex(rowIndex)]}
              selectedCols={explorerFields.queriedFields}
              timeStampField={timeStampField}
              explorerFields={explorerFields}
              pplService={pplService}
              rawQuery={rawQuery}
              onFlyoutOpen={() => {}}
              dataGridColumns={dataGridColumns()}
              dataGridColumnVisibility={dataGridColumnVisibility()}
              selectedIndex={rowIndex}
              sortingFields={sortingFields}
              rowHeightsOptions={rowHeightsOptions()}
              rows={data}
            />
          );
        },
        width: 40,
      },
    ];
  };

  // renders what is shown in each cell, i.e. the content of each row
  const dataGridCellRender = ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
    const trueIndex = findTrueIndex(rowIndex);

    if (trueIndex < data.length) {
      if (columnId === '_source') {
        return (
          <EuiDescriptionList type="inline" compressed>
            {Object.keys(data[trueIndex]).map((key) => (
              <Fragment key={key}>
                <EuiDescriptionListTitle className="osdDescriptionListFieldTitle">
                  {key}
                </EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {data[trueIndex][key]}
                </EuiDescriptionListDescription>
              </Fragment>
            ))}
          </EuiDescriptionList>
        );
      }
      if (columnId === timeStampField) {
        return `${moment(data[trueIndex][timeStampField]).format(DATE_DISPLAY_FORMAT)}`;
      }
      return `${data[trueIndex][columnId]}`;
    }
    return null;
  };

  // ** Pagination config
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 100 });
  // changing the number of items per page, reset index and modify page size
  const onChangeItemsPerPage = (pageSize) =>
    setPagination(() => {
      setPage([0, pageSize]);
      return { pageIndex: 0, pageSize };
    });
  // changing the page index, keep page size constant
  const onChangePage = (pageIndex) => {
    setPagination(({ pageSize }) => {
      setPage([pageIndex, pageSize]);
      return { pageSize, pageIndex };
    });
  };

  const rowHeightsOptions = () => ({
    defaultHeight: {
      // if source is listed as a column, add extra space
      lineCount: selectedColumns.some((obj) => obj.name === '_source') ? 3 : 1,
    },
  });

  // TODO: memoize the expensive table below

  return (
    <EuiPanel paddingSize="s">
      {timeStampField === '' && (
        <>
          <HitsCounter hits={totalHits} showResetButton={false} onResetQuery={() => {}} />
          <EuiSpacer size="s" />
        </>
      )}
      <div className="dscTable dscTableFixedScroll">
        <EuiDataGrid
          aria-labelledby="aria-labelledby"
          data-test-subj="docTable"
          columns={dataGridColumns()}
          columnVisibility={dataGridColumnVisibility()}
          leadingControlColumns={dataGridLeadingColumns()}
          rowCount={totalHits}
          renderCellValue={dataGridCellRender}
          pagination={{
            ...pagination,
            pageSizeOptions: [25, 50, 100],
            onChangePage,
            onChangeItemsPerPage,
          }}
          sorting={{
            columns: sortingFields.current,
            onSort: setSort,
          }}
          toolbarVisibility={{
            showColumnSelector: {
              allowHide: false,
              allowReorder: true,
            },
            showFullScreenSelector: false,
            showStyleSelector: false,
          }}
          rowHeightsOptions={rowHeightsOptions()}
          {...OuiDataGridProps}
        />
      </div>
    </EuiPanel>
  );
}
