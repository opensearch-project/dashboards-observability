/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiEmptyPrompt,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiText,
  SortDirection,
} from '@elastic/eui';
import { IQuery, PatternTableData } from 'common/types/explorer';
import round from 'lodash/round';
import React from 'react';
import { FILTERED_PATTERN } from '../../../../../common/constants/explorer';
import { PPL_DOCUMENTATION_URL } from '../../../../../common/constants/shared';

interface PatternsTableProps {
  tableData: PatternTableData[];
  onPatternSelection: (pattern: string) => void;
  tabId: string;
  query: IQuery;
  isPatternLoading: boolean;
}

export function PatternsTable(props: PatternsTableProps) {
  const { tableData, onPatternSelection, query } = props;
  const totalHits = tableData.reduce((p, v) => p + v.count, 0);

  const tableColumns = [
    {
      field: 'count',
      name: 'Count',
      width: '6%',
      sortable: true,
      render: (item: string) => {
        return <EuiText size="s">{item}</EuiText>;
      },
    },
    {
      field: 'count',
      name: 'Ratio',
      width: '6%',
      sortable: (row: PatternTableData) => row.count,
      render: (item: number) => {
        const ratio = (item / totalHits) * 100;
        return <EuiText size="s">{`${round(ratio, 2)}%`}</EuiText>;
      },
    },
    {
      field: 'anomalyCount',
      name: 'Anomalies',
      width: '6%',
      sortable: (row: PatternTableData) => row.anomalyCount,
      render: (item: number) => {
        return <EuiText size="s">{item ?? 'N/A'}</EuiText>;
      },
    },
    {
      field: 'sampleLog',
      name: 'Sample Log',
      width: '82%',
      sortable: true,
      render: (item: string) => {
        return <EuiText size="s">{item}</EuiText>;
      },
    },
  ];

  const sorting = {
    sort: {
      field: 'count',
      direction: SortDirection.DESC,
    },
    enableAllColumns: true,
  };

  const pagination = {
    pageSizeOptions: [5, 10, 15, 20],
    initialPageSize: 5,
  };

  const message = (
    <EuiEmptyPrompt
      title={<h3>No patterns found.</h3>}
      titleSize="s"
      iconType="minusInCircle"
      iconColor="#DDDDDD"
      body={
        <p>
          Try expanding your time range or modifying your query. Learn more from our{' '}
          <EuiLink href={PPL_DOCUMENTATION_URL}>
            PPL documentation
            <EuiIcon type="popout" />
          </EuiLink>
        </p>
      }
    />
  );

  const getRowProps = (item: PatternTableData) => {
    const { pattern } = item;
    return {
      'data-test-subj': `row-${pattern}`,
      className: 'customRowClass',
      onClick: () => {
        if (!props.isPatternLoading) {
          onPatternSelection(pattern);
        }
      },
      isSelected: pattern === query[FILTERED_PATTERN],
    };
  };

  return (
    <EuiInMemoryTable
      items={tableData}
      columns={tableColumns}
      pagination={pagination}
      sorting={sorting}
      message={message}
      rowProps={getRowProps}
      isSelectable={true}
      tableLayout="auto"
      allowNeutralSort={false}
    />
  );
}
