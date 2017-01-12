/* @flow */

import net from 'net';
import fs from 'fs';
import util from 'util';
import makeDebug from 'debug';
import type { Socket, Server } from 'net';

const debug = makeDebug('babel-plugin-transform-postcss');
const streams = { stderr: process.stderr }; // overwritable by tests
const error = (...args: any) => {
  let prefix = 'babel-plugin-transform-postcss: ';
  const message = util.format(...args);

  if (streams.stderr.isTTY) {
    prefix = `\x1b[31m${prefix}\x1b[0m`;
  }

  streams.stderr.write(`${prefix}${message}\n`);
};

const main = async function main(socketPath: string): Promise<Server> {
  const options = { allowHalfOpen: true };
  const server = net.createServer(options, (connection: Socket) => {
    let data: string = '';

    connection.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });

    connection.on('end', async (): Promise<void> => {
      try {
        let config, tokens;
        const { configFile, cssFile } = JSON.parse(data);

        // eslint-disable-next-line global-require, $FlowFixMe
        try { config = require(configFile); }
        catch (err) {
          error(`Could not resolve config file at ${configFile}`);
          connection.end();

          return;
        }

        const extractModules = (_, resultTokens: any) => {
          tokens = resultTokens;
        };

        // eslint-disable-next-line no-sync
        const source = fs.readFileSync(cssFile, 'utf8');
        const runner = config({ extractModules });

        await runner.process(source);

        connection.end(JSON.stringify(tokens));
      }
      catch (err) {
        error(err.stack);
        connection.end();
      }
    });
  });

  if (fs.existsSync(socketPath)) { // eslint-disable-line no-sync
    error(`Server already running on socket ${socketPath}`);
    process.exit(1);

    return server; // tests can make it past process.exit
  }

  await new Promise((resolve: () => void, reject: (Error) => void) => {
    server.on('error', (err: Error) => reject(err));
    server.on('listening', () => {
      const handler = () => {
        fs.unlinkSync(socketPath); // eslint-disable-line no-sync
      };

      server.on('close', () => {
        process.removeListener('exit', handler);
        process.removeListener('SIGINT', handler);
        process.removeListener('SIGTERM', handler);
      });

      process.on('exit', handler);
      process.on('SIGINT', handler);
      process.on('SIGTERM', handler);

      resolve();
    });

    server.listen(socketPath, () => {
      debug(
        `babel-plugin-transform-postcss server running on socket ${socketPath}`
      );
    });
  });

  return server;
};

/* istanbul ignore if */
if ((require: any).main === module) {
  (async (): Promise<void> => {
    try { await main(...process.argv.slice(2)); }
    catch (err) { process.stderr.write(`${err.stack}\n`); process.exit(1); }
  })();
}

export {
  main,
  streams as _streams,
};
