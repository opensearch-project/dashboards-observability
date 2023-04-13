/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IField } from '../../../../../common/types/explorer';
import {
  OBSERVABILITY_BASE,
  EVENT_ANALYTICS,
  SAVED_OBJECTS,
  SAVED_VISUALIZATION,
} from '../../../../../common/constants/shared';
import { PPLSavedObjectClient } from './ppl_client';
import { SavedObjectsCreateResponse, SavedObjectsUpdateResponse } from '../types';
import { getOSDHttp } from '../../../../../common/utils';

interface CommonParams {
  query: string;
  fields: IField[];
  dateRange: [string, string];
  type: string;
  name: string;
  timestamp: string;
  applicationId: string;
  userConfigs: any;
  description: string;
  subType: string;
  unitsOfMeasure: string;
  selectedLabels: string;
}

type CreateParams = CommonParams & { applicationId: string };
type UpdateParams = CommonParams & { objectId: string };

export class PPLSavedVisualizationClient extends PPLSavedObjectClient {
  private static instance: PPLSavedVisualizationClient;

  async create(params: CreateParams): Promise<SavedObjectsCreateResponse> {
    return await this.client.post(
      `${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}${SAVED_VISUALIZATION}`,
      {
        body: JSON.stringify(
          this.buildRequestBody({
            query: params.query,
            fields: params.fields,
            dateRange: params.dateRange,
            chartType: params.type,
            name: params.name,
            timestamp: params.timestamp,
            applicationId: params.applicationId,
            userConfigs: params.userConfigs,
            description: params.description,
            subType: params.subType,
            unitsOfMeasure: params.unitsOfMeasure,
            selectedLabels: params.selectedLabels,
          })
        ),
      }
    );
  }

  async update(params: UpdateParams): Promise<SavedObjectsUpdateResponse> {
    return await this.client.put(
      `${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}${SAVED_VISUALIZATION}`,
      {
        body: JSON.stringify(
          this.buildRequestBody({
            query: params.query,
            fields: params.fields,
            dateRange: params.dateRange,
            chartType: params.type,
            name: params.name,
            timestamp: params.timestamp,
            userConfigs: params.userConfigs,
            description: params.description,
            subType: params.subType,
            unitsOfMeasure: params.unitsOfMeasure,
            selectedLabels: params.selectedLabels,
            objectId: params.objectId,
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
