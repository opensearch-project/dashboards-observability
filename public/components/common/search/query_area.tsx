/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCodeEditor, EuiFlexGroup, EuiFlexItem, EuiPanel } from '@elastic/eui';
import React, { useEffect, useMemo } from 'react';
import { coreRefs } from '../../../framework/core_refs';
import { QueryAssistInput } from '../../event_analytics/explorer/query_assist/input';
import { useFetchEvents } from '../../event_analytics/hooks/use_fetch_events';

export function QueryArea({
  tabId,
  handleQueryChange,
  handleTimePickerChange,
  handleTimeRangePickerRefresh,
  runQuery,
  tempQuery,
  setNeedsUpdate,
  setFillRun,
  selectedIndex,
  nlqInput,
  setNlqInput,
  pplService,
}: any) {
  const requestParams = { tabId };
  const { getAvailableFields } = useFetchEvents({
    pplService,
    requestParams,
  });

  // use effect that sets the editor text and populates sidebar field for a particular index upon initialization
  const memoizedGetAvailableFields = useMemo(() => getAvailableFields, []);
  const memoizedHandleQueryChange = useMemo(() => handleQueryChange, []);
  useEffect(() => {
    const indexQuery = `source = ${selectedIndex[0].label}`;
    memoizedHandleQueryChange(indexQuery);
    memoizedGetAvailableFields(indexQuery);
  }, [selectedIndex, memoizedGetAvailableFields, memoizedHandleQueryChange]);

  return (
    <EuiPanel paddingSize="m">
      <EuiFlexGroup gutterSize="m" direction="column">
        <EuiFlexItem>
          <EuiCodeEditor
            theme="textmate"
            width="100%"
            height="4rem"
            showPrintMargin={false}
            setOptions={{
              fontSize: '14px',
            }}
            aria-label="Code Editor"
            onChange={(query) => {
              handleQueryChange(query);
              // query is considered updated when the last run query is not the same as whats in the editor
              // setUpdatedQuery(runQuery !== query);
              setNeedsUpdate(runQuery !== query);
            }}
            onFocus={() => setFillRun(true)}
            onBlur={() => setFillRun(false)}
            value={tempQuery}
            wrapEnabled={true}
          />
        </EuiFlexItem>
        {coreRefs.queryAssistEnabled && (
          <EuiFlexItem>
            <QueryAssistInput
              tabId={tabId}
              handleTimePickerChange={handleTimePickerChange}
              handleQueryChange={handleQueryChange}
              handleTimeRangePickerRefresh={handleTimeRangePickerRefresh}
              setNeedsUpdate={setNeedsUpdate}
              selectedIndex={selectedIndex}
              nlqInput={nlqInput}
              setNlqInput={setNlqInput}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
}
