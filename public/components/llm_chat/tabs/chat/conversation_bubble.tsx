/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiAvatar, EuiFlexGroup, EuiFlexItem, EuiPanel } from '@elastic/eui';
import React from 'react';
import userAvatar from '../../../../assets/user_avatar.svg';
import { IConversation } from '../../types';

interface ConversationBubbleProps {
  type: IConversation['type'];
  contentType: IConversation['contentType'];
}

export const ConversationBubble: React.FC<ConversationBubbleProps> = React.memo((props) => {
  console.count('❗conversation rerender:');
  if (props.type === 'input') {
    return (
      <EuiFlexGroup gutterSize="m" justifyContent="flexEnd" alignItems="flexStart">
        <EuiFlexItem grow={false}>
          <EuiPanel
            grow={false}
            paddingSize="l"
            color="plain"
            hasBorder
            className="llm-chat-bubble-panel llm-chat-bubble-panel-input"
          >
            {props.children}
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiAvatar name="user" size="l" iconType={userAvatar} color="#e9edf3" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (props.contentType === 'visualization') {
    return <>{props.children}</>;
  }

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
            {props.children}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
});
