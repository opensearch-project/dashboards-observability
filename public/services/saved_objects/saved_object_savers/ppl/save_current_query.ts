/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedQuerySaver } from './saved_query_saver';

export class SaveAsCurrentQuery extends SavedQuerySaver {
  constructor(
    private readonly saveContext,
    protected readonly dispatchers,
    private readonly saveClient,
    private readonly saveParams
  ) {
    super(dispatchers);
  }

  save(): void {
    const { dispatch, updateTabName } = this.dispatchers;
    const { tabId, notifications } = this.saveContext;
    const { name } = this.saveParams;
    this.saveClient
      .update({ ...this.saveParams })
      .then((res: any) => {
        notifications.toasts.addSuccess({
          title: 'Saved successfully.',
          text: `Query '${name}' has been successfully updated.`,
        });
        dispatch(
          updateTabName({
            tabId,
            tabName: name,
          })
        );
      })
      .catch((error: any) => {
        notifications.toasts.addError(error, {
          title: `Cannot update query '${name}'`,
        });
      });
  }
}
