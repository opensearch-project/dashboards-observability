/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiBadge,
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLoadingChart,
  EuiPanel,
  EuiSpacer,
} from '@elastic/eui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { coreRefs } from '../../../../framework/core_refs';
import { TraceFilter } from '../common/constants';
import { PanelTitle, parseHits } from '../common/helper_functions';
import { SpanDetailTable, SpanDetailTableHierarchy } from './span_detail_table';

export function SpanDetailPanel(props: {
  http: HttpSetup;
  traceId: string;
  colorMap: Record<string, string>;
  mode: TraceAnalyticsMode;
  dataSourceMDSId: string;
  dataSourceMDSLabel?: string;
  spanFilters: TraceFilter[];
  setSpanFiltersWithStorage: (newFilters: TraceFilter[]) => void;
  onSpanClick: (spanId: string) => void;
  payloadData: string;
  isLoading?: boolean;
}) {
  const { chrome } = coreRefs;
  const { mode } = props;

  const isLocked = useObservable(chrome!.getIsNavDrawerLocked$() ?? false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState<number>(window.innerWidth);
  const newNavigation = coreRefs?.chrome?.navGroup.getNavGroupEnabled?.();

  const updateAvailableWidth = () => {
    if (containerRef.current) {
      setAvailableWidth(containerRef.current.getBoundingClientRect().width);
    } else {
      setAvailableWidth(window.innerWidth);
    }
  };

  useEffect(() => {
    // Add event listeners for window resize and full-screen toggling
    window.addEventListener('resize', updateAvailableWidth);
    document.addEventListener('fullscreenchange', updateAvailableWidth);

    // Initial update
    updateAvailableWidth();

    return () => {
      // Clean up event listeners
      window.removeEventListener('resize', updateAvailableWidth);
      document.removeEventListener('fullscreenchange', updateAvailableWidth);
    };
  }, []);

  const dynamicLayoutAdjustment = useMemo(() => {
    const adjustment = newNavigation ? 350 : 400; // allows resizing of the window
    const leftNavAdjustment = newNavigation ? 125 : 75;
    return isLocked ? availableWidth - adjustment : availableWidth - leftNavAdjustment;
  }, [isLocked, availableWidth]);

  const removeSpanFilter = (field: string) => {
    const newFilters = [...props.spanFilters];
    const index = newFilters.findIndex(({ field: filterField }) => field === filterField);
    if (index !== -1) {
      newFilters.splice(index, 1);
      props.setSpanFiltersWithStorage(newFilters);
    }
  };

  useEffect(() => {
    if (!props.payloadData) {
      return;
    }

    const hits = parseHits(props.payloadData);

    if (hits.length === 0) {
      return;
    }
  }, [props.payloadData, props.colorMap, mode, props.spanFilters]);

  const renderFilters = useMemo(() => {
    return props.spanFilters.map(({ field, value }) => (
      <EuiFlexItem grow={false} key={`span-filter-badge-${field}`}>
        <EuiBadge
          iconType="cross"
          iconSide="right"
          iconOnClick={() => removeSpanFilter(field)}
          iconOnClickAriaLabel="remove current filter"
        >
          {`${field}: ${value}`}
        </EuiBadge>
      </EuiFlexItem>
    ));
  }, [props.spanFilters]);

  const toggleOptions = [
    {
      id: 'timeline',
      label: 'Timeline',
    },
    {
      id: 'span_list',
      label: 'Span list',
    },
    {
      id: 'hierarchy_span_list',
      label: 'Tree view',
    },
  ];
  const [toggleIdSelected, setToggleIdSelected] = useState(toggleOptions[0].id);

  const spanDetailTable = useMemo(
    () => (
      <div style={{ width: 'auto' }}>
        <SpanDetailTable
          http={props.http}
          hiddenColumns={mode === 'jaeger' ? ['traceID', 'traceGroup'] : ['traceId', 'traceGroup']}
          mode={mode}
          openFlyout={(spanId: string) => {
            props.onSpanClick(spanId);
          }}
          dataSourceMDSId={props.dataSourceMDSId}
          availableWidth={dynamicLayoutAdjustment}
          payloadData={props.payloadData}
          filters={props.spanFilters}
        />
      </div>
    ),
    [dynamicLayoutAdjustment, props.payloadData, props.spanFilters]
  );

  const spanDetailTableHierarchy = useMemo(
    () => (
      <div style={{ width: 'auto' }}>
        <SpanDetailTableHierarchy
          http={props.http}
          hiddenColumns={mode === 'jaeger' ? ['traceID', 'traceGroup'] : ['traceId', 'traceGroup']}
          mode={mode}
          openFlyout={(spanId: string) => {
            props.onSpanClick(spanId);
          }}
          dataSourceMDSId={props.dataSourceMDSId}
          availableWidth={dynamicLayoutAdjustment}
          payloadData={props.payloadData}
          filters={props.spanFilters}
        />
      </div>
    ),
    [dynamicLayoutAdjustment, props.payloadData, props.spanFilters]
  );

  return (
    <>
      <EuiPanel data-test-subj="span-gantt-chart-panel">
        <EuiFlexGroup direction="column" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup>
              <EuiFlexItem>
                <PanelTitle title="Spans" totalItems={0} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      isDisabled={props.isLoading}
                      legend="Select view of spans"
                      options={toggleOptions}
                      idSelected={toggleIdSelected}
                      onChange={(id) => setToggleIdSelected(id)}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          {props.isLoading ? (
            <div className="center-loading-div">
              <EuiLoadingChart size="l" />
            </div>
          ) : (
            <>
              {props.spanFilters.length > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiSpacer size="s" />
                  <EuiFlexGroup gutterSize="s" wrap>
                    {renderFilters}
                  </EuiFlexGroup>
                </EuiFlexItem>
              )}

              <EuiHorizontalRule margin="m" />

              <EuiFlexItem style={{ overflowY: 'auto', maxHeight: 500 }}>
                {toggleIdSelected === 'timeline' ? (
                  <div>New Timeline Here</div>
                ) : toggleIdSelected === 'span_list' ? (
                  spanDetailTable
                ) : (
                  spanDetailTableHierarchy
                )}
              </EuiFlexItem>
            </>
          )}
        </EuiFlexGroup>
      </EuiPanel>
    </>
  );
}
