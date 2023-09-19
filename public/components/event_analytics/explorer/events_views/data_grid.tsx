/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  RefObject,
  Fragment,
  useCallback,
} from 'react';
import {
  EuiButtonIcon,
  EuiDataGrid,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiLink,
  EuiDataGridColumn,
  EuiDataGridSorting,
} from '@elastic/eui';
import moment from 'moment';
import { toPairs, uniqueId } from 'lodash';
import dompurify from 'dompurify';
import datemath from '@elastic/datemath';
import { GridSortingColumn, IExplorerFields } from '../../../../../common/types/explorer';
import {
  DATE_DISPLAY_FORMAT,
  DATE_PICKER_FORMAT,
  DEFAULT_COLUMNS,
  JAEGER_TRACE_ID,
  OTEL_TRACE_ID,
  PAGE_SIZE,
} from '../../../../../common/constants/explorer';
import { getHeaders, getTrs, isValidTraceId, populateDataGrid } from '../../utils';
import { HttpSetup } from '../../../../../../../src/core/public';
import PPLService from '../../../../services/requests/ppl';
import { FlyoutButton, IDocType } from './docViewRow';
import { DocFlyout } from './doc_flyout';
import { useFetchEvents } from '../../hooks';
import { composeFinalQuery } from '../../../../../common/utils';
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
  const [limit, setLimit] = useState(PAGE_SIZE);
  const loader = useRef<HTMLDivElement>(null);
  const [rowRefs, setRowRefs] = useState<
    Array<RefObject<{ closeAllFlyouts(openDocId: string): void }>>
  >([]);
  const { getEvents } = useFetchEvents({
    pplService,
    requestParams,
  });
  const sortingFields = useRef([{ id: 'timestamp', direction: 'asc' }]);
  const pageFields = useRef([0, 25]);

  useEffect(() => {
    if (!loader.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setLimit((alimit) => alimit + PAGE_SIZE);
      },
      {
        root: null,
        rootMargin: '500px',
        threshold: 0,
      }
    );
    observer.observe(loader.current);

    return () => observer.disconnect();
  }, [loader]);

  const onFlyoutOpen = (docId: string) => {
    rowRefs.forEach((rowRef) => {
      rowRef.current?.closeAllFlyouts(docId);
    });
  };

  const redoQuery = () => {
    let finalQuery = '';

    // convert to moment
    const start = datemath.parse(startTime)?.utc().format(DATE_PICKER_FORMAT);
    const end = datemath.parse(endTime, { roundUp: true })?.utc().format(DATE_PICKER_FORMAT);
    const tokens = rawQuery.replaceAll(PPL_NEWLINE_REGEX, '').match(PPL_INDEX_INSERT_POINT_REGEX);

    finalQuery = `${tokens![1]}=${
      tokens![2]
    } | where ${timeStampField} >= '${start}' and ${timeStampField} <= '${end}'`;

    finalQuery += tokens![3];

    console.log(finalQuery); // to delete
    // if (isLiveQuery) {
    //   finalQuery = finalQuery + ` | sort - ${timeField}`;
    // } else {
    console.log(sortingFields);
    for (let i = 0; i < sortingFields.current.length; i++) {
      const field = sortingFields.current[i];
      const dir = field.direction === 'asc' ? '+' : '-';
      finalQuery = finalQuery + ` | sort ${dir} ${field.id}`;
    }
    console.log(finalQuery); // to delete

    finalQuery =
      finalQuery +
      ` | head ${pageFields.current[1]} from ${pageFields.current[0] * pageFields.current[1]}`;
    console.log(finalQuery);
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

  const Queriedheaders = useMemo(() => getHeaders(explorerFields.queriedFields, DEFAULT_COLUMNS), [
    explorerFields.queriedFields,
  ]);
  const [QueriedtableRows, setQueriedtableRows] = useState<any[]>([]);
  useEffect(() => {
    setQueriedtableRows(
      getTrs(
        http,
        explorerFields.queriedFields,
        limit,
        setLimit,
        PAGE_SIZE,
        timeStampField,
        explorerFields,
        pplService,
        rawQuery,
        rowRefs,
        setRowRefs,
        onFlyoutOpen,
        rows
      )
    );
  }, [rows, explorerFields.queriedFields]);

  const headers = useMemo(() => getHeaders(explorerFields.selectedFields, DEFAULT_COLUMNS), [
    explorerFields.selectedFields,
  ]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  useEffect(() => {
    const dataToRender =
      explorerFields?.queriedFields && explorerFields.queriedFields.length > 0 ? rowsAll : rows;
    setTableRows(
      getTrs(
        http,
        explorerFields.selectedFields,
        limit,
        setLimit,
        PAGE_SIZE,
        timeStampField,
        explorerFields,
        pplService,
        rawQuery,
        rowRefs,
        setRowRefs,
        onFlyoutOpen,
        dataToRender
      )
    );
  }, [rows, explorerFields.selectedFields]);

  useEffect(() => {
    setQueriedtableRows((prev) =>
      getTrs(
        http,
        explorerFields.queriedFields,
        limit,
        setLimit,
        PAGE_SIZE,
        timeStampField,
        explorerFields,
        pplService,
        rawQuery,
        rowRefs,
        setRowRefs,
        onFlyoutOpen,
        rows,
        prev
      )
    );
    const dataToRender =
      explorerFields?.queriedFields && explorerFields.queriedFields.length > 0 ? rowsAll : rows;
    setTableRows((prev) =>
      getTrs(
        http,
        explorerFields.selectedFields,
        limit,
        setLimit,
        PAGE_SIZE,
        timeStampField,
        explorerFields,
        pplService,
        rawQuery,
        rowRefs,
        setRowRefs,
        onFlyoutOpen,
        dataToRender,
        prev
      )
    );
  }, [limit]);

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
        rowCellRender: ({ rowIndex }) => {
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

            // <EuiButtonIcon
            //   onClick={() => alert('flyout opens')}
            //   iconType={'inspect'}
            //   aria-label="inspect document details"
            // />
          );
        },
        width: 40,
      },
    ];
  }, [rows]);

  // ** Flyout code
  // const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  // const [surroundingEventsOpen, setSurroundingEventsOpen] = useState<boolean>(false);
  // const [openTraces, setOpenTraces] = useState<boolean>(false);
  // const tracesFlyout = () => {
  //   setOpenTraces(true);
  //   if (!detailsOpen) toggleDetailOpen();
  // };
  // const toggleDetailOpen = () => {
  //   if (surroundingEventsOpen) {
  //     setSurroundingEventsOpen(false);
  //     setDetailsOpen(false);
  //   } else {
  //     const newState = !detailsOpen;
  //     setDetailsOpen(newState);
  //   }
  // };
  // const memorizedDocFlyout = useMemo(() => {
  //   return (
  //     <DocFlyout
  //       http={http}
  //       detailsOpen={detailsOpen}
  //       setDetailsOpen={setDetailsOpen}
  //       doc={doc}
  //       timeStampField={timeStampField}
  //       memorizedTds={getTds(doc, selectedCols, true).slice(1)}
  //       explorerFields={explorerFields}
  //       openTraces={openTraces}
  //       rawQuery={rawQuery}
  //       toggleSize={flyoutToggleSize}
  //       setToggleSize={setFlyoutToggleSize}
  //       setOpenTraces={setOpenTraces}
  //       setSurroundingEventsOpen={setSurroundingEventsOpen}
  //     />
  //   );
  // }, [
  //   http,
  //   detailsOpen,
  //   doc,
  //   timeStampField,
  //   selectedCols,
  //   explorerFields,
  //   openTraces,
  //   rawQuery,
  //   flyoutToggleSize,
  // ]);

  // renders what is shown in each cell, i.e. the content of each row
  const dataGridCellRender = useMemo(
    () => ({ rowIndex, columnId }) => {
      const trueIndex = rowIndex % pageFields.current[1];
      if (trueIndex < rows.length) {
        if (columnId === '_source') {
          return (
            // <div className="truncate-by-height" type="inline" compressed>
            //   <span>
            //     <dl className="source truncate-by-height">
            //       {Object.keys(rows[rowIndex]).map((key) => (
            //         <span key={uniqueId('grid-desc')}>
            //           <dt>{key}:</dt>
            //           <dd>
            //             {dompurify.sanitize(rows[rowIndex][key])}
            //           </dd>
            //         </span>
            //       ))}
            //     </dl>
            //   </span>
            // </div>
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
      {/* {populateDataGrid(explorerFields, Queriedheaders, QueriedtableRows, headers, tableRows)} */}
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
          // inMemory={{ level: 'sorting' }}
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
      <div ref={loader} />
    </>
  );
}
