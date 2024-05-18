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
  EuiButton,
} from '@elastic/eui';
import React from 'react';
import { FormattedMessage, I18nProvider } from '@osd/i18n/react';
import { queryWorkbenchPluginID } from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';

interface DirectQueryVisualizationProps {
  currentDataSource: string;
  isS3ConnectionWithLakeFormation: boolean;
  onCreateAcceleration: () => void;
}

export const DirectQueryVisualization = ({
  currentDataSource,
  isS3ConnectionWithLakeFormation,
  onCreateAcceleration,
}: DirectQueryVisualizationProps) => {
  return (
    <I18nProvider>
      <EuiPage paddingSize="s">
        {isS3ConnectionWithLakeFormation ? (
          <EuiCallOut color="warning" title={"The data source can't be visualized"}>
            <p>
              Create acceleration for the table to visualize or select accelerated data. Contact
              your administrator to accelerate data by creating a materialized view or covering
              index.
            </p>
            <EuiButton iconType={'bolt'} onClick={onCreateAcceleration} color="warning">
              Create acceleration
            </EuiButton>
          </EuiCallOut>
        ) : (
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
                        path: `#/accelerate/${currentDataSource}`,
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
        )}
      </EuiPage>
    </I18nProvider>
  );
};
