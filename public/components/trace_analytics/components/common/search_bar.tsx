/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiCompressedFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiSuperDatePicker,
} from '@elastic/eui';
import debounce from 'lodash/debounce';
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { uiSettingsService } from '../../../../../common/utils';
import { Filters, FiltersProps } from './filters/filters';

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

export interface SearchBarProps extends FiltersProps {
  query: string;
  setQuery: (query: string) => void;
  startTime: string;
  setStartTime: (startTime: string) => void;
  endTime: string;
  setEndTime: (endTime: string) => void;
}

interface SearchBarOwnProps extends SearchBarProps {
  refresh: (currService?: string, overrideQuery?: string) => Promise<void>;
  page: 'dashboard' | 'traces' | 'services' | 'app';
  datepickerOnly?: boolean;
}

export const SearchBar = forwardRef((props: SearchBarOwnProps, ref) => {
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
      <EuiFlexGroup gutterSize="s">
        {!props.datepickerOnly && (
          <EuiFlexItem>
            <EuiCompressedFieldSearch
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
        )}
        <EuiFlexItem grow={false} style={{ maxWidth: '40vw' }}>
          {renderDatePicker(props.startTime, props.setStartTime, props.endTime, props.setEndTime)}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSmallButton
            data-test-subj="superDatePickerApplyTimeButton"
            data-click-metric-element="trace_analytics.refresh_button"
            iconType="refresh"
            onClick={() => props.refresh()}
          >
            Refresh
          </EuiSmallButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {!props.datepickerOnly && (
        <>
          <EuiSpacer size="s" />
          <Filters
            page={props.page}
            filters={props.filters}
            setFilters={props.setFilters}
            appConfigs={props.appConfigs}
            mode={props.mode}
            attributesFilterFields={props.attributesFilterFields}
          />
        </>
      )}
    </>
  );
});
