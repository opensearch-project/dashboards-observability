/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCallOut, EuiPage, EuiButton } from '@elastic/eui';
import React from 'react';
import { FormattedMessage, I18nProvider } from '@osd/i18n/react';

interface DirectQueryVisualizationProps {
  onCreateAcceleration: () => void;
}

export const DirectQueryVisualization = ({
  onCreateAcceleration,
}: DirectQueryVisualizationProps) => {
  return (
    <I18nProvider>
      <EuiPage paddingSize="s">
        <EuiCallOut color="warning" title={"The data source can't be visualized"}>
          <p>
            <FormattedMessage
              id="observability.directQueryVisualization.IndexDataBeforeVisualizeLink"
              defaultMessage="Create acceleration for the table to visualize or select accelerated data. Contact
              your administrator to accelerate data by creating a materialized view or covering
              index."
            />
          </p>
          <EuiButton iconType={'bolt'} onClick={onCreateAcceleration} color="warning">
            <FormattedMessage
              id="observability.directQueryVisualization.CreateAcceleration"
              defaultMessage="Create acceleration"
            />
          </EuiButton>
        </EuiCallOut>
      </EuiPage>
    </I18nProvider>
  );
};
