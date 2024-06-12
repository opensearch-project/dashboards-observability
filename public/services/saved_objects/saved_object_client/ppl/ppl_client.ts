/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import has from 'lodash/has';
import isArray from 'lodash/isArray';
import isEmpty from 'lodash/isEmpty';
import { HttpStart } from '../../../../../../../src/core/public';
import {
  EVENT_ANALYTICS,
  OBSERVABILITY_BASE,
  SAVED_OBJECTS,
} from '../../../../../common/constants/shared';
import { ISavedObjectRequestParams } from '../../event_analytics/saved_objects';
import { SavedObjectClientBase } from '../client_base';
import { ISavedObjectsClient } from '../client_interface';
import {
  SavedObjectsDeleteBulkParams,
  SavedObjectsDeleteParams,
  SavedObjectsDeleteResponse,
  SavedObjectsGetResponse,
} from '../types';

const CONCAT_FIELDS = ['objectIdList', 'objectType'];

export class PPLSavedObjectClient extends SavedObjectClientBase implements ISavedObjectsClient {
  constructor(protected readonly client: HttpStart) {
    super();
  }

  create(params: any): Promise<any> {
    throw new Error('Method not implemented.');
  }

  get(params: ISavedObjectRequestParams): Promise<SavedObjectsGetResponse> {
    return this.client.get(`${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}`, {
      query: {
        ...params,
      },
    });
  }

  getBulk(params: ISavedObjectRequestParams): Promise<SavedObjectsGetResponse> {
    CONCAT_FIELDS.map((arrayField) => {
      this.stringifyList(params, arrayField, ',');
    });

    return this.client.get(`${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}`, {
      query: {
        ...params,
      },
    });
  }

  update(params: any): Promise<any> {
    throw new Error('Method not implemented.');
  }

  updateBulk(params: any): Promise<Array<Promise<any>>> {
    throw new Error('Method not implemented.');
  }

  delete(params: SavedObjectsDeleteParams): Promise<SavedObjectsDeleteResponse> {
    return this.client.delete(
      `${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}/${params.objectId}`
    );
  }

  deleteBulk(params: SavedObjectsDeleteBulkParams): Promise<SavedObjectsDeleteResponse> {
    return this.client.delete(
      `${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}/${params.objectIdList.join(',')}`
    );
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
    metricType = '',
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
      objRequest.object.userConfigs = userConfigs;
    }

    if (!isEmpty(subType)) {
      objRequest.object.subType = subType;
    }

    if (!isEmpty(metricType)) {
      objRequest.object.metricType = metricType;
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

  private stringifyList(targetObj: any, key: string, joinBy: string) {
    if (has(targetObj, key) && isArray(targetObj[key])) {
      targetObj[key] = targetObj[key].join(joinBy);
    }
    return targetObj;
  }
}
