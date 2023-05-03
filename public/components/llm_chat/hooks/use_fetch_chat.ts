/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Reducer, useContext, useEffect, useReducer } from 'react';
import { SimpleSavedObject } from '../../../../../../src/core/public';
import { CHAT_SAVED_OBJECT } from '../../../../common/types/observability_saved_object_attributes';
import { ChatContext } from '../header_chat_button';
import { IChat } from '../types';

interface FetchChatState {
  chat?: SimpleSavedObject<IChat>;
  loading: boolean;
  error?: Error;
}

type FetchChatAction =
  | { type: 'request' }
  | { type: 'success'; payload: FetchChatState['chat'] }
  | { type: 'failure'; error: Required<FetchChatState['error']> };

const reducer: Reducer<FetchChatState, FetchChatAction> = (state, action) => {
  switch (action.type) {
    case 'request':
      return { loading: true };
    case 'success':
      return { loading: false, chat: action.payload };
    case 'failure':
      return { loading: false, error: action.error };
    default:
      return state;
  }
};

export const useFetchChat = () => {
  const chatContext = useContext(ChatContext)!;
  const [state, dispatch] = useReducer(reducer, { loading: false });

  useEffect(() => {
    console.log('❗chatId:', chatContext.chatId);
    dispatch({ type: 'request' });
    if (!chatContext.chatId) {
      dispatch({ type: 'success', payload: undefined });
      return;
    }

    chatContext.savedObjectsClient
      .get<IChat>(CHAT_SAVED_OBJECT, chatContext.chatId)
      .then((payload) => dispatch({ type: 'success', payload }))
      .catch((error) => dispatch({ type: 'failure', error }));
  }, [chatContext.chatId]);

  return { ...state };
};
