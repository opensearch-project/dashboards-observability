/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectAttributes, SimpleSavedObject } from '../../../../../../../src/core/public';
import { OBSERVABILTY_SAVED_OBJECTS } from '../../../../../common/types/observability_saved_object_attributes';
import { SavedObjectsCreateResponse } from '../types';

export type ObservabilitySavedObjectsType = typeof OBSERVABILTY_SAVED_OBJECTS[number];

export interface OSDSavedObjectCreateResponse<T extends SavedObjectAttributes>
  extends SavedObjectsCreateResponse {
  object: SimpleSavedObject<T>;
}

export interface OSDSavedObjectUpdateResponse<T extends SavedObjectAttributes>
  extends SavedObjectsCreateResponse {
  object: SimpleSavedObject<Partial<T>>;
}
