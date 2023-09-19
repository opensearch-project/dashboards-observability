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
} from '@elastic/eui';
import moment from 'moment';
import dompurify from 'dompurify';
import datemath from '@elastic/datemath';
import { MutableRefObject } from 'react';
import { GridSortingColumn, IExplorerFields } from '../../../../../common/types/explorer';
import { DATE_DISPLAY_FORMAT, DATE_PICKER_FORMAT } from '../../../../../common/constants/explorer';
import { getHeaders, getTrs, isValidTraceId, populateDataGrid } from '../../utils';
import { HttpSetup } from '../../../../../../../src/core/public';
import PPLService from '../../../../services/requests/ppl';
import { FlyoutButton, IDocType } from './docViewRow';
import { useFetchEvents } from '../../hooks';
import {
  PPL_INDEX_INSERT_POINT_REGEX,
  PPL_NEWLINE_REGEX,
} from '../../../../../common/constants/shared';

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
  const [rowRefs, setRowRefs] = useState<
    Array<RefObject<{ closeAllFlyouts(openDocId: string): void }>>
  >([]);
  const { getEvents } = useFetchEvents({
    pplService,
    requestParams,
  });
  const sortingFields: MutableRefObject<GridSortingColumn[]> = useRef([
    { id: 'timestamp', direction: 'asc' },
  ]);
  const pageFields = useRef([0, 25]);

  const onFlyoutOpen = (docId: string) => {
    rowRefs.forEach((rowRef) => {
      rowRef.current?.closeAllFlyouts(docId);
    });
  };

  const redoQuery = () => {
    let finalQuery = '';

    const start = datemath.parse(startTime)?.utc().format(DATE_PICKER_FORMAT);
    const end = datemath.parse(endTime, { roundUp: true })?.utc().format(DATE_PICKER_FORMAT);
    const tokens = rawQuery.replaceAll(PPL_NEWLINE_REGEX, '').match(PPL_INDEX_INSERT_POINT_REGEX);

    finalQuery = `${tokens![1]}=${
      tokens![2]
    } | where ${timeStampField} >= '${start}' and ${timeStampField} <= '${end}'`;

    finalQuery += tokens![3];

    for (let i = 0; i < sortingFields.current.length; i++) {
      const field = sortingFields.current[i];
      const dir = field.direction === 'asc' ? '+' : '-';
      finalQuery = finalQuery + ` | sort ${dir} ${field.id}`;
    }

    finalQuery =
      finalQuery +
      ` | head ${pageFields.current[1]} from ${pageFields.current[0] * pageFields.current[1]}`;
    getEvents(finalQuery);
  };

  // setSort and setPage are used to change the query and send a direct request to get data
  const setSort = (sort: GridSortingColumn[]) => {
    console.log('its sorbing time');
    sortingFields.current = sort;
    console.log(sortingFields);
    console.log(sort);
    redoQuery();
  };

  const setPage = (page: number[]) => {
    console.log('its porbing time');
    pageFields.current = page;
    redoQuery();
  };

  // creates the header for each column listing what that column is
  const dataGridColumns = useMemo(() => {
    if (explorerFields?.selectedFields && explorerFields.selectedFields.length > 0) {
      const fields = explorerFields.selectedFields;
      const columns: EuiDataGridColumn[] = [];
      fields.map(({ name, type }) => {
        const newColumn = {
          id: name,
          display: name,
          isSortable: true,
        };
        columns.push(newColumn);
      });
      return columns;
    }
    console.log('default state');
    // default selected fields
    return [
      {
        id: 'timestamp',
        isSortable: true,
        display: 'Time',
        schema: 'datetime',
        initialWidth: 200,
      },
      {
        id: '_source',
        isSortable: false,
        display: 'Source',
        schema: '_source',
      },
    ];
  }, [explorerFields.selectedFields]);

  // used for which columns are visible and their order
  const dataGridColumnVisibility = useMemo(() => {
    if (explorerFields?.selectedFields && explorerFields.selectedFields.length > 0) {
      const fields = explorerFields.selectedFields;
      const columns: string[] = [];
      fields.map(({ name }) => {
        columns.push(name);
      });
      return {
        visibleColumns: columns,
        setVisibleColumns: (visibleColumns: string[]) => {
          console.log(visibleColumns);
        },
      };
    }
    console.log('default states');
    // default shown fields
    return {
      visibleColumns: ['timestamp', '_source'],
      setVisibleColumns: (visibleColumns: string[]) => {
        console.log(visibleColumns);
      },
    };
  }, [explorerFields.selectedFields]);

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
              onFlyoutOpen={onFlyoutOpen}
            />
          );
        },
        width: 40,
      },
    ];
  }, [rows]);

  // renders what is shown in each cell, i.e. the content of each row
  const dataGridCellRender = useMemo(
    () => ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
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
                  <EuiDescriptionListDescription
                    dangerouslySetInnerHTML={{ __html: dompurify.sanitize(rows[trueIndex][key]) }}
                  />
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
    [rows, explorerFields.selectedFields]
  );

  // ** Pagination config
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  // changing the number of items per page, reset index and modify page size
  const onChangeItemsPerPage = useCallback(
    (pageSize) =>
      setPagination(() => {
        setPage([0, pageSize]);
        return { pageIndex: 0, pageSize };
      }),
    [setPagination]
  );
  // changing the page index, keep page size constant
  const onChangePage = useCallback(
    (pageIndex) => {
      setPagination(({ pageSize }) => {
        setPage([pageIndex, pageSize]);
        return { pageSize, pageIndex };
      });
    },
    [setPagination]
  );

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
        />
      </div>
    </>
  );
}
