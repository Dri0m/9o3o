let entryData, gameZipData;
let zipServerOrigin, legacyServerOrigin;
let supportedPlatforms, supportedExts;

// Copy of unmodified fetch method
const _fetch = window.fetch;

// Player initialization methods
const players = {
	'Ruffle': async (container) => {
		// Allow script to be overridden by extension if it was compiled within the past 24 hours
		let overrideScript = false;
		if (window.RufflePlayer && window.RufflePlayer.sources.extension) {
			const buildDate = window.RufflePlayer.sources.extension.version.split('+')[1];
			if (Date.now() - new Date(buildDate).getTime() < 86400000)
				overrideScript = true;
		}

		// If script cannot/should not be overridden, load it
		const scriptUrl = 'https://unpkg.com/@ruffle-rs/ruffle';
		if (!overrideScript)
			await loadScript(scriptUrl);

		// Intercept fetches and return redirected response
		window.fetch = async (resource, options) => {
			// Get request as URL object
			let resourceUrl = new URL(resource instanceof Request ? resource.url : resource);

			// Fix for some obscure edge case I can't remember the exact details of
			if (resourceUrl.protocol == 'blob:')
				resourceUrl = new URL(resourceUrl.pathname);

			// Don't redirect if the requested URL belongs to the active player or doesn't use HTTP
			if (scriptUrl.startsWith(resourceUrl.origin) || !resourceUrl.protocol.startsWith('http'))
				return await _fetch(resource, options);

			// Get redirected URL and fetch
			const redirectInfo = await redirect(resourceUrl);
			const response = await _fetch(redirectInfo.new, options);

			// Spoof URL to bypass sitelocks
			Object.defineProperty(response, 'url', { value: redirectInfo.old.href });

			return response;
		};

		// Create player instance and add to page
		const player = window.RufflePlayer.newest().createPlayer();
		player.className = 'player';
		container.appendChild(player);

		// Load the SWF
		player.ruffle().load({
			url: entryData.launchCommand,
			// Set base URL to directory of launch command
			base: entryData.launchCommand.substring(0, entryData.launchCommand.lastIndexOf('/') + 1),
			// Allow entries that use ExternalInterface to work
			allowScriptAccess: true
		});

		// Use custom player width/height if supplied
		const params = new URL(location).searchParams;
		let width, height;
		if (params.has('width')) {
			const widthParam = parseInt(params.get('width'), 10);
			if (!isNaN(widthParam))
				width = widthParam;
		}
		if (params.has('height')) {
			const heightParam = parseInt(params.get('height'), 10);
			if (!isNaN(heightParam))
				height = heightParam;
		}

		// Otherwise, set width and height to that of the SWF
		await new Promise(resolve => player.addEventListener('loadedmetadata', () => {
			if (!width) width = player.ruffle().metadata.width;
			if (!height) height = player.ruffle().metadata.height;
			resolve();
		}));

		// Use Flash Player defaults if width or height is invalid
		if (width <= 1) width = 550;
		if (height <= 1) height = 400;

		// Build the sizer
		await initSizer(container, width, height);
	},
	'DirPlayer': async (container) => {
		// Observe when the player canvas is created and sized
		const canvasObserver = new MutationObserver((mutationList, observer) => {
			for (const mutation of mutationList) {
				if (mutation.target.nodeName == 'CANVAS') {
					// Stop observing mutations
					observer.disconnect();

					// Use custom player width/height if supplied, otherwise use canvas dimensions
					const params = new URL(location).searchParams;
					let [width, height] = [mutation.target.width, mutation.target.height];
					if (params.has('width')) {
						const widthParam = parseInt(params.get('width'), 10);
						if (!isNaN(widthParam) && widthParam > 1)
							width = widthParam;
					}
					if (params.has('height')) {
						const heightParam = parseInt(params.get('height'), 10);
						if (!isNaN(heightParam) && heightParam > 1)
							height = heightParam;
					}

					// Build the sizer and get out of here
					initSizer(container, width, height);
					break;
				}
			}
		});

		// Observe when the player is created
		const playerObserver = new MutationObserver((mutationList, observer) => {
			for (const mutation of mutationList) {
				if (mutation.addedNodes.length > 0 && mutation.addedNodes[0].nodeName == 'DIV') {
					// Stop observing mutations
					observer.disconnect();

					// Add CSS to player
					const player = mutation.addedNodes[0];
					player.classList.add('player', 'shockwave');

					// Start observing when player canvas is created and sized
					canvasObserver.observe(player, { subtree: true, attributes: true, attributeFilter: ['width'] });
				}
			}
		});
		playerObserver.observe(container, { childList: true });

		// Load the polyfill
		await loadScript('https://dirplayer-rs.s3.us-west-2.amazonaws.com/dirplayer-polyfill-latest.js');

		// Intercept fetches and return redirected response
		window.fetch = async (resource, options) => {
			// Get request as URL object
			const resourceUrl = new URL(resource instanceof Request ? resource.url : resource);

			// Don't redirect if the requested URL doesn't use HTTP
			if (!resourceUrl.protocol.startsWith('http'))
				return await _fetch(resource, options);

			// Get redirected URL and fetch
			const redirectInfo = await redirect(resourceUrl);
			const response = await _fetch(redirectInfo.new, options);

			// Spoof URL to bypass sitelocks
			Object.defineProperty(response, 'url', { value: redirectInfo.old.href });

			return response;
		};

		// Initialize Shockwave embed to be replaced by the polyfill
		const embed = document.createElement('embed');
		embed.width = 480;
		embed.height = 360;

		// Try to parse components of SPR launch command
		const sprExps = [/(?:^|SPR.exe\s+)"(.*?)"/, /(?:^|SPR.exe\s+)([^ ]*)/];
		for (const sprExp of sprExps) {
			const sprMatch = entryData.launchCommand.match(sprExp);
			if (sprMatch) {
				embed.setAttribute('src', sprMatch[1]);
				for (const extParam of entryData.launchCommand.matchAll(/--setExternalParam\s+"(.*?)"\s+"(.*?)"/g))
					embed.setAttribute(extParam[1], extParam[2]);
				break;
			}
		}

		// Otherwise, just use the full launch command
		if (!embed.hasAttribute('src'))
			embed.setAttribute('src', entryData.launchCommand);

		// Add embed to page
		container.appendChild(embed);
	},
	'X_ITE': async (container) => {
		// Load the script
		await loadScript('https://create3000.github.io/code/x_ite/latest/x_ite.min.js');

		// Create copy of unmodified createElement method
		const _createElement = document.createElement;
		// Intercept calls to createElement and return <img> elements with redirected src attribute
		document.createElement = function(...args) {
			const observer = new MutationObserver(async mutationList => {
				for (const mutation of mutationList) {
					// Only redirect requests that haven't already been redirected yet
					if (!['blob:', zipServerOrigin, legacyServerOrigin].some(prefix => mutation.target.src.startsWith(prefix)))
						mutation.target.src = (await redirect(new URL(mutation.target.src))).new;
				}
			});

			// Create the element
			const element = _createElement.apply(this, args);
			// If created element is an <img> element, observe changes to src attribute
			if (element.tagName == 'IMG')
				observer.observe(element, { attributes: true, attributeFilter: ['src'] });

			return element;
		};

		// Create player instance and add to page
		const player = X3D.createBrowser();
		player.className = 'player';
		container.appendChild(player);

		// Use custom player width/height if supplied, otherwise use 900x600 since VRML/X3D files do not specify dimensions
		const params = new URL(location).searchParams;
		let [width, height] = [900, 600];
		if (params.has('width')) {
			const widthParam = parseInt(params.get('width'), 10);
			if (!isNaN(widthParam) && widthParam > 1)
				width = widthParam;
		}
		if (params.has('height')) {
			const heightParam = parseInt(params.get('height'), 10);
			if (!isNaN(heightParam) && heightParam > 1)
				height = heightParam;
		}

		// Build the sizer
		await initSizer(container, width, height);

		// Set base URL to directory of launch command and load the world
		player.browser.baseURL = entryData.launchCommand.substring(0, entryData.launchCommand.lastIndexOf('/') + 1);
		player.browser.loadURL(new X3D.MFString((await redirect(new URL(entryData.launchCommand))).new));
	}
};

