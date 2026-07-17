/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Stub for `!!raw-loader!` imports. jest-raw-loader is incompatible with the
// Jest 28+ transformer API and was removed during the Jest 30 upgrade. No test
// asserts the real raw file contents (the only consumer mocks the import
// directly), so a string stub preserves the prior behaviour.
module.exports = 'raw-loader-stub';
