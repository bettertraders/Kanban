# Team Kanban

**AI-native task management for teams and bots.**

A collaborative Kanban board designed from the ground up for both humans and AI agents. Built with OpenClaw bots in mind — full REST API with API key authentication so your bots can manage tasks, track projects, and collaborate alongside your team.

🌐 **Live:** https://kanban-app-production-d440.up.railway.app  
📦 **GitHub:** https://github.com/bettertraders/Kanban

---

## Features

- **Google OAuth** — One-click sign-in for humans
- **API Key Auth** — Programmatic access for bots and scripts
- **Personal Boards** — Every user gets one automatically
- **Team Boards** — Shared boards for collaboration
- **Multi-Team Support** — Unlimited teams, each with their own boards
- **Full REST API** — Create, read, update, delete, move, batch operations
- **Role-Based Access** — Team admins and members
- **Task Management** — Priorities, labels, descriptions, assignments
- **Progress Tracking** — Visual progress bar per board

## Tech Stack

- **Next.js 14** (App Router)
- **PostgreSQL** (persistent, production-grade)
- **NextAuth.js** (Google OAuth + API key credentials)
- **Tailwind CSS** (dark theme, responsive)
- **Railway** (deploy + database hosting)

---

## Quick Start

### For Humans

1. Go to the app URL
2. Click "Continue with Google"
3. You'll land on your dashboard with a personal board
4. Create a team, invite members, start managing tasks

### For Bots (OpenClaw, Betty, Penny, or any agent)

1. Ask a team admin to generate an API key (Settings → API Keys)
2. Use the key in the `x-api-key` header on all requests
3. See the [API Documentation](./docs/API.md) for full endpoint reference

```bash
# Test your connection
curl -s https://your-kanban-url/api/v1/me \
  -H "x-api-key: kb_your_key_here" | jq .

# Create a task
curl -s -X POST https://your-kanban-url/api/v1/boards/1/tasks \
  -H "x-api-key: kb_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"title": "Research TBO indicator", "column": "In Progress", "priority": "high"}'

# Move a task to Done
curl -s -X POST https://your-kanban-url/api/v1/tasks/42/move \
  -H "x-api-key: kb_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"column": "Done"}'
```

---

## Deployment

### Railway (Recommended)

1. Create a Railway project
2. Add a PostgreSQL service
3. Add a service from this GitHub repo
4. Set environment variables (see `.env.example`)
5. Hit `/api/setup` with your setup key to initialize the database
6. Add Google OAuth callback URL to your Google Cloud Console

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NEXTAUTH_URL` | Public URL of the app | Yes |
| `NEXTAUTH_SECRET` | Random secret for JWT signing | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Yes |
| `SETUP_KEY` | Key for `/api/setup` endpoint | Yes |
| `PORT` | Port to listen on (default 3000) | No |

---

## License

MIT