// Take a request and return a redirected URL (and the old one too)
async function redirect(request) {
	// The requested URL, adjusted to use the launch command as the base if necessary
	const oldUrl = (() => {
		const isRelative = [location.origin, zipServerOrigin, legacyServerOrigin].some(origin => origin == request.origin);
		return isRelative ? new URL(request.pathname.substring(1), entryData.launchCommand) : request;
	})();

	// The actual URL from which the requested file will be retrieved
	const newUrl = await (async () => {
		// If the entry is zipped and the requested file exists inside of the zip, return a blob URL of the file
		if (gameZipData) {
			const requestPathLower = decodeURIComponent('content/' + oldUrl.hostname + oldUrl.pathname).toLowerCase();
			for (const path in gameZipData.files) {
				if (path.toLowerCase() != requestPathLower)
					continue;

				const file = gameZipData.files[path];
				if (file && !file.dir)
					return URL.createObjectURL(await file.async('blob'));
			}
		}

		// If entry is not zipped and/or the requested file does not exist inside of the zip, return URL on the legacy file server
		return entryData.legacyServer + '/' + oldUrl.hostname + oldUrl.pathname;
	})();

	return { old: oldUrl, new: newUrl };
};

// Start the player
async function initPlayer(container) {
	// Retrieve entry/platform information
	entryData = container.dataset;
	supportedPlatforms = await (await fetch('/platforms')).json();
	supportedExts = supportedPlatforms.reduce((exts, platform) => exts.concat(platform.extensions), []);

	let invalidLaunchCommand = entryData.launchCommand == '';
	const launchCommandLower = entryData.launchCommand.toLowerCase();

	// Identify player from launch command
	let player;
	if (!invalidLaunchCommand) {
		const platform = supportedPlatforms.find(platform => platform.extensions.some(ext => launchCommandLower.includes(ext)));
		if (!platform)
			invalidLaunchCommand = true;
		else
			player = players[platform.player];
	}

	legacyServerOrigin = new URL(entryData.legacyServer).origin;

	if (entryData.gameZip != '') {
		zipServerOrigin = new URL(entryData.gameZip).origin;

		// Fetch zip and load JSZip script to interpret it
		const [gameZip] = await Promise.all([
			new Promise(resolve => {
				const xhr = new XMLHttpRequest();
				xhr.responseType = 'blob';

				xhr.addEventListener('progress', event => {
					// Display loading text
					const percentage = Math.round(event.loaded / event.total * 100);
					container.textContent = `Loading ${entryData.launchCommand || 'undefined'} from ${entryData.gameZip}...\n\n${percentage}%`;
				});
				xhr.addEventListener('load', () => resolve(xhr.response));
				xhr.addEventListener('error', () => resolve(null));

				xhr.open('GET', entryData.gameZip);
				xhr.send();
			}),
			loadScript('/jszip.min.js')
		]);

		if (!gameZip) {
			container.textContent = 'Failed to download game data.';
			return;
		}

		// Open zip through JSZip
		try {
			gameZipData = await new JSZip().loadAsync(gameZip);
			initFileViewer();
		}
		catch (error) {
			console.error(error);
			container.textContent = 'Failed to open game data.';
			return;
		}
	}
	else if (!invalidLaunchCommand) {
		// Display static loading message for legacy entry
		zipServerOrigin = '';
		container.textContent = `Loading ${entryData.launchCommand}...`;
	}
	else {
		// Abort legacy entry immediately if launch command is invalid
		container.textContent = 'The launch command is invalid.';
		return;
	}

	// Abort zipped entry after loading the zip if launch command is invalid, allowing the zip to be browsed
	if (invalidLaunchCommand) {
		container.textContent = 'The launch command is invalid.\n\nCheck the info panel for supported files.';
		return;
	}

	// Clear loading text
	container.textContent = '';

	// Add player to page and activate redirector
	player(container);
}

