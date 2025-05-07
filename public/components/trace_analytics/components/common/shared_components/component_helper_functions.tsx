/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';

// Injects Size warning and Load more button into the corners of EUI Data Grid
// 1. When rowCount > maxDisplayRows, show warning (some data is hidden)
// 2. When rowCount < totalCount, show warning (more data to load), and Load more button when isLastPage is true
export const useInjectElementsIntoGrid = (
  rowCount: number,
  maxDisplayRows: number,
  totalCount: number,
  loadMoreHandler?: () => void,
  isLastPage?: boolean
) => {
  useEffect(() => {
    setTimeout(() => {
      const moreToShow = rowCount > maxDisplayRows;
      const moreToLoad = rowCount < totalCount;
      const shouldShowWarning = moreToShow || moreToLoad;

      const toolbar = document.querySelector<HTMLElement>('.euiDataGrid__controls');
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

          const textSpan = document.createElement('span');
          const totalCountText = totalCount > maxDisplayRows ? `${maxDisplayRows}+` : totalCount;
          textSpan.appendChild(document.createTextNode(`Results out of ${totalCountText}`));

          warningDiv.appendChild(textSpan);

          toolbar.appendChild(warningDiv);
        }
      }

      const pagination = document.querySelector<HTMLElement>('.euiDataGrid__pagination');
      if (pagination) {
        pagination.style.display = 'flex';
        pagination.style.alignItems = 'center';
        pagination.style.justifyContent = 'space-between';

        const existingLoadMoreButton = pagination.querySelector('.trace-table-load-more');
        if (existingLoadMoreButton) {
          existingLoadMoreButton.remove();
        }

        if (moreToLoad && loadMoreHandler && isLastPage) {
          const loadMoreButton = document.createElement('button');
          loadMoreButton.className = 'trace-table-load-more euiButtonEmpty euiButtonEmpty--text';
          loadMoreButton.style.marginLeft = '12px';
          loadMoreButton.innerText = '... Load more';
          loadMoreButton.onclick = () => loadMoreHandler();

          const paginationList = pagination.querySelector('.euiPagination__list');
          if (paginationList) {
            const listItem = document.createElement('li');
            listItem.className = 'euiPagination__item trace-table-load-more';
            listItem.appendChild(loadMoreButton);
            paginationList.appendChild(listItem);
          }
        }
      }
    }, 100);
  }, [rowCount, maxDisplayRows, totalCount, loadMoreHandler, isLastPage]);
};
