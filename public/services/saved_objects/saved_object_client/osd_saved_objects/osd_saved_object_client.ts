/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty } from 'lodash';
import {
  SavedObjectsClientContract,
  SimpleSavedObject,
} from '../../../../../../../src/core/public';
import { SavedObjectClientBase } from '../client_base';
import { SavedObjectsGetResponse, SavedObjectsCreateResponse } from '../types';

export class OSDSavedObjectClient extends SavedObjectClientBase {
  constructor(protected readonly client: SavedObjectsClientContract) {
    super();
  }
  create(params: unknown): Promise<SavedObjectsCreateResponse> {
    throw new Error('Method not implemented.');
  }
  get(params: unknown): Promise<SavedObjectsGetResponse> {
    throw new Error('Method not implemented.');
  }
  getBulk(params: unknown): Promise<SavedObjectsGetResponse> {
    throw new Error('Method not implemented.');
  }
  update(params: unknown): Promise<unknown> {
    throw new Error('Method not implemented.');
  }
  updateBulk(params: unknown): Promise<Array<Promise<unknown>>> {
    throw new Error('Method not implemented.');
  }
  delete(params: unknown): Promise<unknown> {
    throw new Error('Method not implemented.');
  }
  deleteBulk(params: unknown): Promise<unknown> {
    throw new Error('Method not implemented.');
  }
  convertToLastUpdatedMs(updatedAt: SimpleSavedObject['updated_at']) {
    return (updatedAt ? new Date(updatedAt) : new Date()).getTime();
  }
  buildRequestBody({
    query,
    fields,
    dateRange,
    timestamp,
    name = '',
    chartType = '',
    description = '',
    applicationId = '',
    userConfigs = '',
    subType = '',
    unitsOfMeasure = '',
    selectedLabels,
    objectId = '',
  }: any) {
    const objRequest: any = {
      object: {
        query,
        selected_date_range: {
          start: dateRange[0] || 'now/15m',
          end: dateRange[1] || 'now',
          text: '',
        },
        selected_timestamp: {
          name: timestamp || '',
          type: 'timestamp',
        },
        selected_fields: {
          tokens: fields,
          text: '',
        },
        name: name || '',
        description: description || '',
      },
    };

    if (!isEmpty(chartType)) {
      objRequest.object.type = chartType;
    }

    if (!isEmpty(applicationId)) {
      objRequest.object.application_id = applicationId;
    }

    if (!isEmpty(userConfigs)) {
      objRequest.object.user_configs = userConfigs;
    }

    if (!isEmpty(subType)) {
      objRequest.object.sub_type = subType;
    }

    if (!isEmpty(unitsOfMeasure)) {
      objRequest.object.units_of_measure = unitsOfMeasure;
    }

    if (!isEmpty(selectedLabels)) {
      objRequest.object.selected_labels = selectedLabels;
    }

    if (!isEmpty(objectId)) {
      objRequest.object_id = objectId;
    }

    return objRequest;
  }
}
