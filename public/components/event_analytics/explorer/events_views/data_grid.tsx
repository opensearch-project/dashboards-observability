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
} from '@elastic/eui';
import moment from 'moment';
import React, { Fragment, MutableRefObject, useEffect, useRef, useState } from 'react';
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

  // creates the header for each column listing what that column is
  const dataGridColumns = () => {
    const columns: EuiDataGridColumn[] = [];
    selectedColumns.map(({ name }) => {
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
  };

  // renders what is shown in each cell, i.e. the content of each row
  const dataGridCellRender = ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
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
        />
      </div>
    </EuiPanel>
  );
}
