/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SAVED_OBJECT_ID,
  SAVED_OBJECT_TYPE,
  SAVED_QUERY,
} from '../../../../../common/constants/explorer';
import { SavedQuerySaver } from './saved_query_saver';

export class SaveAsNewQuery extends SavedQuerySaver {
  constructor(
    private readonly saveContext,
    protected readonly dispatchers,
    private readonly saveClient,
    private readonly saveParams
  ) {
    super(dispatchers);
  }

  save(): void {
    const { batch, dispatch, changeQuery, updateTabName } = this.dispatchers;
    const { tabId, history, notifications, showPermissionErrorToast } = this.saveContext;
    const { name } = this.saveParams;
    this.saveClient
      .create({ ...this.saveParams })
      .then((res: any) => {
        history.replace(`/explorer/${res.objectId}`);
        notifications.toasts.addSuccess({
          title: 'Saved successfully.',
          text: `New query '${name}' has been successfully saved.`,
        });
        batch(() => {
          dispatch(
            changeQuery({
              tabId,
              query: {
                [SAVED_OBJECT_ID]: res.objectId,
                [SAVED_OBJECT_TYPE]: SAVED_QUERY,
              },
            })
          );
          dispatch(
            updateTabName({
              tabId,
              tabName: name,
            })
          );
        });
        history.replace(`/explorer/${res.objectId}`);
        return res;
      })
      .catch((error: any) => {
        if (error?.body?.statusCode === 403) {
          showPermissionErrorToast();
        } else {
          notifications.toasts.addError(error, {
            title: `Cannot save query '${name}'`,
          });
        }
      });
  }
}
