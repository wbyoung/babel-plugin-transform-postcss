module.exports = function (opts) {
  var getJSON = opts.extractModules;

  return require('postcss')([
    require('postcss-modules')({ getJSON: getJSON }),
  ]);
};
