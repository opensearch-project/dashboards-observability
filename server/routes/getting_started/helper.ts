/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  COMPONENT_MAP,
  VERSION_MAP,
  SIGNAL_MAP,
  TutorialId,
} from '../../../common/constants/getting_started_routes';
import { MappingTypeMapping } from '@opensearch-project/opensearch/api/types';
import { RequestHandlerContext } from '../../../../../src/core/server';

export const assetMapper = (tutorialId: TutorialId): string => {
  const component = COMPONENT_MAP[tutorialId] || 'default-component';
  const version = VERSION_MAP[tutorialId] || '1.0.0';
  const signal = SIGNAL_MAP[tutorialId] ? `-${SIGNAL_MAP[tutorialId]}` : '';

  return `${component}-${version}${signal}.ndjson`;
};

export const loadAssetsFromFile = async (tutorialId: TutorialId) => {
  try {
    const fileName = assetMapper(tutorialId);
    const filePath = path.join(__dirname, `assets/${fileName}`);
    const fileData = await fs.promises.readFile(filePath, 'utf8');
    return fileData;
  } catch (error) {
    throw new Error(`Error loading asset: ${tutorialId}`);
  }
};

export const createAllTemplatesSettled = async (
  context: RequestHandlerContext,
  indexTemplates: Array<{ name: string; template: MappingTypeMapping; templatePath: string }>,
  dataSourceMDSId: string
) => {
  const results = await Promise.allSettled(
    indexTemplates.map(({ name, template, templatePath }) =>
      createIndexTemplate(context, name, template, dataSourceMDSId, templatePath)
    )
  );

  return results.map((result, index) => {
    const templateName = indexTemplates[index].name;
    if (result.status === 'fulfilled') {
      return { name: templateName, success: true };
    }
    return { name: templateName, success: false, reason: result.reason };
  });
};

export const createIndexTemplate = async (
  context: RequestHandlerContext,
  name: string,
  template: MappingTypeMapping,
  dataSourceMDSId: string,
  templatePath: string
) => {
  try {
    const osClient = dataSourceMDSId
      ? await context.dataSource.opensearch.getClient(dataSourceMDSId)
      : context.core.opensearch.client.asCurrentUser;

    return await osClient.transport.request({
      method: 'PUT',
      path: templatePath,
      body: template,
    });
  } catch (error) {
    console.error(`Failed to create index template ${name}:`, error);
    throw error;
  }
};
