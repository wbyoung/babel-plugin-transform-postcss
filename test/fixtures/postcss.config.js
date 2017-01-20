var stringHash = require('string-hash');

module.exports = (ctx) => ({
  plugins: [
    require('postcss-modules')({
      getJSON: ctx.extractModules,
      generateScopedName: (name, filename, css) => {
        if (!filename.match(/\.css$/)) {
          return name + '_through_invalid_file';
        }

        const i = css.indexOf(`.${ name }`);
        const lineNumber = css.substr(0, i).split(/[\r\n]/).length;
        const hash = stringHash(css).toString(36).substr(0, 5);

        return `_${ name }_${ hash }_${ lineNumber }`;
      },
    }),
  ],
});
