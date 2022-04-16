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

const exclusiveList = [
	'create-md-post',
	'arvis'
];

(async () => {
	let allPkgInfos = (await npmUserPackages(userId)).filter(info => !exclusiveList.some(exclusive => info.name.includes(exclusive)));
	const mapper = res => res;

	const tasks = allPkgInfos.map(pkgInfo => {
		const task1 = getNpmDownloads({
			userId,
			repository: pkgInfo.name,
			period: 'total',
		}).then(({downloads}) => {
			pkgInfo.totalDownload = downloads;
			return pkgInfo;
		});

		const task2 = getNpmDownloads({
			userId,
			repository: pkgInfo.name,
			period: 'last-week',
		}).then(({downloads}) => {
			pkgInfo.weeklyDownload = downloads;
			return pkgInfo;
		});

		return pMap([task1, task2], mapper);
	});

	await pMap(tasks, mapper, {concurrency: 3});

	const downloadSum = _.reduce(allPkgInfos.map(info => info.totalDownload), (previous, curr) => previous + curr, 0);
	const counts = allPkgInfos.length;

	badgeStats.message = `${downloadSum} Downloads`;

	await fs.writeJSON('./stats.json', badgeStats, {encoding: 'utf-8', spaces: 2});

	const sortedStats = allPkgInfos.sort((lhs, rhs) => lhs.totalDownload < rhs.totalDownload ? 1 : -1);

	generate(sortedStats, downloadSum, counts);
})();

const makeRow = data => [
	`[${data.name}](${data.links.npm})`,
	data.description,
	data.totalDownload,
	data.weeklyDownload,
	data.keywords?.slice(0, 3).map(string_ => `\`${string_}\``).join(', ') ?? '',
];

const makeHeader = (counts) => {
	return `There are \`${counts}\` packages\n\n`
};

function generate(stats, sum, counts) {
	const config = {
		transforms: {
			PACKAGES() {
				return makeHeader(counts) + table([
					['Name', 'Description', 'Total Downloads', 'Weekly Downloads', 'Keywords'],
					...stats.map(stat => makeRow(stat)),
				]);
			},
		},
	};

	markdownMagic(path.join('README.md'), config, () => {
		console.log(`Updated total downloads - ${sum}`);
	});
}
