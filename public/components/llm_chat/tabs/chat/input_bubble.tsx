/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiAvatar, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import React from 'react';

interface InputBubbleProps {
  input: string;
}

export const InputBubble: React.FC<InputBubbleProps> = React.memo((props) => {
  return (
    <>
      <EuiFlexGroup gutterSize="m" justifyContent="flexEnd" alignItems="flexStart">
        <EuiFlexItem grow={false}>
          <EuiPanel
            grow={false}
            paddingSize="l"
            color="plain"
            hasBorder
            className="llm-chat-bubble-panel llm-chat-bubble-panel-input"
          >
            <EuiText style={{ whiteSpace: 'pre-line' }}>Thanks! What’s new?</EuiText>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiAvatar name="llm" size="l" iconType="managementApp" color="plain" />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
});
