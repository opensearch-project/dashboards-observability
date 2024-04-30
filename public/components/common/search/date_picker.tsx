/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSuperDatePicker } from '@elastic/eui';
import React from 'react';
import { uiSettingsService } from '../../../../common/utils';
import { IDatePickerProps } from './search';

export function DatePicker(props: IDatePickerProps) {
  const { startTime, endTime, handleTimePickerChange, handleTimeRangePickerRefresh } = props;

  const handleTimeChange = (e: any) => handleTimePickerChange([e.start, e.end]);

  return (
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
  );
}
