import {
  resolve,
  isAbsolute,
  join,
  extname,
  relative,
  normalize,
} from 'https://deno.land/std/path/mod.ts';
import {
  ServerRequest,
  Response,
  HTTPSOptions,
  listenAndServe,
  listenAndServeTLS,
} from 'https://deno.land/std/http/mod.ts';
import { MEDIA_TYPES } from './types.ts';

const ENV_DIR = resolve('.');
const TARGET = Deno.args[0] || '.';
const ROOT_DIR = isAbsolute(TARGET) ? TARGET : join(ENV_DIR, TARGET);

const encoder = new TextEncoder();

interface EntryInfo {
  mode: string;
  size: string;
  url: string;
  name: string;
}

function contentType(path: string): string | undefined {
  return MEDIA_TYPES[extname(path)];
}

async function serveFile(
  req: ServerRequest,
  filePath: string
): Promise<Response> {
  const [file, fileInfo] = await Promise.all([
    Deno.open(filePath),
    Deno.stat(filePath),
  ]);
  const headers = new Headers();
  headers.set('content-length', fileInfo.size.toString());
  const contentTypeValue = contentType(filePath);
  console.log(contentTypeValue);
  if (contentTypeValue) {
    // if (contentTypeValue.includes('video')) {
    //   headers.set('content-type', 'text/html');

    //   const page = html`
    //     <!DOCTYPE html>
    //     <html lang="en">
    //       <head>
    //         <meta charset="UTF-8" />
    //         <meta
    //           name="viewport"
    //           content="width=device-width, initial-scale=1.0"
    //         />
    //         <title>${filePath}</title>
    //       </head>
    //       <body>
    //         <video-js
    //           id="vid1"
    //           width="600"
    //           height="300"
    //           class="vjs-default-skin"
    //           controls
    //         >
    //           <source
    //             src="${`/${relative(TARGET, filePath)}`}"
    //             type="${contentTypeValue}"
    //           />
    //         </video-js>

    //         <script src="https://cdnjs.cloudflare.com/ajax/libs/video.js/7.8.1/video.min.js"></script>
    //         <script src="https://unpkg.com/browse/@videojs/http-streaming@1.13.4/dist/videojs-http-streaming.min.js"></script>
    //         <script>
    //           var player = videojs('vid1');
    //           player.play();
    //         </script>
    //       </body>
    //     </html>
    //   `;

    //   const res = {
    //     status: 200,
    //     body: page,
    //     headers,
    //   };
    //   return res;
    // }
    headers.set('content-type', contentTypeValue);
  }
  req.done.then(() => {
    file.close();
  });
  return {
    status: 200,
    body: file,
    headers,
  };
}

async function serveDir(
  req: ServerRequest,
  dirPath: string
): Promise<Response> {
  const dirUrl = `/${relative(TARGET, dirPath)}`;
  const listEntry: EntryInfo[] = [];
  for await (const entry of Deno.readDir(dirPath)) {
    entry.name;
    const filePath = join(dirPath, entry.name);
    const fileUrl = join(dirUrl, entry.name);
    let fileInfo = null;
    try {
      fileInfo = await Deno.stat(filePath);
    } catch (e) {
      // Pass
    }
    listEntry.push({
      mode: modeToString(entry.isDirectory, fileInfo?.mode ?? null),
      size: entry.isFile ? fileLenToString(fileInfo?.size ?? 0) : '',
      name: entry.name,
      url: fileUrl,
    });
  }
  listEntry.sort((a, b) =>
    a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1
  );
  const formattedDirUrl = `${dirUrl.replace(/\/$/, '')}/`;
  const page = encoder.encode(dirViewerTemplate(formattedDirUrl, listEntry));

  const headers = new Headers();
  headers.set('content-type', 'text/html');

  const res = {
    status: 200,
    body: page,
    headers,
  };
  return res;
}

function modeToString(isDir: boolean, maybeMode: number | null): string {
  const modeMap = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];

  if (maybeMode === null) {
    return '(unknown mode)';
  }
  const mode = maybeMode.toString(8);
  if (mode.length < 3) {
    return '(unknown mode)';
  }
  let output = '';
  mode
    .split('')
    .reverse()
    .slice(0, 3)
    .forEach((v): void => {
      output = modeMap[+v] + output;
    });
  output = `(${isDir ? 'd' : '-'}${output})`;
  return output;
}

function fileLenToString(len: number): string {
  const multiplier = 1024;
  let base = 1;
  const suffix = ['B', 'K', 'M', 'G', 'T'];
  let suffixIndex = 0;

  while (base * multiplier < len) {
    if (suffixIndex >= suffix.length - 1) {
      break;
    }
    base *= multiplier;
    suffixIndex++;
  }

  return `${(len / base).toFixed(2)}${suffix[suffixIndex]}`;
}

