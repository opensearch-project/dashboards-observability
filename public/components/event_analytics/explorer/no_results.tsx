/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiCallOut,
  EuiCode,
  EuiCodeBlock,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingSpinner,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@osd/i18n/react';
import React from 'react';
import { useSelector } from 'react-redux';
import { DATA_SOURCE_TYPES, QUERY_LANGUAGE } from '../../../../common/constants/data_sources';
import { CachedDataSourceStatus } from '../../../../common/types/data_connections';
import { CatalogCacheManager } from '../../../framework/catalog_cache/cache_manager';
import { coreRefs } from '../../../framework/core_refs';
import { selectQueryAssistantSummarization } from '../redux/slices/query_assistant_summarization_slice';
import { selectQueries } from '../redux/slices/query_slice';
import { selectSearchMetaData } from '../redux/slices/search_meta_data_slice';

export interface NoResultsProps {
  tabId: string;
  eventsLoading: boolean;
}

const CreatedCodeBlock = ({ code }: { code: string }) => {
  return (
    <EuiCodeBlock isCopyable={true} paddingSize="m" fontSize="s" language="sql">
      {code}
    </EuiCodeBlock>
  );
};

const LoadingResults: React.FC = () => (
  <EuiEmptyPrompt title={<EuiLoadingSpinner size="xl" />} body={<p>Loading results...</p>} />
);

const OpenSearchIndexNoResults = () => {
  return (
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
  );
};

export const NoResults = ({ tabId, eventsLoading }: NoResultsProps) => {
  // get the queries isLoaded, if it exists AND is true = show no res
  const queryInfo = useSelector(selectQueries)[tabId];
  const summaryData = useSelector(selectQueryAssistantSummarization)[tabId];
  const queryAssistLoading = summaryData?.loading;
  const explorerSearchMeta = useSelector(selectSearchMetaData)[tabId];

  const datasourceName = explorerSearchMeta?.datasources[0]?.label;
  const languageInUse = explorerSearchMeta?.lang;

  const queryInputted = queryInfo?.rawQuery !== '';

  let arbitraryDatabaseName: string | undefined;
  let arbitraryTableName: string | undefined;
  let arbitraryRealQuery: string | undefined;
  const datasourceCache = CatalogCacheManager.getOrCreateDataSource(datasourceName);
  if (datasourceCache?.status === CachedDataSourceStatus.Updated) {
    const database = datasourceCache?.databases?.[0];
    if (database?.status === CachedDataSourceStatus.Updated) {
      const table = database.tables[0];
      arbitraryDatabaseName = database.name;
      arbitraryTableName = table.name;
      if (languageInUse === QUERY_LANGUAGE.SQL) {
        arbitraryRealQuery = `SELECT * FROM ${datasourceName}.${database.name}.${table.name} LIMIT 10`;
      } else {
        arbitraryRealQuery = `source = ${datasourceName}.${database.name}.${table.name} | head 10`;
      }
    }
  }

  const renderS3Callouts = () => {
    return (
      <EuiFlexGroup justifyContent="center" direction="column">
        {queryInputted && (
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
        )}
        <EuiFlexItem grow={false}>
          <EuiText>
            <h2 data-test-subj="obsNoResultsMessage">
              <FormattedMessage
                id="observability.noResults.enterAQuery"
                defaultMessage={'Enter a query'}
              />
            </h2>
            <p>
              To start exploring this datasource, enter a query or{' '}
              <EuiLink
                onClick={() => {
                  coreRefs?.application!.navigateToApp('datasources', {
                    path: `#/manage/${datasourceName}`,
                  });
                }}
              >
                view databases and tables.
              </EuiLink>
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPanel style={{ width: '700px' }}>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <b>Sample Queries</b>
              </EuiFlexItem>
              {languageInUse === QUERY_LANGUAGE.SQL ? (
                <>
                  <EuiFlexItem grow={false}>
                    <p>
                      Show a list of databases in{' '}
                      <EuiCode transparentBackground={true}>{datasourceName}</EuiCode>
                    </p>
                    <EuiSpacer size="s" />
                    <CreatedCodeBlock code={`SHOW DATABASES IN ${datasourceName}`} />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <p>Show a list of tables within a database</p>
                    <EuiSpacer size="s" />
                    <CreatedCodeBlock
                      code={`SHOW TABLE EXTENDED IN ${datasourceName}.<database> LIKE '*'`}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <p>Explore data within a table</p>
                    <EuiSpacer size="s" />
                    <CreatedCodeBlock
                      code={`SELECT * FROM ${datasourceName}.<database>.<table> LIMIT 10`}
                    />
                  </EuiFlexItem>
                </>
              ) : (
                <EuiFlexItem>
                  <p>Explore data within a table</p>
                  <EuiSpacer size="s" />
                  <CreatedCodeBlock
                    code={`source = ${datasourceName}.<database>.<table> | head 10`}
                  />
                </EuiFlexItem>
              )}
              {arbitraryRealQuery && (
                <EuiFlexItem>
                  <p>
                    Explore data within the table
                    <EuiCode transparentBackground={true}>{arbitraryTableName!}</EuiCode> in the
                    database
                    <EuiCode transparentBackground={true}>{arbitraryDatabaseName!}</EuiCode>
                  </p>
                  <EuiSpacer size="s" />
                  <CreatedCodeBlock code={arbitraryRealQuery!} />
                </EuiFlexItem>
              )}
              <EuiFlexItem>
                <EuiLink
                  href="https://github.com/opensearch-project/opensearch-spark/blob/main/docs/index.md"
                  external
                >
                  Reference manual
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  return (
    <EuiPage paddingSize="s">
      {coreRefs.queryAssistEnabled ? (
        <>
          {/* check to see if the rawQuery is empty or not */}
          {queryAssistLoading || eventsLoading ? (
            <LoadingResults />
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
              title={
                <h2>
                  <FormattedMessage
                    id="observability.noResults.queryAssist.getStarted.title"
                    defaultMessage="Get started"
                  />
                </h2>
              }
              body={
                <p>
                  <FormattedMessage
                    id="observability.noResults.queryAssist.getStarted.body"
                    defaultMessage="Enter your natural language question to automatically generate summaries and complex queries using simple conversational prompts."
                  />
                </p>
              }
            />
          )}
        </>
      ) : (
        <>
          {explorerSearchMeta?.datasources[0]?.type === DATA_SOURCE_TYPES.S3Glue ? (
            renderS3Callouts()
          ) : eventsLoading ? (
            <LoadingResults />
          ) : (
            <OpenSearchIndexNoResults />
          )}
        </>
      )}
    </EuiPage>
  );
};
