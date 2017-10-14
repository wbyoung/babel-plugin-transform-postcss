/* @flow */

import {
  dirname,
  extname,
  resolve,
  join,
} from 'path';

import {
  execFileSync,
  spawn,
} from 'child_process';

// note: socket path is important to keep short as it will be truncated if it
// exceeds certain platform limits. for this reason, we're writing to /tmp
// instead of using os.tmpdir (which can, on platforms like darwin, be quite
// long & per-process).
const projectId = process.cwd().toLowerCase().replace(/[^a-z]/ig, '');
const socketName = `bptp-${projectId}.sock`;
const socketPath = join('/tmp', socketName);
const tmpPath = join('/tmp', `bptp-${projectId}`);

const nodeExecutable = process.argv[0];
const clientExcutable = join(__dirname, 'postcss-client.js');
const serverExcutable = join(__dirname, 'postcss-server.js');

let server;

const startServer = () => {
  server = spawn(nodeExecutable, [serverExcutable, socketPath, tmpPath], {
    env: process.env, // eslint-disable-line no-process-env
    stdio: 'inherit',
  });

  server.unref();
};

const stopServer = () => {
  if (!server) { return; }

  server.kill();
  server = null;
  process.removeListener('exit', stopServer);
};

const launchServer = () => {
  if (server) { return; }

  startServer();

  process.on('exit', stopServer);
};

const extensions = ['.css'];

const getStylesFromStylesheet = (stylesheetPath: string, file: any,
  config: any): any => {
  const stylesheetExtension = extname(stylesheetPath);

  if (extensions.indexOf(stylesheetExtension) !== -1) {
    launchServer();
    const requiringFile = file.opts.filename;
    const cssFile = resolve(dirname(requiringFile), stylesheetPath);
    const data = JSON.stringify({ cssFile, config });
    const execArgs = [clientExcutable, socketPath, data];
    const result = execFileSync(nodeExecutable, execArgs, {
      env: process.env, // eslint-disable-line no-process-env
    }).toString();

    return JSON.parse(result || '{}');
  }

  return undefined;
};

export default function transformPostCSS({ types: t }: any): any {
  return {
    visitor: {
      CallExpression(path: any, { file }: any) {
        const { callee: { name: calleeName }, arguments: args } = path.node;
        const expression = path.findParent((test) => (
          test.isVariableDeclaration()
        ));

        if (calleeName !== 'require' ||
            !args.length ||
            !t.isStringLiteral(args[0]) ||
            !expression) {
          return;
        }

        const [{ value: stylesheetPath }] = args;
        const { config, retainImport } = this.opts;
        const tokens = getStylesFromStylesheet(stylesheetPath, file, config);

        if (tokens !== undefined) {

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

          if (retainImport) {
            expression.insertBefore(t.expressionStatement(
              t.callExpression(
                t.identifier('require'),
                [t.stringLiteral(stylesheetPath)]
              )
            ));
          }
        }
      },
      ImportDeclaration(path: any, { file }: any) {
        const stylesheetPath = path.node.source.value;

        if (path.node.specifiers.length !== 1) {
          return;
        }

        const { config, retainImport } = this.opts;
        const tokens = getStylesFromStylesheet(stylesheetPath, file, config);

        if (tokens) {
          const styles = t.objectExpression(
            Object.keys(tokens).map(
              (token) => t.objectProperty(
                t.stringLiteral(token),
                t.stringLiteral(tokens[token])
              )
            )
          );
          /* eslint-disable new-cap */

          const variableDeclaration = t.VariableDeclaration('var',
            [t.VariableDeclarator(path.node.specifiers[0].local, styles)]);

          /* eslint-enable new-cap */
          path.addComment('trailing', ` @related-file ${stylesheetPath}`, true);
          path.replaceWith(variableDeclaration);

          if (retainImport) {
            path.insertBefore(t.importDeclaration(
              [],
              t.stringLiteral(stylesheetPath)
            ));
          }
        }
      },
    },
  };
}

export {
  startServer,
  stopServer,
};
