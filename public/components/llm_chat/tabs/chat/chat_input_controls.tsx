/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiTextArea } from '@elastic/eui';
import autosize from 'autosize';
import React, { useContext, useEffect, useRef } from 'react';
import { IMessage } from '../../../../../common/types/observability_saved_object_attributes';
import { ChatContext } from '../../header_chat_button';
import { useChatActions } from '../../hooks/use_chat_actions';

interface ChatInputControlsProps {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  disabled: boolean;
}

export const ChatInputControls: React.FC<ChatInputControlsProps> = (props) => {
  console.count('chat input controls rerender');
  const chatContext = useContext(ChatContext)!;
  const { send } = useChatActions();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = props.input;
      autosize(inputRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async () => {
    const userInput = inputRef.current?.value.trim();
    if (!userInput) return;

    const inputMessage: IMessage = {
      type: 'input',
      content: userInput,
      contentType: 'text',
      context: {
        appId: chatContext.appId,
      },
    };
    props.setInput('');
    inputRef.current!.value = '';
    inputRef.current!.style.height = '40px';
    send(inputMessage);
  };

  return (
    <EuiFlexGroup gutterSize="m" alignItems="flexEnd" justifyContent="spaceEvenly">
      <EuiFlexItem grow={false} />
      <EuiFlexItem>
        <EuiTextArea
          fullWidth
          rows={1}
          compressed
          autoFocus
          placeholder="Ask me anything..."
          inputRef={inputRef}
          onBlur={(e) => props.setInput(e.target.value)}
          style={{ minHeight: 40 }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!props.disabled) onSubmit();
            }
          }}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonIcon
          aria-label="send"
          size="m"
          display="fill"
          iconType="sortRight"
          onClick={onSubmit}
          isDisabled={props.disabled}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false} />
    </EuiFlexGroup>
  );
};
