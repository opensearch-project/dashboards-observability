/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiSpacer, PropertySort } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { handleTracesRequest } from '../../requests/traces_request_handler';
import { getValidFilterFields } from '../common/filters/filter_helpers';
import { filtersToDsl, processTimeStamp } from '../common/helper_functions';
import { SearchBar } from '../common/search_bar';
import { TracesProps } from './traces';
import { DataPrepperTracesTable } from './data_prepper_traces_table';
import { JaegerTracesTable } from './jaeger_traces_table';

export interface TracesTableProps {
  items: any[];
  refresh: (sort?: PropertySort) => void;
  loading: boolean;
  traceIdColumnAction: any;
  indexExists: boolean;
}

export function TracesContent(props: TracesProps) {
  const {
    page,
    http,
    chrome,
    query,
    filters,
    appConfigs,
    startTime,
    endTime,
    parentBreadcrumbs,
    childBreadcrumbs,
    traceIdColumnAction,
    setQuery,
    setFilters,
    setStartTime,
    setEndTime,
    mode,
    dataPrepperIndicesExist,
    jaegerIndicesExist,
  } = props;
  const [tableItems, setTableItems] = useState([]);
  const [redirect, setRedirect] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    chrome.setBreadcrumbs([...parentBreadcrumbs, ...childBreadcrumbs]);
    const validFilters = getValidFilterFields(mode, 'traces');
    setFilters([
      ...filters.map((filter) => ({
        ...filter,
        locked: validFilters.indexOf(filter.field) === -1,
      })),
    ]);
    setRedirect(false);
  }, []);

  useEffect(() => {
    if (
      !redirect &&
      ((mode === 'data_prepper' && dataPrepperIndicesExist) ||
        (mode === 'jaeger' && jaegerIndicesExist))
    )
      refresh();
  }, [filters, appConfigs, redirect, mode, dataPrepperIndicesExist, jaegerIndicesExist]);

  const refresh = async (sort?: PropertySort) => {
    setLoading(true);
    const DSL = filtersToDsl(
      mode,
      filters,
      query,
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode),
      page,
      appConfigs
    );
    const timeFilterDSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode),
      page
    );
    await handleTracesRequest(http, DSL, timeFilterDSL, tableItems, setTableItems, mode, sort);
    setLoading(false);
  };

  const tracesTable = () => {
    switch (mode) {
      case 'data_prepper':
        return (
          <DataPrepperTracesTable
            items={tableItems}
            refresh={refresh}
            loading={loading}
            traceIdColumnAction={traceIdColumnAction}
            indexExists={dataPrepperIndicesExist}
          />
        );
      case 'jaeger':
        return (
          <JaegerTracesTable
            items={tableItems}
            refresh={refresh}
            loading={loading}
            traceIdColumnAction={traceIdColumnAction}
            indexExists={jaegerIndicesExist}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <SearchBar
        query={query}
        filters={filters}
        appConfigs={appConfigs}
        setFilters={setFilters}
        setQuery={setQuery}
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        refresh={refresh}
        page={page}
        mode={mode}
      />
      <EuiSpacer size="m" />
      {tracesTable()}
    </>
  );
}
