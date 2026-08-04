/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// babelrc doesn't respect NODE_PATH anymore but using require does.
// Alternative to install them locally in node_modules
module.exports = function (api) {
  // ensure env is test so that this config won't impact build or dev server
  if (api.env('test')) {
    return {
      presets: [
        // Explicit modern-Node target for jest — without targets, preset-env
        // compiles to ES5 and rewrites `**` to Math.pow(), which throws
        // "Cannot convert a BigInt value to a number" on BigInt
        // exponentiation in transpiled OSD core sources (e.g. @osd/monaco).
        // Node 14 (not `current`) keeps newer syntax like class static
        // blocks transpiled for compatibility across toolchain versions.
        [require('@babel/preset-env'), { targets: { node: '14' } }],
        require('@babel/preset-react'),
        require('@babel/preset-typescript'),
      ],
      plugins: [
        [require('@babel/plugin-transform-runtime'), { regenerator: true }],
        require('@babel/plugin-transform-class-properties'),
        require('@babel/plugin-transform-object-rest-spread'),
        [require('@babel/plugin-transform-modules-commonjs'), { allowTopLevelThis: true }],
      ],
    };
  }
  return {};
};
