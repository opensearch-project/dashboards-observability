/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CriteriaWithPagination,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHighlight,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiPanel,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
  EuiSelectableOption,
  EuiSmallButtonEmpty,
  EuiSpacer,
  EuiTextColor,
  PropertySort,
} from '@elastic/eui';
import React, { Fragment, useMemo, useState } from 'react';
import {
  TRACE_TABLE_OPTIONS,
  TRACE_TABLE_TITLES,
  TRACE_TABLE_TYPE_KEY,
  TRACES_MAX_NUM,
} from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode, TraceQueryMode } from '../../../../../common/types/trace_analytics';
import {
  MissingConfigurationMessage,
  NoMatchMessage,
  PanelTitle,
} from '../common/helper_functions';
import { getTableColumns } from './trace_table_helpers';

interface TracesLandingTableProps {
  columnItems: string[];
  items: any[];
  refresh: (sort?: PropertySort) => Promise<void>;
  mode: TraceAnalyticsMode;
  loading: boolean;
  getTraceViewUri?: (traceId: string) => string;
  openTraceFlyout?: (traceId: string) => void;
  jaegerIndicesExist: boolean;
  dataPrepperIndicesExist: boolean;
  tracesTableMode: TraceQueryMode;
  setTracesTableMode: React.Dispatch<React.SetStateAction<TraceQueryMode>>;
}

export function TracesCustomIndicesTable(props: TracesLandingTableProps) {
  const { columnItems, items, refresh, mode, loading, getTraceViewUri, openTraceFlyout } = props;
  const [showAttributes, setShowAttributes] = useState(false);
  const [isTitlePopoverOpen, setIsTitlePopoverOpen] = useState(false);
  const [tableOptions, setTableOptions] = useState<EuiSelectableOption[]>(() =>
    TRACE_TABLE_OPTIONS.map((obj) =>
      obj.key === props.tracesTableMode ? { ...obj, checked: 'on' } : obj
    )
  );

  const titlePopoverButton = (totalItems?: number) => (
    <EuiSmallButtonEmpty
      onClick={() => setIsTitlePopoverOpen(!isTitlePopoverOpen)}
      iconType="arrowDown"
      iconSide="right"
    >
      <PanelTitle title={TRACE_TABLE_TITLES[props.tracesTableMode]} totalItems={totalItems} />
    </EuiSmallButtonEmpty>
  );

  const renderTableOptions = (option: EuiSelectableOption, searchValue: string) => {
    return (
      <>
        <EuiHighlight search={searchValue}>{TRACE_TABLE_TITLES[option.key]}</EuiHighlight>
        <br />
        <EuiTextColor color="subdued" className="popOverSelectableItem">
          <small>{option['aria-describedby']}</small>
        </EuiTextColor>
      </>
    );
  };

  const renderTitleBar = (totalItems?: number) => {
    return (
      <EuiFlexGroup justifyContent="spaceBetween" gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiPopover
            button={titlePopoverButton(totalItems)}
            isOpen={isTitlePopoverOpen}
            closePopover={() => setIsTitlePopoverOpen(false)}
          >
            <EuiPopoverTitle className="tableModePopover">
              Select trace table filter
            </EuiPopoverTitle>
            <EuiSelectable
              singleSelection="always"
              aria-label="Searchable trace mode"
              searchable
              searchProps={{
                'data-test-subj': 'traceTableMode',
              }}
              renderOption={renderTableOptions}
              listProps={{ rowHeight: 80 }}
              options={tableOptions}
              onChange={(newOptions) => {
                setTableOptions(newOptions);
                const tableMode = newOptions.filter((option) => option.checked === 'on')[0]
                  .key as TraceQueryMode;
                props.setTracesTableMode(tableMode);
                sessionStorage.setItem(TRACE_TABLE_TYPE_KEY, tableMode);
                setIsTitlePopoverOpen(false);
              }}
            >
              {(list, search) => (
                <Fragment>
                  {search}
                  {list}
                </Fragment>
              )}
            </EuiSelectable>
          </EuiPopover>
        </EuiFlexItem>
        {props.tracesTableMode !== 'traces' && (
          <EuiFlexItem grow={false}>
            <EuiSmallButtonEmpty onClick={() => setShowAttributes(!showAttributes)}>
              {showAttributes ? 'Hide Attributes' : 'Show Attributes'}
            </EuiSmallButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );
  };

  const columns = useMemo(() => {
    return getTableColumns(
      showAttributes,
      columnItems,
      mode,
      props.tracesTableMode,
      getTraceViewUri,
      openTraceFlyout
    );
  }, [
    showAttributes,
    columnItems,
    mode,
    props.tracesTableMode,
    getTraceViewUri,
    openTraceFlyout,
    items,
  ]);

  const titleBar = useMemo(() => renderTitleBar(items?.length), [
    showAttributes,
    items,
    isTitlePopoverOpen,
  ]);

  const [sorting, setSorting] = useState<{ sort: PropertySort }>({
    sort: {
      field: 'trace_id',
      direction: 'asc',
    },
  });

  const onTableChange = async ({ sort }: CriteriaWithPagination<unknown>) => {
    if (typeof sort?.field !== 'string') return;

    // maps table column key to DSL aggregation name
    const fieldMappings = {
      trace_id: '_key',
      trace_group: null,
      latency: 'latency',
      percentile_in_trace_group: null,
      error_count: 'error_count',
      last_updated: 'last_updated',
    };
    const field = fieldMappings[sort.field as keyof typeof fieldMappings];
    if (!field || items?.length < TRACES_MAX_NUM) {
      setSorting({ sort });
      return;
    }

    // using await when sorting the default sorted field leads to a bug in UI,
    // user needs to click one time more to change sort back to ascending
    if (sort.field === 'trace_id') {
      refresh({ ...sort, field });
      setSorting({ sort });
      return;
    }

    await refresh({ ...sort, field });
    setSorting({ sort });
  };

  return (
    <>
      <EuiPanel>
        {titleBar}
        <EuiSpacer size="m" />
        <EuiHorizontalRule margin="none" />
        {!(
          mode === 'custom_data_prepper' ||
          (mode === 'data_prepper' && props.dataPrepperIndicesExist) ||
          (mode === 'jaeger' && props.jaegerIndicesExist)
        ) ? (
          <MissingConfigurationMessage mode={mode} />
        ) : items?.length > 0 || loading ? (
          <EuiInMemoryTable
            className="traces-scrollable-table"
            tableLayout="auto"
            allowNeutralSort={true}
            items={items}
            columns={columns}
            pagination={{
              initialPageSize: 10,
              pageSizeOptions: [5, 10, 15],
            }}
            sorting={sorting}
            onTableChange={onTableChange}
            loading={loading}
          />
        ) : (
          <NoMatchMessage size="xl" />
        )}
      </EuiPanel>
    </>
  );
}
