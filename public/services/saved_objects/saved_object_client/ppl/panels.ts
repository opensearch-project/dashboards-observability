/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PPLSavedObjectClient } from './ppl_client';
import { CUSTOM_PANELS_API_PREFIX } from '../../../../../common/constants/custom_panels';

interface PanelRaw {
  dateCreated: number;
  dateModified: number;
  id: string;
  name: string;
}

interface Panel {
  label: string;
  panel: PanelRaw;
}

interface CommonParams {
  savedVisualizationId: string;
  selectedCustomPanels: Panel[];
}

type BulkUpdateParams = CommonParams;

export class PanelSavedObjectClient extends PPLSavedObjectClient {
  async updateBulk(params: BulkUpdateParams): Promise<Array<Promise<any>>> {
    return await Promise.all(
      params.selectedCustomPanels.map((panel: Panel) => {
        return this.client.post(`${CUSTOM_PANELS_API_PREFIX}/visualizations`, {
          body: JSON.stringify({
            savedVisualizationId: params.savedVisualizationId,
            panelId: panel.panel.id,
          }),
        });
      })
    );
  }
}
