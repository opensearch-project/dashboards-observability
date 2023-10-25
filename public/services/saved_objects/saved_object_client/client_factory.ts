/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SEARCH_SAVED_OBJECT,
  VISUALIZATION_SAVED_OBJECT,
} from '../../../../common/types/observability_saved_object_attributes';
import { ISavedObjectsClient } from './client_interface';
import { OSDSavedObjectClient } from './osd_saved_objects/osd_saved_object_client';
import { OSDSavedVisualizationClient } from './osd_saved_objects/saved_visualization';
import { OSDSavedSearchClient } from './osd_saved_objects/saved_searches';
import { PPLSavedQueryClient, PPLSavedVisualizationClient } from './ppl';

interface GetSavedObjectsClientOptions {
  objectId: string;
  objectType?: string; // only required for non OSD saved objects
}

export const getSavedObjectsClient = (
  options: GetSavedObjectsClientOptions
): ISavedObjectsClient => {
  const type = OSDSavedObjectClient.extractType(options.objectId);

  switch (type) {
    case VISUALIZATION_SAVED_OBJECT:
      return OSDSavedVisualizationClient.getInstance();
    case SEARCH_SAVED_OBJECT:
      return OSDSavedSearchClient.getInstance();

    default:
      break;
  }

  switch (options.objectType) {
    case 'savedVisualization':
      return PPLSavedVisualizationClient.getInstance();

    default:
      return PPLSavedQueryClient.getInstance();
  }
};
