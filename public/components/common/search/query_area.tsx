/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiAccordion, EuiCodeEditor, EuiPanel, EuiSpacer } from '@elastic/eui';
import React, { useEffect, useMemo, useState } from 'react';
import { coreRefs } from '../../../framework/core_refs';
import { QueryAssistInput } from '../../event_analytics/explorer/query_assist/input';
import { useFetchEvents } from '../../event_analytics/hooks/use_fetch_events';
import './query_area.scss';

/**
 * QueryArea is currently used for query assist only.
 */
export function QueryArea({
  tabId,
  handleQueryChange,
  handleTimePickerChange,
  handleTimeRangePickerRefresh,
  runQuery,
  tempQuery,
  setNeedsUpdate,
  runChanges,
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
    const indexQuery = `source = ${selectedIndex[0]?.label || ''}`;
    memoizedHandleQueryChange(indexQuery);
    memoizedGetAvailableFields(indexQuery);
  }, [selectedIndex, memoizedGetAvailableFields, memoizedHandleQueryChange]);
  const [lastFocusedInput, setLastFocusedInput] = useState<'query_area' | 'nlq_input'>('nlq_input');
  const [callOut, setCallOut] = useState<React.ReactNode>(null);

  const queryEditor = (
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
        setCallOut(null);
        // query is considered updated when the last run query is not the same as whats in the editor
        setNeedsUpdate(runQuery !== query);
      }}
      onFocus={() => setLastFocusedInput('query_area')}
      value={tempQuery}
      wrapEnabled={true}
    />
  );

  if (!coreRefs.queryAssistEnabled) {
    return <EuiPanel paddingSize="m">{queryEditor}</EuiPanel>;
  }

  return (
    <EuiPanel paddingSize="none">
      <EuiAccordion
        id="ppl-query-accordion"
        buttonContent="Query Assist"
        initialIsOpen
        className="ppl-query-accordion"
        // this paddingSize is for accordion children
        paddingSize="none"
      >
        <>
          <EuiSpacer size="s" />
          <QueryAssistInput
            tabId={tabId}
            handleTimePickerChange={handleTimePickerChange}
            handleQueryChange={handleQueryChange}
            handleTimeRangePickerRefresh={handleTimeRangePickerRefresh}
            setNeedsUpdate={setNeedsUpdate}
            selectedIndex={selectedIndex}
            nlqInput={nlqInput}
            setNlqInput={setNlqInput}
            lastFocusedInput={lastFocusedInput}
            setLastFocusedInput={setLastFocusedInput}
            runChanges={runChanges}
            callOut={callOut}
            setCallOut={setCallOut}
          >
            {queryEditor}
          </QueryAssistInput>
        </>
      </EuiAccordion>
    </EuiPanel>
  );
}
