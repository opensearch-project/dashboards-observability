/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiAvatar, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiPanel, EuiText } from '@elastic/eui';
import React from 'react';
import userAvatar from '../../../../assets/user_avatar.svg';

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
            <EuiText style={{ whiteSpace: 'pre-line' }}>{props.input}</EuiText>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiAvatar name="user" size="l" iconType={userAvatar} color="#e9edf3" />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
});