// Show entry files in the panel if zip is loaded
function initFileViewer() {
	const params = new URL(location).searchParams;

	// Create table header
	const filesHeader = document.createElement('div');
	filesHeader.className = 'header-small';
	filesHeader.textContent = 'Files';

	// Create table
	const filesTable = document.createElement('div');
	filesTable.className = 'table';
	// Loop through files in zip and add them to table
	for (const path in gameZipData.files) {
		const file = gameZipData.files[path];
		if (!path.startsWith('content/') || !file || file.dir) continue;
		const shortPath = path.substring('content/'.length);
		const pathLower = shortPath.toLowerCase();

		// Create table row
		const tableRow = document.createElement('div');
		tableRow.className = 'row';

		// Create path text
		let tablePath;
		if (supportedExts.some(ext => pathLower.includes(ext))) {
			// Make path a direct link if file is supported
			tablePath = document.createElement('a');
			const pathUrl = new URL(location.origin);
			pathUrl.searchParams.set('id', entryData.id);
			if (params.has('rev'))
				pathUrl.searchParams.set('rev', params.get('rev'));
			pathUrl.searchParams.set('path', shortPath);
			tablePath.href = pathUrl.href;
		}
		else
			tablePath = document.createElement('div');
		tablePath.className = 'path';
		tablePath.textContent = shortPath;

		// Add path to row and row to table
		tableRow.appendChild(tablePath);
		filesTable.appendChild(tableRow);
	}

	// Add table to panel
	const panel = document.querySelector('.panel');
	panel.appendChild(filesHeader);
	panel.appendChild(filesTable);
}

