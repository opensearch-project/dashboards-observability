/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EVENT_ANALYTICS,
  OBSERVABILITY_BASE,
  SAVED_NOTEBOOK,
  SAVED_OBJECTS
} from '../../../../../common/constants/shared';
import { getOSDHttp } from '../../../../../common/utils';
import { SavedObjectsCreateResponse, SavedObjectsUpdateResponse } from '../types';
import { PPLSavedObjectClient } from './ppl_client';

interface CommonParams {
  name: string;
  dateCreated: string;
  dateModified: string;
  backend: string;
  paragraphs: [];
  dateRange: [string, string];
}

type CreateParams = CommonParams & { applicationId: string };
type UpdateParams = CommonParams & { objectId: string };

export class PPLSavedNotebookClient extends PPLSavedObjectClient {
  private static instance: PPLSavedNotebookClient;

  async create(params: CreateParams): Promise<SavedObjectsCreateResponse> {
    return await this.client.post(
      `${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}${SAVED_NOTEBOOK}`,
      {
        body: JSON.stringify(
          this.buildRequestBody({
            name: params.name,
            dateCreated: params.dateCreated,
            dateModified: params.dateModified,
            backend: params.backend,
            paragraphs: params.paragraphs,
            dateRange: params.dateRange,
          })
        ),
      }
    );
  }

  async update(params: UpdateParams): Promise<SavedObjectsUpdateResponse> {
    return await this.client.put(
      `${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}${SAVED_NOTEBOOK}`,
      {
        body: JSON.stringify(
          this.buildRequestBody({
            name: params.name,
            dateCreated: params.dateCreated,
            dateModified: params.dateModified,
            backend: params.backend,
            paragraphs: params.paragraphs
          })
        ),
      }
    );
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new this(getOSDHttp());
    }
    return this.instance;
  }
}
