const { Transpiler, BuildType } = require('../dist');
const fs = require('fs');
const path = require('path');
const testFolder = path.resolve(__dirname, 'scripts');

describe('parse', function() {
	const environmentVariables = new Map([
		['test', '"foo"'],
		['test2', 0.2]
	]);

	describe('default scripts', function() {
		fs
			.readdirSync(testFolder)
			.forEach(file => {
				const filepath = path.resolve(testFolder, file);

				test(path.basename(filepath), async () => {
					const result = await (new Transpiler({
						target: filepath,
						environmentVariables
					}).parse());

					expect(Object.values(result)).toMatchSnapshot();
				});

				test(path.basename(filepath) + ' uglify', async () => {
					const result = await (new Transpiler({
						target: filepath,
						buildType: BuildType.UGLIFY,
						environmentVariables
					}).parse());

					expect(Object.values(result)).toMatchSnapshot();
				});

				test(path.basename(filepath) + ' beautify', async () => {
					const result = await (new Transpiler({
						target: filepath,
						buildType: BuildType.BEAUTIFY,
						environmentVariables
					}).parse());

					expect(Object.values(result)).toMatchSnapshot();
				});
			});
	});
});