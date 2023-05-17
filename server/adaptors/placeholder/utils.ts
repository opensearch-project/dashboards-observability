import { Readable } from 'stream';

/**
 * Parse a stream of newline-delimited JSON objects as an array.
 * The entire stream is read; the method will hang if the stream is not closed.
 * The data entries MUST be JSON objects,
 * other valid JSON values will be rejected.
 *
 * Resolves the `Promise` if every newline-separated JSON object is valid.
 * Rejects the `Promise` if the stream errors, or if the JSON is not parseable.
 *
 * @param {Readable} stream A stream of newline-delimited JSON objects.
 * @returns {Promise<object[]>} A `Promise` for an array of parsed JSON objects.
 */
export const readNDJsonObjects = async (stream: Readable): Promise<any[]> => {
  return new Promise<any[]>((resolve, reject) => {
    let assets: any[] = [];
    let json: string = '';
    stream.on('data', (chunk: string | Buffer) => {
      json += chunk.toString();
    });
    stream.on('end', () => {
      try {
        assets = JSON.parse(`[${json.replace(/\}\s+\{/g, '},{')}]`);
        resolve(assets);
      } catch (err: any) {
        reject(err);
      }
    });
    stream.on('error', (err: Error) => {
      reject(err);
    });
  });
};
