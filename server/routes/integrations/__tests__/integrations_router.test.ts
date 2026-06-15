/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeepPartial } from 'redux';
import { OpenSearchDashboardsResponseFactory } from '../../../../../../src/core/server/http/router';
import { handleWithCallback, serveStaticImage } from '../integrations_router';
import { IntegrationsManager } from 'server/adaptors/integrations/integrations_manager';
import mime from 'mime';

jest
  .mock('../../../../../../src/core/server', () => jest.fn())
  .mock('../../../../../../src/core/server/http/router', () => jest.fn());

describe('Data wrapper', () => {
  const adaptorMock: Partial<IntegrationsManager> = {};
  const responseMock: DeepPartial<OpenSearchDashboardsResponseFactory> = {
    custom: jest.fn((data) => data),
    ok: jest.fn((data) => data),
  };

  it('retrieves data from the callback method', async () => {
    const callback = jest.fn((_) => {
      return { test: 'data' };
    });
    const result = await handleWithCallback(
      adaptorMock as IntegrationsManager,
      responseMock as OpenSearchDashboardsResponseFactory,
      (callback as unknown) as (a: IntegrationsManager) => Promise<unknown>
    );

    expect(callback).toHaveBeenCalled();
    expect(responseMock.ok).toHaveBeenCalled();
    expect((result as { body?: unknown }).body).toEqual({ data: { test: 'data' } });
  });

  it('passes callback errors through', async () => {
    const callback = jest.fn((_) => {
      throw new Error('test error');
    });
    const result = await handleWithCallback(
      adaptorMock as IntegrationsManager,
      responseMock as OpenSearchDashboardsResponseFactory,
      callback
    );

    expect(callback).toHaveBeenCalled();
    expect(responseMock.custom).toHaveBeenCalled();
    expect((result as { body?: unknown }).body).toEqual('test error');
  });
});

describe('serveStaticImage', () => {
  const responseMock: DeepPartial<OpenSearchDashboardsResponseFactory> = {
    ok: jest.fn((data) => data),
    custom: jest.fn((data) => data),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles regular image types correctly', () => {
    const imageTypes = [
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/webp',
      'image/avif',
    ];

    imageTypes.forEach((type) => {
      const path = `test.${type.split('/')[1]}`;
      const content = Buffer.from('fake image data');

      jest.spyOn(mime, 'getType').mockReturnValue(type);

      serveStaticImage(path, content, responseMock as OpenSearchDashboardsResponseFactory);

      expect(responseMock.ok).toHaveBeenCalledWith({
        headers: {
          'Content-Type': type,
        },
        body: content,
      });
    });
  });

  it('sanitizes SVG content', () => {
    const path = 'test.svg';
    const scriptedSvg = Buffer.from(
      `<svg><script>alert('test')</script><rect width="50" height="50"></rect></svg>`
    );

    jest.spyOn(mime, 'getType').mockReturnValue('image/svg+xml');

    serveStaticImage(path, scriptedSvg, responseMock as OpenSearchDashboardsResponseFactory);

    expect(responseMock.ok).toHaveBeenCalledWith({
      headers: {
        'Content-Type': 'image/svg+xml',
      },
      body: expect.stringMatching('<svg><rect.*></rect></svg>'), // No script tag
    });
  });

  it('rejects unsupported image types', () => {
    const path = 'test.bmp';
    const content = Buffer.from('fake image data');

    jest.spyOn(mime, 'getType').mockReturnValue('image/bmp');

    const _ = serveStaticImage(path, content, responseMock as OpenSearchDashboardsResponseFactory);

    expect(responseMock.custom).toHaveBeenCalledWith({
      body: 'not a supported image type: image/bmp',
      statusCode: 400,
    });
  });
});
