# alist-encrypt

A transparent encryption proxy for [AList](https://github.com/AlistGo/alist) (and compatible forks such as OpenList), covering both the web UI and WebDAV.

English | [简体中文](README.md)

alist-encrypt sits in front of AList: files are encrypted on upload and decrypted on download, preview, and playback. Encryption is stream-based with Range support, so encrypted videos can be scrubbed in the browser and images or text can be viewed online without downloading the whole file first. Apart from encrypted upload and decrypted playback, the original AList web UI and WebDAV requests pass through unchanged.

> The project is under active development. Node.js is the primary runtime; the `txiki` branch adds an experimental txiki.js runtime. The current version is defined in [config.js](node-proxy/src/config.js) (0.3.0).

## Features

| Feature | Description |
|---|---|
| Transparent AList proxy | Pages, login, APIs, and icons pass through; responses are rewritten only when needed |
| Transparent WebDAV | Uploads are encrypted and downloads are decrypted; works with Infuse, VLC, IINA, rclone, etc. |
| Online playback and preview | Supports Range requests and 302 redirects for encrypted video, images, and text |
| Multiple algorithms | AES-CTR (default, recommended), ChaCha20, RC4 (legacy compatibility only) |
| Multiple password groups | Different directories can use different passwords and algorithms, selected by regex |
| Filename / folder-name encryption | Optional; encrypted names are shown decrypted and encrypted again on writes |
| Derived folder password | Encode a sub-password and algorithm into a folder name; accessing that folder switches credentials automatically |
| Web admin UI | Overview, AList config, WebDAV config, server-side encryption, browser-side encryption |
| Server-side batch encryption | Asynchronously encrypt/decrypt local directories on the proxy host, up to 10,000 files per job |
| Browser-local encryption | Files never leave the browser; streaming encrypt/decrypt and split-volume zip output |
| CLI | Batch encryption/decryption for local files before uploading |
| Dual runtime | Node.js (primary) and txiki.js (experimental, single-file binary) |
| Multi-arch images | CI builds amd64 / arm64 / armv7 Docker images |

## How It Works

```text
Browser / WebDAV client
        │
        ▼
  alist-encrypt:5344          ← stream encrypt/decrypt when the path matches
        │
        ▼
     AList:5244               ← web UI, APIs, WebDAV, 302 redirects
        │
        ▼
   Cloud storage backend
```

Key design points:

- **Path-based activation**: `encPath` entries are regular expressions. Only matching requests enter the encryption pipeline; everything else is proxied as-is.
- **Streaming**: encryption and decryption are stream transforms, so large files are never fully buffered in memory or written to a temporary plaintext file.
- **File key bound to file size**: keys are derived from the password plus the file size (`sizeSalt`). The proxy obtains the original size from AList metadata or its local KV cache.
- **Range seeking**: when a player sends `bytes=xxx-`, the proxy rebuilds the cipher counter at that offset and decrypts only the requested segment.
- **Filename encryption**: names are encrypted and encoded with a checksum. Listing responses show decrypted names; upload, rename, and move requests re-encrypt them.
- **302 redirects**: the proxy follows the real download URL and keeps decrypting the stream, so cloud-drive redirects do not bypass encryption.
- **Local cache**: file metadata is cached in `conf/nedb/datafile.db` (a `node:sqlite` KV store; legacy nedb data is migrated automatically) for path, size, and decryption parameters.

## Quick Start (Node.js)

Requirements: Node.js 20 or newer (22 recommended) and npm.

```bash
git clone https://github.com/traceless/alist-encrypt.git
cd alist-encrypt/node-proxy

# Runtime-only install
npm install --omit=dev

# Start
npm run serve
```

If `conf/config.json` does not exist, it is created on first start. You can set the AList address with an environment variable (only used when the config is first generated):

```bash
ALIST_HOST=192.168.1.100:5244 npm run serve
```

You can also edit [conf/config.json](node-proxy/conf/config.json) directly or use the admin UI.

After startup:

- Admin UI: <http://127.0.0.1:5344/public/index.html>, default user `admin`, default password `123456`. Change it after login; the backend requires at least 8 characters.
- Proxied AList: <http://127.0.0.1:5344/>
- `/index` redirects to the admin UI.

Notes:

- Start from the `node-proxy` directory. `conf/`, `logs/`, and `public/` are resolved relative to the current working directory.
- The default port is `5344`; change `port` in `conf/config.json` if needed.
- If the config already exists, `ALIST_HOST` will not overwrite it. Edit the file or use the UI instead.

Development:

```bash
npm run dev     # node --watch app.js
npm run ui      # frontend-only Vite dev server
```

## Docker

CI publishes images for `linux/amd64`, `linux/arm64`, and `linux/arm/v7` with `latest` and date tags.

```bash
docker run -d \
  --name alist-encrypt \
  --restart unless-stopped \
  -p 5344:5344 \
  -v "$(pwd)/alist-encrypt-conf:/node-proxy/conf" \
  -e TZ=Asia/Shanghai \
  -e ALIST_HOST=192.168.1.100:5244 \
  prophet310/alist-encrypt:latest
```

`docker-compose.yml`:

```yaml
services:
  alist-encrypt:
    image: prophet310/alist-encrypt:latest
    container_name: alist-encrypt
    restart: unless-stopped
    ports:
      - "5344:5344"
    volumes:
      - ./alist-encrypt-conf:/node-proxy/conf
    environment:
      TZ: Asia/Shanghai
      ALIST_HOST: 192.168.1.100:5244
```

Persist `conf/`; otherwise configuration, user credentials, and caches are lost on restart.

Build an image locally:

```bash
cd node-proxy
npm install
npm run docker       # beta tag
npm run docker-arm   # ARM tag
```

> The scripts use `sudo docker`; adjust if your user already has Docker permissions.

## Configuration

`conf/config.json` (created on first start):

```json
{
  "alistServer": {
    "name": "alist",
    "path": "/*",
    "serverHost": "192.168.1.100",
    "serverPort": 5244,
    "https": false,
    "passwdList": [
      {
        "password": "123456",
        "encType": "aesctr",
        "enable": true,
        "encName": false,
        "encFolder": false,
        "describe": "my video",
        "encPath": ["movie_encrypt/*", "encrypt_folder/*"]
      }
    ]
  },
  "webdavServer": [],
  "port": 5344
}
```

`alistServer`:

| Field | Description |
|---|---|
| `serverHost` / `serverPort` / `https` | AList host, port, and protocol |
| `path` | AList proxy entry path, defaults to `/*`; usually unchanged |
| `passwdList` | Password groups; multiple groups can target different paths |

Password group fields:

| Field | Description |
|---|---|
| `enable` | Enable this group |
| `password` | Encryption password |
| `encType` | `aesctr` (default), `chacha20`, or `rc4` (legacy) |
| `encPath` | Array of path regexes to encrypt; comma-separated in the UI |
| `encName` | Encrypt filenames (original extension is preserved) |
| `encFolder` | Encrypt folder names |
| `describe` | Free-form note |
| `encSuffix` | Optional custom extension handling; usually empty |

`encPath` examples:

- `movie_encrypt/.*`: matches any URL containing `movie_encrypt/`.
- `^/onedrive/encrypt/.*`: matches paths starting with `/onedrive/encrypt/`.
- Broader regexes affect more files; validate on a small directory first.

WebDAV fields:

| Field | Description |
|---|---|
| `name` | Configuration name |
| `path` | Main path regex, e.g. `^/aliyun-dav/.*`; cannot be `/enc-api/*` |
| `serverHost` / `serverPort` / `https` | Upstream WebDAV endpoint |
| `enable` | Enable this configuration |
| `passwdList` | Same fields as AList password groups |

> Changing the WebDAV main path requires a restart. Password-group changes take effect after saving.

Environment variables:

| Variable | Description |
|---|---|
| `ALIST_HOST` | `host:port`; used only when `conf/config.json` is first generated |
| `RUN_MODE` | Set to `DEV` for debug logs |
| `TJS_CA_BUNDLE` / `SSL_CERT_FILE` | Upstream CA bundle for the txiki.js runtime |

Runtime data:

- `conf/config.json`: configuration.
- `conf/nedb/datafile.db`: file metadata and login-token KV cache.
- `logs/server.log`: runtime log.

## Usage

### AList Configuration

In the "Alist config" page, set the AList host, port, and protocol, then add password groups. Saving writes `conf/config.json` and takes effect immediately.

Files uploaded through the proxy into a matching path are encrypted; downloads, playback, and previews through the proxy are decrypted. Accessing the cloud backend directly shows ciphertext.

Matching paths are also exposed under `/d/...`, `/p/...`, and `/dav/...` prefixes to keep AList download, preview, and WebDAV links working.

### WebDAV Configuration

In the "WebDAV config" page:

1. Enter a name, upstream host, port, and HTTPS setting.
2. Enter the main path regex, e.g. `^/aliyun-dav/.*`.
3. Add password groups with sub-path regexes (`encPath`) and passwords.
4. Save and restart the service.

Connect your WebDAV client to `http://proxy-host:5344/<main-path-prefix>` with the upstream credentials. The main path is a regex prefix and is forwarded to the upstream, so the directory layout stays the same.

Supported methods: `PROPFIND`, `PROPPATCH`, `MKCOL`, `GET`, `PUT`, `DELETE`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`. Node.js supports them natively; the txiki.js runtime needs the WebDAV patches in `tjs-build/patches/`.

### Playback and Download

Use AList's web UI as usual:

- Video Range requests are decrypted at the requested offset, so seeking works.
- Images and text are decrypted and returned online.
- Download links and external-player links keep working, as long as they point at the proxy.

302 redirects from cloud drives need no extra configuration; the proxy follows the real URL and keeps decrypting.

### Server-side Batch Encryption

The "Cloud encryption" page batch-encrypts or decrypts **local directories on the machine running the proxy**. This is useful for preparing files before uploading or restoring encrypted files.

- Jobs run asynchronously; the service stays available.
- Up to 10,000 files per scan.
- If the output path is empty, output goes to `outFile/<timestamp>`.
- For very large files, prefer encrypting locally or in the browser before uploading.

This is not a cloud-drive transfer feature; copying existing cloud files into an encrypted folder is still on the roadmap.

### Browser-local Encryption

The "Online decrypt" page performs encryption and decryption inside the browser; files are not uploaded:

- File encrypt/decrypt: AES-CTR or ChaCha20, with selectable processing block size.
- Filename encryption: encrypt the whole name and append `.enc`, or restore it on decrypt.
- Decrypt to split volumes: decrypt block by block and write `.z01`, `.z02`, ... plus `.zip`. Open the last `.zip` with 7-Zip or WinRAR to merge and extract. This is useful on iOS and other clients that cannot stream large writes.

The ciphertext format is compatible with the server and CLI.

### Derived Folder Password

In a password-group card, click "Sub-password / folder name". This encrypts a sub-algorithm and sub-password into a folder-name ciphertext using the current password:

1. Enter a note, sub-algorithm, and sub-password to generate the ciphertext name.
2. Name a sub-folder with that ciphertext.
3. When accessing anything under that folder, the proxy detects the name and switches to the sub-password and algorithm automatically.

When sharing, you only need to give the recipient the folder-name ciphertext; the original password is not exposed. Different sub-folders can use different passwords.

### CLI

```bash
cd node-proxy
node app.js <password> <encType> <enc|dec> <folder> <outPath> [encName]
```

Examples:

```bash
node app.js mypassword aesctr enc ./videos ./out encName
node app.js mypassword aesctr dec ./out ./plain
```

- `encType`: `aesctr`, `chacha20`, or `rc4`.
- `enc` / `dec`: encrypt or decrypt.
- `outPath`: output directory; defaults to `outFile/<timestamp>` when empty.
- `encName`: any non-empty string enables filename encryption/decryption.
- Files are written to a temporary directory and renamed atomically to avoid partial output.

The CLI relies on Node.js file streams and is not available in the txiki.js entry point; extra arguments cause an explicit error there.

## Algorithms

| encType | Key derivation | Range seeking | Status | Notes |
|---|---|---|---|---|
| `aesctr` | PBKDF2 + file size | Yes | Default, recommended | Fast on most CPUs; best choice for video |
| `chacha20` | PBKDF2 + file size | Yes | Available | Pure JS; can use FFI under txiki.js |
| `rc4` | PBKDF2 + file size | Yes | Legacy | Not recommended for new data; marked deprecated in the UI |

Performance reference (same machine; depends on CPU and runtime):

| Runtime | Algorithm | Throughput |
|---|---|---|
| Node.js | AES-CTR | ~235 MB/s |
| txiki.js glibc | AES-CTR | ~193 MB/s |
| txiki.js glibc | ChaCha20 (FFI) | ~1.3 GB/s |
| txiki.js musl | ChaCha20 (pure JS fallback) | ~1 MB/s |

Guidance:

- Use `aesctr` by default; AES instructions are widely available and seeking is stable.
- Use `chacha20` when you need higher throughput and run txiki.js glibc.
- Keep `rc4` only to decrypt existing data; do not use it for new uploads.

Compatibility:

- Ciphertext requires the **same algorithm and password** that produced it. Changing either makes old files unreadable.
- Decryption also depends on the original file size (`sizeSalt`). Do not replace a file upstream with one of a different size.
- Browser-local encryption, server-side batch encryption, and the CLI share the same ciphertext format.

Security notes:

- These are stream ciphers and provide confidentiality only. They do **not** provide integrity or authentication; anyone who can modify ciphertext can tamper with plaintext.
- Keys and IVs are derived from the password plus file size, so files with the same password and identical size reuse the same keystream. This is a known risk of stream ciphers. Do not treat this scheme as strong encryption for high-value data; use different passwords per directory and protect them carefully.
- Password strength is the main security boundary. Use a different password for the admin UI and for encryption.

## txiki.js Runtime (Optional)

The `txiki` branch adds a txiki.js runtime for a single-file binary and lower resource usage. See [docs/tjs-runtime.md](docs/tjs-runtime.md) for details.

Build:

```bash
cd tjs-build
./build-tjs.sh
```

Outputs:

- `tjs-build/dist/tjs-glibc`: dynamically linked glibc, ChaCha20 via FFI (libcrypto / nettle); recommended.
- `tjs-build/dist/tjs-musl`: fully static single file; ChaCha20 falls back to pure JS and is much slower.

Start (from the `node-proxy` directory):

```bash
cd node-proxy
../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
```

Limitations:

- The batch CLI is unavailable; use Node.js for that.
- musl cannot `dlopen`, so ChaCha20 is pure JS there. Use the glibc build or switch data to AES-CTR.
- Self-signed HTTPS upstreams need a CA bundle. The bundle **replaces** the built-in one; precedence is `--tls-ca <file>` > `TJS_CA_BUNDLE` > `SSL_CERT_FILE` > built-in.
- WebDAV methods (`PROPFIND`, `MKCOL`, `COPY`, `MOVE`, `PROPPATCH`, `LOCK`, `UNLOCK`) require the patches in `tjs-build/patches/`; unpatched txiki.js rejects them at the parser layer.

The Node.js runtime relaxes certificate verification for self-signed upstreams (matching the original behavior) and logs a warning once.

## Development and Tests

```bash
cd node-proxy

npm run dev       # watch mode
npm run serve     # production start
npm run bundle    # esbuild bundle into dist/
npm run build     # bundle + pkg executables into build/
npm run ui        # Vite frontend dev server
```

Tests (some rewrite `conf/config.json` temporarily and bind ports 5344/5244; stop the running service first):

```bash
node test/crypto-golden-test.mjs          # cross-runtime ciphertext golden vectors
node test/propfindParserTest.js           # WebDAV XML parsing
node test/runtime-test.mjs                # runtime adaptation layer
node test/p2-tjs-smoke.mjs                # HTTP surface smoke test (node / tjs)
node test/p3-enc-smoke.mjs                # end-to-end encryption smoke test
node test/p4-storage-smoke.mjs            # storage/config/log persistence
node test/webdavSmokeTest.js              # requires a running proxy and upstream
```

Run a smoke test against txiki.js:

```bash
node test/p3-enc-smoke.mjs -- ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
```

Smoke scripts do not kill the service they start; the PID is written to `/tmp/*-smoke-service.pid` for cleanup.

## Project Layout

```text
alist-encrypt/
├── node-proxy/            # main service
│   ├── app.js             # Node.js entry (server + CLI)
│   ├── app.tjs.js         # txiki.js entry
│   ├── src/               # proxy, crypto, routes, DAO, runtime adapters
│   ├── public/            # web admin UI
│   ├── conf/              # generated config and data
│   └── test/              # golden and smoke tests
├── tjs-build/             # txiki.js build scripts, patches, binaries
├── docs/                  # migration and runtime notes
├── .github/workflows/     # build, release, Docker image
└── dockerfile             # Docker image definition
```

Runtime dependencies are only `hono` and `@hono/node-server`; everything else uses Node.js built-ins.

## FAQ

**Playback is slow or stutters.**

The proxy consumes bandwidth and CPU on the machine where it runs. Deploy it close to storage with enough bandwidth. On low-power devices, prefer AES-CTR.

**Downloads are garbled or decryption fails.**

Check in order:

1. The algorithm and password match the ones used for upload.
2. The file size has not changed (the key depends on the original size).
3. The same path was not overwritten by a file of a different size, leaving a stale cached size. Re-list the parent directory to refresh the cache.
4. The client supports the requested path type; verify with a browser or WebDAV first.

**Configuration changes do not take effect.**

AList config applies immediately after saving; the WebDAV main path requires a restart.

**The upstream uses a self-signed HTTPS certificate.**

The Node.js runtime relaxes certificate verification and logs a warning. The txiki.js runtime needs a CA bundle as described above.

**Can I copy existing cloud files into an encrypted folder?**

Not yet. Current options are encrypted proxy upload, server-side local batch encryption, and browser-local encryption. For large files, encrypt locally and upload the result.

## Roadmap

- Copy existing cloud files into an encrypted folder (planned).
- Continue improving the txiki.js runtime and cross-platform packaging.
- Keep up with AList / OpenList API changes.

## Community and License

- Issues: <https://github.com/traceless/alist-encrypt/issues>
- Discussion group: 422035582
- License: ISC (see `package.json`)
