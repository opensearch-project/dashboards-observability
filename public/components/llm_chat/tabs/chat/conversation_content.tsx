/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiMarkdownFormat, EuiText } from '@elastic/eui';
import moment from 'moment';
import React, { useContext, useEffect, useState } from 'react';
import { DashboardContainerInput } from '../../../../../../../src/plugins/dashboard/public';
import { uiSettingsService } from '../../../../../common/utils';
import { ChatContext } from '../../header_chat_button';
import { IConversation } from '../../types';

interface ConversationContentProps {
  conversation: IConversation;
}

export const ConversationContent: React.FC<ConversationContentProps> = React.memo((props) => {
  console.count('❗conversation content rerender:');
  const chatContext = useContext(ChatContext)!;
  const [visInput, setVisInput] = useState<DashboardContainerInput>();

  useEffect(() => {
    if (props.conversation.contentType === 'visualization') {
      setVisInput(JSON.parse(props.conversation.content));
    }
  }, [props.conversation]);

  switch (props.conversation.contentType) {
    case 'text':
      return <EuiText style={{ whiteSpace: 'pre-line' }}>{props.conversation.content}</EuiText>;

    case 'markdown':
      return <EuiMarkdownFormat>{props.conversation.content}</EuiMarkdownFormat>;

    case 'visualization':
      const dateFormat = uiSettingsService.get('dateFormat');
      let from = moment(visInput?.timeRange?.from).format(dateFormat);
      let to = moment(visInput?.timeRange?.to).format(dateFormat);
      from = from === 'Invalid date' ? visInput?.timeRange.from : from;
      to = to === 'Invalid date' ? visInput?.timeRange.to : to;
      return (
        <>
          <EuiText size="s">{`${from} - ${to}`}</EuiText>
          <chatContext.DashboardContainerByValueRenderer
            input={JSON.parse(props.conversation.content)}
            onInputUpdated={setVisInput}
          />
        </>
      );

    default:
      return null;
  }
});
