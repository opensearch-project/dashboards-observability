/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb } from '@elastic/eui';
import { coreRefs } from '../../public/framework/core_refs';

export const setNavBreadCrumbs = (
  parentBreadCrumb: EuiBreadcrumb[],
  pageBreadCrumb: EuiBreadcrumb[]
) => {
  const isNavGroupEnabled = coreRefs?.chrome?.navGroup.getNavGroupEnabled();
  if (isNavGroupEnabled) {
    coreRefs?.chrome?.setBreadcrumbs([...pageBreadCrumb]);
  } else {
    coreRefs?.chrome?.setBreadcrumbs([...parentBreadCrumb, ...pageBreadCrumb]);
  }
};
