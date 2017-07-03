/* @flow */

import net from 'net';

// exponential backoff, roughly 100ms-6s
const retries = [1, 2, 3, 4, 5].map((num) => Math.exp(num) * 40);
const streams = { stdout: process.stdout }; // overwritable by tests

const communicate = async function communicate(
  socketPath: string,
  message: string,
): Promise<void> {
  await new Promise((resolve: () => void, reject: (Error) => void) => {
    const client = net.connect(socketPath, () => {
      client.end(message);
      client.pipe(streams.stdout);
    });

    client.on('error', (err: ErrnoError) => reject(err));
    client.on('close', (err: ?Error) => {
      if (err) { reject(err); }
      else { resolve(); }
    });
  });
};

const main = async function main(...args: string[]): Promise<void> {
  try { await communicate(...args); }
  catch (err) {
    const recoverable = (
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOENT'
    );

    if (recoverable && retries.length) {
      await new Promise((resolve: () => void, reject: (Error) => void) => {
        setTimeout(() => {
          main(...args).then(resolve, reject);
        }, retries.shift());
      });
    }
  }
};

/* istanbul ignore if */
if ((require: any).main === module) {
  (async(): Promise<void> => {
    try { await main(...process.argv.slice(2)); }
    catch (err) { process.stderr.write(`${err.stack}\n`); process.exit(1); }
  })();
}

export {
  main,
  streams as _streams,
  retries as _retries,
};
