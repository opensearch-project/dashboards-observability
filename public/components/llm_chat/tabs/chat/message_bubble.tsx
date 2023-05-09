/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiAvatar, EuiFlexGroup, EuiFlexItem, EuiPanel } from '@elastic/eui';
import React from 'react';
import { IMessage } from '../../../../../common/types/observability_saved_object_attributes';
import userAvatar from '../../../../assets/user_avatar.svg';
import llmAvatar from '../../../../assets/llm_avatar.svg';

interface MessageBubbleProps {
  type: IMessage['type'];
  contentType: IMessage['contentType'];
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo((props) => {
  console.count('message rerender:');
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

  if (['visualization', 'ppl_visualization'].includes(props.contentType)) {
    return <>{props.children}</>;
  }

  return (
    <>
      <EuiFlexGroup gutterSize="m" justifyContent="flexStart" alignItems="flexStart">
        <EuiFlexItem grow={false}>
          <EuiAvatar name="llm" size="l" iconType={llmAvatar} iconSize="xxl" color="#e9edf3" />
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
