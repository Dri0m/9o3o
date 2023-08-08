const oooo = 'https://api.ooooooooo.ooo';
const fpdb = 'https://db-api.unstable.life';

// Create unmodified copies of methods that will be redirected
const _fetch = window.fetch;
const _createElement = document.createElement;

// Player attributes and initialization methods
const players = [
    {
        source: 'https://unpkg.com/@ruffle-rs/ruffle',
        platforms: [ 'Flash' ],
        extensions: [ '.swf' ],
        
        get override() { return window.RufflePlayer && window.RufflePlayer.sources.extension != null; },
        
        initialize(launchCommand) {
            let player = window.RufflePlayer.newest().createPlayer();
            // Set base URL to path of launch command
            player.config.base = launchCommand.substring(0, launchCommand.lastIndexOf('/'));
            
            // Add player to DOM and load
            document.querySelector('.player').append(player);
            player.load(launchCommand);
            
            // Once loaded, resize player to dimensions of SWF
            player.addEventListener('loadedmetadata', () => {
                if (player.metadata.width > 1 && player.metadata.height > 1) {
                    player.style.width  = player.metadata.width  + 'px';
                    player.style.height = player.metadata.height + 'px';
                }
            });
        }
    },
    {
        source: 'https://create3000.github.io/code/x_ite/latest/x_ite.min.js',
        platforms: [ 'VRML', 'X3D' ],
        extensions: [ '.wrl', '.wrl.gz', '.x3d' ],
        
        get override() { return false; },
        
        initialize(launchCommand) {
            let player = X3D.createBrowser();
            // There's no way to identify the intended dimensions of a VRML/X3D file, so always resize to 900x600
            player.style.width = '900px';
            player.style.height = '600px';
            // Set base URL to path of launch command
            player.browser.baseURL = launchCommand.substring(0, launchCommand.lastIndexOf('/'));
            
            // Add player to DOM and load
            document.querySelector('.player').append(player);
            player.browser.loadURL(new X3D.MFString(launchCommand));
        }
    }
];

// Build API request
let request = oooo + '/get';
// If query string exists in current URL, assume the client wants to access a specific entry, and append to request as ID
if (location.search != '')
    request += '?id=' + location.search.substring(1);
// If there is no query string, assume the client wants to access a random entry, and apply NSFW filter if enabled 
else if (localStorage.getItem('filter') != 'false')
    request += '?filter=true';

// Fetch API request
fetch(request).then(async response => {
    // Deserialize JSON response
    let entry;
    try {
        entry = await response.json();
    // If deserialization fails, replace page content with error message
    } catch {
        document.querySelector('.header').textContent = 'The specified entry is invalid.';
        document.querySelectorAll('.content *:not(.header)').forEach(elem => elem.style.display = 'none');
        return;
    }
    
    // Add entry title to page title and display above player
    document.title = entry.title + ' - 9o3o';
    document.querySelector('.header').textContent = entry.title;
    
    // Allow NSFW filter preferences to persist across page loads using localStorage
    let toggle = document.querySelector('.toggle input');
    if (localStorage.getItem('filter') == 'false') toggle.checked = false;
    toggle.addEventListener('change', e => {
        localStorage.setItem('filter', e.target.checked.toString());
    });
    
    // Update right-hand footer links
    document.querySelector('.info').href = 'https://flashpointproject.github.io/flashpoint-database/search/#' + entry.uuid;
    document.querySelector('.link').href = './?' + entry.uuid;
    
    // Calculate rating and total votes
    let total = entry.votesWorking + entry.votesBroken;
    if (total > 0) {
        document.querySelector('.fraction').textContent = (Math.round((entry.votesWorking / total) * 100) / 10) + '/10';
        document.querySelector('.total').textContent = total;
    }
    
    // Send POST request and hide voting buttons when vote is submitted
    document.querySelectorAll('.button').forEach(elem => elem.addEventListener('click', () => {
        document.querySelector('.vote').textContent = 'Thank you.';
        _fetch(`${oooo}/${elem.classList[1]}?id=${entry.uuid}`, { method: 'POST' });
    }));
    
    // Identify appropriate player based on launch command
    let p = Math.max(0, players.findIndex(player => player.extensions.some(ext => entry.launchCommand.toLowerCase().endsWith(ext))));
    
    // Don't load a second instance of player if it's already active (ie. by using an extension)
    if (players[p].override)
        playEntry(entry, p);
    // Otherwise, load player by appending <script> element to page
    else {
        let script = document.createElement('script');
        script.src = players[p].source;
        script.addEventListener('load', () => playEntry(entry, p));
        document.head.append(script);
    }
});

