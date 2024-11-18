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
  EuiPanel,
  EuiSmallButton,
  EuiSpacer,
} from '@elastic/eui';
import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { Plt } from '../../../visualizations/plotly/plot';
import { handleSpansGanttRequest } from '../../requests/traces_request_handler';
import { PanelTitle } from '../common/helper_functions';
import { SpanDetailFlyout } from './span_detail_flyout';
import { SpanDetailTable } from './span_detail_table';

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
  setData?: (data: { gantt: any[]; table: any[]; ganttMaxX: number }) => void;
}) {
  const { mode } = props;
  const storedFilters = sessionStorage.getItem('TraceAnalyticsSpanFilters');
  const fromApp = props.page === 'app';
  const [spanFilters, setSpanFilters] = useState<Array<{ field: string; value: any }>>(
    storedFilters ? JSON.parse(storedFilters) : []
  );
  const [DSL, setDSL] = useState<any>({});
  let data: { gantt: any[]; table: any[]; ganttMaxX: number };
  let setData: (data: { gantt: any[]; table: any[]; ganttMaxX: number }) => void;
  const [localData, localSetData] = useState<{ gantt: any[]; table: any[]; ganttMaxX: number }>({
    gantt: [],
    table: [],
    ganttMaxX: 0,
  });
  if (props.data && props.setData) {
    [data, setData] = [props.data, props.setData];
  } else {
    [data, setData] = [localData, localSetData];
  }

  const fullRange = [0, data.ganttMaxX * 1.2];
  const [selectedRange, setSelectedRange] = useState(fullRange);

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

  const refresh = debounce(() => {
    if (isEmpty(props.colorMap)) return;
    const refreshDSL = spanFiltersToDSL();
    setDSL(refreshDSL);
    handleSpansGanttRequest(
      props.traceId,
      props.http,
      setData,
      props.colorMap,
      refreshDSL,
      mode,
      props.dataSourceMDSId
    );
  }, 150);

  const spanFiltersToDSL = () => {
    const spanDSL: any =
      mode === 'jaeger'
        ? {
            query: {
              bool: {
                must: [
                  {
                    term: {
                      traceID: props.traceId,
                    },
                  },
                ],
                filter: [],
                should: [],
                must_not: [],
              },
            },
          }
        : {
            query: {
              bool: {
                must: [
                  {
                    term: {
                      traceId: props.traceId,
                    },
                  },
                ],
                filter: [],
                should: [],
                must_not: [],
              },
            },
          };
    spanFilters.map(({ field, value }) => {
      if (value != null) {
        spanDSL.query.bool.filter.push({
          term: {
            [field]: value,
          },
        });
      }
    });
    return spanDSL;
  };

  useEffect(() => {
    refresh();
  }, [props.colorMap, spanFilters]);

  const getSpanDetailLayout = (
    plotTraces: Plotly.Data[],
    _maxX: number
  ): Partial<Plotly.Layout> => {
    // get unique labels from traces
    const yLabels = plotTraces
      .map((d) => d.y[0])
      .filter((label, i, self) => self.indexOf(label) === i);
    // remove uuid when displaying y-ticks
    const yTexts = yLabels.map((label) => label.substring(0, label.length - 36));

    return {
      plot_bgcolor: 'rgba(0, 0, 0, 0)',
      paper_bgcolor: 'rgba(0, 0, 0, 0)',
      height: 25 * plotTraces.length + 60,
      width: 800,
      margin: {
        l: 260,
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
  ]);

  const miniMapLayout = {
    ...layout,
    height: 100,
    dragmode: 'select',
    xaxis: { ...layout.xaxis, range: fullRange },
    yaxis: { visible: false, fixedrange: true },
  };

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

  const toggleOptions = [
    {
      id: 'timeline',
      label: 'Timeline',
    },
    {
      id: 'span_list',
      label: 'Span list',
    },
  ];
  const [toggleIdSelected, setToggleIdSelected] = useState(toggleOptions[0].id);

  const spanDetailTable = useMemo(
    () => (
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
      />
    ),
    [DSL, setCurrentSpan]
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
      />
    ),
    [data.gantt, layout, onClick, onHover, onUnhover]
  );

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
            setSelectedRange(x); // Update selected range state to adjust main chart
          }
        }}
      />
    ),
    [data.gantt, miniMapLayout]
  );

  return (
    <>
      <EuiPanel data-test-subj="span-gantt-chart-panel">
        <EuiFlexGroup direction="column" gutterSize="m">
          <EuiFlexItem grow={false}>
            {miniMap}
            <EuiFlexGroup justifyContent="center" gutterSize="none">
              <EuiFlexItem grow={false}>
                <EuiSmallButton onClick={() => setSelectedRange(fullRange)}>
                  Reset Zoom
                </EuiSmallButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup>
              <EuiFlexItem>
                <PanelTitle title="Spans" totalItems={data.gantt.length / 2} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend="Select view of spans"
                  options={toggleOptions}
                  idSelected={toggleIdSelected}
                  onChange={(id) => setToggleIdSelected(id)}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          {spanFilters.length > 0 && (
            <EuiFlexItem grow={false}>
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="s" wrap>
                {renderFilters}
              </EuiFlexGroup>
            </EuiFlexItem>
          )}

          <EuiHorizontalRule margin="m" />

          <EuiFlexItem style={{ overflowY: 'auto', maxHeight: 500 }}>
            {toggleIdSelected === 'timeline' ? ganttChart : spanDetailTable}
          </EuiFlexItem>
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
