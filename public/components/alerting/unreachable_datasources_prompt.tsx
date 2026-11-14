/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Alerts and Rules tabs' empty state when every selected datasource failed: names each
 * datasource with its error, in place of the onboarding empty state.
 */
import React from 'react';
import { EuiEmptyPrompt, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';

/** A selected datasource that failed, with the text of its error. */
export interface UnreachableDatasource {
  name: string;
  error: string;
}

export const UnreachableDatasourcesPrompt: React.FC<{
  datasources: UnreachableDatasource[];
}> = ({ datasources }) => (
  <EuiEmptyPrompt
    data-test-subj="alertingUnreachableDatasources"
    iconType="alert"
    iconColor="danger"
    title={
      <h3>
        <FormattedMessage
          id="observability.alerting.unreachableDatasources.title"
          defaultMessage="Couldn't reach the selected datasources"
        />
      </h3>
    }
    body={
      <EuiText size="s" textAlign="left">
        <ul>
          {datasources.map((ds) => (
            <li key={ds.name}>
              <strong>{ds.name}</strong>: {ds.error}
            </li>
          ))}
        </ul>
      </EuiText>
    }
  />
);
