import path from 'path';
import { RepositoryFileSystem } from '../repository_fs';

describe('Repository FS', () => {
  it('returns the latest integration for get_integration_latest', async () => {
    // Filling in the latest version for now, ideally this should be appropriately mocked later.
    const rfs = new RepositoryFileSystem(path.join(__dirname, '../__data__/repository'));
    const latest = await rfs.get_latest_path('nginx');
    expect(latest).toContain('nginx-1.0.1');
  });

  it('returns latest integrations on get_latest_integrations', async () => {
    const rfs = new RepositoryFileSystem(path.join(__dirname, '../__data__/repository'));
    const latest = await rfs.get_latest_integration_paths();
    expect(latest).toHaveLength(1);
    expect(latest[0]).toContain('nginx-1.0.1');
  });

  it('returns a valid integration from get_integration_latest', async () => {
    const rfs = new RepositoryFileSystem(path.join(__dirname, '../__data__/repository'));
    const latest = await rfs.get_latest_path('nginx');
    const result = await rfs.get_integration(latest!);
    expect(result.name).toBe('nginx');
  });
});
