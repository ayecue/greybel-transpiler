const { Transpiler, BuildType } = require('../dist');
const fs = require('fs');
const path = require('path');
const testFolder = path.resolve(__dirname, 'scripts');

describe('parse', function () {
  const environmentVariables = new Map([
    ['test', '"foo"'],
    ['test2', 0.2],
    ['TEST_ENV', true]
  ]);

  describe('default scripts', function () {
    fs.readdirSync(testFolder).forEach((file) => {
      const filepath = path.resolve(testFolder, file);

      test(path.basename(filepath), async () => {
        const result = await new Transpiler({
          target: filepath,
          environmentVariables,
          obfuscation: false
        }).parse();

        expect(Object.values(result)).toMatchSnapshot();
      });

      test(path.basename(filepath) + ' uglify', async () => {
        const result = await new Transpiler({
          target: filepath,
          buildType: BuildType.UGLIFY,
          environmentVariables,
          obfuscation: false
        }).parse();

        expect(Object.values(result)).toMatchSnapshot();
      });

      test(path.basename(filepath) + ' beautify', async () => {
        const result = await new Transpiler({
          target: filepath,
          buildType: BuildType.BEAUTIFY,
          environmentVariables
        }).parse();

        expect(Object.values(result)).toMatchSnapshot();
      });
    });
  });

  describe('special scripts', function () {
    const testFile = path.resolve(__dirname, 'special', 'circular-import.src');

    test(path.basename(testFile), async () => {
      expect(() => {
        return new Transpiler({
          target: testFile,
          environmentVariables,
          obfuscation: false
        }).parse();
      }).rejects.toThrowError(/^Circular dependency/);
    });
  });
});
