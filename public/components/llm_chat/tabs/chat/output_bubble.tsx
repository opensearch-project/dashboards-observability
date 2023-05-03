/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiAvatar, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import React from 'react';

interface OutputBubbleProps {
  output: string;
}

export const OutputBubble: React.FC<OutputBubbleProps> = React.memo((props) => {
  return (
    <>
      <EuiFlexGroup gutterSize="m" justifyContent="flexStart" alignItems="flexStart">
        <EuiFlexItem grow={false}>
          <EuiAvatar name="llm" size="l" iconType="managementApp" color="#e9edf3" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPanel
            grow={false}
            paddingSize="l"
            color="plain"
            hasBorder
            className="llm-chat-bubble-panel llm-chat-bubble-panel-output"
          >
            <EuiText style={{ whiteSpace: 'pre-line' }}>{props.output}</EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
});
