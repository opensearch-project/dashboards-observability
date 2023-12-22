/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { genericReducer } from '../hooks';

describe('genericReducer', () => {
  it('should return original state', () => {
    expect(
      genericReducer(
        { data: { foo: 'bar' }, loading: false },
        // mock not supported type
        { type: ('not-supported-type' as unknown) as 'request' }
      )
    ).toEqual({
      data: { foo: 'bar' },
      loading: false,
    });
  });

  it('should return state follow request action', () => {
    expect(genericReducer({ data: { foo: 'bar' }, loading: false }, { type: 'request' })).toEqual({
      data: { foo: 'bar' },
      loading: true,
    });
  });

  it('should return state follow success action', () => {
    expect(
      genericReducer(
        { data: { foo: 'bar' }, loading: false },
        { type: 'success', payload: { foo: 'baz' } }
      )
    ).toEqual({
      data: { foo: 'baz' },
      loading: false,
    });
  });

  it('should return state follow failure action', () => {
    const error = new Error();
    expect(
      genericReducer({ data: { foo: 'bar' }, loading: false }, { type: 'failure', error })
    ).toEqual({
      error,
      loading: false,
    });
  });
});
