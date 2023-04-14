/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { dispatch } from 'd3';
import { indexPatternLoad } from '../../../../../../../src/plugins/data/public/index_patterns/expressions/load_index_pattern';
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

    // const deletePanelSO = (customPanelIdList: string[]) => {
    //   const soPanelIds = customPanelIdList.filter((id) => id.match(uuidRx));
    //   return Promise.all(
    //     soPanelIds.map((id) =>
    //       coreRefs.savedObjectsClient?.delete(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id)
    //     )
    //   );
    // };
  
    // const deletePanels = (customPanelIdList: string[]) => {
    //   const panelIds = customPanelIdList.filter((id) => !id.match(uuidRx));
    //   const concatList = panelIds.toString();
    //   return http.delete(`${CUSTOM_PANELS_API_PREFIX}/panelList/` + concatList);
    // };
    const uuidRx = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

    console.log(selectedPanels)

    const soPanels = selectedPanels.filter((id) => id.panel.id.match(uuidRx));
    const opsPanels = selectedPanels.filter((id) => !id.panel.id.match(uuidRx))
    console.log(opsPanels)
    // dispatch(bulkupdateblah(sopanels, vizid))
    this.panelClient
      .updateBulk({
        // selectedCustomPanels: opsPanels,
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
