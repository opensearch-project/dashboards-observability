/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext, useEffect, useState } from 'react';
import { ChatContext } from '../header_chat_button';

export const useGetConversation = () => {
  const chatContext = useContext(ChatContext)!;
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState({});

  useEffect(() => {
    (async () => {
      console.log(chatContext.savedObjectsClient);
    })();
  });

  return { conversation, loading, error };
};
