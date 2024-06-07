/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatasourceType } from '../../../../common/types/data_connections';

export function isS3Connection(dataSourceType: DatasourceType): boolean {
  return ['s3glue', 'securitylake'].includes(dataSourceType?.toLowerCase());
}
