const oooo = 'https://api.ooooooooo.ooo';
const fpdb = 'https://db-api.unstable.life';

const _fetch = window.fetch;
const _createElement = document.createElement;

const players = [
    {
        source: 'https://unpkg.com/@ruffle-rs/ruffle',
        platforms: [ 'Flash' ],
        extensions: [ '.swf' ],
        
        initialize(launchCommand) {
            let player = window.RufflePlayer.newest().createPlayer();
            player.config = {
                warnOnUnsupportedContent: false,
                base: launchCommand.substring(0, launchCommand.lastIndexOf('/'))
            };
            
            document.querySelector('.player').append(player);
            player.load(launchCommand);
            
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
        
        initialize(launchCommand) {
            let player = X3D.createBrowser();
            player.style.width = '900px';
            player.style.height = '600px';
            player.browser.baseURL = launchCommand.substring(0, launchCommand.lastIndexOf('/'));
            
            document.querySelector('.player').append(player);
            player.browser.loadURL(new X3D.MFString(launchCommand));
        }
    }
];

let request = oooo + '/get';
if (location.search != '')
    request += '?id=' + location.search.substring(1);
else if (localStorage.getItem('filter') != 'false')
    request += '?filter=true';

fetch(request).then(async response => {
    let entry;
    try {
        entry = await response.json();
    } catch {
        document.querySelector('.header').textContent = 'The specified entry is invalid.';
        document.querySelectorAll('.content *:not(.header)').forEach(elem => elem.style.display = 'none');
        return;
    }
    
    document.title = entry.title + ' - 9o3o';
    document.querySelector('.header').textContent = entry.title;
    
    let toggle = document.querySelector('.toggle input');
    
    if (localStorage.getItem('filter') == 'false')
        toggle.checked = false;
    
    toggle.addEventListener('change', e => {
        localStorage.setItem('filter', e.target.checked.toString());
    });
    
    document.querySelector('.info').href = 'https://flashpointproject.github.io/flashpoint-database/search/#' + entry.uuid;
    document.querySelector('.link').href = './?' + entry.uuid;
    
    let total = entry.votesWorking + entry.votesBroken;
    if (total > 0) {
        document.querySelector('.fraction').textContent = (Math.round((entry.votesWorking / total) * 100) / 10) + '/10';
        document.querySelector('.total').textContent = total;
    }
    
    document.querySelectorAll('.button').forEach(elem => elem.addEventListener('click', () => {
        _fetch(`${oooo}/${elem.classList[1]}?id=${entry.uuid}`, { method: 'POST' }).then(() => {
            document.querySelector('.vote').textContent = 'Thank you.';
        });
    }));
    
    for (let i = 0; i < players.length; i++) {
        if (players[i].extensions.some(ext => entry.launchCommand.toLowerCase().endsWith(ext))) {
            let script = document.createElement('script');
            script.src = players[i].source;
            
            document.head.append(script);
            script.addEventListener('load', () => playEntry(entry, i));
            
            return;
        }
    }
});

async function playEntry(entry, player) {
    let gameZip = null;
    try {
        if (entry.zipped) gameZip = await new JSZip().loadAsync(await fetch(`${fpdb}/get?id=${entry.uuid}`).then(r => r.blob()));
    } catch {
        let player = document.querySelector('.player');
        player.style.fontSize = '12px';
        player.style.padding = '16px 0 20px';
        player.textContent = 'Failed to load entry. This is not an emulator issue.';
        return;
    }
    
    let redirect = async url => {
        let info = {
            base: new URL(url.origin == location.origin ? url.pathname.substring(1) : url.href, entry.launchCommand),
            url: ''
        };
        
        if (entry.zipped) {
            let redirectedFile = gameZip.file(decodeURIComponent('content/' + info.base.hostname + info.base.pathname));
            if (redirectedFile != null) {
                info.url = URL.createObjectURL(await redirectedFile.async('blob'));
                return info;
            }
        }
        
        info.url = `${fpdb}/get?url=${info.base.hostname + info.base.pathname}`;
        return info;
    };
    
    window.fetch = async (resource, options) => {
        let resourceURL = new URL(resource instanceof Request ? resource.url : resource);
        
        if (resourceURL.protocol == 'blob:')
            resourceURL = new URL(resourceURL.pathname);
        
        if (resourceURL.hostname == 'unpkg.com' || !resourceURL.protocol.startsWith('http'))
            return await _fetch(resource, options);
        
        let redirectInfo = await redirect(resourceURL),
            response = await _fetch(redirectInfo.url, options);
        
        Object.defineProperty(response, 'url', { value: redirectInfo.base.href });
        return response;
    }
    
    document.createElement = function(...args) {
        let element = _createElement.apply(this, args),
            observer = new MutationObserver(async records => {
                for (let record of records) {
                    if (['blob:', fpdb].some(prefix => record.target.src.startsWith(prefix))) continue;
                    record.target.src = (await redirect(new URL(record.target.src))).url;
                }
            });
        
        if (element.tagName == 'IMG')
            observer.observe(element, { attributes: true, attributeFilter: ['src'] });
        
        return element;
    };
    
    players[player].initialize(entry.launchCommand);
}