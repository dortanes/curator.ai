<table>
<tr>
<td width="120">
<img src="logo.png" width="120" height="120"/>
</td>
<td>

## curator.ai

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-brightgreen.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED.svg)](https://docs.docker.com/compose/)

</td>
</tr>
</table>

**Self-hosted AI content pipeline for social media channels.** Collects posts from multiple sources, filters and rewrites them with LLM, and publishes on your schedule — all through a web UI. Currently supports Telegram, with more platforms coming soon.

## ✨ Features

- 📡 **Multi-source collection** — Pull content from Telegram channels and RSS feeds simultaneously
- 🧠 **AI-powered filtering** — LLM analyzes every post and keeps only what matches your topic (include/exclude keywords, author blocklists)
- ✍️ **AI rewriting** — Each post is rewritten in your channel's voice, language, and tone using customizable prompts
- 📺 **Multi-channel support** — Run multiple channels at once, each with its own sources, filters, system prompt, and language
- 📋 **Queue & moderation** — Every post lands in a queue where you can review, edit, approve, schedule, or reject it before it goes live
- ⏰ **Scheduled publishing** — Set a date & time — the bot publishes automatically
- 📊 **Dashboard** — Live overview: source count, queue status, AI token usage, last/next publish time
- 📝 **Editable AI prompts** — Filter and rewrite prompts are Markdown files you can edit right from the UI
- 🖼️ **Image support** — Attach or replace images for posts before publishing

## 🛠️ Tech Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Server   | Node.js, Express, TypeScript, Prisma          |
| AI       | Google Gemini (`@google/genai`)               |
| Bot      | grammY (Telegram Bot API)                     |
| Client   | Stencil.js, Tailwind CSS, Material Tailwind   |
| Database | PostgreSQL 16                                 |
| Infra    | Docker Compose                                |

## 🚀 Quick Start

This is the easiest way to get everything running. You only need **Docker** installed.

### Step 1 — Install Docker

If you don't have Docker yet:

- **Windows / Mac**: Download [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- **Linux (Ubuntu/Debian)**:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  # Log out and back in, then verify:
  docker --version
  ```

### Step 2 — Get API keys

You'll need two free tokens. Both take ~2 minutes to get:

1. **Gemini API key** — Go to [Google AI Studio](https://aistudio.google.com/apikey), sign in with Google, click **"Create API Key"**, copy it.
2. **Telegram Bot Token** — Open Telegram, find [@BotFather](https://t.me/BotFather), send `/newbot`, follow the prompts, copy the token it gives you.

### Step 3 — Set up the bot in your channel

Before the bot can publish, you need to add it to your Telegram channel:

1. Open your Telegram channel → **Settings** → **Administrators**
2. Click **Add Administrator** → search for your bot by username
3. Grant it the **Post Messages** permission (the only one it needs)
4. Click **Save**

### Step 4 — Clone & configure

```bash
git clone https://github.com/dortanes/curator.ai.git
cd curator.ai

# Create your config file from the template
cp .env.example .env
```

Now open `.env` in any text editor and paste your keys:

```env
GEMINI_API_KEY=paste_your_gemini_key_here
TELEGRAM_BOT_TOKEN=paste_your_bot_token_here
```

> 💡 The rest of the settings (database, ports) work out of the box. Change `POSTGRES_PASSWORD` if you want extra security.

### Step 5 — Launch

```bash
docker compose up -d
```

Wait ~30 seconds for everything to start.
To stop everything: `docker compose down`

### Step 6 — Start curating

1. Open the web UI at http://localhost:3333
2. Go to **Channels** → create a channel with your channel username (e.g. `@mychannel`)
3. Go to **Sources** → add Telegram channels or RSS feeds to pull content from
4. *(Optional)* Go to **Filters** → set up include/exclude keywords
5. Go to **Dashboard** → hit **Run Pipeline** — the AI will collect, filter, and rewrite posts
6. Go to **Queue** → review the results, edit if needed, approve & schedule
7. Posts are published to your channel automatically at the scheduled time 🎉

## ⚙️ Environment Variables

| Variable             | Description                               | Default     | Required |
|----------------------|-------------------------------------------|-------------|----------|
| `GEMINI_API_KEY`     | Google Gemini API key                     | —           | ✅       |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token from BotFather        | —           | ✅       |
| `POSTGRES_HOST`      | PostgreSQL hostname                       | `postgres`  | ✅       |
| `POSTGRES_PORT`      | PostgreSQL port                           | `5432`      | —        |
| `POSTGRES_USER`      | PostgreSQL username                       | `curator`   | ✅       |
| `POSTGRES_PASSWORD`  | PostgreSQL password                       | `changeme`  | ✅       |
| `POSTGRES_DB`        | PostgreSQL database name                  | `curator`   | ✅       |
| `PORT`               | Server HTTP port                          | `1532`      | —        |
| `DATABASE_URL`       | Full Prisma connection string             | *composed*  | ✅       |

## 📁 Project Structure

```
curator.ai/
├── client/                   # Stencil.js frontend
│   └── src/
│       ├── components/       # Web components (pages + UI)
│       ├── services/         # API client
│       └── global/           # Global styles
├── server/                   # Express backend
│   ├── prisma/               # Database schema (schema.prisma)
│   └── src/
│       ├── routes/           # REST API endpoints
│       ├── services/         # Business logic & AI integration
│       │   └── collectors/   # Source collectors (Telegram, RSS)
│       └── prompts/          # AI prompt templates (Markdown)
├── shared/                   # Shared TypeScript types
│   └── src/
│       ├── entities.ts       # Domain models
│       └── api-types.ts      # API request/response contracts
├── docker-compose.yml        # One-command full stack setup
├── .env.example              # Environment template
└── LICENSE                   # Apache 2.0
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📜 License

[Apache License 2.0](LICENSE)

---

<p align="center">Vibecoded with ❤️ by <a href="https://github.com/dortanes">dortanes</a></p>
