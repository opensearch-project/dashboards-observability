/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSuperDatePicker, EuiToolTip } from '@elastic/eui';
import React, { useEffect } from 'react';
import { uiSettingsService } from '../../../../common/utils';
import { coreRefs } from '../../../framework/core_refs';
import { IDatePickerProps } from './search';

export function DatePicker(props: IDatePickerProps) {
  const {
    startTime,
    endTime,
    handleTimePickerChange,
    handleTimeRangePickerRefresh,
    isAppAnalytics,
  } = props;
  const fixedStartTime = 'now-40y';
  const fixedEndTime = 'now';

  const handleTimeChange = (e: any) => handleTimePickerChange([e.start, e.end]);
  const allowTimeChanging = !coreRefs.queryAssistEnabled || isAppAnalytics;

  // set the time range to be 40 years rather than the standard 15 minutes if using query assistant
  useEffect(() => {
    if (!allowTimeChanging) {
      handleTimePickerChange([fixedStartTime, fixedEndTime]);
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
          start={allowTimeChanging ? startTime : fixedStartTime}
          end={allowTimeChanging ? endTime : fixedEndTime}
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
