/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSuperDatePicker,
} from '@elastic/eui';
import debounce from 'lodash/debounce';
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { uiSettingsService } from '../../../../../common/utils';
import { GlobalFilterButton } from './filters/filters'; // Import the GlobalFilterButton
import { FilterType } from './filters/filters';

export const renderDatePicker = (
  startTime: string,
  setStartTime: (startTime: string) => void,
  endTime: string,
  setEndTime: (endTime: string) => void
) => {
  return (
    <EuiSuperDatePicker
      start={startTime}
      end={endTime}
      dateFormat={uiSettingsService.get('dateFormat')}
      showUpdateButton={false}
      onTimeChange={(e) => {
        setStartTime(e.start);
        setEndTime(e.end);
      }}
    />
  );
};

export interface SearchBarProps {
  filters: FilterType[];
  setFilters: (filters: FilterType[]) => void;
  query: string;
  setQuery: (query: string) => void;
  startTime: string;
  setStartTime: (startTime: string) => void;
  endTime: string;
  setEndTime: (endTime: string) => void;
  refresh: (currService?: string, overrideQuery?: string) => Promise<void>;
  page: 'dashboard' | 'traces' | 'services' | 'app';
  datepickerOnly?: boolean;
}

export const SearchBar = forwardRef((props: SearchBarProps, ref) => {
  // use another query state to avoid typing delay
  const [query, setQuery] = useState(props.query);
  const setGlobalQuery = debounce((q) => {
    props.setQuery(q);
  }, 50);

  // Expose a method to update the local query state
  useImperativeHandle(ref, () => ({
    updateQuery(newQuery: string) {
      setQuery(newQuery);
      setGlobalQuery(newQuery);
      props.refresh(undefined, newQuery);
    },
  }));

  return (
    <>
      <EuiFlexGroup gutterSize="s" alignItems="center">
        {!props.datepickerOnly && (
          <>
            <EuiFlexItem>
              <EuiFieldSearch
                prepend={
                  <GlobalFilterButton filters={props.filters} setFilters={props.setFilters} />
                }
                compressed
                fullWidth
                isClearable={false}
                placeholder="Trace ID, trace group name, service name"
                data-test-subj="search-bar-input-box"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setGlobalQuery(e.target.value);
                }}
                onSearch={props.refresh}
              />
            </EuiFlexItem>
          </>
        )}
        <EuiFlexItem grow={false} style={{ maxWidth: '30vw' }}>
          <EuiSuperDatePicker
            compressed
            start={props.startTime}
            end={props.endTime}
            onTimeChange={(e) => {
              props.setStartTime(e.start);
              props.setEndTime(e.end);
            }}
            showUpdateButton={false}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="refresh"
            aria-label="Refresh"
            display="base"
            onClick={() => props.refresh()}
            size="s"
            data-test-subj="superDatePickerApplyTimeButton"
            data-click-metric-element="trace_analytics.refresh_button"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
});
