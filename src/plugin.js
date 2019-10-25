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

/* eslint-disable id-length */
const findExpressionStatementChild = (path: any, t: any): any => {
  const parent = path.parentPath;

  if (
    t.isExpressionStatement(parent) ||
    t.isProgram(parent) ||
    t.isBlockStatement(parent)
  ) {
    return path;
  }

  return findExpressionStatementChild(parent, t);
};
/* eslint-enable id-length */

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

const defaultExtensions = ['.css'];

const getStylesFromStylesheet = (
  stylesheetPath: string,
  file: any,
  config: any,
  configExtensions: string[],
): any => {
  const stylesheetExtension = extname(stylesheetPath);

  const extensions = Array.isArray(configExtensions)
    ? configExtensions
    : defaultExtensions;

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

        if (calleeName !== 'require' ||
            !args.length ||
            !t.isStringLiteral(args[0])) {
          return;
        }

        const [{ value: stylesheetPath }] = args;
        const { config, extensions, keepImport } = this.opts;

        if (!t.isExpressionStatement(path.parent)) {
          const tokens = getStylesFromStylesheet(
            stylesheetPath,
            file,
            config,
            extensions
          );

          if (tokens !== undefined) {
            const finalExpression = t.objectExpression(
              Object.keys(tokens).map(
                (token) => t.objectProperty(
                  t.stringLiteral(token),
                  t.stringLiteral(tokens[token])
                )
              )
            );

            path.replaceWith(finalExpression);

            if (t.isProperty(path.parentPath)) {
              path.parentPath.addComment(
                'trailing', ` @related-file ${stylesheetPath}`, true
              );
            }
            else {

              // Add comment
              const expression = path.findParent((test) => (
                test.isVariableDeclaration() ||
                  test.isExpressionStatement()
              ));

              expression.addComment(
                'trailing', ` @related-file ${stylesheetPath}`, true
              );
            }

            // Keeped `require` will be placed before closest expression
            // statement child
            if (keepImport) {
              findExpressionStatementChild(path, t)
                .insertBefore(t.expressionStatement(
                  t.callExpression(
                    t.identifier('require'),
                    [t.stringLiteral(stylesheetPath)]
                  )
                ));
            }
          }
        }
        else if (!keepImport) {
          path.remove();
        }
      },
      ImportDeclaration(path: any, { file }: any) {
        const stylesheetPath = path.node.source.value;

        if (path.node.specifiers.length !== 1) {
          return;
        }

        const { config, extensions, keepImport } = this.opts;
        const tokens = getStylesFromStylesheet(
          stylesheetPath,
          file,
          config,
          extensions
        );

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

          if (keepImport) {
            path.replaceWithMultiple([
              t.importDeclaration([], t.stringLiteral(stylesheetPath)),
              variableDeclaration,
            ]);

            // Add comment directly to the variable declaration
            variableDeclaration.trailingComments.push({
              type: 'CommentLine',
              value: ` @related-file ${stylesheetPath}`,
            });
          }
          else {
            path.replaceWith(variableDeclaration);

            // Add comment
            path.addComment(
              'trailing', ` @related-file ${stylesheetPath}`, true
            );
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
