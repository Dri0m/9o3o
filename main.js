import { FlashpointArchive, newSubfilter } from 'npm:@fparchive/flashpoint-archive';
import { contentType } from 'jsr:@std/media-types@1.1.0';
import { format } from 'jsr:@std/fmt@1.0.8/bytes';
import { parseArgs } from 'jsr:@std/cli@1.0.23/parse-args';

// Command-line flags
const flags = parseArgs(Deno.args, {
	boolean: ['update'],
	string: ['config'],
	default: { 'update': false, 'config': 'config.json' },
});

// Initialize stuff
initGlobals();
await initDatabase();
initServer();

// Handle requests
async function serverHandler(request) {
	// Make sure request is for a valid URL
	const requestUrl = URL.parse(request.url);
	if (requestUrl === null) throw new BadRequestError();

	// If access host is configured, do not allow connections through any other hostname
	if (config.accessHosts.length > 0 && !config.accessHosts.some(host => host == requestUrl.hostname))
		throw new BadRequestError();

	// Default headers
	const responseHeaders = new Headers({
		'Content-Type': 'text/html; charset=UTF-8',
		'Cache-Control': 'max-age=14400',
	});

	// Build formatted date string of last update
	const lastUpdate = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'long',
		timeStyle: 'long',
		timeZone: 'UTC',
		hour12: false,
	}).format(new Date(lastUpdated));

	const requestPath = requestUrl.pathname.replace(/^[/]+(.*?)[/]*$/, '$1');
	const params = requestUrl.searchParams;

	// Log the request path (no IP address or query string)
	logMessage('served /' + requestPath);

	switch (requestPath) {
		case '': {
			// Get entry ID
			const idExp = /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/;
			let id;
			if (params.has('id')) {
				id = params.get('id');
				if (!idExp.test(id)) throw new BadRequestError();
			}
			else {
				// Backward compatibility with old ID query strings
				const queryString = requestUrl.search.substring(1);
				if (idExp.test(queryString)) id = queryString;
			}

			// Fetch the entry
			let entry;
			if (id) {
				entry = await fp.findGame(id);
				if (entry === null)
					throw new NotFoundError();
			}
			else {
				// If no ID is provided, search for random entry and disable caching
				const search = fp.parseUserSearchInput('').search;
				responseHeaders.delete('Cache-Control');

				// Whitelist supported file extensions
				const supportedFilter = newSubfilter();
				supportedFilter.whitelist.launchCommand = supportedExts;
				supportedFilter.matchAny = true;
				search.filter.subfilters.push(supportedFilter);

				// Filter NSFW entries if not explicitly specified otherwise
				if (params.get('nsfw') != 'true') {
					const extremeFilter = newSubfilter();
					extremeFilter.exactBlacklist.tags = extremeTags;
					extremeFilter.matchAny = true;
					search.filter.subfilters.push(extremeFilter);
				}

				// Perform the search (TODO: Combine this into one query)
				id = (await fp.searchGamesRandom(search, 1))[0].id;
				entry = await fp.findGame(id);
			}

			// Check if a launch command contains a supported file extension
			const isSupported = launchCommand => supportedExts.some(ext => launchCommand.toLowerCase().includes(ext));

			// Sort game data from latest to oldest
			const sortedGameData = entry.gameData.toSorted((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());

			// Get correct zip path and launch command
			let gameDataIndex = -1, launchCommand;
			if (entry.gameData.length > 1 && params.has('rev')) {
				// If a zip revision is provided, try to parse it
				const revParamStr = params.get('rev');
				const revParamInt = parseInt(revParamStr, 10);
				const revParamDate = new Date(revParamStr);
				let rev;
				if (!isNaN(revParamInt))
					rev = revParamInt;
				else if (!isNaN(revParamDate))
					rev = revParamDate.getTime();

				if (rev) {
					// Find the closest zip revision to the one defined
					const revDists = sortedGameData.map(gameData => Math.abs(new Date(gameData.dateAdded).getTime() - rev));
					gameDataIndex = revDists.reduce((l, cur, i, arr) => cur < arr[l] ? i : l, 0);

					// Set the launch command to that of the chosen zip revision
					launchCommand = sortedGameData[gameDataIndex].launchCommand;
				}
			}
			else if (entry.gameData.length > 0) {
				// First check each game data for desired launch command
				gameDataIndex = sortedGameData.findIndex(gameData => isSupported(gameData.launchCommand));
				if (gameDataIndex != -1)
					launchCommand = sortedGameData[gameDataIndex].launchCommand;
				else {
					// Then check additional apps
					gameDataIndex = 0;
					launchCommand = entry.addApps.find(addApp => isSupported(addApp.launchCommand))?.launchCommand;
					// Otherwise, give up and use legacy launch command
					if (!launchCommand)
						launchCommand = entry.legacyLaunchCommand;
				}
			}
			else {
				// Legacy entries use legacy launch command
				launchCommand = entry.legacyLaunchCommand;

				// Check additional apps if main launch command is invalid
				if (!isSupported(launchCommand) && entry.addApps.length > 0) {
					const addAppLaunchCommand = entry.addApps.find(addApp => isSupported(addApp.launchCommand))?.launchCommand;
					if (addAppLaunchCommand)
						launchCommand = addAppLaunchCommand;
				}
			}

			// Get path of selected zip
			let gameZip = '';
			if (gameDataIndex != -1)
				gameZip = `${config.zipServer}/${entry.id}-${new Date(sortedGameData[gameDataIndex].dateAdded).getTime()}.zip`;

			if (params.has('path')) {
				// Override launch command if path is defined in URL
				launchCommand = params.get('path');
				if (!launchCommand.toLowerCase().startsWith('http://'))
					launchCommand = 'http://' + launchCommand;
			}
			else {
				// Otherwise, remove any prefixes from the launch command
				const httpIndex = launchCommand.indexOf('http://');
				if (httpIndex != 0) launchCommand = launchCommand.substring(httpIndex);
			}

			const title = sanitizeInject(entry.title);
			const directLink = new URL(requestUrl);
			directLink.searchParams.set('id', entry.id);
			for (const field of ['rev', 'path', 'width', 'height']) {
				if (params.has(field))
					directLink.searchParams.set(field, params.get(field));
			}

			// Build page HTML
			const playerHtml = buildHtml(templates.player, {
				'Title': title,
				'Legacy_Server': config.legacyServer,
				'Game_Zip': gameZip,
				'Launch_Command': sanitizeInject(launchCommand),
				'ID': entry.id,
				'Direct_Link': directLink.href,
				'Info_Table': buildTable(entry, entryFields.game),
				'Add_App_Header': entry.addApps.length == 0 ? '' : '<div class="header-small">Additional Applications</div>',
				'Add_App_Table': entry.addApps.length == 0 ? '' : entry.addApps.map(addApp => buildTable(addApp, entryFields.addApp)).join('\n'),
				'Game_Data_Header': sortedGameData.length == 0 ? '' : '<div class="header-small">Game Data</div>',
				'Game_Data_Table': sortedGameData.length == 0 ? '' : sortedGameData.map(gameData => buildTable(gameData, entryFields.gameData)).join('\n'),
			});
			const shellHtml = buildHtml(templates.shell, {
				'Title': title + ' - 9o3o',
				'Styles': buildStyles('/player.css'),
				'Scripts': buildScripts('/player.js'),
				'Content': playerHtml,
				'Last_Update': lastUpdate,
			});

			// Serve entry viewer
			return new Response(shellHtml, { headers: responseHeaders });
		}
		case 'browse': {
			// Initialize search object
			const search = fp.parseUserSearchInput('').search;
			search.limit = config.pageSize;

			// Whitelist supported file extensions
			const supportedFilter = newSubfilter();
			supportedFilter.whitelist.launchCommand = supportedExts;
			supportedFilter.matchAny = true;
			search.filter.subfilters.push(supportedFilter);

			// Filter NSFW entries if not explicitly specified otherwise
			if (params.get('nsfw') != 'true') {
				const extremeFilter = newSubfilter();
				extremeFilter.exactBlacklist.tags = extremeTags;
				extremeFilter.matchAny = true;
				search.filter.subfilters.push(extremeFilter);
			}

			// Add parsed query to search
			const searchQuery = params.get('query') ?? '';
			const searchFilter = fp.parseUserSearchInput(searchQuery).search.filter;
			search.filter.subfilters.push(searchFilter);

			// Get search result total and page offsets
			// We perform the actual search once the offset is applied to the query
			const [totalResults, searchIndex] = await Promise.all([fp.searchGamesTotal(search), fp.searchGamesIndex(search)]);
			const totalPages = searchIndex.length > 0 ? searchIndex.length + 1 : 1;
			const currentPage = Math.max(1, Math.min(totalPages, parseInt(params.get('page'), 10) || 1));

			// Apply offset based on current page
			if (currentPage > 1) {
				const offset = searchIndex[currentPage - 2];
				search.offset = {
					value: offset.orderVal,
					title: offset.title,
					gameId: offset.id,
				};
			}

			// Get URLs for page navigation buttons
			const nthPageUrl = new URL(requestUrl);
			nthPageUrl.searchParams.set('page', 1);
			const firstPageUrl = nthPageUrl.search;
			nthPageUrl.searchParams.set('page', Math.max(currentPage - 1, 1));
			const prevPageUrl = nthPageUrl.search;
			nthPageUrl.searchParams.set('page', Math.min(currentPage + 1, totalPages));
			const nextPageUrl = nthPageUrl.search;
			nthPageUrl.searchParams.set('page', totalPages);
			const lastPageUrl = nthPageUrl.search;

			// Get search results and tag totals, and build HTML for the former
			const searchResults = await fp.searchGames(search);
			const searchResultsArr = [];
			const tagCounts = {};
			for (const searchResult of searchResults) {
				// Increment tag totals
				for (const tag of searchResult.tags) {
					if (tag == 'Auto-zipped')
						continue;
					else if (tagCounts[tag])
						tagCounts[tag]++;
					else
						tagCounts[(await fp.findTag(tag)).aliases[0]] = 1;
				}

				searchResultsArr.push(buildHtml(templates.result, {
					'Logo': `${config.imageServer}/${searchResult.logoPath}?type=jpg`,
					'Screenshot': `${config.imageServer}/${searchResult.screenshotPath}?type=jpg`,
					'Link': '/?id=' + searchResult.id,
					'Title': sanitizeInject(searchResult.title),
				}));
			}

			// Build HTML for tag totals
			const sortedTagCounts = Object.entries(tagCounts).toSorted((a, b) => b[1] - a[1]);
			const tagCountsArr = [];
			for (const [tag, count] of sortedTagCounts) {
				const queryTag = tag.includes(' ') ? `tag="${tag}"` : `tag=${tag}`;
				const queryTagIndex = searchQuery.indexOf(queryTag);

				// Don't display tag in sidebar if it exists in query
				if (queryTagIndex != -1 && (queryTagIndex == 0 || searchQuery[queryTagIndex - 1] == ' '))
					continue;

				// Get URLs for filtered queries
				const queryTagUrl = new URL(requestUrl.origin + requestUrl.pathname);
				const queryTagSpace = searchQuery != '' && !searchQuery.endsWith(' ') ? ' ' : '';
				queryTagUrl.searchParams.set('query', searchQuery + queryTagSpace + queryTag);
				const plusLink = queryTagUrl.href;
				queryTagUrl.searchParams.set('query', searchQuery + queryTagSpace + '-' + queryTag);
				const minusLink = queryTagUrl.href;

				tagCountsArr.push(buildHtml(templates.tag, {
					'Tag': sanitizeInject(tag),
					'Count': count.toLocaleString('en-US'),
					'Plus_Link': plusLink,
					'Minus_Link': minusLink,
				}));
			}

			// Build page HTML
			const browseHtml = buildHtml(templates.browse, {
				'Query': sanitizeInject(searchQuery),
				'NSFW_Checked': params.get('nsfw') == 'true' ? ' checked' : '',
				'Total_Results': totalResults.toLocaleString('en-US'),
				'Results_Per_Page': config.pageSize.toLocaleString('en-US'),
				'Current_Page': currentPage.toLocaleString('en-US'),
				'Total_Pages': totalPages.toLocaleString('en-US'),
				'First_Page': firstPageUrl,
				'Prev_Page': prevPageUrl,
				'Next_Page': nextPageUrl,
				'Last_Page': lastPageUrl,
				'Tags': tagCountsArr.join('\n'),
				'Results': searchResultsArr.join('\n'),
			});
			const shellHtml = buildHtml(templates.shell, {
				'Title': 'Browse - 9o3o',
				'Styles': buildStyles('/browse.css'),
				'Scripts': buildScripts('/browse.js'),
				'Content': browseHtml,
				'Last_Update': lastUpdate,
			});

			// Serve entry browser
			return new Response(shellHtml, { headers: responseHeaders });
		}
		case 'faq': {
			// Serve FAQ
			return new Response(buildHtml(templates.shell, {
				'Title': 'FAQ - 9o3o',
				'Styles': buildStyles('/faq.css'),
				'Scripts': '',
				'Content': templates.faq,
				'Last_Update': lastUpdate,
			}), { headers: responseHeaders });
		}
		case 'platforms': {
			responseHeaders.set('Content-Type', 'application/json; charset=UTF-8');

			// Serve supported platform info
			return new Response(supportedPlatformsStr, { headers: responseHeaders });
		}
		default: {
			// Serve static files
			const filePath = `static/${requestPath}`;
			if (getPathInfo(filePath)?.isFile) {
				responseHeaders.set('Content-Type', contentType(filePath.substring(filePath.lastIndexOf('.'))) ?? 'application/octet-stream');
				return new Response(Deno.openSync(filePath).readable, { headers: responseHeaders });
			}

			throw new NotFoundError();
		}
	}
};

