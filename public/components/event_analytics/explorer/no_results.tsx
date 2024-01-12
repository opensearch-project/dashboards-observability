/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FormattedMessage } from '@osd/i18n/react';
import { EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiPage, EuiSpacer, EuiText } from '@elastic/eui';

export const NoResults = () => {
  return (
    <EuiPage paddingSize="s">
      <EuiFlexGroup justifyContent="center" direction="column">
        <EuiFlexItem grow={false}>
          <EuiCallOut
            title={
              <FormattedMessage
                id="observability.noResults.noResultsMatchSearchCriteriaTitle"
                defaultMessage="No results match your search criteria"
              />
            }
            color="warning"
            iconType="help"
            data-test-subj="observabilityNoResultsCallout"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSpacer size="s" />
          <EuiText>
            <h2 data-test-subj="obsNoResultsTimefilter">
              <FormattedMessage
                id="observability.noResults.expandYourTimeRangeTitle"
                defaultMessage="Select a data source, expand your time range, or modify the query"
              />
            </h2>
            <p>
              <FormattedMessage
                id="observability.noResults.queryMayNotMatchTitle"
                defaultMessage="After selection, check the time range, query filters, fields, and query"
              />
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPage>
  );
};
