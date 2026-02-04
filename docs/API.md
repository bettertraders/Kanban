# Team Kanban — API Documentation

## Authentication

All API requests require authentication. Two methods are supported:

### API Key (for bots)
Include your API key in the `x-api-key` header:
```
x-api-key: kb_abc123...
```

Or use the `Authorization` header:
```
Authorization: Bearer kb_abc123...
```

### Session (for browsers)
Authenticated browser sessions via Google OAuth work automatically with cookies.

### Getting an API Key
1. Sign in via Google at the web UI
2. Go to Settings → API Keys
3. Enter a name (e.g., "Penny Bot") and click Generate
4. **Save the key immediately** — it's only shown once

---

## Base URL

```
https://kanban-app-production-d440.up.railway.app/api/v1
```

---

## Endpoints

### Identity

#### `GET /me`
Returns the authenticated user's info, boards, and teams. Use this to verify your API key works and discover your board IDs.

**Response:**
```json
{
  "user": { "id": 1, "email": "penny@thebettertraders.com", "name": "Penny" },
  "boards": [
    { "id": 1, "name": "Penny's Board", "is_personal": true, "team_id": null },
    { "id": 3, "name": "TBT Board", "is_personal": false, "team_id": 1, "team_name": "TBT" }
  ],
  "teams": [
    { "id": 1, "name": "TBT", "slug": "tbt", "role": "member" }
  ]
}
```

---

### Boards

#### `GET /boards`
List all boards you have access to (personal + team boards).

**Response:**
```json
{
  "boards": [
    {
      "id": 1,
      "name": "Penny's Board",
      "description": "Personal task board",
      "is_personal": true,
      "team_id": null,
      "columns": ["Backlog", "Planned", "In Progress", "Done"]
    }
  ]
}
```

#### `POST /boards`
Create a new board. If `teamId` is provided, creates a team board. Otherwise, creates a personal board.

**Body:**
```json
{
  "name": "Sprint 1",
  "description": "February sprint tasks",
  "teamId": 1
}
```

#### `GET /boards/:id`
Get a board with all tasks grouped by column.

**Response:**
```json
{
  "board": { "id": 1, "name": "My Board", "columns": ["Backlog", "Planned", "In Progress", "Done"] },
  "columns": [
    {
      "name": "Backlog",
      "tasks": [
        { "id": 1, "title": "Research TBO", "priority": "high", "labels": ["research"] }
      ]
    },
    { "name": "In Progress", "tasks": [] }
  ],
  "totalTasks": 5
}
```

#### `PATCH /boards/:id`
Update a board's name, description, or columns.

**Body (all fields optional):**
```json
{
  "name": "New Board Name",
  "description": "Updated description",
  "columns": ["To Do", "Doing", "Review", "Done"]
}
```

#### `DELETE /boards/:id`
Delete a board and all its tasks. Cannot delete personal boards.

---

### Tasks

#### `GET /boards/:id/tasks`
List all tasks on a board with optional filters.

**Query Parameters:**
| Param | Description | Example |
|-------|-------------|---------|
| `column` | Filter by column | `?column=In Progress` |
| `priority` | Filter by priority | `?priority=high` |
| `search` | Search title & description | `?search=TBO` |
| `label` | Filter by label | `?label=research` |
| `assigned_to` | Filter by user ID | `?assigned_to=2` |

**Response:**
```json
{
  "board": { "id": 1, "name": "My Board" },
  "tasks": [
    {
      "id": 1,
      "title": "Study TBO indicator",
      "description": "Deep dive on signals and setups",
      "column_name": "In Progress",
      "priority": "high",
      "assigned_to": 1,
      "assigned_to_name": "Penny",
      "labels": ["trading", "research"],
      "created_by_name": "Michael",
      "created_at": "2026-02-03T20:00:00Z"
    }
  ],
  "count": 1
}
```

#### `POST /boards/:id/tasks`
Create a task on a specific board.

**Body:**
```json
{
  "title": "Study TBO indicator",
  "description": "Watch Aaron's videos, document signals",
  "column": "In Progress",
  "priority": "high",
  "labels": ["trading", "research"],
  "assignedTo": 1,
  "dueDate": "2026-02-10"
}
```

Only `title` is required. Defaults: column = "Backlog", priority = "medium".

#### `POST /tasks`
Create a task (requires `boardId` in body).

**Body:**
```json
{
  "boardId": 1,
  "title": "New task",
  "column": "Planned"
}
```

#### `GET /tasks/:id`
Get a single task by ID.

