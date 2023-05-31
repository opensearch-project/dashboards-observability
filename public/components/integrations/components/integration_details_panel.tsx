/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';

export function IntegrationDetails(props: any) {
  let screenshots;
  if (props.data.data.statics.gallery) {
    screenshots = props.data.data.statics.gallery;
  }

  return (
    <EuiPanel>
      <PanelTitle title={props.data.data.name + ' Details'} />
      <EuiSpacer />
      <EuiText>{props.data.data.description}</EuiText>
    </EuiPanel>
  );
}
