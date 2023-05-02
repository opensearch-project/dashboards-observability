/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem, EuiFlyoutBody, EuiFlyoutFooter, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React from 'react';
import { ChatInputControls } from './chat_input_controls';
import { ChatPageContent } from './chat_page_content';
import { InputBubble } from './input_bubble';
import { OutputBubble } from './output_bubble';

interface ChatPageProps {
  input: string;
  setInput: (input: string) => void;
}

export const ChatPage: React.FC<ChatPageProps> = (props) => {
  return (
    <>
      <EuiFlyoutBody>
        <EuiPage>
          <EuiPageBody component="div">
            <ChatPageContent />
          </EuiPageBody>
        </EuiPage>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiSpacer />
        <ChatInputControls
          input={props.input}
          setInput={props.setInput}
          onSumbit={() => {
            props.setInput('');
          }}
        />
        <EuiSpacer />
      </EuiFlyoutFooter>
    </>
  );
};
