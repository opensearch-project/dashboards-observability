/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiMarkdownFormat, EuiText } from '@elastic/eui';
import moment from 'moment';
import React, { useContext, useEffect, useState } from 'react';
import { DashboardContainerInput } from '../../../../../../../src/plugins/dashboard/public';
import { SavedVisualization } from '../../../../../common/types/explorer';
import { uiSettingsService } from '../../../../../common/utils';
import { SavedObjectVisualization } from '../../../visualizations/saved_object_visualization';
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

    case 'ppl_visualization':
      const savedVisualization: SavedVisualization = {
        query: props.conversation.content,
        selected_date_range: { start: 'now-15m', end: 'now', text: '' },
        selected_timestamp: { name: 'timestamp', type: 'timestamp' },
        selected_fields: { tokens: [], text: '' },
        name: 'Flight count by destination',
        description: '',
        type: 'bar',
        sub_type: 'visualization',
      };
      return (
        <SavedObjectVisualization
          savedVisualization={savedVisualization}
          timeRange={{
            from: savedVisualization.selected_date_range.start,
            to: savedVisualization.selected_date_range.end,
          }}
        />
      );

    default:
      return null;
  }
});
