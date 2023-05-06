/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiHeaderSectionItemButton, EuiIcon } from '@elastic/eui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApplicationStart,
  HttpStart,
  SavedObjectsClientContract,
} from '../../../../../src/core/public';
import { DashboardStart } from '../../../../../src/plugins/dashboard/public';
import { IConversation } from '../../../common/types/observability_saved_object_attributes';
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

interface IConversationContext {
  localConversations: IConversation[];
  setLocalConversations: React.Dispatch<React.SetStateAction<IConversation[]>>;
}
export const ConversationContext = React.createContext<IConversationContext | null>(null);

export const HeaderChatButton: React.FC<HeaderChatButtonProps> = (props) => {
  console.count('header chat button rerender');
  const [appId, setAppId] = useState<string>();
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState<string>();
  const [flyoutVisible, setFlyoutVisible] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState<TabId>('chat');
  const [localConversations, setLocalConversations] = useState<IConversation[]>([]);

  const prevId = useRef<string | undefined>();
  useEffect(() => {
    props.application.currentAppId$.subscribe({
      next(id) {
        if (prevId.current !== id) {
          prevId.current = id;
          setAppId(id);
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const conversationContextValue: IConversationContext = useMemo(
    () => ({
      localConversations,
      setLocalConversations,
    }),
    [localConversations]
  );

  return (
    <>
      <EuiHeaderSectionItemButton onClick={() => setFlyoutVisible(!flyoutVisible)}>
        <EuiIcon type={chatIcon} size="l" />
      </EuiHeaderSectionItemButton>
      <ChatContext.Provider value={chatContextValue}>
        <ConversationContext.Provider value={conversationContextValue}>
          {flyoutVisible ? <ChatFlyout input={input} setInput={setInput} /> : null}
        </ConversationContext.Provider>
      </ChatContext.Provider>
    </>
  );
};
