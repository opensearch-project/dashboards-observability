/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import { selectCountDistribution } from '../../redux/slices/count_distribution_slice';
import { CountDistribution } from '../visualizations/count_distribution';
import { HitsCounter } from './hits_counter';
import { TimechartHeader } from './timechart_header';

interface TimechartProps {
  countDistribution: ReturnType<typeof selectCountDistribution>[string];
  timeIntervalOptions: Array<{ text: string; value: string }>;
  onChangeInterval: (interval: string) => void;
  selectedInterval: string;
  startTime?: string;
  endTime?: string;
}

export const Timechart: React.FC<TimechartProps> = (props) => {
  return (
    <>
      <HitsCounter
        hits={_.sum(props.countDistribution.data?.['count()'])}
        showResetButton={false}
        onResetQuery={() => {}}
      />
      <TimechartHeader
        options={props.timeIntervalOptions}
        onChangeInterval={props.onChangeInterval}
        stateInterval={props.selectedInterval}
        startTime={props.startTime}
        endTime={props.endTime}
      />
      <EuiSpacer size="s" />
      <CountDistribution
        countDistribution={props.countDistribution}
        selectedInterval={props.selectedInterval}
        startTime={props.startTime}
        endTime={props.endTime}
      />
    </>
  );
};
