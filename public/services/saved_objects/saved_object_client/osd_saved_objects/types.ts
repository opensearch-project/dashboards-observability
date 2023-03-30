/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectAttributes, SimpleSavedObject } from '../../../../../../../src/core/public';
import { SavedObjectsCreateResponse } from '../types';

export interface OSDSavedObjectCreateResponse<T extends SavedObjectAttributes>
  extends SavedObjectsCreateResponse {
  object: SimpleSavedObject<T>;
}

export interface OSDSavedObjectUpdateResponse<T extends SavedObjectAttributes>
  extends SavedObjectsCreateResponse {
  object: SimpleSavedObject<Partial<T>>;
}
