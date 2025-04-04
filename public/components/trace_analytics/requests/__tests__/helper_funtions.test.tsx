/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { handleError } from '../helper_functions';
import { coreRefs } from '../../../../../public/framework/core_refs';

describe('handleError in handleDslRequest', () => {
  const addDangerMock = jest.fn();
  const addErrorMock = jest.fn();

  beforeAll(() => {
    coreRefs.core = {
      notifications: {
        toasts: {
          addDanger: addDangerMock,
          addError: addErrorMock,
        },
      },
    } as any;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays danger toast for too_many_buckets_exception', () => {
    const error = {
      response: JSON.stringify({
        error: {
          caused_by: {
            type: 'too_many_buckets_exception',
            reason: 'Too many buckets',
          },
        },
      }),
    };

    handleError(error);

    expect(addDangerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Too many buckets in aggregation',
        text: 'Too many buckets',
      })
    );
    expect(addErrorMock).not.toHaveBeenCalled();
  });

  it('logs error for non-bucket exceptions', () => {
    const error = {
      body: {
        error: {
          type: 'search_phase_execution_exception',
          reason: 'Some other error',
        },
      },
    };

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    handleError(error);

    expect(consoleSpy).toHaveBeenCalledWith(error);
    expect(addDangerMock).not.toHaveBeenCalled();
    expect(addErrorMock).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('parses nested message JSON string', () => {
    const error = {
      body: {
        message: JSON.stringify({
          error: {
            caused_by: {
              type: 'too_many_buckets_exception',
              reason: 'Buckets exceeded',
            },
          },
        }),
      },
    };

    handleError(error);

    expect(addDangerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Too many buckets in aggregation',
        text: 'Buckets exceeded',
      })
    );
  });
});
