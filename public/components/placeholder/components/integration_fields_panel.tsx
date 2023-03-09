import { EuiPanel } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../../../public/components/trace_analytics/components/common/helper_functions';

export function IntegrationFields(props: { appId }) {
  return (
    <EuiPanel>
      <PanelTitle title={props.appId} />
    </EuiPanel>
  );
}
