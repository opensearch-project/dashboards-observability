/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Criteria, EuiIcon, EuiInMemoryTable, EuiLink } from '@elastic/eui';
import React, { useRef, useState } from 'react';
import { FILTER_OPTIONS, LOG_EXPLORER_BASE_PATH } from '../../../../common/constants/explorer';
import { PPL_METRIC_SUBTYPE, PROMQL_METRIC_SUBTYPE } from '../../../../common/constants/shared';
import { METRIC_EXPLORER_BASE_PATH } from '../../../../common/constants/metrics';

interface SavedQueryTableProps {
  savedHistories: any[];
  handleHistoryClick: (objectId: string) => void;
  handleSelectHistory: (selectedHistories: any[]) => void;
  isTableLoading: boolean;
  selectedHistories: History[];
}

export function SavedQueryTable({
  savedHistories,
  handleSelectHistory,
  isTableLoading,
}: SavedQueryTableProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const pageIndexRef = useRef<number>();
  pageIndexRef.current = pageIndex;
  const pageSizeRef = useRef<number>();
  pageSizeRef.current = pageSize;

  const onTableChange = (criteria: Criteria<typeof histories>) => {
    if (criteria.page) {
      const { index, size } = criteria.page;
      setPageIndex(index);
      setPageSize(size);
    }
  };

  const columns = [
    {
      field: 'type',
      name: '',
      sortable: true,
      width: '40px',
      render: (item: any) => {
        if (item === 'Visualization') {
          return (
            <div>
              <EuiIcon type="visBarVerticalStacked" size="m" />
            </div>
          );
        } else {
          return (
            <div>
              <EuiIcon type="discoverApp" size="m" />
            </div>
          );
        }
      },
    },
    {
      field: 'data',
      name: 'Name',
      width: '70%',
      sortable: true,
      truncateText: true,
      render: (item: any) => {
        return item.subType === PROMQL_METRIC_SUBTYPE ? (
          <EuiLink
            href={`${METRIC_EXPLORER_BASE_PATH}${item.objectId}`}
            data-test-subj="eventHome__savedQueryTableName"
          >
            {item.name}
          </EuiLink>
        ) : (
          <EuiLink
            href={`${LOG_EXPLORER_BASE_PATH}${item.objectId}`}
            data-test-subj="eventHome__savedQueryTableName"
          >
            {item.name}
          </EuiLink>
        );
      },
    },
    {
      field: 'type',
      name: 'Type',
    },
  ];

  const histories = savedHistories.map((h) => {
    const isSavedVisualization = h.hasOwnProperty('savedVisualization');
    const savedObject = isSavedVisualization ? h.savedVisualization : h.savedQuery;
    const curType = isSavedVisualization ? 'savedVisualization' : 'savedQuery';
    const displayType = !isSavedVisualization
      ? 'Query'
      : [PPL_METRIC_SUBTYPE, PROMQL_METRIC_SUBTYPE].includes(savedObject?.subType)
      ? 'Metric'
      : 'Visualization';
    const record = {
      objectId: h.objectId,
      objectType: curType,
      name: savedObject.name,
      query: savedObject.query,
      date_start: savedObject.selected_date_range.start,
      date_end: savedObject.selected_date_range.end,
      timestamp: savedObject.selected_timestamp?.name,
      fields: savedObject.selected_fields?.tokens || [],
      subType: savedObject.subType,
    };
    return {
      id: h.objectId,
      data: record,
      name: savedObject.name,
      type: displayType,
    };
  });

  const search = {
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection',
        field: 'type',
        name: 'Type',
        multiSelect: 'or',
        options: FILTER_OPTIONS.map((i) => ({
          value: i,
          name: i,
          view: i,
        })),
      },
    ],
  };

  const pagination = {
    pageIndex,
    pageSize,
    totalItemCount: histories.length,
    pageSizeOptions: [5, 10, 20, 50],
  };

  return (
    <EuiInMemoryTable
      itemId="id"
      loading={isTableLoading}
      items={histories}
      columns={columns}
      pagination={pagination}
      onChange={onTableChange}
      search={search}
      isSelectable={true}
      selection={{
        onSelectionChange: (selectedHistories) => {
          handleSelectHistory(selectedHistories);
        },
      }}
    />
  );
}
