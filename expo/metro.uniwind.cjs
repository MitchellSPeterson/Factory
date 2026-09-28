const path = require('path');
const uniwindPkg = path.dirname(require.resolve('uniwind/package.json'));
const uniwind = require(path.join(uniwindPkg, 'dist/metro/transformer.cjs'));

// Uniwind only compiles the CSS entry when Metro's file path joins to the
// same string as cssEntryFile. An absolute filePath misses that check and
// the stylesheet is dropped, so useCSSVariable cannot see theme tokens.
module.exports.transform = function transform(config, projectRoot, filePath, data, options) {
  const cssEntry = config?.uniwind?.cssEntryFile;
  if (typeof cssEntry === 'string') {
    const expected = path.resolve(projectRoot, cssEntry);
    const incoming = path.resolve(projectRoot, filePath);
    if (incoming === expected) {
      filePath = path.relative(projectRoot, expected);
    }
  }
  return uniwind.transform(config, projectRoot, filePath, data, options);
};
