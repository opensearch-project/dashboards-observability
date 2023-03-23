/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ISavedObjectSaver } from '../saver_interface';
import { SavedObjectSaverBase } from '../saver_base';

export class SavedQuerySaver extends SavedObjectSaverBase implements ISavedObjectSaver {
  save() {
    throw new Error('Method not implemented.');
  }
}
