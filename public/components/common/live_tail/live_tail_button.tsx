/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Define pop over interval options for live tail button in your plugin

import { EuiSmallButton } from '@elastic/eui';
import React, { useMemo } from 'react';
import { LiveTailProps } from 'common/types/explorer';

// Live Tail Button
export const LiveTailButton = ({
  isLiveTailOn,
  isLiveTailPopoverOpen,
  setIsLiveTailPopoverOpen,
  liveTailName,
  dataTestSubj,
}: LiveTailProps) => {
  const liveButton = useMemo(() => {
    return (
      <EuiSmallButton
        iconType={isLiveTailOn ? 'stop' : 'clock'}
        iconSide="left"
        onClick={() => setIsLiveTailPopoverOpen(!isLiveTailPopoverOpen)}
        data-test-subj={dataTestSubj}
      >
        {liveTailName}
      </EuiSmallButton>
    );
  }, [isLiveTailPopoverOpen, isLiveTailOn]);
  return liveButton;
};

export const StopLiveButton = (props: any) => {
  const { StopLive, dataTestSubj } = props;

  const stopButton = () => {
    return (
      <EuiSmallButton
        iconType="stop"
        onClick={() => StopLive()}
        color="danger"
        data-test-subj={dataTestSubj}
      >
        Stop
      </EuiSmallButton>
    );
  };
  return stopButton();
};

export const sleep = (milliseconds: number | undefined) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};
