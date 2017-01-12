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
} from '../src/postcss-server';

import {
  stub,
} from 'sinon';

import { expect } from 'chai';

import { join } from 'path';
import fs from 'fs';
import net from 'net';
import { Server } from 'net';

const testSocket = join(__dirname, 'tmp.sock');
const testOutput = join(__dirname, 'tmp.out');

describe('postcss-server', () => {
  let server, originalStderr;
  const invokeMain = async () => { server = await main(testSocket); };
  const closeServer = async() => {
    await new Promise((resolve: () => void, reject: (Error) => void) => {
      server.close((err: ?Error) => {
        if (err) { reject(err); }
        else { resolve(); }
      });
    });
  };
  const closeStderr = async () => {
    const write = new Promise((resolve: () => void) => {
      streams.stderr.on('finish', () => resolve());
    });

    streams.stderr.end();
    await write;
  };

  beforeEach(() => {
    originalStderr = streams.stderr;
    streams.stderr = fs.createWriteStream(testOutput);
  });
  afterEach(() => {
    streams.stderr = originalStderr;
    fs.unlinkSync(testOutput);
  });

  describe('main(...testArgs)', () => {
    let signintHandlers;

    beforeEach(() => { signintHandlers = process.listeners('SIGINT'); });

    beforeEach(invokeMain);
    afterEach(closeServer);

    it('starts a server', () => {
      expect(server.address()).to.eql(testSocket);
    });

    it('observes SIGINT to cleanup server socket', () => {
      const newHandlers = process.listeners('SIGINT')
        .slice(signintHandlers.length);

      expect(newHandlers.length).to.eql(1);
      newHandlers[0]();

      expect(fs.existsSync(testSocket)).to.be.false;
    });

    const sendMessage = async (
      json: {
        cssFile: string,
        configFile: string,
      }
    ): Promise<string> => {
      let response = '';

      await new Promise((resolve: () => void, reject: (Error) => void) => {
        const client = net.connect(testSocket, () => {
          client.end(JSON.stringify(json));
          client.on('data', (chunk: Buffer) => {
            response += chunk.toString('utf8');
          });
        });

        client.on('error', (err: ErrnoError) => reject(err));
        client.on('close', (err: ?Error) => {
          if (err) { reject(err); }
          else { resolve(); }
        });
      });

      return response;
    };

    it('accepts JSON details and extracts PostCSS modules', async () => {
      const response = await sendMessage({
        cssFile: join(__dirname, 'fixtures', 'simple.css'),
        configFile: join(__dirname, 'fixtures', 'postcss.config.js'),
      });

      expect(JSON.parse(response)).to.eql({ simple: '_simple_jvai8_1' });
    });

    it('fails gracefully for invalid CSS', async () => {
      const response = await sendMessage({
        cssFile: join(__dirname, 'fixtures', 'invalid.css'),
        configFile: join(__dirname, 'fixtures', 'postcss.config.js'),
      });

      expect(response).to.eql('');
    });

    describe('with a missing CSS file', () => {
      let response;

      beforeEach(async () => {
        response = await sendMessage({
          cssFile: join(__dirname, 'fixtures', 'nofile'),
          configFile: join(__dirname, 'fixtures', 'postcss.config.js'),
        });
      });
      beforeEach(closeStderr);

      it('does not contain a response', () => {
        expect(response).to.eql('');
      });

      it('logs a useful message', () => {
        expect(fs.readFileSync(testOutput, 'utf8'))
          .to.match(/no such file/i);
      });
    });

    describe('with a missing config file', () => {
      let response;

      beforeEach(async () => {
        response = await sendMessage({
          cssFile: join(__dirname, 'fixtures', 'simple.css'),
          configFile: join(__dirname, 'fixtures', 'nofile'),
        });
      });
      beforeEach(closeStderr);

      it('does not contain a response', () => {
        expect(response).to.eql('');
      });

      it('logs a useful message', () => {
        expect(fs.readFileSync(testOutput, 'utf8'))
          .to.match(/could not resolve config/i);
      });
    });
  });

  describe('when listen fails', () => {
    beforeEach(() => {
      stub(Server.prototype, 'listen', function errorHandler() {
        this.emit('error', new Error('test failure'));
      });
    });
    afterEach(() => { Server.prototype.listen.restore(); });

    it('fails to complete main(...testArgs)', async () => {
      let error;

      try { await invokeMain(); }
      catch (err) { error = err; }
      expect(error).to.match(/test failure/);
    });
  });

  describe('when the server socket already exists', () => {
    beforeEach(() => { stub(process, 'exit'); });
    afterEach(() => { process.exit.restore(); });

    beforeEach(() => { fs.writeFileSync(testSocket, ''); });
    afterEach(() => { fs.unlinkSync(testSocket); });

    describe('main(...testArgs)', () => {
      beforeEach(invokeMain);
      beforeEach(closeStderr);

      it('exits', () => {
        expect(process.exit).to.have.been.calledOnce;
        expect(process.exit).to.have.been.calledWith(1);
      });

      it('logs a useful message', () => {
        expect(fs.readFileSync(testOutput, 'utf8'))
          .to.match(/already running/i);
      });
    });

    describe('when stderr is a TTY', () => {
      beforeEach(() => { (streams.stderr: any).isTTY = true; });

      describe('main(...testArgs)', () => {
        beforeEach(invokeMain);
        beforeEach(closeStderr);

        it('logs with color', () => {
          expect(fs.readFileSync(testOutput, 'utf8')).to.startWith('\x1b[31m');
        });
      });
    });

  });
});