#### `PATCH /tasks/:id`
Update any task fields.

**Body (all fields optional):**
```json
{
  "title": "Updated title",
  "description": "New description",
  "column_name": "Done",
  "priority": "low",
  "labels": ["completed"],
  "assigned_to": 2
}
```

#### `POST /tasks/:id/move`
Move a task to a different column. Validates the column exists on the board.

**Body:**
```json
{
  "column": "Done"
}
```

**Response:**
```json
{
  "task": { "id": 1, "title": "...", "column_name": "Done" },
  "moved": { "from": "In Progress", "to": "Done" }
}
```

#### `DELETE /tasks/:id`
Delete a task permanently.

---

### Batch Operations

#### `POST /tasks/batch`
Execute up to 50 task operations in a single request. Useful for syncing boards, bulk updates, or automated workflows.

**Body:**
```json
{
  "operations": [
    {
      "action": "create",
      "boardId": 1,
      "title": "Task A",
      "column": "Backlog",
      "priority": "high"
    },
    {
      "action": "create",
      "boardId": 1,
      "title": "Task B",
      "column": "Backlog"
    },
    {
      "action": "move",
      "taskId": 5,
      "column": "Done"
    },
    {
      "action": "update",
      "taskId": 3,
      "priority": "low",
      "labels": ["deprioritized"]
    },
    {
      "action": "delete",
      "taskId": 10
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    { "action": "create", "success": true, "task": { "id": 11, "title": "Task A" } },
    { "action": "create", "success": true, "task": { "id": 12, "title": "Task B" } },
    { "action": "move", "success": true, "from": "In Progress", "to": "Done" },
    { "action": "update", "success": true, "task": { "id": 3 } },
    { "action": "delete", "success": true, "taskId": 10 }
  ],
  "summary": { "total": 5, "successes": 5, "failures": 0 }
}
```

---

### Teams

#### `GET /teams`
List all teams you belong to.

#### `POST /teams`
Create a new team. You become the admin automatically. A default team board is created.

**Body:**
```json
{
  "name": "TBT",
  "description": "The Better Traders team"
}
```

#### `GET /teams/:id/members`
List all members of a team (requires team membership).

**Response:**
```json
{
  "members": [
    { "id": 1, "email": "michael@tbt.com", "name": "Michael", "role": "admin" },
    { "id": 2, "email": "penny@tbt.com", "name": "Penny", "role": "member" }
  ]
}
```

#### `POST /teams/:id/members`
Add a member to a team (admin only). If the email doesn't have an account yet, one is created automatically.

**Body:**
```json
{
  "email": "betty@example.com",
  "role": "member"
}
```

---

### API Keys

#### `POST /auth/apikey`
Generate a new API key. **Requires browser session** (cannot generate keys via API key).

**Body:**
```json
{
  "name": "Penny Bot"
}
```

**Response:**
```json
{
  "apiKey": "kb_abc123...",
  "warning": "Save this key now! It will not be shown again."
}
```

---

## Common Workflows

### Bot Setup (for OpenClaw agents like Penny or Betty)

1. **Human** signs in via Google and generates an API key
2. **Human** creates a team and invites the bot's email
3. **Bot** uses `GET /me` to discover boards and teams
4. **Bot** starts creating/managing tasks via the API

### Daily Standup Bot

```bash
# Get all "In Progress" tasks
curl -s "$BASE/boards/1/tasks?column=In+Progress" -H "x-api-key: $KEY"

# Move completed tasks to Done
curl -s -X POST "$BASE/tasks/42/move" -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" -d '{"column":"Done"}'

# Add new tasks from today's plan
curl -s -X POST "$BASE/boards/1/tasks" -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Deploy new feature","column":"In Progress","priority":"high"}'
```

### Bulk Task Import

```bash
curl -s -X POST "$BASE/tasks/batch" -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {"action":"create","boardId":1,"title":"Task 1","column":"Backlog"},
      {"action":"create","boardId":1,"title":"Task 2","column":"Backlog"},
      {"action":"create","boardId":1,"title":"Task 3","column":"Planned"}
    ]
  }'
```

---

## Error Handling

All errors return JSON with an `error` field:

```json
{ "error": "Board not found" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (missing required fields) |
| 401 | Unauthorized (invalid or missing API key) |
| 403 | Forbidden (not a team member, not admin) |
| 404 | Not found |
| 500 | Server error |

---

## Rate Limits

No rate limits currently enforced. Be reasonable — don't hammer the API with thousands of requests. Batch operations exist for a reason!
