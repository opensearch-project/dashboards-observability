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
  EuiSmallButton,
  EuiSpacer,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { coreRefs } from '../../../../framework/core_refs';
import { Plt } from '../../../visualizations/plotly/plot';
import { PanelTitle, parseIsoToNano } from '../common/helper_functions';
import { SpanDetailFlyout } from './span_detail_flyout';
import { SpanDetailTable, SpanDetailTableHierarchy } from './span_detail_table';
import { hitsToSpanDetailData } from '../../requests/traces_request_handler';

export function SpanDetailPanel(props: {
  http: HttpSetup;
  traceId: string;
  colorMap: any;
  mode: TraceAnalyticsMode;
  dataSourceMDSId: string;
  dataSourceMDSLabel: string | undefined;
  page?: string;
  openSpanFlyout?: any;
  data?: { gantt: any[]; table: any[]; ganttMaxX: number };
  setGanttData?: (data: { gantt: any[]; table: any[]; ganttMaxX: number }) => void;
  isApplicationFlyout?: boolean;
  payloadData: string;
  isGanttChartLoading?: boolean;
  setGanttChartLoading?: (loading: boolean) => void;
}) {
  const { chrome } = coreRefs;
  const { mode } = props;
  const storedFilters = sessionStorage.getItem('TraceAnalyticsSpanFilters');
  const fromApp = props.page === 'app';
  const [spanFilters, setSpanFilters] = useState<Array<{ field: string; value: any }>>(
    storedFilters ? JSON.parse(storedFilters) : []
  );
  const [DSL, _setDSL] = useState<any>({});
  let data: { gantt: any[]; table: any[]; ganttMaxX: number };
  let setData: (data: { gantt: any[]; table: any[]; ganttMaxX: number }) => void;
  const [localData, localSetData] = useState<{ gantt: any[]; table: any[]; ganttMaxX: number }>({
    gantt: [],
    table: [],
    ganttMaxX: 0,
  });
  if (props.data && props.setGanttData) {
    [data, setData] = [props.data, props.setGanttData];
  } else {
    [data, setData] = [localData, localSetData];
  }
  const fullRange = [0, data.ganttMaxX * 1.1];
  const [selectedRange, setSelectedRange] = useState(fullRange);
  const isLocked = useObservable(chrome!.getIsNavDrawerLocked$() ?? false);
  const [isFullScreen, setIsFullScreen] = useState(false);
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

  const handleFullScreenChange = () => {
    const isFullscreenActive = !!document.fullscreenElement;
    setIsFullScreen(isFullscreenActive);
    updateAvailableWidth();
  };

  useEffect(() => {
    // Add event listeners for window resize and full-screen toggling
    window.addEventListener('resize', updateAvailableWidth);
    document.addEventListener('fullscreenchange', handleFullScreenChange);

    // Initial update
    updateAvailableWidth();

    return () => {
      // Clean up event listeners
      window.removeEventListener('resize', updateAvailableWidth);
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, []);

  const dynamicLayoutAdjustment = useMemo(() => {
    const adjustment = newNavigation ? 350 : 400; // allows resizing of the window
    const leftNavAdjustment = newNavigation ? 125 : 75;
    return isLocked ? availableWidth - adjustment : availableWidth - leftNavAdjustment;
  }, [isLocked, availableWidth]);

  // Update selectedRange whenever data.ganttMaxX changes to ensure it starts fully zoomed out
  useEffect(() => {
    setSelectedRange(fullRange);
  }, [data.ganttMaxX]);

  const setSpanFiltersWithStorage = (newFilters: Array<{ field: string; value: any }>) => {
    setSpanFilters(newFilters);
    sessionStorage.setItem('TraceAnalyticsSpanFilters', JSON.stringify(newFilters));
  };

  const addSpanFilter = (field: string, value: any) => {
    const newFilters = [...spanFilters];
    const index = newFilters.findIndex(({ field: filterField }) => field === filterField);
    if (index === -1) {
      newFilters.push({ field, value });
    } else {
      newFilters.splice(index, 1, { field, value });
    }
    setSpanFiltersWithStorage(newFilters);
  };

  const removeSpanFilter = (field: string) => {
    const newFilters = [...spanFilters];
    const index = newFilters.findIndex(({ field: filterField }) => field === filterField);
    if (index !== -1) {
      newFilters.splice(index, 1);
      setSpanFiltersWithStorage(newFilters);
    }
  };

  const parseAndFilterHits = (
    payloadData: string,
    traceMode: string,
    payloadSpanFilters: any[]
  ) => {
    try {
      const parsed = JSON.parse(payloadData);
      let hits: any[] = [];
      if (parsed.hits && Array.isArray(parsed.hits.hits)) {
        hits = parsed.hits.hits;
      } else if (Array.isArray(parsed)) {
        hits = parsed;
      } else {
        console.warn('Unexpected payload format:', parsed);
        return [];
      }

      hits = hits.map((hit) => {
        if (traceMode === 'jaeger') {
          if (!hit.sort || !hit.sort[0]) {
            return {
              ...hit,
              sort: [Number(hit._source.startTime) * 1000], // Jaeger: startTime is in microseconds
            };
          }
        } else {
          if (!hit.sort || !hit.sort[0]) {
            return {
              ...hit,
              sort: [parseIsoToNano(hit._source.startTime)],
            };
          }
        }
        return hit;
      });

      hits.sort((a, b) => b.sort[0] - a.sort[0]);

      if (payloadSpanFilters.length > 0) {
        hits = hits.filter((hit) => {
          return payloadSpanFilters.every(({ field, value }) => {
            let fieldVal;
            if (traceMode === 'jaeger' && field.startsWith('process.')) {
              fieldVal = hit._source?.process?.[field.split('.')[1]];
            } else {
              fieldVal = hit._source?.[field];
            }
            return fieldVal === value;
          });
        });
      }

      hits = hits.filter((hit) => {
        if (traceMode === 'jaeger') {
          return Boolean(hit._source?.process?.serviceName);
        } else {
          return Boolean(hit._source?.serviceName);
        }
      });

      return hits;
    } catch (error) {
      console.error('Error processing payloadData in parseAndFilterHits:', error);
      return [];
    }
  };

  useEffect(() => {
    if (!props.payloadData) {
      console.warn('No payloadData provided to SpanDetailPanel');
      return;
    }

    const hits = parseAndFilterHits(props.payloadData, mode, spanFilters);

    if (hits.length === 0) {
      return;
    }

    hitsToSpanDetailData(hits, props.colorMap, mode)
      .then((transformedData) => {
        setData(transformedData);
      })
      .catch((error) => {
        console.error('Error in hitsToSpanDetailData:', error);
      })
      .finally(() => {
        if (props.setGanttChartLoading) {
          props.setGanttChartLoading(false);
        }
      });
  }, [props.payloadData, props.colorMap, mode, spanFilters]);

  const getSpanDetailLayout = (
    plotTraces: Plotly.Data[],
    _maxX: number
  ): Partial<Plotly.Layout> => {
    const dynamicWidthAdjustment = !isLocked
      ? 200
      : newNavigation
      ? 390 // If locked and new navigation
      : 410; // If locked and new navigation is disabled
    // get unique labels from traces
    const yLabels = plotTraces
      .map((d) => d.y[0])
      .filter((label, i, self) => self.indexOf(label) === i);
    // remove uuid when displaying y-ticks
    const yTexts = yLabels.map((label) => label.substring(0, label.length - 36));

    // Calculate the maximum label length dynamically
    const maxLabelLength = Math.max(...yTexts.map((text) => text.length));

    // Dynamically set left margin based on the longest label
    let dynamicLeftMargin = Math.max(150, maxLabelLength * 5);
    dynamicLeftMargin = Math.min(dynamicLeftMargin, 500);

    return {
      plot_bgcolor: 'rgba(0, 0, 0, 0)',
      paper_bgcolor: 'rgba(0, 0, 0, 0)',
      height: 25 * plotTraces.length + 60,
      width: props.isApplicationFlyout
        ? availableWidth / 2 - 100 // Allow gantt chart to fit in flyout
        : availableWidth - dynamicWidthAdjustment, // Allow gantt chart to render full screen
      margin: {
        l: dynamicLeftMargin,
        r: 5,
        b: 30,
        t: 30,
      },
      xaxis: {
        ticksuffix: ' ms',
        side: 'top',
        color: '#91989c',
        showline: true,
        range: selectedRange, // Apply selected range to main chart
      },
      yaxis: {
        showgrid: false,
        tickvals: yLabels,
        ticktext: yTexts,
        fixedrange: true, // Prevent panning/scrolling in main chart
      },
    };
  };

  const layout = useMemo(() => getSpanDetailLayout(data.gantt, data.ganttMaxX), [
    data.gantt,
    data.ganttMaxX,
    selectedRange,
    availableWidth,
    isLocked,
    isFullScreen,
  ]);
  const miniMapLayout = {
    ...layout,
    height: 100,
    dragmode: 'select', // Allow users to define their zoom range
    xaxis: { ...layout.xaxis, range: fullRange },
    yaxis: { visible: false, fixedrange: true },
    shapes: [
      {
        type: 'rect',
        xref: 'x',
        yref: 'paper',
        x0: selectedRange[0],
        x1: selectedRange[1],
        y0: 0,
        y1: 1,
        fillcolor: 'rgba(128, 128, 128, 0.3)', // Highlight the selection area
        line: {
          width: 1,
          color: 'rgba(255, 0, 0, 0.6)', // Border of the selection
        },
        editable: true,
      },
    ],
  };

  const miniMap = useMemo(
    () => (
      <Plt
        data={data.gantt.map((trace) => ({
          ...trace,
        }))}
        layout={miniMapLayout}
        onSelectedHandler={(event) => {
          if (event && event.range) {
            const { x } = event.range;
            setSelectedRange(x); // Update selected range to reflect user-defined zoom
          }
        }}
        onRelayout={(event) => {
          if (event && event['shapes[0].x0'] && event['shapes[0].x1']) {
            // Update selected range when the shape (rectangle) is moved
            setSelectedRange([event['shapes[0].x0'], event['shapes[0].x1']]);
          }
        }}
      />
    ),
    [data.gantt, miniMapLayout, setSelectedRange]
  );

  const [currentSpan, setCurrentSpan] = useState('');

  const onClick = useCallback(
    (event: any) => {
      if (!event?.points) return;
      const point = event.points[0];
      if (fromApp) {
        props.openSpanFlyout(point.data.spanId);
      } else {
        setCurrentSpan(point.data.spanId);
      }
    },
    [props.openSpanFlyout, setCurrentSpan, fromApp]
  );

  const renderFilters = useMemo(() => {
    return spanFilters.map(({ field, value }) => (
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
  }, [spanFilters]);

  const onHover = useCallback(() => {
    const dragLayer = document.getElementsByClassName('nsewdrag')?.[0];
    dragLayer.style.cursor = 'pointer';
  }, []);

  const onUnhover = useCallback(() => {
    const dragLayer = document.getElementsByClassName('nsewdrag')?.[0];
    dragLayer.style.cursor = '';
  }, []);

  const onRelayoutHandler = useCallback(
    (event) => {
      // Handle x-axis range update
      if (event && event['xaxis.range[0]'] && event['xaxis.range[1]']) {
        const newRange = [event['xaxis.range[0]'], event['xaxis.range[1]']];
        setSelectedRange(newRange);
      } else {
        setSelectedRange(fullRange);
      }
    },
    [setSelectedRange, fullRange]
  );

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
          DSL={DSL}
          mode={mode}
          openFlyout={(spanId: string) => {
            if (fromApp) {
              props.openSpanFlyout(spanId);
            } else {
              setCurrentSpan(spanId);
            }
          }}
          dataSourceMDSId={props.dataSourceMDSId}
          availableWidth={dynamicLayoutAdjustment}
          payloadData={props.payloadData}
          filters={spanFilters}
        />
      </div>
    ),
    [DSL, setCurrentSpan, dynamicLayoutAdjustment, props.payloadData, spanFilters]
  );

  const spanDetailTableHierarchy = useMemo(
    () => (
      <div style={{ width: 'auto' }}>
        <SpanDetailTableHierarchy
          http={props.http}
          hiddenColumns={mode === 'jaeger' ? ['traceID', 'traceGroup'] : ['traceId', 'traceGroup']}
          DSL={DSL}
          mode={mode}
          openFlyout={(spanId: string) => {
            if (fromApp) {
              props.openSpanFlyout(spanId);
            } else {
              setCurrentSpan(spanId);
            }
          }}
          dataSourceMDSId={props.dataSourceMDSId}
          availableWidth={dynamicLayoutAdjustment}
          payloadData={props.payloadData}
          filters={spanFilters}
        />
      </div>
    ),
    [DSL, setCurrentSpan, dynamicLayoutAdjustment, props.payloadData, spanFilters]
  );

  const ganttChart = useMemo(
    () => (
      <Plt
        data={data.gantt.map((trace) => {
          const duration = trace.x[0] ? trace.x[0].toFixed(2) : '0.00'; // Format duration to 2 decimal places

          return {
            ...trace,
            text: `${duration} ms`,
            textposition: 'outside',
            hoverinfo: 'none',
          };
        })}
        layout={layout}
        onClickHandler={onClick}
        onHoverHandler={onHover}
        onUnhoverHandler={onUnhover}
        onRelayout={onRelayoutHandler}
      />
    ),
    [data.gantt, layout, onClick, onHover, onUnhover, setSelectedRange]
  );

  return (
    <>
      <EuiPanel data-test-subj="span-gantt-chart-panel">
        <EuiFlexGroup direction="column" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup>
              <EuiFlexItem>
                <PanelTitle title="Spans" totalItems={data.gantt.length / 2} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s">
                  {toggleIdSelected === 'timeline' && (
                    <EuiFlexItem grow={false}>
                      <EuiSmallButton
                        onClick={() => setSelectedRange(fullRange)}
                        isDisabled={
                          selectedRange[0] === fullRange[0] && selectedRange[1] === fullRange[1]
                        }
                      >
                        Reset zoom
                      </EuiSmallButton>
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      isDisabled={props.isGanttChartLoading}
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
          {props.isGanttChartLoading ? (
            <div className="center-loading-div">
              <EuiLoadingChart size="l" />
            </div>
          ) : (
            <>
              {spanFilters.length > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiSpacer size="s" />
                  <EuiFlexGroup gutterSize="s" wrap>
                    {renderFilters}
                  </EuiFlexGroup>
                </EuiFlexItem>
              )}

              <EuiHorizontalRule margin="m" />

              {toggleIdSelected === 'timeline' && <EuiFlexItem grow={false}>{miniMap}</EuiFlexItem>}

              <EuiFlexItem style={{ overflowY: 'auto', maxHeight: 500 }}>
                {toggleIdSelected === 'timeline'
                  ? ganttChart
                  : toggleIdSelected === 'span_list'
                  ? spanDetailTable
                  : spanDetailTableHierarchy}
              </EuiFlexItem>
            </>
          )}
        </EuiFlexGroup>
      </EuiPanel>
      {!!currentSpan && (
        <SpanDetailFlyout
          http={props.http}
          spanId={currentSpan}
          isFlyoutVisible={!!currentSpan}
          closeFlyout={() => setCurrentSpan('')}
          addSpanFilter={addSpanFilter}
          mode={mode}
          dataSourceMDSId={props.dataSourceMDSId}
          dataSourceMDSLabel={props.dataSourceMDSLabel}
        />
      )}
    </>
  );
}
