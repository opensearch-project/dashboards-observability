/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectAttributes } from '../../../../src/core/types';
import { SavedVisualization } from './explorer';

export const VISUALIZATION_SAVED_OBJECT = 'observability-visualization';
export const CHAT_SAVED_OBJECT = 'observability-chat';
export const OBSERVABILTY_SAVED_OBJECTS = [VISUALIZATION_SAVED_OBJECT, CHAT_SAVED_OBJECT] as const;
export const SAVED_OBJECT_VERSION = 1;

export interface VisualizationSavedObjectAttributes extends SavedObjectAttributes {
  title: string;
  description: string;
  version: number;
  createdTimeMs: number;
  savedVisualization: SavedVisualization;
}
