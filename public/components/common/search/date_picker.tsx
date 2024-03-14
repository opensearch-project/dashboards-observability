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
import { i18n } from '@osd/i18n';

export function DatePicker(props: IDatePickerProps) {
  const {
    startTime,
    endTime,
    handleTimePickerChange,
    handleTimeRangePickerRefresh,
    isAppAnalytics,
    includesTimestamp,
  } = props;

  const handleTimeChange = (e: any) => handleTimePickerChange([e.start, e.end]);

  let setStartTime;
  let setEndTime;
  let setDisabled;
  let toolTipMessage;

  switch (true) {
    case coreRefs.queryAssistEnabled && !isAppAnalytics: // is query assistant inside log explorer
      setStartTime = QUERY_ASSIST_START_TIME;
      setEndTime = QUERY_ASSIST_END_TIME;
      setDisabled = true;
      toolTipMessage = i18n.translate('discover.queryAssistant.timePickerDisabledMessage', {
        defaultMessage: 'Date range has been disabled to accomodate timerange of all datasets',
      });
      break;
    case !includesTimestamp: // there is no timestamp
      setStartTime = 'now';
      setDisabled = true;
      toolTipMessage = i18n.translate('discover.events.timePickerNotFoundMessage', {
        defaultMessage: 'There is no timestamp found in the index',
      });
      break;
    default:
      setStartTime = startTime;
      setEndTime = endTime;
      setDisabled = false;
      toolTipMessage = false;
  }

  return (
    <>
      <EuiToolTip position="bottom" content={toolTipMessage}>
        <EuiSuperDatePicker
          data-test-subj="pplSearchDatePicker"
          start={setStartTime}
          end={setEndTime}
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
