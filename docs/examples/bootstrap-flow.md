# Bootstrap Flow Example

## Dry-Run

```bash
node scripts/bootstrap-project.mjs --target /path/to/project
```

Expected result:

- discovery report summary
- plan summary
- no file changes
- no backup creation

## Apply

```bash
node scripts/bootstrap-project.mjs --target /path/to/project --apply
```

Expected result:

- backup created
- project-local OpenCode config written or merged
- Hermes portable bundle written
- reports generated
- validation run

## Rollback

```bash
node scripts/bootstrap-project.mjs --target /path/to/project --rollback /path/to/backup
```

Expected result:

- files restored from backup
- rollback manifest preserved
- unrelated files left untouched
