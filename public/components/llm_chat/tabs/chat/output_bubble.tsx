/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiAvatar, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import React from 'react';

interface OutputBubbleProps {
  input: string;
}

export const OutputBubble: React.FC<OutputBubbleProps> = React.memo((props) => {
  console.log('❗output rerender:');
  return (
    <>
      <EuiFlexGroup gutterSize="m" justifyContent="flexStart" alignItems="flexStart">
        <EuiFlexItem grow={false}>
          <EuiAvatar name="llm" size="l" iconType="managementApp" color="plain" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPanel
            grow={false}
            paddingSize="l"
            color="plain"
            hasBorder
            className="llm-chat-bubble-panel llm-chat-bubble-panel-output"
          >
            <EuiText style={{ whiteSpace: 'pre-line' }}>
              Welcome back! What would you like to chat about?
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
});
