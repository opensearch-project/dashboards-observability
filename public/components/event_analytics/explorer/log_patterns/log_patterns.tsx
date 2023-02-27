/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useContext } from 'react';
import { useDispatch, connect } from 'react-redux';
import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiText, EuiHorizontalRule } from '@elastic/eui';
import {
  FILTERED_PATTERN,
  PATTERN_REGEX,
  RAW_QUERY,
  PPL_DEFAULT_PATTERN_REGEX_FILETER,
} from '../../../../../common/constants/explorer';
import { PatternsHeader } from './patterns_header';
import { PatternsTable } from './patterns_table';
import { selectPatterns } from '../../redux/slices/patterns_slice';
import { TabContext, useFetchPatterns } from '../../hooks';
import { changeQuery, selectQueries } from '../../redux/slices/query_slice';
import { formatError } from '../../utils';
import { Query as IQuery, PatternTableData } from '../../../../../common/types/explorer';

export interface LogPatternProps {
  selectedIntervalUnit: {
    text: string;
    value: string;
  };
  setTempQuery: () => string;
  handleTimeRangePickerRefresh: (flag: boolean) => {};
  patterns: PatternTableData[];
  query: IQuery;
}

const EventPatterns = ({
  selectedIntervalUnit,
  setTempQuery,
  handleTimeRangePickerRefresh,
  patterns,
  query,
}: LogPatternProps) => {
  const dispatch = useDispatch();
  const { tabId, pplService, notifications } = useContext<any>(TabContext);
  const patternsData = patterns[tabId];
  const [viewLogPatterns, setViewLogPatterns] = useState(false);
  const [isPatternConfigPopoverOpen, setIsPatternConfigPopoverOpen] = useState(false);
  const [patternRegexInput, setPatternRegexInput] = useState(PPL_DEFAULT_PATTERN_REGEX_FILETER);
  const { isEventsLoading: isPatternLoading, getPatterns } = useFetchPatterns({
    pplService,
    requestParams: { tabId },
  });

  const onPatternSelection = async (pattern: string) => {
    if (query[FILTERED_PATTERN] === pattern) {
      return;
    }
    dispatch(
      changeQuery({
        tabId,
        query: {
          [FILTERED_PATTERN]: pattern,
        },
      })
    );
    // workaround to refresh callback and trigger fetch data
    await setTempQuery(query[RAW_QUERY]);
    await handleTimeRangePickerRefresh(true);
  };

  const showToastError = (errorMsg: string) => {
    return (error: any) => {
      const formattedError = formatError(error.name, error.message, error.body.message);
      notifications.toasts.addError(formattedError, {
        errorMsg,
      });
    };
  };

  const handlePatternApply = async () => {
    await dispatch(
      changeQuery({
        tabId,
        query: {
          [PATTERN_REGEX]: patternRegexInput,
        },
      })
    );
    await getPatterns(
      selectedIntervalUnit.value.replace(/^auto_/, '') || 'y',
      showToastError('Error fetching patterns')
    );
  };

  return (
    <>
      <EuiFlexGroup
        justifyContent="spaceBetween"
        alignItems="center"
        style={{ margin: '8px' }}
        gutterSize="xs"
      >
        <EuiFlexItem grow={false}>
          {viewLogPatterns && (
            <PatternsHeader
              patternsData={patternsData}
              patternRegexInput={patternRegexInput}
              setPatternRegexInput={setPatternRegexInput}
              onPatternApply={handlePatternApply}
              isPatternConfigPopoverOpen={isPatternConfigPopoverOpen}
              setIsPatternConfigPopoverOpen={setIsPatternConfigPopoverOpen}
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup>
            <EuiFlexItem grow={false}>
              {viewLogPatterns && (
                <EuiText size="s">
                  <EuiLink onClick={() => onPatternSelection('')}>Clear Selection</EuiLink>
                </EuiText>
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                <EuiLink
                  onClick={() => {
                    // hide patterns will also clear pattern selection
                    if (viewLogPatterns) {
                      onPatternSelection('');
                    }
                    setViewLogPatterns(!viewLogPatterns);
                    setIsPatternConfigPopoverOpen(false);
                  }}
                >
                  {`${viewLogPatterns ? 'Hide' : 'Show'} Patterns`}
                </EuiLink>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiHorizontalRule margin="xs" />
      {viewLogPatterns && (
        <>
          <PatternsTable
            tableData={patternsData.patternTableData || []}
            onPatternSelection={onPatternSelection}
            tabId={tabId}
            query={query}
            isPatternLoading={isPatternLoading}
          />
          <EuiHorizontalRule margin="xs" />
        </>
      )}
    </>
  );
};

const mapStateToProps = (state) => {
  return {
    patterns: selectPatterns(state),
    query: selectQueries(state),
  };
};

export const LogPatterns = connect(mapStateToProps)(EventPatterns);
