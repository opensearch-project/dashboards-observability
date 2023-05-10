/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiHeaderSectionItemButton, EuiIcon } from '@elastic/eui';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useEffectOnce } from 'react-use';
import {
  ApplicationStart,
  HttpStart,
  SavedObjectsClientContract,
} from '../../../../../src/core/public';
import { DashboardStart } from '../../../../../src/plugins/dashboard/public';
import { IMessage } from '../../../common/types/observability_saved_object_attributes';
import chatIcon from '../../assets/chat.svg';
import { ChatFlyout } from './chat_flyout';
import { TabId } from './components/chat_tab_bar';
import './index.scss';

interface HeaderChatButtonProps {
  application: ApplicationStart;
}

interface ICoreServicesContext {
  http: HttpStart;
  savedObjectsClient: SavedObjectsClientContract;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
}
export const CoreServicesContext = React.createContext<ICoreServicesContext | null>(null);

interface IChatContext {
  appId?: string;
  chatId?: string;
  setChatId: React.Dispatch<React.SetStateAction<string | undefined>>;
  flyoutVisible: boolean;
  setFlyoutVisible: React.Dispatch<React.SetStateAction<boolean>>;
  selectedTabId: TabId;
  setSelectedTabId: React.Dispatch<React.SetStateAction<TabId>>;
}
export const ChatContext = React.createContext<IChatContext | null>(null);

interface IChatStateContext {
  chatState: ChatState;
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>;
}
export const ChatStateContext = React.createContext<IChatStateContext | null>(null);

/**
 * state for messages cached in browser.
 *
 * @property persisted - whether messages have been saved to index, which happens when
 * user sends input to LLM. It is used to determine when to reset local state for messages
 */
export interface ChatState {
  messages: IMessage[];
  llmResponding: boolean;
  llmError?: Error;
  persisted: boolean;
}

export const HeaderChatButton: React.FC<HeaderChatButtonProps> = (props) => {
  console.count('header chat button rerender');
  const [appId, setAppId] = useState<string>();
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState<string>();
  const [flyoutVisible, setFlyoutVisible] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState<TabId>('chat');
  const [chatState, setChatState] = useState<ChatState>({
    messages: [
      {
        content: `Hello, I'm the Observability assistant.\n\nHow may I help you?`,
        contentType: 'markdown',
        type: 'output',
        suggestedActions: [
          { message: 'Answer questions about my system', actionType: 'send_as_input' },
          { message: 'Show me all services', actionType: 'send_as_input' },
        ],
      },
    ],
    llmResponding: false,
    persisted: false,
  });

  useEffectOnce(() => {
    const subscription = props.application.currentAppId$.subscribe((id) => setAppId(id));
    return () => subscription.unsubscribe();
  });

  const chatContextValue: IChatContext = useMemo(
    () => ({
      appId,
      chatId,
      setChatId,
      flyoutVisible,
      setFlyoutVisible,
      selectedTabId,
      setSelectedTabId,
    }),
    [appId, chatId, flyoutVisible, selectedTabId]
  );

  const chatStateContextValue: IChatStateContext = useMemo(
    () => ({
      chatState,
      setChatState,
    }),
    [chatState]
  );

  return (
    <>
      <EuiHeaderSectionItemButton
        className={classNames('llm-chat-header-icon-wrapper', {
          'llm-chat-header-icon-wrapper-selected': flyoutVisible,
        })}
        onClick={() => setFlyoutVisible(!flyoutVisible)}
      >
        <EuiIcon type={chatIcon} size="l" />
      </EuiHeaderSectionItemButton>
      <ChatContext.Provider value={chatContextValue}>
        <ChatStateContext.Provider value={chatStateContextValue}>
          {flyoutVisible ? <ChatFlyout input={input} setInput={setInput} /> : null}
        </ChatStateContext.Provider>
      </ChatContext.Provider>
    </>
  );
};
