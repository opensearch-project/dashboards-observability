/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3GlueProperties } from 'common/types/data_connections';
import { DatasourceDetails } from '../components/manage/data_connection';

export function checkIsConnectionWithLakeFormation({
  connector,
  properties,
}: DatasourceDetails): boolean {
  return connector === 'S3GLUE' && (properties as S3GlueProperties)['glue.lakeformation.enabled'];
}