// Display error page
function serverError(error) {
	const [badRequest, notFound] = [error instanceof BadRequestError, error instanceof NotFoundError];

	// We don't need to translate this
	let errorPage;
	if (badRequest || notFound)
		errorPage = buildHtml(templates.error, {
			'Error': `${error.status} ${error.statusText}`,
			'Description': badRequest ? 'The requested URL is invalid.' : 'The requested URL does not exist.',
		});
	else {
		logMessage(error.stack);
		errorPage = buildHtml(templates.error, {
			'Error': '500 Internal Server Error',
			'Description': 'The server encountered an error while handling the request.',
		});
	}

	return new Response(errorPage, { status: error.status ?? 500, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
};

// Log when server is started
function serverListen(addr) { logMessage(`server listening at ${addr.hostname} (port ${addr.port})`); }

// Define global variables
function initGlobals() {
	// Try to load config file
	globalThis.config = Object.assign({}, JSON.parse(Deno.readTextFileSync('data/defaultConfig.json')));
	const configPath = flags['config'];
	if (getPathInfo(configPath)?.isFile) {
		Object.assign(config, JSON.parse(Deno.readTextFileSync(configPath)));
		logMessage(`loaded config file: ${Deno.realPathSync(configPath)}`);
	}
	else
		logMessage('no config file found, using default config');

	globalThis.templates = {
		shell: Deno.readTextFileSync('templates/shell.html'),
		player: Deno.readTextFileSync('templates/player.html'),
		table: Deno.readTextFileSync('templates/table.html'),
		row: Deno.readTextFileSync('templates/row.html'),
		browse: Deno.readTextFileSync('templates/browse.html'),
		result: Deno.readTextFileSync('templates/result.html'),
		tag: Deno.readTextFileSync('templates/tag.html'),
		faq: Deno.readTextFileSync('templates/faq.html'),
		error: Deno.readTextFileSync('templates/error.html'),
	};

	globalThis.supportedPlatformsStr = Deno.readTextFileSync('data/platforms.json');
	globalThis.supportedPlatforms = JSON.parse(supportedPlatformsStr);
	globalThis.supportedExts = supportedPlatforms.reduce((exts, platform) => exts.concat(platform.extensions), []);

	globalThis.extremeTags = JSON.parse(Deno.readTextFileSync('data/extreme.json'));
	globalThis.entryFields = JSON.parse(Deno.readTextFileSync('data/fields.json'));
}

// Load/update/build Flashpoint database
async function initDatabase() {
	// Get time of last update
	globalThis.updateInProgress = false;
	globalThis.lastUpdated = '1970-01-01';
	if (getPathInfo('data/lastUpdated.txt')?.isFile) {
		const lastUpdatedText = Deno.readTextFileSync('data/lastUpdated.txt');
		if (!isNaN(Date.parse(lastUpdatedText)))
			lastUpdated = lastUpdatedText;
	}

	if (flags['update']) {
		// Update and exit if --update flag is passed
		await updateDatabase();
		Deno.exit(0);
	}
	else if (!getPathInfo(config.databaseFile)?.isFile) {
		// If database doesn't exist, initiate database build alongside server
		logMessage('no database found, starting database build');
		updateDatabase();
	}

	// Load the database
	globalThis.fp = new FlashpointArchive();
	fp.loadDatabase(config.databaseFile);

	// Update the database on a set interval
	if (config.updateFrequency > 0)
		globalThis.updateInterval = setInterval(updateDatabase, config.updateFrequency * 60 * 1000);
}

// Start the web server
function initServer() {
	// Start server on HTTP
	if (config.httpPort)
		globalThis.httpServer = Deno.serve({
			port: config.httpPort,
			hostname: config.hostName,
			onListen: serverListen,
			onError: serverError,
		}, serverHandler);

	// Start server on HTTPS
	if (config.httpsPort && config.httpsCert && config.httpsKey)
		globalThis.httpsServer = Deno.serve({
			port: config.httpsPort,
			cert: Deno.readTextFileSync(config.httpsCert),
			key: Deno.readTextFileSync(config.httpsKey),
			hostName: config.hostName,
			onListen: serverListen,
			onError: serverError,
		}, serverHandler);
}

// Create or update a database file
// Adapted from https://github.com/FlashpointProject/FPA-Rust/blob/master/crates/flashpoint-database-builder/src/main.rs
async function updateDatabase() {
	if (updateInProgress) return;
	updateInProgress = true;

	// Find out if we're creating a new database or updating an existing one
	const createNew = !getPathInfo(config.databaseFile)?.isFile;
	logMessage(`${createNew ? 'building new' : 'updating'} database...`);

	// Get old and new update times
	const oldLastUpdated = lastUpdated;
	const newLastUpdated = new Date().toISOString();

	// Initialize new database
	const fp = new FlashpointArchive();
	fp.loadDatabase(config.databaseFile);

	// Fetch and apply platforms
	const platsRes = await fetchFromFpfss(`platforms?after=${oldLastUpdated}`);
	logMessage(`applying ${platsRes.length} platforms...`);
	await fp.updateApplyPlatforms(platsRes.map(plat => propsToCamel(plat)));

	// Fetch and apply tags and tag categories
	const tagsRes = await fetchFromFpfss(`tags?after=${oldLastUpdated}`);
	logMessage(`applying ${tagsRes.categories.length} categories...`);
	await fp.updateApplyCategories(tagsRes.categories);
	logMessage(`applying ${tagsRes.tags.length} tags...`);
	await fp.updateApplyTags(tagsRes.tags.map(tag => propsToCamel(tag)));

	// Fetch and apply pages of games until there are none left
	let totalAppliedGames = 0;
	let pageNum = 1;
	let afterId;
	while (true) {
		const gamesRes = await fetchFromFpfss(`games?broad=true&after=${oldLastUpdated}` + (afterId ? `&afterId=${afterId}` : ''));
		logMessage(`applying page ${pageNum} of games... (total: ${totalAppliedGames + gamesRes.games.length})`);
		pageNum++;
		if (gamesRes.games.length > 0) {
			totalAppliedGames += gamesRes.games.length;
			afterId = gamesRes.games[gamesRes.games.length - 1].id;
			await fp.updateApplyGames({
				games: gamesRes.games.map(game => propsToCamel(game)),
				addApps: gamesRes.add_apps.map(addApp => propsToCamel(addApp)),
				gameData: gamesRes.game_data.map(gameData => propsToCamel(gameData)),
				tagRelations: gamesRes.tag_relations,
				platformRelations: gamesRes.platform_relations
			}, 'flashpoint-archive');
		}
		else
			break;
	}

	if (!createNew) {
		// Fetch and apply deleted games
		const deletionsRes = await fetchFromFpfss(`games/deleted?after=${oldLastUpdated}`);
		deletionsRes.games = deletionsRes.games.map(deletion => propsToCamel(deletion));
		logMessage(`applying ${deletionsRes.games.length} game deletions...`);
		await fp.updateDeleteGames(deletionsRes);

		// Fetch and apply game redirects
		const redirectsRes = await fetchFromFpfss(`game-redirects`);
		logMessage(`applying ${redirectsRes.length} game redirects...`);
		await fp.updateApplyRedirects(redirectsRes.map(redirect => ({
			sourceId: redirect.source_id,
			destId: redirect.id,
		})));
	}

	// Optimize the database
	logMessage('optimizing database...');
	await fp.optimizeDatabase();

	// Save time of last update
	logMessage('saving time of last update...');
	Deno.writeTextFileSync('data/lastUpdated.txt', newLastUpdated);
	lastUpdated = newLastUpdated;

	// We're done
	updateInProgress = false;
	logMessage(`database ${createNew ? 'created' : 'updated'} successfully!`);
}

// Fetch data from an FPFSS endpoint
async function fetchFromFpfss(endpoint) {
	return (await fetch(`${config.fpfssUrl}/api/${endpoint}`)).json();
}

// Change FPFSS properties to camel case to work with FPA library
function propsToCamel(obj) {
	const newObj = {};
	for (const prop of Object.keys(obj)) {
		const propParts = prop.split('_');
		propParts[0] = propParts[0].toLowerCase();
		for (let i = 1; i < propParts.length; i++)
			propParts[i] = propParts[i][0].toUpperCase() + propParts[i].substring(1).toLowerCase();
		const newProp = propParts.join('');
		newObj[newProp] = newProp == 'aliases'
			? obj[prop].split(';').map(alias => alias.trim())
			: obj[prop];
	}
	return newObj;
}

// Safely fill HTML template with text definitions
function buildHtml(template, defs) {
	const varSlices = [];
	const varExp = /(?:(^|\n)(\t*))?\{(.*?)\}/gs;
	for (let match; (match = varExp.exec(template)) !== null;) {
		const value = defs[match[3]];
		const newLine = match[1] ?? '';
		const tabs = match[2] ?? '';
		const formattedValue = value ? newLine + value.replaceAll(/^/gm, tabs) : '';
		varSlices.push({
			start: match.index,
			end: match.index + match[0].length,
			value: formattedValue,
		});
	}
	return replaceSlices(template, varSlices);
}

// Function to build table HTML given a set of data and field definitions
function buildTable(source, fields) {
	const tableRowsArr = [];
	for (const field in fields) {
		const rawValue = source[field];
		// If value doesn't exist or is empty or blank, skip it
		if (rawValue === undefined || rawValue.length === 0)
			continue;

		const fieldInfo = fields[field];
		let value;
		switch (fieldInfo.type) {
			case 'string': {
				// Sanitize value or use real name if defined
				if (Object.hasOwn(fieldInfo, 'values') && Object.hasOwn(fieldInfo.values, rawValue))
					value = fieldInfo.values[rawValue].name;
				else
					value = sanitizeInject(rawValue);
				break;
			}
			case 'list': {
				// Parse and sanitize list in respect to whether it is an array or a semicolon-delimited string
				let valueList = rawValue instanceof Array
					? rawValue.map(listValue => sanitizeInject(listValue))
					: rawValue.split(';').map(listValue => sanitizeInject(listValue.trim()));
				if (field == 'platforms') {
					// Remove primary platform from Other Technologies list
					if (source.primaryPlatform !== undefined)
						valueList = valueList.filter(listValue => listValue != source.primaryPlatform);
				} else if (field == 'language') {
					// Display real names of languages instead of their language codes
					const displayNames = new Intl.DisplayNames(['en-US'], { type: 'language' });
					valueList = valueList.map(listValue => {
						try { return displayNames.of(listValue); }
						catch { return listValue; }
					});
				}

				if (valueList.length > 0)
					// Render as a bulleted list if there are multiple values
					// Otherwise, render as a normal string
					value = valueList.length == 1
						? valueList[0]
						: `<ul>${valueList.map(listValue => `<li>${listValue}</li>`).join('')}</ul>`;
				break;
			}
			case 'date': {
				// Parse date into formatted string
				const parsedValue = new Date(rawValue);
				if (!isNaN(parsedValue)) {
					if (rawValue.length == 4)
						value = `${parsedValue.getUTCFullYear()}`;
					else if (rawValue.length == 7)
						value = `${parsedValue.getUTCMonth() + 1}/${parsedValue.getUTCFullYear()}`;
					else if (rawValue.length == 10)
						value = parsedValue.toLocaleDateString(config.defaultLang, { timeZone: 'UTC' });
					else
						value = parsedValue.toLocaleString(config.defaultLang, { timeZone: 'UTC' });
				}
				break;
			}
			case 'size': {
				// Format bytes into human-readable string
				if (typeof(rawValue) == 'number')
					value = format(rawValue, { locale: 'en-US' });
				break;
			}
			case 'number': {
				// Parse number into comma-separated string
				const parsedValue = parseInt(rawValue, 10);
				if (!isNaN(parsedValue))
					value = parsedValue.toLocaleString('en-US');
				break;
			}
		}

		// If value was able to be parsed, build HTML for its respective table row
		if (value !== undefined)
			tableRowsArr.push(buildHtml(templates.row, {
				'Field': fieldInfo.name + ':',
				'Value': value.replaceAll('\n', '<br>'),
			}));
	}

	// Build and return table HTML
	return buildHtml(templates.table, { 'Table_Rows': tableRowsArr.join('\n') });
};

// Build external resource elements
function buildStyles(...urls) { return urls.map(url => `<link rel="stylesheet" href="${url}">`).join('\n'); }
function buildScripts(...urls) { return urls.map(url => `<script src="${url}"></script>`).join('\n'); }

// Replace slices of a string with different values
function replaceSlices(str, slices) {
	let offset = 0;
	let newStr = '';
	for (const slice of slices.toSorted((a, b) => a.start - b.start)) {
		newStr += str.substring(0, slice.start - offset) + slice.value;
		str = str.substring(slice.end - offset);
		offset = slice.end;
	}
	return newStr + str;
}

// Sanitize string to ensure it can't inject tags or escape attributes
function sanitizeInject(str) {
	if (str.length == 0) return str;
	const charMap = {
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
	};
	const charMapExp = new RegExp(`[${Object.keys(charMap).join('')}]`, 'g');
	return str.replace(charMapExp, m => charMap[m]);
}

// Run Deno.lstat without throwing error if path doesn't exist
function getPathInfo(path) {
	try { return Deno.lstatSync(path); } catch {}
	return null;
}

// Log to the appropriate locations
function logMessage(message) {
	message = `[${new Date().toLocaleString()}] ${message}`;
	if (config.logToConsole) console.log(message);
	if (config.logFile) try { Deno.writeTextFile(config.logFile, message + '\n', { append: true }); } catch {}
}

// 400 Bad Request
class BadRequestError extends Error {
	constructor(message) {
		super(message);
		this.name = this.constructor.name;
		this.status = 400;
		this.statusText = 'Bad Request';
	}
}

// 404 Not Found
class NotFoundError extends Error {
	constructor(message) {
		super(message);
		this.name = this.constructor.name;
		this.status = 404;
		this.statusText = 'Not Found';
	}
}