/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiHeaderSectionItemButton, EuiIcon } from '@elastic/eui';
import React, { useRef, useState } from 'react';
import { CoreStart } from '../../../../../src/core/public';
import { NavigationPublicPluginStart } from '../../../../../src/plugins/navigation/public';
import chatIcon from '../../assets/chat.svg';
import { ChatFlyout } from './chat_flyout';
import './index.scss';

interface HeaderChatButtonProps {
  core: CoreStart;
  navigation: NavigationPublicPluginStart;
}

interface IChatContext {
  setFlyoutVisible: React.Dispatch<React.SetStateAction<boolean>>;
}
export const ChatContext = React.createContext<IChatContext | null>(null);

export const HeaderChatButton: React.FC<HeaderChatButtonProps> = (props) => {
  const [appId, setAppId] = useState<string | undefined>();
  const [flyoutVisible, setFlyoutVisible] = useState(false);

  const prevId = useRef<string | undefined>();
  props.core.application.currentAppId$.subscribe({
    next(id) {
      if (prevId.current !== id) {
        prevId.current = id;
        setAppId(id);
        console.log('❗id:', id);
      }
    },
  });

  const onClick = () => {};

  return (
    <ChatContext.Provider value={{ setFlyoutVisible }}>
      <EuiHeaderSectionItemButton
        data-test-subj="llm-chat-header-button"
        onClick={() => setFlyoutVisible(!flyoutVisible)}
      >
        <EuiIcon type={chatIcon} size="l" />
      </EuiHeaderSectionItemButton>
      {flyoutVisible ? <ChatFlyout /> : null}
    </ChatContext.Provider>
  );
};
