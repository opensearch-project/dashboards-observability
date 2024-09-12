/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../framework/core_refs';
import { useToast } from '../../../../public/components/common/toast';

const fetchAssets = async (tutorialId: string, assetFilter?: 'dashboards' | 'indexPatterns') => {
  const assetFilterParam = assetFilter ? `${assetFilter}/` : '';
  const http = coreRefs.http;
  const responeData = await http!
    .get(`/api/observability/gettingStarted/${assetFilterParam}${tutorialId}`)
    .then((res: any) => {
      return res;
    })
    .catch((_error) => {
      console.error('failed to fetch file');
    });
  return responeData;
};

export const UploadAssets = async (tutorialId: string, mdsId: string, mdsLabel: string) => {
  const { setToast } = useToast();
  const http = coreRefs.http;

  try {
    const response = await http!.post(`/api/observability/gettingStarted/createAssets`, {
      body: JSON.stringify({
        mdsId,
        mdsLabel,
        tutorialId,
      }),
    });

    if (response) {
      setToast('Created saved object assets successfully', 'success');
    }
  } catch (err) {
    console.error(err.message);
    setToast('Failed to create saved object assets', 'danger');
  }
};

export const fetchDashboardIds = async (tutorialId: string) => {
  try {
    const responeData = await fetchAssets(tutorialId, 'dashboards');
    return responeData;
  } catch (err) {
    console.error(err.message);
  }
};

export const fetchIndexPatternIds = async (tutorialId: string) => {
  try {
    const responeData = await fetchAssets(tutorialId, 'indexPatterns');
    return responeData;
  } catch (err) {
    console.error(err.message);
  }
};

export const redirectToDashboards = (path: string) => {
  coreRefs?.application!.navigateToApp('dashboards', {
    path: `#/${path}`,
  });
};
