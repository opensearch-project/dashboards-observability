/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedQuerySaver } from './saved_query_saver';

export class SaveAsCurrentVisualization extends SavedQuerySaver {
  constructor(
    private readonly saveContext,
    protected readonly dispatchers,
    private readonly saveClient,
    private readonly panelClient,
    private readonly saveParams
  ) {
    super(dispatchers);
  }

  save(): void {
    const { dispatch, updateTabName } = this.dispatchers;
    const { tabId, notifications } = this.saveContext;
    const { name, selectedPanels } = this.saveParams;
    this.saveClient
      .update({ ...this.saveParams })
      .then((res: any) => {
        notifications.toasts.addSuccess({
          title: 'Saved successfully.',
          text: `Visualization '${name}' has been successfully updated.`,
        });

        if (selectedPanels?.length)
          this.addToPanel({ selectedPanels, saveTitle: name, notifications, visId: res.objectId });

        dispatch(
          updateTabName({
            tabId,
            tabName: name,
          })
        );
      })
      .catch((error: any) => {
        notifications.toasts.addError(error, {
          title: `Cannot update Visualization '${name}'`,
        });
      });
  }

  addToPanel({ selectedPanels, saveTitle, notifications, visId }) {
    const uuidRx = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;
    const soPanels = selectedPanels.filter((id) => id.panel.id.match(uuidRx));
    const opsPanels = selectedPanels.filter((id) => !id.panel.id.match(uuidRx));
    this.panelClient
      .updateBulk({
        selectedCustomPanels: opsPanels,
        savedVisualizationId: visId,
      })
      .then((res: any) => {
        notifications.toasts.addSuccess({
          title: 'Saved successfully.',
          text: `Visualization '${saveTitle}' has been successfully saved to operation panels.`,
        });
      })
      .catch((error: any) => {
        notifications.toasts.addError(error, {
          title: 'Failed to save',
          text: `Cannot add Visualization '${saveTitle}' to operation panels`,
        });
      });
  }
}
