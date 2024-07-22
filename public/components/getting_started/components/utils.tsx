/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreRefs } from '../../../framework/core_refs';
import { uploadBundle } from '../../integrations/components/upload_flyout';

export const uploadAssets = async () => {
  const http = coreRefs.http;
  let responeData = {};

  try {
    await http!
      .get('/api/observability/gettingstarted')
      .then((res: any) => {
        responeData = res;
        console.log(responeData);
      })
      .catch((error) => {
        console.error('failed to fetch file');
      });

    const blob = new Blob([responeData.data], { type: 'application/x-ndjson' });
    const file = new File([blob], 'your-ndjson-file.ndjson');

    const error = await uploadBundle(file);
    if (error) {
      console.error(error.message);
    } else {
      console.log('Bundle uploaded successfully');
    }
    // const result = await responeData.json();
  } catch (err) {
    console.error(err.message);
  }
};
