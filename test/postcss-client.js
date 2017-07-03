/* @flow */
/* eslint-disable no-sync */

import {
  describe,
  it,
  beforeEach,
  afterEach,
} from 'mocha';

import {
  main,
  _streams as streams,
  _retries as retries,
} from '../src/postcss-client';

import {
  spy,
} from 'sinon';

import { expect } from 'chai';

import { join } from 'path';
import fs from 'fs';
import net from 'net';
import type { Socket } from 'net';

const testSocket = join(__dirname, 'tmp.sock');
const testOutput = join(__dirname, 'tmp.out');

describe('postcss-client', () => {
  let originalStdout, originalRetries;

  beforeEach(() => {
    originalStdout = streams.stdout;
    streams.stdout = fs.createWriteStream(testOutput);
  });
  afterEach(() => {
    streams.stdout = originalStdout;
    fs.unlinkSync(testOutput);
  });

  beforeEach(() => {
    originalRetries = [...retries];
    retries.splice(0, retries.length, 1);
  });
  afterEach(() => {
    retries.splice(0, retries.length, ...originalRetries);
  });

  beforeEach(() => spy(net, 'connect'));
  afterEach(() => net.connect.restore());

  describe('with a server to connect to', () => {
    let server, received;

    beforeEach(() => {
      received = '';
      server = net.createServer({ allowHalfOpen: true }, (conn: Socket) => {
        conn.on('data', (chunk: Buffer) => {
          received += chunk.toString('utf8');
        });
        conn.on('end', () => {
          conn.end('server output');
        });
      });

      return new Promise((resolve: () => void, reject: (Error) => void) => {
        server.listen(testSocket, (err: ?Error) => {
          if (err) { reject(err); }
          else { resolve(); }
        });
      });
    });

    afterEach(async() => {
      await new Promise((resolve: () => void, reject: (Error) => void) => {
        fs.unlinkSync(testSocket);
        server.close((err: ?Error) => {
          if (err) { reject(err); }
          else { resolve(); }
        });
      });
    });

    describe('main(...testArgs)', () => {
      beforeEach(async() => {
        const write = new Promise((resolve: () => void) => {
          streams.stdout.on('finish', () => resolve());
        });

        await Promise.all([main(testSocket, 'client message'), write]);
      });

      it('sends client message to server', () => {
        expect(received).to.eql('client message');
      });

      it('writes server response to stdout', () => {
        expect(fs.readFileSync(testOutput, 'utf8')).to.eql('server output');
      });

      it('succeeds during first connect attempt', () => {
        expect(net.connect).to.have.been.calledOnce;
      });
    });
  });

  describe('main(...testArgs)', () => {
    beforeEach(async() => { await main(testSocket, 'client message'); });

    it('attempts to re-connect', () => {
      expect(net.connect).to.have.been.calledTwice;
    });
  });

});
