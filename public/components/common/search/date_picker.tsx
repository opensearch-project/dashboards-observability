/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSuperDatePicker, EuiToolTip } from '@elastic/eui';
import React from 'react';
import { uiSettingsService } from '../../../../common/utils';
import { coreRefs } from '../../../framework/core_refs';
import { IDatePickerProps } from './search';
import {
  QUERY_ASSIST_END_TIME,
  QUERY_ASSIST_START_TIME,
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
          start={allowTimeChanging ? startTime : QUERY_ASSIST_START_TIME}
          end={allowTimeChanging ? endTime : QUERY_ASSIST_END_TIME}
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
