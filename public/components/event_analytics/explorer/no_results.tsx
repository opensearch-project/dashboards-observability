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
                defaultMessage="Expand your time range or modify your query"
              />
            </h2>
            <p>
              <FormattedMessage
                id="observability.noResults.queryMayNotMatchTitle"
                defaultMessage="Your query may not match anything in the current time range, 
                or there may not be any data at all in the currently selected time range. 
                Try change time range, query filters or choose different time fields."
              />
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPage>
  );
};
