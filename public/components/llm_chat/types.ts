/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectAttributes } from '../../../../../src/core/types';

export interface ChatConversation extends SavedObjectAttributes {
  title: string;
  description: string;
  version: number;
  createdTimeMs: number;
  statements: Statement[];
}

export interface Statement extends SavedObjectAttributes {
  type: 'input' | 'output';
  content: string;
}
