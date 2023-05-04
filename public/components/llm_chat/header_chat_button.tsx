/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiHeaderSectionItemButton, EuiIcon } from '@elastic/eui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CoreStart, HttpStart, SavedObjectsClientContract } from '../../../../../src/core/public';
import { DashboardStart } from '../../../../../src/plugins/dashboard/public';
import chatIcon from '../../assets/chat.svg';
import { AppPluginStartDependencies } from '../../types';
import { ChatFlyout } from './chat_flyout';
import './index.scss';

interface HeaderChatButtonProps {
  core: CoreStart;
  startDeps: AppPluginStartDependencies;
}

interface IChatContext {
  http: HttpStart;
  savedObjectsClient: SavedObjectsClientContract;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
  setFlyoutVisible: React.Dispatch<React.SetStateAction<boolean>>;
  appId?: string;
  chatId?: string;
  setChatId: (chatId?: string) => void;
}
export const ChatContext = React.createContext<IChatContext | null>(null);

export const HeaderChatButton: React.FC<HeaderChatButtonProps> = (props) => {
  console.count('❗header chat button rerender');
  const [appId, setAppId] = useState<string>();
  const [chatId, setChatId] = useState<string>();
  const [flyoutVisible, setFlyoutVisible] = useState(false);
  const [input, setInput] = useState('');

  const prevId = useRef<string | undefined>();
  useEffect(() => {
    props.core.application.currentAppId$.subscribe({
      next(id) {
        if (prevId.current !== id) {
          prevId.current = id;
          setAppId(id);
        }
      },
    });
  }, []);

  const chatContextValue = useMemo(
    () => ({
      http: props.core.http,
      savedObjectsClient: props.core.savedObjects.client,
      DashboardContainerByValueRenderer:
        props.startDeps.dashboard.DashboardContainerByValueRenderer,
      setFlyoutVisible,
      appId,
      chatId,
      setChatId,
    }),
    [
      props.core.http,
      props.core.savedObjects.client,
      props.startDeps.dashboard.DashboardContainerByValueRenderer,
      setFlyoutVisible,
      appId,
      chatId,
      setChatId,
    ]
  );

  return (
    <>
      <EuiHeaderSectionItemButton
        data-test-subj="llm-chat-header-button"
        onClick={() => setFlyoutVisible(!flyoutVisible)}
      >
        <EuiIcon type={chatIcon} size="l" />
      </EuiHeaderSectionItemButton>
      <ChatContext.Provider value={chatContextValue}>
        {flyoutVisible ? <ChatFlyout input={input} setInput={setInput} /> : null}
      </ChatContext.Provider>
    </>
  );
};
