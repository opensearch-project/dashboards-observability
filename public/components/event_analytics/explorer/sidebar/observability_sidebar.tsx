/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import isEmpty from 'lodash/isEmpty';
import { changeQuery, selectQueries } from '../../redux/slices/query_slice';
import { selectQueryResult } from '../../redux/slices/query_result_slice';
import { selectFields } from '../../redux/slices/field_slice';
import {
  RAW_QUERY,
  SELECTED_PATTERN_FIELD,
  SELECTED_TIMESTAMP,
} from '../../../../../common/constants/explorer';
import { PPL_STATS_REGEX } from '../../../../../common/constants/shared';
import { Sidebar } from './sidebar';
import { useFetchPatterns } from '../../hooks';
import { formatError } from '../../utils';
import { IField } from '../../../../../common/types/explorer';
import { selectCountDistribution } from '../../redux/slices/count_distribution_slice';

export const ObservabilitySideBar = ({ tabId, pplService, notifications }) => {
  const dispatch = useDispatch();
  const query = useSelector(selectQueries)[tabId];
  const explorerData = useSelector(selectQueryResult)[tabId];
  const explorerFields = useSelector(selectFields)[tabId];
  const countDistribution = useSelector(selectCountDistribution)[tabId];
  const requestParams = { tabId };
  const { getPatterns, setDefaultPatternsField } = useFetchPatterns({
    pplService,
    requestParams,
  });
  const [isOverridingPattern, setIsOverridingPattern] = useState(false);
  const [isOverridingTimestamp, setIsOverridingTimestamp] = useState(false);

  const getErrorHandler = (title: string) => {
    return (error: any) => {
      const formattedError = formatError(error.name, error.message, error.body.message);
      notifications.toasts.addError(formattedError, {
        title,
      });
    };
  };

  const handleOverridePattern = async (pattern: IField) => {
    setIsOverridingPattern(true);
    await setDefaultPatternsField(
      '',
      pattern.name,
      getErrorHandler('Error overriding default pattern')
    );
    setIsOverridingPattern(false);
    await getPatterns(
      countDistribution.selectedInterval || 'y',
      getErrorHandler('Error fetching patterns')
    );
  };

  const handleOverrideTimestamp = async (timestamp: IField) => {
    setIsOverridingTimestamp(true);
    await dispatch(
      changeQuery({
        tabId,
        query: {
          [SELECTED_TIMESTAMP]: timestamp?.name || '',
        },
      })
    );
    setIsOverridingTimestamp(false);
  };

  return (
    <Sidebar
      query={query}
      explorerFields={explorerFields}
      explorerData={explorerData}
      selectedTimestamp={query[SELECTED_TIMESTAMP]}
      selectedPattern={query[SELECTED_PATTERN_FIELD]}
      handleOverrideTimestamp={handleOverrideTimestamp}
      handleOverridePattern={handleOverridePattern}
      isOverridingTimestamp={isOverridingTimestamp}
      isOverridingPattern={isOverridingPattern}
      isFieldToggleButtonDisabled={
        isEmpty(explorerData.jsonData) || !isEmpty(query[RAW_QUERY]?.match(PPL_STATS_REGEX))
      }
      tabId={tabId}
    />
  );
};
