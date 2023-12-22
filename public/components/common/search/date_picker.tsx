/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSuperDatePicker, EuiToolTip } from '@elastic/eui';
import React from 'react';
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

  return !coreRefs.queryAssistEnabled || isAppAnalytics ? (
    <EuiSuperDatePicker
      data-test-subj="pplSearchDatePicker"
      start={startTime}
      end={endTime}
      dateFormat={uiSettingsService.get('dateFormat')}
      onTimeChange={handleTimeChange}
      onRefresh={handleTimeRangePickerRefresh}
      className="osdQueryBar__datePicker"
      showUpdateButton={false}
    />
  ) : (
    <>
      <EuiToolTip
        position="bottom"
        content="Date range has been disabled to accomodate timerange of all datasets"
      >
        <EuiSuperDatePicker
          data-test-subj="pplSearchDatePicker"
          start={fixedStartTime}
          end={fixedEndTime}
          dateFormat={uiSettingsService.get('dateFormat')}
          onTimeChange={handleTimeChange}
          onRefresh={handleTimeRangePickerRefresh}
          className="osdQueryBar__datePicker"
          showUpdateButton={false}
          isDisabled={true}
        />
      </EuiToolTip>
    </>
  );
}
