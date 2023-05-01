/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import React from 'react';

interface ChatBubbleProps {
  input: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = (props) => {
  return (
    <>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiPanel
            grow={false}
            paddingSize="none"
            color="plain"
            hasBorder
            className="investigations-chat-dialog"
            style={{ backgroundColor: '#3a71e2' }}
          >
            <EuiText style={{ whiteSpace: 'pre-line' }}>{props.i}</EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
