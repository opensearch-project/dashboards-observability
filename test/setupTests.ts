/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextEncoder, TextDecoder } from 'util';

require('babel-polyfill');
require('core-js/stable');

// TextEncoder/TextDecoder polyfill required by react-dom/server (pulled in by
// server-side tests) and React 18 under the jsdom test environment. jsdom 26
// no longer provides these globals in every context, so provide them here.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as typeof global.TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}
