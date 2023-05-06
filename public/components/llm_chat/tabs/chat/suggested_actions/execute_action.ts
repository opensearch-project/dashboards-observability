/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IConversation,
  ISuggestedAction,
} from '../../../../../../common/types/observability_saved_object_attributes';

export const executeAction = (
  actionType: ISuggestedAction['actionType'],
  conversation: IConversation
) => {
  switch (actionType) {
    case 'send_as_input':
      break;

    default:
      break;
  }
};
