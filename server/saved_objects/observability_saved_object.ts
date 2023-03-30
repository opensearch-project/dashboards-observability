/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsType } from '../../../../src/core/server';
import { VISUALIZATION_SAVED_OBJECT } from '../../common/types/observability_saved_object_attributes';

export const visualizationSavedObject: SavedObjectsType = {
  name: VISUALIZATION_SAVED_OBJECT,
  hidden: false,
  namespaceType: 'single',
  mappings: {
    dynamic: false,
    properties: {
      title: {
        type: 'text',
      },
      description: {
        type: 'text',
      },
      version: { type: 'integer' },
    },
  },
  migrations: {},
};
