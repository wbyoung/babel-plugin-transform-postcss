/* @flow */

import {
  dirname,
  extname,
  resolve,
} from 'path';

import fs from 'fs';
import util from 'util';
import postcss from 'postcss';
import loadConfig from 'postcss-load-config';
import deasync from 'deasync';

const sync = <T>(promise: Promise<T>): T => {
  let success: { result: T }, error: Error;

  promise.then(
    (result: T) => { success = { result }; },
    (err: Error) => { error = err; },
  );
  deasync.loopWhile(() => !(success || error));

  if (!success) {
    throw error;
  }

  return success.result;
};

const streams = { stderr: process.stderr }; // overwritable by tests
const error = (...args: any) => {
  let prefix = 'babel-plugin-transform-postcss: ';
  const message = util.format(...args);

  if (streams.stderr.isTTY) {
    prefix = `\x1b[31m${prefix}\x1b[0m`;
  }

  streams.stderr.write(`${prefix}${message}\n`);
};

export default function transformPostCSS({ types: t }: any): any {
  const extensions = ['.css'];

  return {
    visitor: {
      CallExpression(path: any, { file }: any) {
        const { callee: { name: calleeName }, arguments: args } = path.node;

        if (calleeName !== 'require' ||
            !args.length ||
            !t.isStringLiteral(args[0])) {
          return;
        }

        const [{ value: stylesheetPath }] = args;
        const stylesheetExtension = extname(stylesheetPath);

        if (extensions.indexOf(stylesheetExtension) !== -1) {

          let config, source;
          let tokens = {};
          const requiringFile = file.opts.filename;
          const cssFile = resolve(dirname(requiringFile), stylesheetPath);
          const extractModules = (_, resultTokens: any) => {
            tokens = resultTokens;
          };

          try {
            config = sync(loadConfig({ extractModules }, dirname(cssFile)));
            source = // eslint-disable-next-line no-sync
              fs.readFileSync(cssFile, 'utf8');
          }
          catch (err) {
            error(err.stack);

            return;
          }

          const { plugins, postcssOpts } = config;
          const runner = postcss(plugins);

          sync(runner.process(source, postcssOpts));

          const expression = path.findParent((test) => (
              test.isVariableDeclaration() ||
              test.isExpressionStatement()
            ));

          expression.addComment(
            'trailing', ` @related-file ${stylesheetPath}`, true
          );

          path.replaceWith(t.objectExpression(
            Object.keys(tokens).map(
              (token) => t.objectProperty(
                t.stringLiteral(token),
                t.stringLiteral(tokens[token])
              )
            )
          ));
        }
      },
    },
  };
}

export {
  streams as _streams,
};
