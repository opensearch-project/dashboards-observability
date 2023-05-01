/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTextArea,
} from '@elastic/eui';
import React from 'react';
import { ChatBubble } from './chat_bubble';

interface ChatPageProps {
  conversation: object;
}

export const ChatPage: React.FC<ChatPageProps> = (props) => {
  return (
    <>
      <EuiFlyoutBody>
        <EuiPage>
          <EuiPageBody component="div">
            {[...Array(50).keys()].map((i) => {
              return <ChatBubble i={i} />;
            })}
          </EuiPageBody>
        </EuiPage>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiSpacer />
        <EuiFlexGroup gutterSize="m" alignItems="flexEnd" justifyContent="spaceEvenly">
          <EuiFlexItem grow={false} />
          <EuiFlexItem grow={false}>
            <EuiButtonIcon size="m" iconSize="l" iconType="pin" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTextArea
              fullWidth
              compressed
              placeholder="Ask me anything.."
              style={{ height: '41px' }}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonIcon size="m" display="fill" iconType="sortRight" />
          </EuiFlexItem>
          <EuiFlexItem grow={false} />
        </EuiFlexGroup>
        <EuiSpacer />
      </EuiFlyoutFooter>
    </>
  );
};
