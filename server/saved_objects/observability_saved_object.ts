/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsType } from '../../../../src/core/server';
import { observabilityID, observabilityLogsID } from '../../common/constants/shared';
import { VISUALIZATION_SAVED_OBJECT } from '../../common/types/observability_saved_object_attributes';

export const visualizationSavedObject: SavedObjectsType = {
  name: VISUALIZATION_SAVED_OBJECT,
  hidden: false,
  namespaceType: 'single',
  management: {
    defaultSearchField: 'title',
    importableAndExportable: true,
    icon: 'visQueryPPL',
    getTitle(obj) {
      return obj.attributes.title;
    },
    getInAppUrl(obj) {
      const editPath = `#/explorer/${VISUALIZATION_SAVED_OBJECT}:${obj.id}`;
      const editUrl = `/app/${observabilityLogsID}${editPath}`;
      return {
        path: editUrl,
        uiCapabilitiesPath: 'observability.show',
      };
    },
  },
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
