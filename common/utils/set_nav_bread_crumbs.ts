/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb } from '@elastic/eui';
import { coreRefs } from '../../public/framework/core_refs';

export const setNavBreadCrumbs = (
  parentBreadCrumb: EuiBreadcrumb[],
  pageBreadCrumb: EuiBreadcrumb[],
  counter?: number
) => {
  const isNavGroupEnabled = coreRefs?.chrome?.navGroup.getNavGroupEnabled();

  const updatedPageBreadCrumb = pageBreadCrumb.map((crumb) => ({
    ...crumb,
    text: isNavGroupEnabled && counter !== undefined ? `${crumb.text} (${counter})` : crumb.text,
  }));

  if (isNavGroupEnabled) {
    coreRefs?.chrome?.setBreadcrumbs([...updatedPageBreadCrumb]);
  } else {
    coreRefs?.chrome?.setBreadcrumbs([...parentBreadCrumb, ...updatedPageBreadCrumb]);
  }
};
