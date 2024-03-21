/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCallOut,
  EuiCodeBlock,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPage,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import React from 'react';
import { useSelector } from 'react-redux';
import { coreRefs } from '../../../framework/core_refs';
import { selectQueryAssistantSummarization } from '../redux/slices/query_assistant_summarization_slice';
import { selectQueries } from '../redux/slices/query_slice';
import { selectSearchMetaData } from '../redux/slices/search_meta_data_slice';
import { DATA_SOURCE_TYPES, QUERY_LANGUAGE } from '../../../../common/constants/data_sources';

export const NoResults = ({ tabId }: any) => {
  // get the queries isLoaded, if it exists AND is true = show no res
  const queryInfo = useSelector(selectQueries)[tabId];
  const summaryData = useSelector(selectQueryAssistantSummarization)[tabId];
  const queryAssistLoading = summaryData?.loading;
  const explorerSearchMeta = useSelector(selectSearchMetaData)[tabId];

  const datasourceName = explorerSearchMeta?.datasources[0]?.name;
  const languageInUse = explorerSearchMeta?.lang;

  return (
    <EuiPage paddingSize="s">
      {coreRefs.queryAssistEnabled ? (
        <>
          {/* check to see if the rawQuery is empty or not */}
          {queryAssistLoading ? (
            <EuiEmptyPrompt
              title={<EuiLoadingSpinner size="xl" />}
              body={<p>Loading results...</p>}
            />
          ) : queryInfo?.rawQuery ? (
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
                  Run a query to view results, or use the Natural Language Query Generator to
                  automatically generate complex queries using simple conversational prompts.
                </p>
              }
            />
          )}
        </>
      ) : (
        <EuiFlexGroup justifyContent="center" direction="column">
          <EuiFlexItem grow={false}>
            {explorerSearchMeta?.datasources[0]?.type === DATA_SOURCE_TYPES.S3Glue ? (
              <EuiCallOut
                title={
                  <FormattedMessage
                    id="observability.noResults.noResultsMatchSearchCriteriaTitle"
                    defaultMessage="Explore S3 data source"
                  />
                }
                color="warning"
                iconType="help"
                data-test-subj="observabilityNoResultsCallout"
              >
                {languageInUse === QUERY_LANGUAGE.SQL ? (
                  <EuiFlexGroup direction="column">
                    <EuiFlexItem grow={false}>
                      <h4>Explore Databases</h4>
                      <EuiCodeBlock isCopyable={true} paddingSize="none" fontSize="s">
                        {`SHOW SCHEMAS IN ${datasourceName}`}
                      </EuiCodeBlock>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <h4>Explore Tables</h4>
                      <EuiCodeBlock isCopyable={true} paddingSize="none" fontSize="s">
                        {`SHOW TABLES EXTENDED IN ${datasourceName}.<database> LIKE '*'`}
                      </EuiCodeBlock>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <h4>Sample Query</h4>
                      <EuiCodeBlock isCopyable={true} paddingSize="none" fontSize="s">
                        {`SELECT * FROM ${datasourceName}.<database>.<table> LIMIT 10`}
                      </EuiCodeBlock>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ) : (
                  <>
                    <h4>Sample Query</h4>
                    <EuiCodeBlock isCopyable={true} paddingSize="none" fontSize="s">
                      {`source = ${datasourceName}.<database>.<table> | head 10`}
                    </EuiCodeBlock>
                  </>
                )}
              </EuiCallOut>
            ) : (
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
            )}
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
