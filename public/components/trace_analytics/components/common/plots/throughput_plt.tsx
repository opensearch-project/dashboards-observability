/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonGroup, EuiFlexGroup, EuiHorizontalRule, EuiPanel } from '@elastic/eui';
import moment from 'moment';
import React, { useMemo } from 'react';
import { Plt } from '../../../../visualizations/plotly/plot';
import {
  fixedIntervalToMilli,
  fixedIntervalToTickFormat,
  NoMatchMessage,
  PanelTitle,
} from '../helper_functions';

export function ThroughputTrendPlt(props: {
  onClick: (event: any) => void;
  items: { items: Plotly.Data[]; fixedInterval: string };
  isPanel: boolean;
}) {
  const layout = useMemo(
    () =>
      ({
        plot_bgcolor: 'rgba(0, 0, 0, 0)',
        paper_bgcolor: 'rgba(0, 0, 0, 0)',
        margin: {
          l: 50,
          r: 5,
          b: 50,
          t: 30,
          pad: 4,
        },
        annotations: props.items.items.length > 0 && [
          {
            x: props.items.items[0].x[props.items.items[0].x.length - 1],
            y: 0,
            showarrow: true,
            arrowhead: 0,
            xref: 'x',
            yref: 'y',
            text: `Now: ${props.items.items[0].y[props.items.items[0].y.length - 1]?.toLocaleString(
              undefined
            )}`,
            ax: 0,
            ay: -140,
            borderpad: 10,
            arrowwidth: 0.7,
            font: {
              color: '#899195',
            },
          },
        ],
        xaxis: {
          fixedrange: true,
          showgrid: false,
          visible: true,
          type: 'date',
          tickformat: fixedIntervalToTickFormat(props.items.fixedInterval),
          color: '#899195',
        },
        yaxis: {
          title: {
            text: 'Throughput (n)',
            font: {
              size: 12,
            },
          },
          fixedrange: true,
          gridcolor: 'rgba(217, 217, 217, 0.2)',
          showgrid: true,
          visible: true,
          color: '#899195',
        },
        ...(!props.isPanel ? { height: 200 } : { height: 217 }),
        ...(!props.isPanel && { width: 400 }),
      } as Partial<Plotly.Layout>),
    [props.items]
  );
  return (
    <>
      {' '}
      {props.items?.items?.length > 0 ? (
        <Plt
          data={props.items.items}
          layout={layout}
          onClickHandler={props.onClick}
          height={props.isPanel ? '217' : '200'}
        />
      ) : (
        <NoMatchMessage size="s" />
      )}
    </>
  );
}

export function ThroughputPlt(props: {
  title?: string;
  items: { items: Plotly.Data[]; fixedInterval: string };
  setStartTime: (startTime: string) => void;
  setEndTime: (endTime: string) => void;
  setIdSelected: (mode: string) => void;
  idSelected: string;
  toggleButtons: any[];
}) {
  const onClick = (event) => {
    if (!event?.points) return;
    const point = event.points[0];
    const start = point.data.x[point.pointNumber];
    const end = start + fixedIntervalToMilli(props.items.fixedInterval);
    props.setStartTime(moment(start).toISOString());
    props.setEndTime(moment(end).toISOString());
    window.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <EuiPanel style={{ minWidth: 433, minHeight: 308, maxHeight: 560 }}>
        <EuiFlexGroup justifyContent="spaceBetween" gutterSize="xs">
          <PanelTitle title={props.title ? props.title : 'Traces over time'} />
          <EuiButtonGroup
            options={props.toggleButtons}
            idSelected={props.idSelected}
            onChange={(id: string) => props.setIdSelected(id as 'error_rate' | 'throughput')}
            buttonSize="s"
            color="text"
          />
        </EuiFlexGroup>
        <EuiHorizontalRule margin="m" />
        <ThroughputTrendPlt items={props.items} onClick={onClick} isPanel={true} />
      </EuiPanel>
    </>
  );
}
