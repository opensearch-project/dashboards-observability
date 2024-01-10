/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSuperDatePicker, EuiToolTip } from '@elastic/eui';
import React, { useEffect } from 'react';
import { uiSettingsService } from '../../../../common/utils';
import { coreRefs } from '../../../framework/core_refs';
import { IDatePickerProps } from './search';
import {
  QUERY_ASSISTANT_FIXED_END_TIME,
  QUERY_ASSISTANT_FIXED_START_TIME,
} from '../../../../common/constants/shared';

export function DatePicker(props: IDatePickerProps) {
  const {
    startTime,
    endTime,
    handleTimePickerChange,
    handleTimeRangePickerRefresh,
    isAppAnalytics,
  } = props;

  const handleTimeChange = (e: any) => handleTimePickerChange([e.start, e.end]);
  const allowTimeChanging = !coreRefs.queryAssistEnabled || isAppAnalytics;

  // set the time range to be 40 years rather than the standard 15 minutes if using query assistant
  useEffect(() => {
    if (!allowTimeChanging) {
      handleTimePickerChange([QUERY_ASSISTANT_FIXED_START_TIME, QUERY_ASSISTANT_FIXED_END_TIME]);
    }
  }, []);

  return (
    <>
      <EuiToolTip
        position="bottom"
        content={
          allowTimeChanging
            ? false
            : 'Date range has been disabled to accomodate timerange of all datasets'
        }
      >
        <EuiSuperDatePicker
          data-test-subj="pplSearchDatePicker"
          start={allowTimeChanging ? startTime : QUERY_ASSISTANT_FIXED_START_TIME}
          end={allowTimeChanging ? endTime : QUERY_ASSISTANT_FIXED_END_TIME}
          dateFormat={uiSettingsService.get('dateFormat')}
          onTimeChange={handleTimeChange}
          onRefresh={handleTimeRangePickerRefresh}
          className="osdQueryBar__datePicker"
          showUpdateButton={false}
          isDisabled={!allowTimeChanging}
        />
      </EuiToolTip>
    </>
  );
}
