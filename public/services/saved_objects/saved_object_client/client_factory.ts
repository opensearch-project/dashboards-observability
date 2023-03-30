/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOSDHttp, getOSDSavedObjectsClient } from '../../../../common/utils';
import { ISavedObjectsClient } from './client_interface';
import { OSDSavedVisualizationClient } from './osd_saved_objects/saved_visualization';
import { PPLSavedQueryClient, PPLSavedVisualizationClient } from './ppl';

type SavedObjectsClientType = 'osd' | 'ppl';
type SavedObjectsType = 'savedQuery' | 'savedVisualization';

interface GetSavedObjectsClientOptions {
  objectId: string;
  objectType: SavedObjectsType;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getTypeById = (objectId: string): SavedObjectsClientType => {
  if (UUID_REGEX.test(objectId)) {
    return 'osd';
  }
  return 'ppl';
};

let osdSavedVisualizationClient: OSDSavedVisualizationClient;
let pplSavedQueryClient: PPLSavedQueryClient;
let pplSavedVisualizationClient: PPLSavedVisualizationClient;

export const getSavedObjectsClient = (
  options: GetSavedObjectsClientOptions
): ISavedObjectsClient => {
  const clientType = getTypeById(options.objectId);

  if (clientType === 'osd') {
    if (osdSavedVisualizationClient === undefined) {
      osdSavedVisualizationClient = new OSDSavedVisualizationClient(getOSDSavedObjectsClient());
    }
    return osdSavedVisualizationClient;
  }

  switch (options.objectType) {
    case 'savedQuery':
      if (pplSavedQueryClient === undefined) {
        pplSavedQueryClient = new PPLSavedQueryClient(getOSDHttp());
      }
      return pplSavedQueryClient;
    default:
      if (pplSavedVisualizationClient === undefined) {
        pplSavedVisualizationClient = new PPLSavedVisualizationClient(getOSDHttp());
      }
      return pplSavedVisualizationClient;
  }
};
