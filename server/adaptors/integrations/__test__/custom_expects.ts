/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Useful for asserting results are okay, while still having access to error information. A context
 * object can be supplied to help provide context if the value of the result doesn't contain enough
 * information to know what went wrong.
 */
export const expectOkResult = (result: Result<unknown>, context?: string | object) => {
  const labeled = {
    ...result,
    context,
  };
  expect(labeled).toEqual({
    ok: true,
    context,
    value: expect.anything(),
  });
};

/**
 * Validate an error result is correctly returned. A context object can be supplied to help provide
 * context if the value of the result doesn't contain enough information to know what went wrong.
 */
export const expectErrorResult = (result: Result<unknown>, context?: string | object) => {
  const labeled = {
    ...result,
    context,
  };
  expect(labeled).toEqual({
    ok: false,
    context,
    error: expect.anything(),
  });
};
