/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ISavedObjectLoader } from './loader_interface';

export abstract class SavedObjectLoaderBase implements ISavedObjectLoader {
  constructor() {}
  abstract load(): void;
}
