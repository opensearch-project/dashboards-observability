import { readNDJson } from '../placeholder_router';
import { Readable } from 'stream';
import { createReadStream } from 'fs';

describe('ReadNDJsonStream', () => {
  it('should successfully parse simple ndjson', async () => {
    const stream = Readable.from(['{"key":1}\n{"key":2}\n{"key":3}']);
    const array = await readNDJson(stream);
    expect(array).toEqual([{ key: 1 }, { key: 2 }, { key: 3 }]);
  });
  it('should succeed if chunks split objects', async () => {
    const stream = Readable.from(['{"key":1}\n{"ke', 'y":2}\n{"key":3}']);
    const array = await readNDJson(stream);
    expect(array).toEqual([{ key: 1 }, { key: 2 }, { key: 3 }]);
  });
  it('should succeed on test ndjson file', async () => {
    const file = createReadStream(__dirname + '/test.ndjson');
    const array = await readNDJson(file);
    expect(array.length).toBeGreaterThan(0);
  });
});
