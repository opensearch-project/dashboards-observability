/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useRef, RefObject, Fragment, useCallback } from 'react';
import {
  EuiDataGrid,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiDataGridColumn,
  EuiDataGridSorting,
} from '@elastic/eui';
import moment from 'moment';
import dompurify from 'dompurify';
import datemath from '@elastic/datemath';
import { MutableRefObject } from 'react';
import { GridSortingColumn, IExplorerFields, IField } from '../../../../../common/types/explorer';
import {
  DATE_DISPLAY_FORMAT,
  DATE_PICKER_FORMAT,
  DEFAULT_SOURCE_COLUMN,
  DEFAULT_TIMESTAMP_COLUMN,
} from '../../../../../common/constants/explorer';
import { HttpSetup } from '../../../../../../../src/core/public';
import PPLService from '../../../../services/requests/ppl';
import { FlyoutButton, IDocType } from './docViewRow';
import { useFetchEvents } from '../../hooks';
import {
  PPL_INDEX_INSERT_POINT_REGEX,
  PPL_NEWLINE_REGEX,
} from '../../../../../common/constants/shared';
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
    storedSelectedColumns,
  } = props;
  const { getEvents } = useFetchEvents({
    pplService,
    requestParams,
  });
  // useRef instead of useState somehow solves the issue of user triggered sorting not
  // having any delays
  const sortingFields: MutableRefObject<EuiDataGridSorting['columns']> = useRef([]);
  const pageFields = useRef([0, 100]);

  // setSort and setPage are used to change the query and send a direct request to get data
  const setSort = (sort: EuiDataGridSorting['columns']) => {
    sortingFields.current = sort;
    redoQuery(startTime, endTime, rawQuery, timeStampField, sortingFields, pageFields, getEvents);
  };

  const setPage = (page: number[]) => {
    pageFields.current = page;
    redoQuery(startTime, endTime, rawQuery, timeStampField, sortingFields, pageFields, getEvents);
  };

  // creates the header for each column listing what that column is
  const dataGridColumns = useMemo(() => {
    if (storedSelectedColumns.length > 0) {
      const columns: EuiDataGridColumn[] = [];
      storedSelectedColumns.map(({ name, type }) => {
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
    }
    return [];
  }, [storedSelectedColumns]);

  // used for which columns are visible and their order
  const dataGridColumnVisibility = useMemo(() => {
    if (storedSelectedColumns.length > 0) {
      const columns: string[] = [];
      storedSelectedColumns.map(({ name }) => {
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
  }, [storedSelectedColumns]);

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
              onFlyoutOpen={() => {}} // TODO: change this button to a minimize icon
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
      if (trueIndex < rows.length) {
        if (columnId === '_source') {
          return (
            <EuiDescriptionList type="inline" compressed>
              {Object.keys(rows[trueIndex]).map((key) => (
                <Fragment key={key}>
                  <EuiDescriptionListTitle className="osdDescriptionListFieldTitle">
                    {key}
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription>
                    {rows[trueIndex][key]}
                  </EuiDescriptionListDescription>
                </Fragment>
              ))}
            </EuiDescriptionList>
          );
        }
        if (columnId === 'timestamp') {
          return `${moment(rows[trueIndex][columnId]).format(DATE_DISPLAY_FORMAT)}`;
        }
        return `${rows[trueIndex][columnId]}`;
      }
      return null;
    },
    [rows, pageFields, explorerFields]
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
        lineCount: storedSelectedColumns.some((obj) => obj.name === '_source') ? 3 : 1,
      },
    }),
    [storedSelectedColumns]
  );

  // TODO: memoize the expensive table below

  return (
    <>
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
    </>
  );
}
