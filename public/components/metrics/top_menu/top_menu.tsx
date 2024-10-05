/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiCompressedFieldText,
  EuiCompressedSelect,
  EuiCompressedSuperDatePicker,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resolutionOptions } from '../../../../common/constants/metrics';
import { uiSettingsService } from '../../../../common/utils';
import { dateSpanFilterSelector, setDateSpan } from '../redux/slices/metrics_slice';
import { MetricsExport } from './metrics_export';
import './top_menu.scss';

export const TopMenu = () => {
  // Redux tools
  const dispatch = useDispatch();
  const dateSpanFilter = useSelector(dateSpanFilterSelector);

  return (
    dateSpanFilter && (
      <>
        <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <div className="resolutionSelect">
              <EuiCompressedFieldText
                className="resolutionSelectText"
                prepend="Span Interval"
                value={dateSpanFilter.span}
                isInvalid={dateSpanFilter.span < 1}
                onChange={(e) => dispatch(setDateSpan({ span: e.target.value }))}
                data-test-subj="metrics__spanValue"
                append={
                  <EuiCompressedSelect
                    className="resolutionSelectOption"
                    options={resolutionOptions}
                    value={dateSpanFilter.resolution}
                    onChange={(e) => dispatch(setDateSpan({ resolution: e.target.value }))}
                    aria-label="resolutionSelect"
                    data-test-subj="metrics__spanResolutionSelect"
                  />
                }
                aria-label="resolutionField"
              />
            </div>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiCompressedSuperDatePicker
                  dateFormat={uiSettingsService.get('dateFormat')}
                  start={dateSpanFilter.start}
                  end={dateSpanFilter.end}
                  onTimeChange={(dateSpan) => dispatch(setDateSpan(dateSpan))}
                  recentlyUsedRanges={dateSpanFilter.recentlyUsedRanges}
                  showUpdateButton={false}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="refresh"
                  aria-label="Refresh"
                  display="base"
                  onClick={() => dispatch(setDateSpan(dateSpanFilter))}
                  size="s"
                  data-test-subj="superDatePickerApplyTimeButton"
                  data-click-metric-element="metrics.refresh_button"
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <MetricsExport />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    )
  );
};
