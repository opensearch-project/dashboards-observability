/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiI18nNumber,
  EuiPopover,
  EuiText,
} from '@elastic/eui';
import { round } from 'lodash';
import React, { useState } from 'react';
import { ServiceTrends } from '../../../../../common/types/trace_analytics';
import { NoMatchMessage } from '../common/helper_functions';
import { ErrorTrendPlt } from '../common/plots/error_rate_plt';
import { LatencyPlt } from '../common/plots/latency_trend_plt';
import { ThroughputTrendPlt } from '../common/plots/throughput_plt';

interface ServiceTrendsPlotsProps {
  item: any;
  row: any;
  isServiceTrendEnabled: boolean;
  fieldType: 'average_latency' | 'error_rate' | 'throughput';
  serviceTrends?: ServiceTrends;
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
    <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
      <EuiFlexItem grow={false}>
        <EuiText
          color={isServiceTrendEnabled && !isPopoverOpen ? 'success' : 'default'}
          onMouseEnter={() => setIsPopoverOpen(true)}
          onMouseLeave={() => setIsPopoverOpen(false)}
        >
          {fieldType === 'average_latency' && (item === 0 || item ? round(item, 2) : '-')}
          {fieldType === 'error_rate' &&
            (item === 0 || item ? <EuiText size="s">{`${round(item, 2)}%`}</EuiText> : '-')}
          {fieldType === 'throughput' &&
            (item === 0 || item ? <EuiI18nNumber value={item} /> : '-')}
        </EuiText>
      </EuiFlexItem>
      {isServiceTrendEnabled && serviceTrends && (
        <EuiFlexItem grow={false}>
          <EuiPopover
            ownFocus
            anchorPosition="downCenter"
            isOpen={isPopoverOpen}
            closePopover={() => setIsPopoverOpen(false)}
          >
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  {fieldType === 'average_latency' && '24hr latency trend'}
                  {fieldType === 'error_rate' && '24hr error rate trend'}
                  {fieldType === 'throughput' && '24hr throughput trend'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSmallButtonIcon
                  aria-label="Close popover"
                  iconType="cross"
                  color="text"
                  onClick={() => setIsPopoverOpen(false)}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            {fieldType === 'average_latency' &&
              (serviceTrends[row.name]?.latency_trend ? (
                <LatencyPlt data={[serviceTrends[row.name]?.latency_trend]} />
              ) : (
                <NoMatchMessage size="s" />
              ))}
            {fieldType === 'error_rate' &&
              (serviceTrends[row.name]?.error_rate ? (
                <ErrorTrendPlt
                  onClick={() => {}}
                  items={{
                    items: serviceTrends[row.name]?.error_rate
                      ? [serviceTrends[row.name]?.error_rate]
                      : [],
                    fixedInterval: '1h',
                  }}
                  isPanel={false}
                />
              ) : (
                <NoMatchMessage size="s" />
              ))}
            {fieldType === 'throughput' &&
              (serviceTrends[row.name]?.throughput ? (
                <ThroughputTrendPlt
                  onClick={() => {}}
                  items={{
                    items: serviceTrends[row.name]?.throughput
                      ? [serviceTrends[row.name]?.throughput]
                      : [],
                    fixedInterval: '1h',
                  }}
                  isPanel={false}
                />
              ) : (
                <NoMatchMessage size="s" />
              ))}
          </EuiPopover>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
