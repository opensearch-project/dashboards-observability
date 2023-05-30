/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiPanel, EuiSpacer, EuiFlexItem, EuiText } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';

export function IntegrationDetails(props: any) {
  let screenshots;
  if (props.data.data.statics.mapping.gallery) {
    screenshots = props.data.data.data.statics.gallery;
  }

  return (
    <EuiPanel>
      <PanelTitle title={props.data.data.name + ' Details'} />
      <EuiSpacer />
      <EuiText>{props.data.data.description}</EuiText>
      <EuiSpacer />
      <PanelTitle title={'Dashboards'} />
      <EuiFlexGroup gutterSize="l">
        {screenshots?.map((i, v) => {
          return (
            <EuiFlexItem key={v}>
              <img style={{ width: 100, height: 100 }} alt="" className="synopsisIcon" src={i} />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPanel>
  );
}