// Build an aspect ratio-maintaining image element to properly scale player
async function initSizer(container, width, height) {
	// Create image element
	const sizer = document.createElement('img');
	sizer.className = 'sizer';

	// Create canvas from which image data will be derived
	const canvas = document.createElement('canvas');
	[canvas.width, canvas.height] = [width, height];

	// Get image data from canvas and apply to element
	const blob = await new Promise(resolve => canvas.toBlob(blob => resolve(blob)));
	sizer.src = URL.createObjectURL(blob);

	// Add sizer to page
	container.appendChild(sizer);

	// Prevent player from exceeding width of content and activate sizer
	container.style.maxWidth = width + 'px';
	container.classList.remove('loading');
}

// Allow info panel to be toggled and open it automatically if needed
function initPanel(container) {
	const moreInfo = document.querySelector('.more-info');
	moreInfo.addEventListener('click', () => togglePanel(container, moreInfo));

	if (localStorage.getItem('showPanel') == 'true')
		togglePanel(container, moreInfo);
}

// Allow the user to expand/shrink the info panel
function initDraggable(container) {
	const draggable = document.querySelector('.draggable');
	const bodyData = document.body.dataset;
	let initPanelWidth, initMousePos;

	draggable.addEventListener('mousedown', event => {
		bodyData.dragging = 'true';
		initPanelWidth = container.offsetWidth;
		initMousePos = event.clientX;
	});
	document.addEventListener('mouseup', () => {
		delete bodyData.dragging;
	});

	document.addEventListener('mousemove', event => {
		if (bodyData.dragging == 'true')
			container.style.width = `${initPanelWidth + (initMousePos - event.clientX)}px`;
	});
}

// Show/hide info panel
function togglePanel(container, moreInfo) {
	container.classList.toggle('hidden');
	if (container.classList.contains('hidden')) {
		localStorage.setItem('showPanel', 'false');
		moreInfo.textContent = '[More Info]';
	}
	else {
		localStorage.setItem('showPanel', 'true');
		moreInfo.textContent = '[Less Info]';
	}
}

// Fetch a script and return a promise that resolves when it is loaded
function loadScript(url) {
	const script = document.createElement('script');
	const scriptLoad = new Promise(resolve => script.addEventListener('load', resolve));
	script.src = url;
	document.head.appendChild(script);

	return scriptLoad;
}

document.addEventListener('DOMContentLoaded', () => {
	// Prepare the player
	const playerContainer = document.querySelector('.player-container');
	initPlayer(playerContainer);

	// Prepare the info panel
	const panelContainer = document.querySelector('.panel-container');
	initPanel(panelContainer);
	initDraggable(panelContainer);
});