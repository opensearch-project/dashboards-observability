/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import round from 'lodash/round';
import React, { useMemo } from 'react';
import { Plt } from '../../../visualizations/plotly/plot';
import { PanelTitle } from '../common/helper_functions';

interface ServiceBreakdownData {
  labels: string[];
  values: number[];
  marker: {
    colors: string[];
  };
}

export function ServiceBreakdownPanel(props: { data: ServiceBreakdownData[] }) {
  const layout = useMemo(
    () =>
      ({
        plot_bgcolor: 'rgba(0, 0, 0, 0)',
        paper_bgcolor: 'rgba(0, 0, 0, 0)',
        height: 200,
        width: 200,
        showlegend: false,
        margin: {
          l: 5,
          r: 5,
          b: 15,
          t: 15,
        },
      } as Partial<Plotly.Layout>),
    [props.data]
  );

  const renderStats = () => {
    if (props.data.length === 0) return null;

    const { labels, values, marker } = props.data[0];

    return (
      <EuiFlexGroup
        direction="column"
        style={{ maxHeight: 260, overflowY: 'auto', paddingRight: '20px' }}
        gutterSize="s"
        responsive={false}
      >
        {labels.map((label: string, index: number) => (
          <EuiFlexGroup
            key={index}
            alignItems="center"
            justifyContent="spaceBetween"
            gutterSize="m"
            responsive={false}
          >
            <EuiFlexItem grow={false}>
              <EuiHealth color={marker.colors[index]}>{label}</EuiHealth>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s">{round(values[index], 2)}%</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ))}
      </EuiFlexGroup>
    );
  };

  const stats = useMemo(() => renderStats(), [props.data]);

  return (
    <EuiPanel>
      <PanelTitle title="Time spent by service" data-test-subj="time-spent-by-service-panel" />
      <EuiHorizontalRule margin="m" />
      <EuiFlexGroup alignItems="center" gutterSize="m">
        <EuiFlexItem grow={3}>
          {props.data?.length > 0 ? <Plt data={props.data} layout={layout} /> : null}
        </EuiFlexItem>
        <EuiFlexItem grow={3}>{stats}</EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
    </EuiPanel>
  );
}
