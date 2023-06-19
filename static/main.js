// Global variable that will contain the entry's UUID
let uuid = '';

// URL of Flashpoint's htdocs folder
const htdocs = 'https://ooooooooo.ooo/htdocs/';
// URL to fetch a random entry from
const random = 'https://api.ooooooooo.ooo/random';
// URL to fetch a specific entry from
const get = (uuid) => `https://api.ooooooooo.ooo/get/${uuid}`;
// URL to tell the site that the entry is working
const working = () => `https://api.ooooooooo.ooo/working/${uuid}`;
// URL to tell the site that the entry is broken
const broken = () => `https://api.ooooooooo.ooo/broken/${uuid}`;

// Copy of the unaltered fetch() method
const originalFetch = window.fetch;

// To-do: figure out why 'load' event never fires
document.addEventListener('DOMContentLoaded', () => {
    let queryString = location.search.substring(1),
        api = '';
    
    // Use unfiltered random API if query string is '?nsfw'
    if (queryString == 'nsfw')
        api = random + '?nsfw';
    // Use direct API if query string otherwise exists
    else if (queryString.length > 0)
        api = get(queryString);
    // Usr filtered random API if query string does not exist
    else
        api = random;
    
    // Get entry data
    fetch(api)
    // Get JSON representation of that data
    .then((response) => response.json())
    // Do the things
    .then((data) => {
        // Display error if entry does not exist
        if (data.uuid.length == 0) {
            document.body.innerHTML = 'The specified entry does not exist!';
            return;
        }
        // Display error if entry is not a Flash game
        if (!data.launchCommand.toLowerCase().endsWith('.swf')) {
            document.body.innerHTML = 'The specified entry is not a Flash game!';
            return;
        }
        
        // Fill in the UUID for use by the voting function
        uuid = data.uuid;
        
        // Create Ruffle instance and add it to DOM
        const player = window.RufflePlayer.newest().createPlayer();
        document.querySelector('#player').append(player);
        
        // Set base path for all resources to that of main SWF
        window.RufflePlayer.config.base = data.launchCommand.substring(0, data.launchCommand.lastIndexOf('/'));
        
        // Add redirection to fetch() method
        // Concept adapted from https://github.com/TBubba/ruffle-redirect-poc
        window.fetch = async (resource, options) => {
            // Get URL object for requested resource
            let resourceURL = new URL(resource instanceof Request ? resource.url : resource);
            
            // Don't redirect if the file is a Ruffle dependency or part of a browser extension
            if (resourceURL.hostname == 'unpkg.com' || !resourceURL.protocol.startsWith('http'))
                return await originalFetch(resource, options);
            
            // Otherwise, fetch the requested resource from htdocs instead
            let response = await originalFetch(htdocs + resourceURL.hostname + resourceURL.pathname, options);
            Object.defineProperty(response, "url", { value: resourceURL.href });
            return response;
        }
        
        // Load entry from original URL
        // This will be redirected by the modified fetch() method as well as any other files the entry requests
        player.load(data.launchCommand);
        
        // Display title of entry
        document.querySelector('#title').textContent = data.title;
        
        // Display direct link to entry
        document.querySelector('#direct a').href = './?' + data.uuid;
        document.querySelector('#direct').hidden = false;
        
        // Display compatibility rating of entry
        if (data.votesWorking + data.votesBroken > 0) {
            let totalVotes = data.votesWorking + data.votesBroken,
                fraction   = data.votesWorking / totalVotes,
                rating     = Math.round(fraction * 100) / 10;
            
            document.querySelector('#rating span').textContent = ` ${rating}/10 (${totalVotes} total votes)`;
        }
        else
            document.querySelector('#rating span').textContent = ` none yet`;
        
        // Once loaded, set dimensions of player to that of the SWF
        player.addEventListener('loadedmetadata', () => {
            if (player.metadata.width > 1 && player.metadata.height > 1) {
                player.style.width  = player.metadata.width  + 'px';
                player.style.height = player.metadata.height + 'px';
            }
        });
        
        // Now that everything else is ready, display voting prompt
        document.querySelector('#vote').hidden = false;
    });
});

// Send vote to server
function vote(callback) {
    let xhr = new XMLHttpRequest();
    xhr.open('POST', callback(), true);
    xhr.send();
    
    // Replace voting buttons with a thank you message
    document.querySelector('#vote span:first-child').hidden = true;
    document.querySelector('#vote span:last-child' ).hidden = false;
}
