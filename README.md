<p align="center">
  <img src="https://sample.app/assets/sample-logo-white.jpg" alt="samplex" width="120" />
</p>

<h1 align="center">samplex</h1>

<p align="center">Deploy static sites to shareable preview URLs from the command line.</p>

## Why samplex?

- **One command to deploy** — no config files, no CI setup, no waiting
- **Instant preview URLs** — share a link before your PR is even open
- **Zero lock-in** — it's just static files on the edge

## Quick start

```bash
# Authenticate with your sample.app account
npx samplex login

# Deploy from your build output directory
npx samplex deploy ./dist
```

Works with any package manager:

```bash
npx samplex login        # npm
bunx samplex login       # bun
pnpm dlx samplex login   # pnpm
```

### Optional global install

```bash
npm install -g samplex    # or: bun install -g samplex / pnpm install -g samplex
```

## Commands

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `samplex login`         | Authenticate via browser (OAuth2 + PKCE) |
| `samplex deploy [dir]`  | Deploy a directory to a preview URL      |
| `samplex list`          | List your deployed sites                 |
| `samplex delete <slug>` | Delete a site by slug                    |
| `samplex init`          | Initialize or view project config        |

## Project config

Running `samplex deploy` saves a `.samplex.config.json` in your project root so subsequent deploys update the same site. You can also set it manually:

```bash
samplex init --slug my-site --name "My Site"
```

## Options

- `--slug <slug>` — Set the site slug (used in the preview URL)
- `--name <name>` — Set a display name for the site
- `-v, --version` — Print the CLI version

## How it works

1. Builds are archived as a `.tar.gz` with a SHA-256 integrity hash
2. Uploaded to sample.app via authenticated API
3. Served on a unique preview URL like `my-site--username.sample.app`

## License

Apache-2.0 — made by [Genmod](https://sample.app)
