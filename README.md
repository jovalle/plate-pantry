# Plate Pantry

Your pantry of Empire State personalized plate ideas.

Demo instance live at [jayro.dev/plate-pantry](https://jayro.dev/plate-pantry).

## Quickstart

Run with Docker Compose:

```bash
cp .env.example .env
docker compose up -d
```

Open [http://localhost:5360/plate-pantry](http://localhost:5360/plate-pantry) in your browser.

For complete deployment options, reverse proxies, and VPN proxy configuration, see the [Self-Hosting Guide](docs/self-hosting.md).

## Development

- `just setup` installs dependencies and builds the application.
- `just dev` starts the local app in development mode with hot reload.
- `just fmt` formats the repository with Prettier.
- `just check` runs formatting checks, linting, type checks, unit tests, backend tests, edge tests, and Playwright browser tests.
- `just publish` triggers the gated production release workflow.

## Screenshots

<p align="center">
  <img src="docs/screenshots/plate-pantry-desktop.jpg" alt="Plate Pantry desktop dashboard with a personalized plate preview and lookup history" width="100%" />
</p>

## License

[MIT](LICENSE)

<p align="center">
  made with <strong>❤️</strong> and <strong>🇩🇴 ☕️</strong>
</p>
