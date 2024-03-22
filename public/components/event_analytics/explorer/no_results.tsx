/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
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
import { CatalogCacheManager } from '../../../framework/catalog_cache/cache_manager';
import { CachedDataSourceStatus } from '../../../../common/types/data_connections';

export const NoResults = ({ tabId }: any) => {
  // get the queries isLoaded, if it exists AND is true = show no res
  const queryInfo = useSelector(selectQueries)[tabId];
  const summaryData = useSelector(selectQueryAssistantSummarization)[tabId];
  const queryAssistLoading = summaryData?.loading;
  const explorerSearchMeta = useSelector(selectSearchMetaData)[tabId];

  const datasourceName = explorerSearchMeta?.datasources[0]?.label;
  const languageInUse = explorerSearchMeta?.lang;

  const CreatedCodeBlock = ({ code }: any) => {
    return (
      <EuiCodeBlock isCopyable={true} paddingSize="none" fontSize="s" language="sql">
        {code}
      </EuiCodeBlock>
    );
  };

  const getRealQuery = (() => {
    const datasourceCache = CatalogCacheManager.getOrCreateDataSource(datasourceName);
    if (datasourceCache.status === CachedDataSourceStatus.Updated) {
      const database = datasourceCache.databases[0];
      if (database.status === CachedDataSourceStatus.Updated) {
        const table = database.tables[0];
        if (languageInUse === QUERY_LANGUAGE.SQL) {
          return `SELECT * FROM ${datasourceName}.${database.name}.${table.name} LIMIT 10`;
        } else {
          return `source = ${datasourceName}.${database.name}.${table.name} | head 10`;
        }
      }
    }
  })();

  const S3Callouts = () => {
    return (
      <EuiFlexGroup justifyContent="center" direction="column">
        <EuiFlexItem grow={false}>
          <EuiCallOut
            title={
              <FormattedMessage
                id="observability.noResults.exploreDataSourceCallout"
                defaultMessage="Explore S3 data source"
              />
            }
            color="success"
            iconType="iInCircle"
            data-test-subj="observabilityExploreDataSourceCallout"
          >
            <EuiButton
              onClick={() => {
                coreRefs?.application!.navigateToApp('datasources', {
                  path: `#/manage/${datasourceName}`,
                });
              }}
            >
              Explore Data Source
            </EuiButton>
          </EuiCallOut>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiCallOut
            title={
              <FormattedMessage
                id="observability.noResults.s3ExampleQueries"
                defaultMessage="Example Queries"
              />
            }
            color="warning"
            iconType="help"
            data-test-subj="observabilityS3ExampleQueries"
          >
            {languageInUse === QUERY_LANGUAGE.SQL ? (
              <EuiFlexGroup direction="column">
                <EuiFlexItem grow={false}>
                  <CreatedCodeBlock code={`SHOW DATABASES IN <datasource>`} />
                </EuiFlexItem>
                <EuiFlexItem>
                  <CreatedCodeBlock
                    code={`SHOW TABLES EXTENDED IN <datasource>.<database> LIKE '*'`}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <CreatedCodeBlock
                    code={`SELECT * FROM <datasource>.<database>.<table> LIMIT 10`}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            ) : (
              <CreatedCodeBlock code={`source = <datasource>.<database>.<table> | head 10`} />
            )}
          </EuiCallOut>
        </EuiFlexItem>
        {getRealQuery && (
          <EuiFlexItem grow={false}>
            <EuiCallOut
              title={
                <FormattedMessage
                  id="observability.noResults.s3ActualQueries"
                  defaultMessage="Actual Executable Queries"
                />
              }
              color="warning"
              iconType="help"
              data-test-subj="observabilityS3ActualQueries"
            >
              <CreatedCodeBlock code={getRealQuery} />
            </EuiCallOut>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );
  };

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
        <>
          {explorerSearchMeta?.datasources[0]?.type === DATA_SOURCE_TYPES.S3Glue ? (
            <S3Callouts />
          ) : (
            <OpenSearchIndexNoResults />
          )}
        </>
      )}
    </EuiPage>
  );
};
