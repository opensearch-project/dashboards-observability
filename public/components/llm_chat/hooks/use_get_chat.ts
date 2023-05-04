/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext, useEffect, useReducer } from 'react';
import {
  SavedObjectsFindOptions,
  SavedObjectsFindResponsePublic,
  SimpleSavedObject,
} from '../../../../../../src/core/public';
import { CHAT_SAVED_OBJECT } from '../../../../common/types/observability_saved_object_attributes';
import { ChatContext } from '../header_chat_button';
import { IChat } from '../types';

interface State<T> {
  data?: T;
  loading: boolean;
  error?: Error;
}

type Action<T> =
  | { type: 'request' }
  | { type: 'success'; payload: State<T>['data'] }
  | { type: 'failure'; error: Required<State<T>['error']> };

// TODO use instantiation expressions when typescript is upgraded to >= 4.7
type Reducer<T = any> = (state: State<T>, action: Action<T>) => State<T>;
const genericReducer: Reducer = (state, action) => {
  switch (action.type) {
    case 'request':
      return { loading: true };
    case 'success':
      return { loading: false, data: action.payload };
    case 'failure':
      return { loading: false, error: action.error };
    default:
      return state;
  }
};

export const useGetChat = () => {
  const chatContext = useContext(ChatContext)!;
  const reducer: Reducer<SimpleSavedObject<IChat>> = genericReducer;
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

export const useBulkGetChat = (options: Partial<SavedObjectsFindOptions> = {}) => {
  const chatContext = useContext(ChatContext)!;
  const reducer: Reducer<SavedObjectsFindResponsePublic<IChat>> = genericReducer;
  const [state, dispatch] = useReducer(reducer, { loading: false });

  useEffect(() => {
    dispatch({ type: 'request' });

    chatContext.savedObjectsClient
      .find<IChat>({ ...options, type: CHAT_SAVED_OBJECT })
      .then((payload) => dispatch({ type: 'success', payload }))
      .catch((error) => dispatch({ type: 'failure', error }));
  }, [options]);

  return { ...state };
};