async function playEntry(entry, p) {
    let gameZip = null;
    // If the entry is zipped, retrieve zip from API and load into JSZip
    try {
        if (entry.zipped) gameZip = await new JSZip().loadAsync(await fetch(`${fpdb}/get?id=${entry.uuid}`).then(r => r.blob()));
    // If there are issues retrieving/loading the zip, replace content with error message
    } catch {
        let player = document.querySelector('.player');
        player.style.fontSize = '12px';
        player.style.padding = '16px 0 20px';
        player.textContent = 'Failed to load entry. This is not an emulator issue.';
        return;
    }
    
    // Automatically convert URL objects to their redirected equivalents
    let redirect = async request => {
        let url = {
            // The requested URL, adjusted to use the launch command as the base rather than the current domain
            original: new URL(request.origin == location.origin ? request.pathname.substring(1) : request.href, entry.launchCommand),
            // The actual URL from which the requested file will be retrieved
            redirect: ''
        };
        
        // If the entry is zipped and requested file exists inside zip, return object URL of file 
        if (entry.zipped) {
            let redirectedFile = gameZip.file(decodeURIComponent('content/' + url.original.hostname + url.original.pathname));
            if (redirectedFile != null) {
                url.redirect = URL.createObjectURL(await redirectedFile.async('blob'));
                return url;
            }
        }
        
        // If entry is not zipped or requested file does not exist inside zip, return API request to be fetched later
        url.redirect = `${fpdb}/get?url=${url.original.hostname + url.original.pathname}`;
        return url;
    };
    
    // Intercept calls to Fetch API with code that replaces the requested URL with redirected equivalent (required for Ruffle)
    window.fetch = async (resource, options) => {
        // Get request as URL object
        let resourceURL = new URL(resource instanceof Request ? resource.url : resource);
        
        // ??? (I think this was for some obscure edge case I can't find examples of anymore)
        if (resourceURL.protocol == 'blob:')
            resourceURL = new URL(resourceURL.pathname);
        
        // Don't redirect if the requested URL belongs to the active player or doesn't use HTTP
        if (players[p].source.startsWith(resourceURL.origin) || !resourceURL.protocol.startsWith('http'))
            return await _fetch(resource, options);
        
        // Get redirected URL and forward to unmodified Fetch API
        let redirectInfo = await redirect(resourceURL),
            response = await _fetch(redirectInfo.redirect, options);
        
        // Spoof URL to bypass sitelocks
        Object.defineProperty(response, 'url', { value: redirectInfo.original.href });
        
        return response;
    };
    
    // Intercept calls to createElement method with code that replaces the source value of <img> elements with redirected equivalent (required for X_ITE)
    document.createElement = function(...args) {
        let observer = new MutationObserver(async records => {
            // Only redirect requests that haven't already been redirected yet
            let r = records.findIndex(record => !['blob:', fpdb].some(prefix => record.target.src.startsWith(prefix)));
            if (r != -1) records[r].target.src = (await redirect(new URL(records[r].target.src))).redirect;
        });
        
        // Create the element 
        let element = _createElement.apply(this, args);
        // If created element is an <img> element, observe changes to source value
        if (element.tagName == 'IMG')
            observer.observe(element, { attributes: true, attributeFilter: ['src'] });
        
        return element;
    };
    
    // Load player now that requests are being actively redirected
    players[p].initialize(entry.launchCommand);
}