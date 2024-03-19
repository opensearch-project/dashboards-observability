/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSuperDatePicker, EuiToolTip } from '@elastic/eui';
import React from 'react';
import { i18n } from '@osd/i18n';
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

  let finalizedStartTime;
  let finalizedEndTime;
  let setDisabled;
  let toolTipMessage;

  if (coreRefs.queryAssistEnabled && !isAppAnalytics) {
    // is query assistant inside log explorer
    finalizedStartTime = QUERY_ASSIST_START_TIME;
    finalizedEndTime = QUERY_ASSIST_END_TIME;
    setDisabled = true;
    toolTipMessage = i18n.translate('discover.queryAssistant.timePickerDisabledMessage', {
      defaultMessage: 'Date range has been disabled to accomodate timerange of all datasets',
    });
  } else {
    finalizedStartTime = startTime;
    finalizedEndTime = endTime;
    setDisabled = false;
    toolTipMessage = false;
  }

  return (
    <>
      <EuiToolTip position="bottom" content={toolTipMessage}>
        <EuiSuperDatePicker
          data-test-subj="pplSearchDatePicker"
          start={finalizedStartTime}
          end={finalizedEndTime}
          dateFormat={uiSettingsService.get('dateFormat')}
          onTimeChange={handleTimeChange}
          onRefresh={handleTimeRangePickerRefresh}
          className="osdQueryBar__datePicker"
          showUpdateButton={false}
          isDisabled={setDisabled}
        />
      </EuiToolTip>
    </>
  );
}
