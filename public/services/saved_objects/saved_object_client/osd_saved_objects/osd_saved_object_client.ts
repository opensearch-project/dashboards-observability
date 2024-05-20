/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import isEmpty from 'lodash/isEmpty';
import {
  SavedObjectsClientContract,
  SimpleSavedObject,
} from '../../../../../../../src/core/public';
import { OBSERVABILTY_SAVED_OBJECTS } from '../../../../../common/types/observability_saved_object_attributes';
import { SavedObjectClientBase } from '../client_base';
import { ObservabilitySavedObjectsType } from './types';

export abstract class OSDSavedObjectClient extends SavedObjectClientBase {
  private static TYPE_ID_REGEX = new RegExp(
    `(${OBSERVABILTY_SAVED_OBJECTS.join(
      '|'
    )}):([0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$)`
  );

  constructor(protected readonly client: SavedObjectsClientContract) {
    super();
  }

  /**
   * OSD saved object client operations requires object type. Type is part of
   * the document id but not in operation response id (see
   * https://github.com/opensearch-project/opensearch-dashboards/blob/11b98ec05483269917c335fcb1900bf98da8cac6/src/core/server/saved_objects/serialization/serializer.ts#L141).
   * In Observability most components only uses id without explicit type. Prepend
   * type to id to make it easier to call OSD saved object client.
   *
   * @param objectId - objectId in the format of id only
   * @returns id in the format of 'SavedObjectType:id'
   */
  protected abstract prependTypeToId(objectId: string): string;

  protected static extractTypeAndUUID(
    objectId: string
  ): {
    type: '' | ObservabilitySavedObjectsType;
    uuid: string;
  } {
    const matches = objectId.match(OSDSavedObjectClient.TYPE_ID_REGEX);
    if (matches === null) {
      return { type: '', uuid: objectId };
    }
    return { type: matches[1] as ObservabilitySavedObjectsType, uuid: matches[2] };
  }

  /**
   * @param objectId - objectId in the format of 'SavedObjectType:UUID'
   * @returns ObservabilitySavedObjectsType or empty string if objectId
   *          is not in expected format.
   */
  public static extractType(objectId: string) {
    return this.extractTypeAndUUID(objectId).type;
  }

  protected static convertToLastUpdatedMs(updatedAt: SimpleSavedObject['updated_at']) {
    return (updatedAt ? new Date(updatedAt) : new Date()).getTime();
  }

  buildRequestBody({
    query,
    fields,
    dateRange,
    timestamp,
    dataSources,
    queryLang,
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
    queryMetaData = {},
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
        data_sources: dataSources,
        query_lang: queryLang,
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

    if (!isEmpty(queryMetaData)) {
      objRequest.object.queryMetaData = queryMetaData;
    }

    return objRequest;
  }
}
