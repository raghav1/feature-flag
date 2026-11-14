# Feature Flags

An internal feature-flag and progressive-rollout service: admin dashboard, Java backend on PostgreSQL, and a demo storefront that reads the flags.

> Work in progress. Phases 0–1 are done: scaffold and evaluation engine (86 tests). See [docs/plan.md](docs/plan.md).

## Run it

Prerequisite: Docker.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Admin | http://localhost:5173 |
| Demo | http://localhost:5174 |
| Backend | http://localhost:8080/actuator/health |

## Tests

Prerequisite: Docker (running). A local JDK 21+ and Node 20+ are used when present; otherwise `test.sh` runs those steps in containers.

```bash
./test.sh
```

## API

The endpoint table will go here once the API exists (phase 2). The planned API is in [docs/plan.md](docs/plan.md#rest-api).

## Assumptions

1. A flag that's ON with no rules serves its **Otherwise** value (default OFF). For "on for everyone", set Otherwise → ON or add a 100 % rule.
2. Rule types are user-ID list, customer list and percentage rollout. The engine accepts new rule types without changes to the evaluator.
3. Percentage rollouts bucket by `userId`. A request with no user ID skips percentage rules.
4. A user lands in the same rollout bucket in dev and prod.
5. Flag keys can't be renamed, since a rename would re-bucket everyone. Descriptions can be edited.
6. Deleting a flag is permanent. Its audit history is kept.
7. Roles: admin can do everything, editor can change dev only and can't delete flags, viewer is read-only. Enforced by the server.
8. Demo users are a fixed, fictional list inside the demo app.
9. There are exactly two environments, dev and prod.
