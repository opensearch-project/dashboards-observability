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
