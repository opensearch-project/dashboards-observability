/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';

export function IntegrationDetails(props: any) {
  const config = props.integration;
  let screenshots;
  if (config.statics.gallery) {
    screenshots = config.statics.gallery;
  }

  return (
    <EuiPanel data-test-subj={`${config.name}-details`}>
      <PanelTitle title={'Details'} />
      <EuiSpacer />
      <EuiText>{config.description}</EuiText>
    </EuiPanel>
  );
}
