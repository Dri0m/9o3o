// Ruffle

type RufflePlayer = Node & {
  load: (url: string) => void;
}

type Ruffle = {
  createPlayer: () => RufflePlayer;
}

declare interface Window {
  RufflePlayer: {
    newest: () => Ruffle;
    config: {
      base?: string | null;
    };
  };
}

// Ruffle Redirect

declare interface Window {
  RuffleRedirect?: {
    redirect_to: URL;
    original_fetch: typeof fetch;
  };
  gameData: any;
}
