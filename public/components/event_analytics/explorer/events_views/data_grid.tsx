/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef, RefObject, Fragment } from 'react';
import {
  EuiButtonIcon,
  EuiDataGrid,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiLink,
} from '@elastic/eui';
import moment from 'moment';
import { toPairs, uniqueId } from 'lodash';
import dompurify from 'dompurify';
import { EuiDataGridColumn } from '@opensearch-project/oui';
import { IExplorerFields } from '../../../../../common/types/explorer';
import {
  DATE_DISPLAY_FORMAT,
  DEFAULT_COLUMNS,
  JAEGER_TRACE_ID,
  OTEL_TRACE_ID,
  PAGE_SIZE,
} from '../../../../../common/constants/explorer';
import { getHeaders, getTrs, isValidTraceId, populateDataGrid } from '../../utils';
import { HttpSetup } from '../../../../../../../src/core/public';
import PPLService from '../../../../services/requests/ppl';
import { IDocType } from './docViewRow';

interface DataGridProps {
  http: HttpSetup;
  pplService: PPLService;
  rows: any[];
  rowsAll: any[];
  explorerFields: IExplorerFields;
  timeStampField: string;
  rawQuery: string;
}

export function DataGrid(props: DataGridProps) {
  const { http, pplService, rows, rowsAll, explorerFields, timeStampField, rawQuery } = props;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const loader = useRef<HTMLDivElement>(null);
  const [rowRefs, setRowRefs] = useState<
    Array<RefObject<{ closeAllFlyouts(openDocId: string): void }>>
  >([]);

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
          schema: type,
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
        rowCellRender: () => {
          return (
            <EuiButtonIcon
              onClick={() => alert('flyout opens')}
              iconType={'inspect'}
              aria-label="inspect document details"
            />
          );
        },
        width: 40,
      },
    ];
  }, []);

  // renders what is shown in each cell, i.e. the content of each row
  const dataGridCellRender = useMemo(
    () => ({ rowIndex, columnId }) => {
      if (rowIndex < tableRows.length) {
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
              {Object.keys(rows[rowIndex]).map((key) => (
                <Fragment key={key}>
                  <EuiDescriptionListTitle className="osdDescriptionListFieldTitle">
                    {key}
                  </EuiDescriptionListTitle>
                  <EuiDescriptionListDescription
                    dangerouslySetInnerHTML={{ __html: dompurify.sanitize(rows[rowIndex][key]) }}
                  />
                </Fragment>
              ))}
            </EuiDescriptionList>
          );
        }
        if (columnId === 'timestamp') {
          return `${moment(rows[rowIndex][columnId]).format(DATE_DISPLAY_FORMAT)}`;
        }
        return `${rows[rowIndex][columnId]}`;
      }
      return null;
    },
    [rows, explorerFields.selectedFields]
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
          rowCount={100}
          renderCellValue={dataGridCellRender}
        />
      </div>
      <div ref={loader} />
    </>
  );
}
