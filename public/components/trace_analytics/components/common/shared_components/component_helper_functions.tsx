/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';

// Injects the size warning and Load buttons into the corners of EUI Data Grid
export const useInjectElementsIntoGrid = (
  rowCount: number,
  maxDisplayRows: number,
  tracesTableMode: string,
  loadMoreHandler?: () => void,
  maxTraces?: number
) => {
  useEffect(() => {
    setTimeout(() => {
      const toolbar = document.querySelector<HTMLElement>('.euiDataGrid__controls');

      const shouldShowWarning =
        (tracesTableMode === 'traces' && maxTraces != null && maxTraces < rowCount) ||
        (tracesTableMode !== 'traces' && rowCount > maxDisplayRows);

      if (toolbar) {
        const existingWarning = toolbar.querySelector('.trace-table-warning');
        if (existingWarning) {
          existingWarning.remove();
        }

        if (shouldShowWarning) {
          toolbar.style.display = 'flex';
          toolbar.style.alignItems = 'center';
          toolbar.style.justifyContent = 'space-between';

          const warningDiv = document.createElement('div');
          warningDiv.className = 'trace-table-warning';

          const strongElement = document.createElement('strong');
          strongElement.textContent =
            tracesTableMode === 'traces' ? `${maxTraces ?? maxDisplayRows}` : `${maxDisplayRows}`;

          const textSpan = document.createElement('span');
          textSpan.appendChild(strongElement);
          textSpan.appendChild(document.createTextNode(' results shown out of '));
          textSpan.appendChild(document.createTextNode(` ${rowCount}`));

          warningDiv.appendChild(textSpan);

          toolbar.appendChild(warningDiv);
        }
      }

      const pagination = document.querySelector<HTMLElement>('.euiDataGrid__pagination');

      if (tracesTableMode !== 'traces') {
        if (pagination) {
          const existingLoadMoreButton = pagination.querySelector('.trace-table-load-more');
          if (existingLoadMoreButton) {
            existingLoadMoreButton.remove();
          }
        }
        return;
      }

      if (pagination && loadMoreHandler) {
        pagination.style.display = 'flex';
        pagination.style.alignItems = 'center';
        pagination.style.justifyContent = 'space-between';

        let loadMoreButton = pagination.querySelector<HTMLElement>('.trace-table-load-more');
        if (!loadMoreButton) {
          loadMoreButton = document.createElement('button');
          loadMoreButton.className = 'trace-table-load-more euiButtonEmpty euiButtonEmpty--text';
          loadMoreButton.style.marginLeft = '12px';
          loadMoreButton.innerText = 'Load more data';

          loadMoreButton.onclick = () => loadMoreHandler();

          pagination.appendChild(loadMoreButton);
        }
      }
    }, 100);
  }, [rowCount, tracesTableMode, loadMoreHandler, maxTraces, maxDisplayRows]);
};
