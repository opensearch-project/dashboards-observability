/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiHorizontalRule, EuiPanel } from '@elastic/eui';
import round from 'lodash/round';
import React, { useMemo } from 'react';
import { Plt } from '../../../../visualizations/plotly/plot';
import { NoMatchMessage, PanelTitle } from '../helper_functions';

export function LinePlt(props: { data: Plotly.Data[] }) {
  const maxY = props.data[0]?.y ? Math.max(...props.data[0].y) : 0;
  const layout = useMemo(
    () => ({
      plot_bgcolor: 'rgba(0, 0, 0, 0)',
      paper_bgcolor: 'rgba(0, 0, 0, 0)',
      xaxis: {
        fixedrange: true,
        showgrid: false,
        visible: false,
      },
      yaxis: {
        fixedrange: true,
        showgrid: false,
        visible: false,
        range: [0, maxY * 1.1],
      },
      margin: {
        l: 0,
        r: 0,
        b: 0,
        t: 0,
        pad: 0,
      },
      height: 20,
      width: 60,
    }),
    [props.data]
  );
  return props.data[0].x.length > 1 ? <Plt data={props.data} layout={layout} /> : <div>-</div>;
}

export function LatencyPlt(props: { data: Plotly.Data[]; isPanel?: boolean }) {
  const layout = useMemo(
    () =>
      ({
        plot_bgcolor: 'rgba(0, 0, 0, 0)',
        paper_bgcolor: 'rgba(0, 0, 0, 0)',
        xaxis: {
          showgrid: false,
          type: 'date',
          tickmode: 'auto',
          color: '#899195',
        },
        yaxis: {
          title: {
            text: 'Hourly latency (ms)',
            font: {
              size: 12,
            },
          },
          gridcolor: 'rgba(217, 217, 217, 0.2)',
          color: '#899195',
        },
        annotations: [
          {
            x: props.data[0].x[props.data[0].x.length - 1],
            y: 0,
            showarrow: true,
            arrowhead: 0,
            xref: 'x',
            yref: 'y',
            text: `Now: ${round(props.data[0].y[props.data[0].y.length - 1] as number, 2)}ms`,
            ax: 0,
            ay: -140,
            borderpad: 10,
            arrowwidth: 0.7,
            font: {
              color: '#899195',
            },
          },
        ],
        margin: {
          l: 50,
          r: 30,
          b: 50,
          t: 30,
          pad: 0,
        },
        ...(!props.isPanel ? { height: 200 } : { height: 217 }),
        ...(!props.isPanel && { width: 400 }),
      } as Partial<Plotly.Layout>),
    [props.data]
  );
  return (
    <>
      <Plt data={props.data} layout={layout} height={props.isPanel ? '217' : '200'} />
    </>
  );
}

export function LatencyPltPanel(props: { data: Plotly.Data[]; isPanel?: boolean }) {
  return (
    <EuiPanel style={{ minWidth: 433, minHeight: 308, maxHeight: 560 }}>
      <EuiFlexGroup justifyContent="spaceBetween" gutterSize="xs">
        <PanelTitle title="24hr latency trend" />
      </EuiFlexGroup>
      <EuiHorizontalRule margin="m" />
      {props.data ? <LatencyPlt data={[props.data]} isPanel={true} /> : <NoMatchMessage size="s" />}
    </EuiPanel>
  );
}
