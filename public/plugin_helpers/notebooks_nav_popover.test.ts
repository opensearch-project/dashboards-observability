/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { of } from 'rxjs';
import { notebooksNavPopover } from './notebooks_nav_popover';
import { httpServiceMock } from '../../../../src/core/public/mocks';
import { NavPopoverServices } from '../../../../src/core/public';
import { observabilityNotebookID } from '../../common/constants/shared';

const makeServices = (navigateToApp = jest.fn()): NavPopoverServices => ({
  navigateToApp,
  basePath: httpServiceMock.createSetupContract({ basePath: '/test' }).basePath,
  http: httpServiceMock.createStartContract(),
  recentlyAccessed$: of([]),
});

/** Fire the action with the given id and return the navigateToApp mock. */
function clickAction(id: string) {
  const navigateToApp = jest.fn();
  const action = (notebooksNavPopover.actions ?? []).find((a) => a.id === id);
  if (!action) throw new Error(`No popover action with id "${id}"`);
  action.onClick(makeServices(navigateToApp));
  return navigateToApp;
}

describe('notebooksNavPopover', () => {
  it('declares createNotebook + viewAllNotebooks', () => {
    expect((notebooksNavPopover.actions ?? []).map((a) => a.id)).toEqual([
      'createNotebook',
      'viewAllNotebooks',
    ]);
  });

  it('navigates to the create-notebook route', () => {
    expect(clickAction('createNotebook')).toHaveBeenCalledWith(observabilityNotebookID, {
      path: '#/create',
    });
  });

  it('navigates to the notebooks list', () => {
    expect(clickAction('viewAllNotebooks')).toHaveBeenCalledWith(observabilityNotebookID, {
      path: '#/',
    });
  });
});
