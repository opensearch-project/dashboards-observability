/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FormattedMessage } from '@osd/i18n/react';
import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiSpacer,
  EuiText,
  EuiEmptyPrompt,
} from '@elastic/eui';
import { useSelector } from 'react-redux';
import { coreRefs } from '../../../framework/core_refs';
import { selectQueries } from '../redux/slices/query_slice';

export const NoResults = ({ tabId }: any) => {
  // get the queries isLoaded, if it exists AND is true = show no res
  const queryInfo = useSelector(selectQueries)[tabId];

  return (
    <EuiPage paddingSize="s">
      {coreRefs.queryAssistEnabled ? (
        <>
          {/* check to see if the rawQuery is empty or not */}
          {queryInfo?.rawQuery ? (
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
              <EuiFlexItem>
                <EuiEmptyPrompt
                  iconType={'editorCodeBlock'}
                  title={<h2>No results</h2>}
                  body={
                    <p>
                      Try selecting a different data source, expanding your time range or modifying
                      the query & filters. You may also use the Query Assistant to fine-tune your
                      query using simple conversational prompts.
                    </p>
                  }
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : (
            <EuiEmptyPrompt
              iconType={'editorCodeBlock'}
              title={<h2>Get started</h2>}
              body={
                <p>
                  Run a query to view results, or use the Query Assistant to automatically generate
                  complex queries using simple conversational prompts.
                </p>
              }
            />
          )}
        </>
      ) : (
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
      )}
    </EuiPage>
  );
};
