/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiTextArea } from '@elastic/eui';
import autosize from 'autosize';
import React, { useEffect, useRef } from 'react';

interface ChatInputControlsProps {
  input: string;
  setInput: (input: string) => void;
  onSumbit: () => void;
  disabled: boolean;
}

export const ChatInputControls: React.FC<ChatInputControlsProps> = (props) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (inputRef.current) autosize(inputRef.current);
  }, []);

  useEffect(() => {
    if (props.input.length === 0 && inputRef.current) inputRef.current.style.height = '40px';
  }, [props.input]);

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
          value={props.input}
          onChange={(e) => props.setInput(e.target.value)}
          inputRef={inputRef}
          style={{ minHeight: 40 }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!props.disabled) props.onSumbit();
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
          onClick={props.onSumbit}
          isDisabled={props.disabled}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false} />
    </EuiFlexGroup>
  );
};
