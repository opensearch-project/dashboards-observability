import { EuiPanel } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../../../public/components/trace_analytics/components/common/helper_functions';

export function IntegrationAssets(props: any) {
  return (
    <EuiPanel>
      <PanelTitle title={props.data.data.templateName + ' Assets'} />
    </EuiPanel>
  );
}
