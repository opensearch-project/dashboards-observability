/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiMarkdownFormat, EuiText } from '@elastic/eui';
import moment from 'moment';
import React, { useContext, useEffect, useState } from 'react';
import { DashboardContainerInput } from '../../../../../../../src/plugins/dashboard/public';
import { SavedVisualization } from '../../../../../common/types/explorer';
import { IMessage } from '../../../../../common/types/observability_saved_object_attributes';
import { uiSettingsService } from '../../../../../common/utils';
import { SavedObjectVisualization } from '../../../visualizations/saved_object_visualization';
import { CoreServicesContext } from '../../chat_header_button';

interface MessageContentProps {
  message: IMessage;
}

export const MessageContent: React.FC<MessageContentProps> = React.memo((props) => {
  console.count('message content rerender:');
  const coreServicesContext = useContext(CoreServicesContext)!;
  const [visInput, setVisInput] = useState<DashboardContainerInput>();

  useEffect(() => {
    if (props.message.contentType === 'visualization') {
      setVisInput(JSON.parse(props.message.content));
    }
  }, [props.message]);

  switch (props.message.contentType) {
    case 'text':
      return <EuiText style={{ whiteSpace: 'pre-line' }}>{props.message.content}</EuiText>;

    case 'markdown':
      // TODO maybe remove emoji from defaultParsingPlugins https://github.com/opensearch-project/oui/blob/8605d70ce89fa5633a90bdec0931c95d1683c48d/src/components/markdown_editor/plugins/markdown_default_plugins.tsx#LL66C31-L66C31
      return <EuiMarkdownFormat>{props.message.content}</EuiMarkdownFormat>;

    case 'visualization':
      const dateFormat = uiSettingsService.get('dateFormat');
      let from = moment(visInput?.timeRange?.from).format(dateFormat);
      let to = moment(visInput?.timeRange?.to).format(dateFormat);
      from = from === 'Invalid date' ? visInput?.timeRange.from : from;
      to = to === 'Invalid date' ? visInput?.timeRange.to : to;
      return (
        <>
          <EuiText size="s">{`${from} - ${to}`}</EuiText>
          <div className="llm-chat-visualizations">
            <coreServicesContext.DashboardContainerByValueRenderer
              input={JSON.parse(props.message.content)}
              onInputUpdated={setVisInput}
            />
          </div>
        </>
      );

    case 'ppl_visualization':
      const savedVisualization: SavedVisualization = {
        query: props.message.content,
        selected_date_range: { start: 'now-14d', end: 'now', text: '' },
        selected_timestamp: { name: 'timestamp', type: 'timestamp' },
        selected_fields: { tokens: [], text: '' },
        name: 'Flight count by destination',
        description: '',
        type: 'line',
        sub_type: 'visualization',
      };
      return (
        <div className="llm-chat-visualizations" style={{ minHeight: 450 }}>
          <SavedObjectVisualization
            savedVisualization={savedVisualization}
            timeRange={{
              from: savedVisualization.selected_date_range.start,
              to: savedVisualization.selected_date_range.end,
            }}
          />
        </div>
      );

    default:
      return null;
  }
});
