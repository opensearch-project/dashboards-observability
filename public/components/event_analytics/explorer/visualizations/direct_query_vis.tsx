/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPage,
  EuiText,
  EuiSpacer,
} from '@elastic/eui';
import React from 'react';
import { FormattedMessage, I18nProvider } from '@osd/i18n/react';
import { queryWorkbenchPluginID } from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';

interface DirectQueryVisualizationProps {
  currentDataSource: string;
}

export const DirectQueryVisualization = ({ currentDataSource }: DirectQueryVisualizationProps) => {
  return (
    <I18nProvider>
      <EuiPage paddingSize="s">
        <EuiFlexGroup direction="column">
          <EuiFlexItem grow={false}>
            <EuiCallOut
              title={
                <FormattedMessage
                  id="observability.directQueryVisualization.cannotVisualizeTitle"
                  defaultMessage="Data source can't be visualized"
                />
              }
              color="danger"
              iconType="alert"
            >
              <p>
                <EuiLink
                  onClick={() =>
                    coreRefs?.application!.navigateToApp(queryWorkbenchPluginID, {
                      path: `#/${currentDataSource}`,
                    })
                  }
                >
                  <FormattedMessage
                    id="observability.directQueryVisualization.IndexDataBeforeVisualizeLink"
                    defaultMessage="Index data to visualize"
                  />
                </EuiLink>
              </p>
            </EuiCallOut>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText>
              <h2>
                <FormattedMessage
                  id="observability.directQueryVisualization.IndexDataBeforeVisualizeTitle"
                  defaultMessage="Index data to visualize or select indexed data"
                />
              </h2>
              <FormattedMessage
                id="observability.directQueryVisualization.IndexDataBeforeVisualizeText"
                defaultMessage="For external data only materialized views or covering indexes can be visualized. Ask
                    your administrator to create these indexes to visualize them."
              />
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPage>
    </I18nProvider>
  );
};
