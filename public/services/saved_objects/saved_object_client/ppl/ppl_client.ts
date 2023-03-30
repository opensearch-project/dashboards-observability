/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty } from 'lodash';
import { HttpStart } from '../../../../../../../src/core/public';
import {
  EVENT_ANALYTICS,
  OBSERVABILITY_BASE,
  SAVED_OBJECTS,
} from '../../../../../common/constants/shared';
import { SavedObjectClientBase } from '../client_base';
import { ISavedObjectsClient } from '../client_interface';

export class PPLSavedObjectClient extends SavedObjectClientBase implements ISavedObjectsClient {
  constructor(protected readonly client: HttpStart) {
    super();
  }
  create(params: any): Promise<any> {
    throw new Error('Method not implemented.');
  }
  get(params: any): Promise<any> {
    return this.client.get(`${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}`, {
      query: {
        ...params,
      },
    });
  }
  getBulk(params: any): Promise<any> {
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
  delete(params: any): Promise<any> {
    throw new Error('Method not implemented.');
  }
  deleteBulk(params: any): Promise<Array<Promise<any>>> {
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
