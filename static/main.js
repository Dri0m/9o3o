// Global variable that will contain the game's UUID
let uuid = '';

// URL of Flashpoint's htdocs folder
const htdocs = 'https://ooooooooo.ooo/htdocs/';
// URL to fetch a random game from
const random = 'https://api.ooooooooo.ooo/random';
// URL to tell the site that the game is working
const working = () => `https://api.ooooooooo.ooo/working/${uuid}`;
// URL to tell the site that the game is broken
const broken = () => `https://api.ooooooooo.ooo/broken/${uuid}`;

// Copy of the unaltered fetch() method
const originalFetch = window.fetch;

// To-do: figure out why 'load' event never fires
document.addEventListener('DOMContentLoaded', () => {
    // Get data for random game
    fetch(random)
    // Get JSON representation of that data
    .then((response) => response.json())
    // Do the things
    .then((data) => {
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
            return await originalFetch(htdocs + resourceURL.hostname + resourceURL.pathname, options);
        }
        
        // Load game from original URL
        // This will be redirected by the modified fetch() method as well as any other files the game requests
        player.load(data.launchCommand);
        
        // Display title of game
        document.querySelector('#title').textContent = data.title;
        
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
    document.querySelector('#vote span:nth-child(1)').hidden = true;
    document.querySelector('#vote span:nth-child(2)').hidden = false;
}