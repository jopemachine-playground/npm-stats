import path from 'node:path';
import fs from 'fs-extra';
import _ from 'lodash';
import table from 'markdown-table';
import markdownMagic from 'markdown-magic';
import getNpmDownloads from 'get-npm-downloads';
import npmUserPackages from 'npm-user-packages';
import pMap from 'p-map';
import loudRejection from 'loud-rejection';
import json from './utils/json.mjs';

loudRejection();

const {'npm-stats': userId} = json('./package.json');
const badgeStats = json('./stats.json');

if (!userId) {
	throw new Error('Please add `npm-stats` to your package.json');
}

(async () => {
	let allPkgInfos = (await npmUserPackages(userId)).filter(info => !info.name.startsWith('arvis'));

	const tasks = allPkgInfos.map(pkgInfo => getNpmDownloads({
		userId,
		repository: pkgInfo.name,
		period: 'total',
	}).then(({downloads}) => {
		pkgInfo.totalDownload = downloads;
		return pkgInfo;
	}));

	const mapper = res => res;
	allPkgInfos = await pMap(tasks, mapper, {concurrency: 3});

	const downloadSum = _.reduce(allPkgInfos.map(info => info.totalDownload), (previous, curr) => previous + curr, 0);

	badgeStats.message = `${downloadSum} Downloads`;

	await fs.writeJSON('./stats.json', badgeStats, {encoding: 'utf-8', spaces: 2});

	const sortedStats = allPkgInfos.sort((lhs, rhs) => lhs.totalDownload < rhs.totalDownload ? 1 : -1);

	generate(sortedStats, downloadSum);
})();

const makeRow = data => [`[${data.name}](${data.links.npm})`, data.description, data.totalDownload, data.keywords?.slice(0, 3).join(', ') ?? ''];

function generate(stats, sum) {
	const config = {
		transforms: {
			PACKAGES() {
				return table([
					['Name', 'Description', 'Total Downloads', 'Keywords'],
					...stats.map(stat => makeRow(stat)),
				]);
			},
		},
	};

	markdownMagic(path.join('README.md'), config, () => {
		console.log(`Updated total downloads - ${sum}`);
	});
}
