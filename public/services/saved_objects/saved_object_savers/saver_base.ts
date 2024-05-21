/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import capitalize from 'lodash/capitalize';
import { CoreStart } from '../../../../../../src/core/public';
import { ISavedObjectSaver } from './saver_interface';

export abstract class SavedObjectSaverBase implements ISavedObjectSaver {
  constructor(protected readonly dispatchers) {}
  abstract save(): any;
  handleResponse(
    notification: CoreStart['notifications'],
    type: 'success' | 'danger',
    msg: string
  ) {
    notification.toasts[`add${capitalize(type)}`]({
      title: 'Saving objects',
      text: msg,
    });
  }
}
