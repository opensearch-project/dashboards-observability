/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useRef, Fragment, useCallback } from 'react';
import {
  EuiDataGrid,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiDataGridColumn,
  EuiDataGridSorting,
  EuiPanel,
} from '@elastic/eui';
import moment from 'moment';
import { MutableRefObject } from 'react';
import { IExplorerFields, IField } from '../../../../../common/types/explorer';
import {
  DATE_DISPLAY_FORMAT,
  DEFAULT_EMPTY_EXPLORER_FIELDS,
  DEFAULT_SOURCE_COLUMN,
  DEFAULT_TIMESTAMP_COLUMN,
} from '../../../../../common/constants/explorer';
import { HttpSetup } from '../../../../../../../src/core/public';
import PPLService from '../../../../services/requests/ppl';
import { FlyoutButton } from './docViewRow';
import { useFetchEvents } from '../../hooks';
import { redoQuery } from '../../utils/utils';

interface DataGridProps {
  http: HttpSetup;
  pplService: PPLService;
  rows: any[];
  rowsAll: any[];
  explorerFields: IExplorerFields;
  timeStampField: string;
  rawQuery: string;
  totalHits: number;
  requestParams: any;
  startTime: string;
  endTime: string;
  storedSelectedColumns: IField[];
}

export function DataGrid(props: DataGridProps) {
  const {
    http,
    pplService,
    rows,
    rowsAll,
    explorerFields,
    timeStampField,
    rawQuery,
    totalHits,
    requestParams,
    startTime,
    endTime,
  } = props;
  const { fetchEvents } = useFetchEvents({
    pplService,
    requestParams,
  });
  const selectedColumns =
    explorerFields.selectedFields.length > 0
      ? explorerFields.selectedFields
      : DEFAULT_EMPTY_EXPLORER_FIELDS;
  // useRef instead of useState somehow solves the issue of user triggered sorting not
  // having any delays
  const sortingFields: MutableRefObject<EuiDataGridSorting['columns']> = useRef([]);
  const pageFields = useRef([0, 100]);

  const [data, setData] = useState(rows);

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
    const res = redoQuery(
      startTime,
      endTime,
      rawQuery,
      timeStampField,
      sortingFields,
      pageFields,
      fetchEvents,
      setData
    );
    console.log(res);
  };

  // creates the header for each column listing what that column is
  const dataGridColumns = useMemo(() => {
    const columns: EuiDataGridColumn[] = [];
    selectedColumns.map(({ name, type }) => {
      if (name === 'timestamp') {
        columns.push(DEFAULT_TIMESTAMP_COLUMN);
      } else if (name === '_source') {
        columns.push(DEFAULT_SOURCE_COLUMN);
      } else {
        columns.push({
          id: name,
          display: name,
          isSortable: true, // TODO: add functionality here based on type
        });
      }
    });
    return columns;
  }, [explorerFields]);

  // used for which columns are visible and their order
  const dataGridColumnVisibility = useMemo(() => {
    if (selectedColumns.length > 0) {
      const columns: string[] = [];
      selectedColumns.map(({ name }) => {
        columns.push(name);
      });
      return {
        visibleColumns: columns,
        setVisibleColumns: (visibleColumns: string[]) => {
          // TODO: implement with sidebar field order (dragability) changes
        },
      };
    }
    // default shown fields
    throw new Error('explorer data grid stored columns empty');
  }, [explorerFields]);

  // sets the very first column, which is the button used for the flyout of each row
  const dataGridLeadingColumns = useMemo(() => {
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
              doc={rows[rowIndex % pageFields.current[1]]}
              selectedCols={explorerFields.queriedFields}
              timeStampField={timeStampField}
              explorerFields={explorerFields}
              pplService={pplService}
              rawQuery={rawQuery}
              onFlyoutOpen={() => {}}
              dataGridColumns={dataGridColumns}
              dataGridColumnVisibility={dataGridColumnVisibility}
              selectedIndex={rowIndex}
              sortingFields={sortingFields}
              rowHeightsOptions={rowHeightsOptions}
              rows={rows}
            />
          );
        },
        width: 40,
      },
    ];
  }, [rows, http, explorerFields, pplService, rawQuery, timeStampField]);

  // renders what is shown in each cell, i.e. the content of each row
  const dataGridCellRender = useCallback(
    ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const trueIndex = rowIndex % pageFields.current[1];
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
        if (columnId === 'timestamp') {
          return `${moment(data[trueIndex][columnId]).format(DATE_DISPLAY_FORMAT)}`;
        }
        return `${data[trueIndex][columnId]}`;
      }
      return null;
    },
    [data, rows, pageFields, explorerFields]
  );

  // ** Pagination config
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 100 });
  // changing the number of items per page, reset index and modify page size
  const onChangeItemsPerPage = useCallback(
    (pageSize) =>
      setPagination(() => {
        setPage([0, pageSize]);
        return { pageIndex: 0, pageSize };
      }),
    [setPagination, setPage]
  );
  // changing the page index, keep page size constant
  const onChangePage = useCallback(
    (pageIndex) => {
      setPagination(({ pageSize }) => {
        setPage([pageIndex, pageSize]);
        return { pageSize, pageIndex };
      });
    },
    [setPagination, setPage]
  );

  const rowHeightsOptions = useMemo(
    () => ({
      defaultHeight: {
        // if source is listed as a column, add extra space
        lineCount: selectedColumns.some((obj) => obj.name === '_source') ? 3 : 1,
      },
    }),
    [explorerFields]
  );

  // TODO: memoize the expensive table below

  return (
    <EuiPanel paddingSize="s">
      <div className="dscTable dscTableFixedScroll">
        <EuiDataGrid
          aria-labelledby="aria-labelledby"
          data-test-subj="docTable"
          columns={dataGridColumns}
          columnVisibility={dataGridColumnVisibility}
          leadingControlColumns={dataGridLeadingColumns}
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
          rowHeightsOptions={rowHeightsOptions}
        />
      </div>
    </EuiPanel>
  );
}
