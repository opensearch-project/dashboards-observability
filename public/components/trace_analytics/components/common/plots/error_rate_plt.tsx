/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonGroup,
  EuiButtonGroupOptionProps,
  EuiFlexGroup,
  EuiHorizontalRule,
  EuiPanel,
} from '@elastic/eui';
import moment from 'moment';
import React, { useMemo } from 'react';
import { Plt } from '../../../../visualizations/plotly/plot';
import {
  fixedIntervalToMilli,
  fixedIntervalToTickFormat,
  NoMatchMessage,
  PanelTitle,
} from '../helper_functions';

export function ErrorTrendPlt(props: {
  items: { items: Plotly.Data[]; fixedInterval: string };
  onClick: (event: any) => void;
  isPanel: boolean;
}) {
  const getLayout = () =>
    ({
      plot_bgcolor: 'rgba(0, 0, 0, 0)',
      paper_bgcolor: 'rgba(0, 0, 0, 0)',
      margin: {
        l: 57,
        r: 5,
        b: 50,
        t: 30,
        pad: 4,
      },
      annotations: props.items.items.length > 0 && [
        {
          x: props.items.items[0]?.x[props.items.items[0]?.x.length - 1],
          y: 0,
          showarrow: true,
          arrowhead: 0,
          xref: 'x',
          yref: 'y',
          text: `Now: ${props.items.items[0]?.y[props.items.items[0]?.y.length - 1]}%`,
          ax: 0,
          ay: -140,
          borderpad: 10,
          arrowwidth: 0.7,
          font: {
            color: '#899195',
          },
        },
      ],
      showlegend: false,
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
          text: 'Error rate (%)',
          font: {
            size: 12,
          },
          standoff: 10,
        },
        range: [
          0,
          Math.min(100, Math.max(...(props.items.items[0]?.y.map((y) => y * 1.2) || []), 1)),
        ],
        fixedrange: true,
        ticksuffix: '%',
        gridcolor: 'rgba(217, 217, 217, 0.2)',
        showgrid: true,
        visible: true,
        color: '#899195',
      },
      ...(!props.isPanel ? { height: 200 } : { height: 217 }),
      ...(!props.isPanel && { width: 400 }),
    } as Partial<Plotly.Layout>);

  const layout = useMemo(() => getLayout(), [props.items]);

  return (
    <>
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

export function ErrorRatePlt(props: {
  title?: string;
  items: { items: Plotly.Data[]; fixedInterval: string };
  setStartTime: (startTime: string) => void;
  setEndTime: (endTime: string) => void;
  setIdSelected: (mode: string) => void;
  idSelected: string;
  toggleButtons: EuiButtonGroupOptionProps[];
}) {
  const onClick = (event: any) => {
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
          <PanelTitle title={props.title ? props.title : 'Trace error rate over time'} />
          <EuiButtonGroup
            options={props.toggleButtons}
            idSelected={props.idSelected}
            onChange={(id) => props.setIdSelected(id as 'error_rate' | 'throughput')}
            buttonSize="s"
            color="text"
          />
        </EuiFlexGroup>
        <EuiHorizontalRule margin="m" />
        <ErrorTrendPlt items={props.items} onClick={onClick} isPanel={true} />
      </EuiPanel>
    </>
  );
}
