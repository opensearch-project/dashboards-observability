/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { act, renderHook } from '@testing-library/react';
import {
  cloudWatchIconUrl,
  resetCloudWatchIconForTests,
  useCloudWatchIconType,
} from '../cloudwatch_icon';

const mockPrepend = jest.fn(
  (path: string, opts?: { withoutClientBasePath?: boolean }) =>
    `${opts?.withoutClientBasePath ? '/base' : '/base/w/ws1'}${path}`
);
jest.mock('../../../framework/core_refs', () => ({
  coreRefs: {
    http: { basePath: { prepend: (...a: unknown[]) => mockPrepend(...(a as [string])) } },
  },
}));

class FakeImage {
  static last: FakeImage | undefined;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.last = this;
  }
}

describe('CloudWatch icon', () => {
  const realImage = global.Image;
  beforeEach(() => {
    resetCloudWatchIconForTests();
    FakeImage.last = undefined;
    (global as unknown as { Image: unknown }).Image = FakeImage;
  });
  afterAll(() => {
    global.Image = realImage;
  });

  it("points at the workspace plugin's static asset under the server base path", () => {
    expect(cloudWatchIconUrl()).toBe('/base/plugins/workspace/assets/cloudwatch_logo.svg');
    expect(mockPrepend).toHaveBeenCalledWith('/plugins/workspace/assets/cloudwatch_logo.svg', {
      withoutClientBasePath: true,
    });
  });

  it('shows the AWS logo until the CloudWatch logo loads, then the CloudWatch logo', () => {
    const { result } = renderHook(() => useCloudWatchIconType());
    expect(result.current).toBe('logoAWS');
    expect(FakeImage.last?.src).toBe('/base/plugins/workspace/assets/cloudwatch_logo.svg');
    act(() => FakeImage.last?.onload?.());
    expect(result.current).toBe('/base/plugins/workspace/assets/cloudwatch_logo.svg');
    // A later consumer gets the loaded logo at once, without loading it again.
    FakeImage.last = undefined;
    const second = renderHook(() => useCloudWatchIconType());
    expect(second.result.current).toBe('/base/plugins/workspace/assets/cloudwatch_logo.svg');
    expect(FakeImage.last).toBeUndefined();
  });

  it('keeps the AWS logo when the CloudWatch logo cannot load', () => {
    const { result } = renderHook(() => useCloudWatchIconType());
    act(() => FakeImage.last?.onerror?.());
    expect(result.current).toBe('logoAWS');
  });
});
