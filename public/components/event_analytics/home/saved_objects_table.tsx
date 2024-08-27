/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Criteria,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiFieldSearch,
  EuiSpacer,
  EuiPopover,
  EuiFilterSelectItem,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiSmallButton,
  EuiContextMenuPanel,
  EuiContextMenuItem,
} from '@elastic/eui';
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
  addSampledata: () => void;
  showDeleteConfirmation: () => void;
}

export function SavedQueryTable({
  savedHistories,
  handleSelectHistory,
  isTableLoading,
  selectedHistories,
  addSampledata,
  showDeleteConfirmation,
}: SavedQueryTableProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);

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

  const togglePopover = () => {
    setIsPopoverOpen(!isPopoverOpen);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const toggleFilter = (filter: string) => {
    if (selectedFilters.includes(filter)) {
      setSelectedFilters(selectedFilters.filter((f) => f !== filter));
    } else {
      setSelectedFilters([...selectedFilters, filter]);
    }
  };

  const popoverItems = [
    <EuiContextMenuItem
      key="delete"
      disabled={savedHistories.length === 0 || selectedHistories.length === 0}
      onClick={() => {
        setIsActionsPopoverOpen(false);
        showDeleteConfirmation();
      }}
      data-test-subj="eventHomeAction__delete"
    >
      Delete
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="addSample"
      onClick={() => {
        setIsActionsPopoverOpen(false);
        addSampledata();
      }}
      data-test-subj="eventHomeAction__addSamples"
    >
      Add samples
    </EuiContextMenuItem>,
  ];

  const popoverButton = (
    <EuiSmallButton
      iconType="arrowDown"
      iconSide="right"
      onClick={() => setIsActionsPopoverOpen(!isActionsPopoverOpen)}
      data-test-subj="eventHomeAction"
    >
      Actions
    </EuiSmallButton>
  );

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
        return item.metricType === PROMQL_METRIC_SUBTYPE ? (
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

  const filteredHistories = savedHistories
    .filter((h) => {
      const isSavedVisualization = h.hasOwnProperty('savedVisualization');
      const savedObject = isSavedVisualization ? h.savedVisualization : h.savedQuery;
      const displayType = !isSavedVisualization
        ? 'Query'
        : [PPL_METRIC_SUBTYPE, PROMQL_METRIC_SUBTYPE].includes(savedObject?.subType)
        ? 'Metric'
        : 'Visualization';
      const name = savedObject.name.toLowerCase();
      const query = savedObject.query.toLowerCase();
      const searchLower = searchQuery.toLowerCase();
      const typeMatches = selectedFilters.length === 0 || selectedFilters.includes(displayType);

      return (name.includes(searchLower) || query.includes(searchLower)) && typeMatches;
    })
    .map((h) => {
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
        metricType: savedObject?.metricType || 'customMetric',
      };
      return {
        id: h.objectId,
        data: record,
        name: savedObject.name,
        type: displayType,
      };
    });

  const pagination = {
    pageIndex,
    pageSize,
    totalItemCount: filteredHistories.length,
    pageSizeOptions: [5, 10, 20, 50],
  };

  return (
    <>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
        <EuiFlexItem grow={true}>
          <EuiFieldSearch
            compressed
            placeholder="Search saved queries"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            isClearable
            fullWidth
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPopover
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            button={
              <EuiSmallButton iconType="arrowDown" onClick={togglePopover} iconSide="right">
                Type{' '}
                {selectedFilters.length > 0 && (
                  <EuiBadge color="secondary">{selectedFilters.length}</EuiBadge>
                )}
              </EuiSmallButton>
            }
          >
            <EuiFlexItem>
              {FILTER_OPTIONS.map((filter) => (
                <EuiFilterSelectItem
                  key={filter}
                  onClick={() => toggleFilter(filter)}
                  checked={selectedFilters.includes(filter) ? 'on' : undefined}
                >
                  {filter}
                </EuiFilterSelectItem>
              ))}
            </EuiFlexItem>
          </EuiPopover>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPopover
            panelPaddingSize="none"
            button={popoverButton}
            isOpen={isActionsPopoverOpen}
            closePopover={() => setIsActionsPopoverOpen(false)}
          >
            <EuiContextMenuPanel items={popoverItems} />
          </EuiPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiInMemoryTable
        itemId="id"
        loading={isTableLoading}
        items={filteredHistories}
        columns={columns}
        pagination={pagination}
        onChange={onTableChange}
        isSelectable={true}
        selection={{
          onSelectionChange: (selectedItems) => {
            handleSelectHistory(selectedItems);
          },
        }}
      />
    </>
  );
}
