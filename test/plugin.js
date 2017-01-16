/* @flow */
/* eslint-disable no-sync */

import {
  describe,
  it,
  beforeEach,
  afterEach,
} from 'mocha';

import {
  read,
  transform,
} from './helpers';

import {
  _streams as streams,
} from '../src/plugin';

import path from 'path';
import fs from 'fs';

import { expect } from 'chai';

describe('babel-plugin-transform-postcss', () => {
  it('compiles require.js correctly', async () => {
    expect(await transform('require.js'))
      .to.eql((await read('require.expected.js')).trim());
  });

  it('compiles import.js correctly', async () => {
    expect(await transform('import.js'))
      .to.eql((await read('import.expected.js')).trim());
  });

  it('compiles nocss.js correctly', async () => {
    expect(await transform('nocss.js'))
      .to.eql((await read('nocss.expected.js')).trim());
  });

  const testOutput = path.join(__dirname, 'tmp.out');
  const setupStreamCapture = () => {
    let originalStderr;

    beforeEach(() => {
      originalStderr = streams.stderr;
      streams.stderr = fs.createWriteStream(testOutput);
    });
    afterEach(() => {
      streams.stderr = originalStderr;
      fs.unlinkSync(testOutput);
    });
  };

  const finishStreamCapture = async () => {
    const write = new Promise((resolve: () => void) => {
      streams.stderr.on('finish', () => resolve());
    });

    streams.stderr.end();
    await write;
  };

  describe('with a missing CSS file', () => {
    setupStreamCapture();
    beforeEach(() => transform('missingcss.js'));
    beforeEach(finishStreamCapture);

    it('logs a useful message', () => {
      expect(fs.readFileSync(testOutput, 'utf8'))
        .to.match(/no such file/i);
    });
  });


  describe('with a missing config file', () => {
    setupStreamCapture();
    beforeEach(() => transform('require.js', 'fixtures-no-config'));
    beforeEach(finishStreamCapture);

    it('logs a useful message', () => {
      expect(fs.readFileSync(testOutput, 'utf8'))
        .to.match(/No PostCSS Config/i);
    });
  });

  describe('when stderr is a TTY', () => {
    setupStreamCapture();
    beforeEach(() => { (streams.stderr: any).isTTY = true; });

    describe('with a missing config file', () => {
      beforeEach(() => transform('require.js', 'fixtures-no-config'));
      beforeEach(finishStreamCapture);

      it('logs with color', () => {
        expect(fs.readFileSync(testOutput, 'utf8'))
          .to.startWith('\x1b[31m');
      });
    });
  });
});
