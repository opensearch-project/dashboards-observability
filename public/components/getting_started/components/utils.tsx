/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../framework/core_refs';
import { uploadBundle } from '../../integrations/components/upload_flyout';

const fetchAssets = async (tutorialId: string, assetFilter?: 'dashboards' | 'indexPatterns') => {
  const assetFilterParam = assetFilter ? `/${assetFilter}/` : '';
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

export const uploadAssets = async (tutorialId: string) => {
  try {
    const responeData = await fetchAssets(tutorialId);

    const blob = new Blob([responeData.data], { type: 'application/x-ndjson' });
    const file = new File([blob], 'ndjson-file.ndjson');

    const error = await uploadBundle(file);
    if (error) {
      console.error(error.message);
    } else {
      console.log('Bundle uploaded successfully');
    }
  } catch (err) {
    console.error(err.message);
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
