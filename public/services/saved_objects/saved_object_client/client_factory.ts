/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VISUALIZATION_SAVED_OBJECT } from '../../../../common/types/observability_saved_object_attributes';
import { ISavedObjectsClient } from './client_interface';
import { OSDSavedObjectClient } from './osd_saved_objects/osd_saved_object_client';
import { OSDSavedVisualizationClient } from './osd_saved_objects/saved_visualization';
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
