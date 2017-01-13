module.exports = (ctx) => ({
  plugins: [
    require('postcss-modules')({ getJSON: ctx.extractModules }),
  ],
});
