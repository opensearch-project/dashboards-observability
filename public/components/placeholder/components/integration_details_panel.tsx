import {
  EuiButton,
  EuiFlexGroup,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiFlexItem,
  EuiText,
  EuiPageContentHeaderSection,
} from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../../../public/components/trace_analytics/components/common/helper_functions';

export function IntegrationDetails(props: { appId }) {
  return (
    <EuiPanel>
      <PanelTitle title={props.appId + ' DETAILS'} />
    </EuiPanel>
  );
}
