/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiToolTip, EuiText, EuiSelect } from '@elastic/eui';
import { I18nProvider } from '@osd/i18n/react';
import { i18n } from '@osd/i18n';
import moment from 'moment';

// TODO: move this function into some common library for other observability datetime uses
function reformatDate(inputDate: string) {
  return moment(inputDate).format('MMM D, YYYY @ HH:mm:ss.SSS')
}

export interface TimechartHeaderProps {
  /**
   * Format of date to be displayed
   */
  dateFormat?: string;
  /**
   * Range of dates to be displayed
   */
  timeRange?: {
    from: string;
    to: string;
  };
  /**
   * Interval Options
   */
  options: Array<{ text: string; value: string }>;
  /**
   * changes the interval
   */
  onChangeInterval: (interval: string) => void;
  /**
   * selected interval
   */
  stateInterval?: string | undefined;
  /**
   * current time span being displayed on the count distribution
   */
  timeSpan: Array<string>;
}

export function TimechartHeader({
  options,
  onChangeInterval,
  stateInterval,
  timeSpan
}: TimechartHeaderProps) {

  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChangeInterval(e.target.value);
  };

  return (
    <I18nProvider>
      <EuiFlexGroup gutterSize="s" responsive justifyContent="center" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('discover.howToChangeTheTimeTooltip', {
              defaultMessage: 'To change the time, use the global time filter above',
            })}
            delay="long"
          >
            <EuiText data-test-subj="discoverIntervalDateRange" size="s">{reformatDate(timeSpan[0])} - {reformatDate(timeSpan[timeSpan.length-1])}</EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSelect
            aria-label={i18n.translate('discover.timechartHeader.timeIntervalSelect.ariaLabel', {
              defaultMessage: 'Time interval',
            })}
            compressed
            id="dscResultsIntervalSelector"
            data-test-subj="eventAnalytics__EventIntervalSelect"
            options={options}
            value={stateInterval || options[0].value}
            onChange={handleIntervalChange}
            append={undefined}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </I18nProvider>
  );
}
