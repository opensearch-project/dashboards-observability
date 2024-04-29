/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem, EuiHorizontalRule, EuiLink, EuiText } from '@elastic/eui';
import React, { useContext, useEffect, useState } from 'react';
import { connect, useDispatch } from 'react-redux';
import {
  FILTERED_PATTERN,
  PATTERN_REGEX,
  PPL_DEFAULT_PATTERN_REGEX_FILETER,
} from '../../../../../common/constants/explorer';
import { PatternTableData, Query as IQuery } from '../../../../../common/types/explorer';
import { TabContext, useFetchPatterns } from '../../hooks';
import { selectPatterns } from '../../redux/slices/patterns_slice';
import { changeQuery, selectQueries } from '../../redux/slices/query_slice';
import { formatError } from '../../utils';
import { PatternsHeader } from './patterns_header';
import { PatternsTable } from './patterns_table';

export interface LogPatternProps {
  selectedIntervalUnit: {
    text: string;
    value: string;
  };
  handleTimeRangePickerRefresh: (flag: boolean) => {};
  patterns: PatternTableData[];
  query: IQuery;
}

const EventPatterns = ({
  selectedIntervalUnit,
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

  // refresh patterns on opening page
  useEffect(() => {
    getPatterns(selectedIntervalUnit?.value?.replace(/^auto_/, '') || 'y');
  }, []);

  const onPatternSelection = async (pattern: string) => {
    if (query[FILTERED_PATTERN] === pattern) {
      return;
    }
    // await here allows react to render update properly and display it.
    // it forces the query to be changed before running it, without await the visual wont update.
    await dispatch(
      changeQuery({
        tabId,
        query: {
          [FILTERED_PATTERN]: pattern,
        },
      })
    );
    handleTimeRangePickerRefresh(true);
    // after rendering the patterns visual, we want the pattern to be reset for future searches
    await dispatch(
      changeQuery({
        tabId,
        query: {
          [FILTERED_PATTERN]: '',
        },
      })
    );
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
          <PatternsHeader
            patternsData={patternsData}
            patternRegexInput={patternRegexInput}
            setPatternRegexInput={setPatternRegexInput}
            onPatternApply={handlePatternApply}
            isPatternConfigPopoverOpen={isPatternConfigPopoverOpen}
            setIsPatternConfigPopoverOpen={setIsPatternConfigPopoverOpen}
          />
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
