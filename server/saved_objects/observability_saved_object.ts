/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsType } from '../../../../src/core/server';
import { observabilityLogsID } from '../../common/constants/shared';
import {
  NOTEBOOK_SAVED_OBJECT,
  NOTEBOOK_SAVED_OBJECT_PATH,
  SEARCH_SAVED_OBJECT,
  VISUALIZATION_SAVED_OBJECT,
} from '../../common/types/observability_saved_object_attributes';

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

export const searchSavedObject: SavedObjectsType = {
  name: SEARCH_SAVED_OBJECT,
  icon: 'editorCodeBlock',
  hidden: false,
  namespaceType: 'single',
  management: {
    defaultSearchField: 'title',
    importableAndExportable: true,
    getTitle(obj) {
      return obj.attributes.title;
    },
    getInAppUrl(obj) {
      const editPath = `#/explorer/${SEARCH_SAVED_OBJECT}:${obj.id}`;
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

export const notebookSavedObject: SavedObjectsType = {
  name: NOTEBOOK_SAVED_OBJECT,
  hidden: false,
  namespaceType: 'single',
  management: {
    defaultSearchField: 'title',
    importableAndExportable: true,
    icon: 'notebookApp',
    getTitle(obj) {
      return obj.attributes.title;
    },
    getInAppUrl(obj) {
      const editUrl = `/app/${NOTEBOOK_SAVED_OBJECT_PATH}#/${obj.id}?view=view_both`;
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
