/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiI18nNumber,
  EuiPopover,
  EuiText,
} from '@elastic/eui';
import { round } from 'lodash';
import React, { useState } from 'react';
import { ServiceTrends } from '../../../../../common/types/trace_analytics';
import { LatencyPlt } from '../common/plots/latency_trend_plt';

interface ServiceTrendsPlotsProps {
  item: any;
  row: any;
  isServiceTrendEnabled: boolean;
  fieldType: 'average_latency' | 'error_rate' | 'throughput';
  serviceTrends: ServiceTrends;
}

export const ServiceTrendsPlots = ({
  item,
  row,
  isServiceTrendEnabled,
  fieldType,
  serviceTrends,
}: ServiceTrendsPlotsProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  return (
    <EuiFlexGroup gutterSize="s">
      <EuiFlexItem grow={false}>
        {fieldType === 'average_latency' && (item === 0 || item ? round(item, 2) : '-')}
        {fieldType === 'error_rate' &&
          (item === 0 || item ? <EuiText size="s">{`${round(item, 2)}%`}</EuiText> : '-')}
        {fieldType === 'throughput' && (item === 0 || item ? <EuiI18nNumber value={item} /> : '-')}
      </EuiFlexItem>
      {isServiceTrendEnabled && (
        <EuiFlexItem grow={false}>
          <EuiPopover
            ownFocus
            anchorPosition="downCenter"
            button={
              <EuiButtonIcon
                aria-label="Open popover"
                onClick={() => setIsPopoverOpen(true)}
                iconType="magnifyWithPlus"
                size="s"
              />
            }
            isOpen={isPopoverOpen}
            closePopover={() => setIsPopoverOpen(false)}
          >
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiText size="s">
                  {fieldType === 'average_latency' && '24hr latency trend'}
                  {fieldType === 'error_rate' && '24hr error rate trend'}
                  {fieldType === 'throughput' && '24hr throughput trend'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  aria-label="Close popover"
                  iconType="cross"
                  color="text"
                  onClick={() => setIsPopoverOpen(false)}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <LatencyPlt data={item.popoverData} />
          </EuiPopover>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
