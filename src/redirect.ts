window.addEventListener('load', function init() {
  // Get search paramters
  // @TODO Validate parameters
  const search_params = new URLSearchParams(window.location.search);
  const redirect_to = search_params.get('redirect_to') || '';
  const entry = search_params.get('entry') || '';

  // Set the base URL for requsts with relative files.
  // The base is set so all relative paths are relative to the entry file.
  // Note: This makes it possible for the Flash application to use relative paths.
  { // <- This scope is here just to separate this messy code from the parent scope.
    const base_url = new URL(entry);
    const last_slash_index = base_url.pathname.lastIndexOf('/');
    if (last_slash_index !== -1) {
      base_url.pathname = base_url.pathname.substr(0, last_slash_index);
    }

    window.RufflePlayer.config.base = base_url.href;
  }

  // Create and add the Ruffle player
  const ruffle = window.RufflePlayer.newest();
  const player = ruffle.createPlayer();
  document.body.appendChild(player);

  // Load the Flash file into Ruffle
  player.load(entry);

  // Initialize state
  // Note: These values to not have to be stored globally, you could store them wherever.
  window.RuffleRedirect = {
    redirect_to: new URL(redirect_to),
    original_fetch: window.fetch,
  };

  // Replace the fetch function with the wrapped version.
  // This is the function that Ruffle calls whenever it makes a request.
  // Note: This is done last so all of Ruffles files are loaded before we start rerouting requests.
  window.fetch = wrappedFetch;
});

async function wrappedFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  // Get the requested URL
  let input_url: URL;
  if (input instanceof Request) {
    input_url = new URL(input.url);
  } else {
    input_url = new URL(input + '');
  }

  let fake_input: RequestInfo = input;
  let fake_init: RequestInit | undefined = init;

  // Modify the arguments to redirect the request
  // Note: Feel free to edit how input_url is remapped. Maybe you want to include the protocol, port etc.
  // Diagram over URL components: https://nodejs.org/api/url.html#url_url_strings_and_url_objects
  { // <- This scope is here just to separate this messy code from the parent scope.
    const fake_input_url = new URL(window.RuffleRedirect!.redirect_to.href);

    fake_input_url.pathname += input_url.hostname;
    if (!input_url.pathname.startsWith('/')) { fake_input_url.pathname += '/'; }
    fake_input_url.pathname += input_url.pathname;

    fake_input = fake_input_url.href;
  }

  if (input instanceof Request) { fake_init = input; }

  // Note: This is just for debugging and troubleshooting purposes
  console.log('Redirected request', 'From:', input_url.href, 'To:', fake_input);

  const original_fetch = window.RuffleRedirect!.original_fetch;
  const response = await original_fetch(fake_input, fake_init);

  // Note: It is possible to create a new "fake" response and make any modifications you want.
  // const fake_response = new Response(response.body, response);

  return response;
}
