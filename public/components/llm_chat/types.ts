/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectAttributes } from '../../../../../src/core/types';

export interface IChat extends SavedObjectAttributes {
  title: string;
  version: number;
  createdTimeMs: number;
  conversations: IConversation[];
}

export interface IConversation extends SavedObjectAttributes {
  type: 'input' | 'output';
  content: string;
}
