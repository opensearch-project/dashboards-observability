/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { htmlIdGenerator } from '@elastic/eui';
import { TAB_ID_TXT_PFX } from '../../../../common/constants/explorer';

export const initialTabId: string = htmlIdGenerator(TAB_ID_TXT_PFX)();
