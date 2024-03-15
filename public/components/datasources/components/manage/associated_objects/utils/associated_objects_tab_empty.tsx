/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiEmptyPrompt, EuiLink, EuiText } from '@elastic/eui';
import React from 'react';
import { LoadCacheType } from '../../../../../../../common/types/data_connections';
import { coreRefs } from '../../../../../../framework/core_refs';

interface AssociatedObjectsTabEmptyProps {
  cacheType: LoadCacheType;
}

export const AssociatedObjectsTabEmpty: React.FC<AssociatedObjectsTabEmptyProps> = (props) => {
  const { cacheType } = props;
  const { application } = coreRefs;

  const QueryWorkbenchButton = (
    <EuiButton
      iconSide="right"
      onClick={() => application!.navigateToApp('opensearch-query-workbench')}
      iconType="popout"
    >
      Query Workbench
    </EuiButton>
  );

  let titleText;
  let bodyText;
  switch (cacheType) {
    case 'databases':
      titleText = 'You have no databases in your data source';
      bodyText = 'Add databases and tables to your data source or use Query Workbench';
      break;
    case 'tables':
      titleText = 'You have no associated objects';
      bodyText = 'Add tables to your data source or use Query Workbench';
      break;
    default:
      titleText = '';
      bodyText = '';
      break;
  }

  return (
    <EuiEmptyPrompt
      body={
        <>
          <EuiText>
            <h4>{titleText}</h4>
            <p>{bodyText}</p>
          </EuiText>
          <EuiLink onClick={() => console.log()} external>
            Learn more
          </EuiLink>
        </>
      }
      button={QueryWorkbenchButton}
    />
  );
};