function dirViewerTemplate(dirname: string, entries: EntryInfo[]): string {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="X-UA-Compatible" content="ie=edge" />
        <title>Deno File Server</title>
        <style>
          :root {
            --background-color: #fafafa;
            --color: rgba(0, 0, 0, 0.87);
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --background-color: #303030;
              --color: #fff;
            }
          }
          @media (min-width: 960px) {
            main {
              max-width: 960px;
            }
            body {
              padding-left: 32px;
              padding-right: 32px;
            }
          }
          @media (min-width: 600px) {
            main {
              padding-left: 24px;
              padding-right: 24px;
            }
          }
          body {
            background: var(--background-color);
            color: var(--color);
            font-family: 'Roboto', 'Helvetica', 'Arial', sans-serif;
            font-weight: 400;
            line-height: 1.43;
            font-size: 0.875rem;
          }
          a {
            color: #2196f3;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          table th {
            text-align: left;
          }
          table td {
            padding: 12px 24px 0 0;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Index of ${dirname}</h1>
          <table>
            <tr>
              <th>Mode</th>
              <th>Size</th>
              <th>Name</th>
            </tr>
            ${entries.map(
              (entry) =>
                html`
                  <tr>
                    <td class="mode">${entry.mode}</td>
                    <td>${entry.size}</td>
                    <td>
                      <a href="${entry.url}">${entry.name}</a>
                    </td>
                  </tr>
                `
            )}
          </table>
        </main>
      </body>
    </html>
  `;
}

function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  const l = strings.length - 1;
  let html = '';

  for (let i = 0; i < l; i++) {
    let v = values[i];
    if (v instanceof Array) {
      v = v.join('');
    }
    const s = strings[i] + v;
    html += s;
  }
  html += strings[l];
  return html;
}

function serveFallback(req: ServerRequest, e: Error): Promise<Response> {
  if (e instanceof Deno.errors.NotFound) {
    return Promise.resolve({
      status: 404,
      body: encoder.encode('Not found'),
    });
  } else {
    return Promise.resolve({
      status: 500,
      body: encoder.encode('Internal server error'),
    });
  }
}

function serverLog(req: ServerRequest, res: Response): void {
  const d = new Date().toISOString();
  const dateFmt = `[${d.slice(0, 10)} ${d.slice(11, 19)}]`;
  const s = `${dateFmt} "${req.method} ${req.url} ${req.proto}" ${res.status}`;
  console.log(s);
}

function setCORS(res: Response): void {
  if (!res.headers) {
    res.headers = new Headers();
  }
  res.headers.append('access-control-allow-origin', '*');
  res.headers.append(
    'access-control-allow-headers',
    'Origin, X-Requested-With, Content-Type, Accept, Range'
  );
}

const serverArgs = {} as any;

class DenoStdInternalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DenoStdInternalError';
  }
}

function assert(expr: unknown, msg = ''): asserts expr {
  if (!expr) {
    throw new DenoStdInternalError(msg);
  }
}

function main(): void {
  const CORSEnabled = serverArgs.cors ? true : false;
  const port = serverArgs.port ?? serverArgs.p ?? 8080;
  const host = serverArgs.host ?? 'localhost';
  const addr = `${host}:${port}`;
  const tlsOpts = {} as HTTPSOptions;
  tlsOpts.certFile = serverArgs.cert ?? serverArgs.c ?? '';
  tlsOpts.keyFile = serverArgs.key ?? serverArgs.k ?? '';
  const dirListingEnabled = serverArgs['dir-listing'] ?? true;

  if (tlsOpts.keyFile || tlsOpts.certFile) {
    if (tlsOpts.keyFile === '' || tlsOpts.certFile === '') {
      console.log('--key and --cert are required for TLS');
      serverArgs.h = true;
    }
  }

  if (serverArgs.h ?? serverArgs.help) {
    console.log(`Deno File Server
      Serves a local directory in HTTP.
  
    INSTALL:
      deno install --allow-net --allow-read https://deno.land/std/http/file_server.ts
  
    USAGE:
      file_server [path] [options]
  
    OPTIONS:
      -h, --help          Prints help information
      -p, --port <PORT>   Set port
      --cors              Enable CORS via the "Access-Control-Allow-Origin" header
      --host     <HOST>   Hostname (default is 0.0.0.0)
      -c, --cert <FILE>   TLS certificate file (enables TLS)
      -k, --key  <FILE>   TLS key file (enables TLS)
      --no-dir-listing    Disable directory listing
  
      All TLS options are required when one is provided.`);
    Deno.exit();
  }

  const handler = async (req: ServerRequest): Promise<void> => {
    let normalizedUrl = normalize(req.url);
    try {
      normalizedUrl = decodeURIComponent(normalizedUrl);
    } catch (e) {
      if (!(e instanceof URIError)) {
        throw e;
      }
    }
    const fsPath = join(TARGET, normalizedUrl);

    let response: Response | undefined;
    try {
      const fileInfo = await Deno.stat(fsPath);
      if (fileInfo.isDirectory) {
        if (dirListingEnabled) {
          response = await serveDir(req, fsPath);
        } else {
          throw new Deno.errors.NotFound();
        }
      } else {
        response = await serveFile(req, fsPath);
      }
    } catch (e) {
      console.error(e.message);
      response = await serveFallback(req, e);
    } finally {
      if (CORSEnabled) {
        assert(response);
        setCORS(response);
      }
      serverLog(req, response!);
      try {
        await req.respond(response!);
      } catch (e) {
        console.error(e.message);
      }
    }
  };

  let proto = 'http';
  if (tlsOpts.keyFile || tlsOpts.certFile) {
    proto += 's';
    tlsOpts.hostname = host;
    tlsOpts.port = port;
    listenAndServeTLS(tlsOpts, handler);
  } else {
    listenAndServe(addr, handler);
  }
  console.log(`${proto.toUpperCase()} server listening on ${proto}://${addr}/`);
}

if (import.meta.main) {
  main();
}
