# Migration risk guide

Use this guide to classify a proposed migration. Actual risk depends on data volume, database engine, provider, traffic, deployment topology, and existing data.

| Change | Typical risk | Safer approach |
| --- | --- | --- |
| Add nullable column or independent table | LOW | Add without changing existing reads or writes; deploy application support afterward. |
| Nullable to required | MEDIUM–HIGH | Validate existing rows, backfill in bounded batches, then add the constraint in a later step. |
| Rename column | HIGH | Add the new column, dual-read/write or backfill, switch consumers, then remove the old column later. |
| Change data type | HIGH | Check conversion validity and rewrite/lock behavior; use a new column plus backfill when in-place conversion is unsafe. |
| Add unique constraint | MEDIUM–HIGH | Detect and resolve duplicates before creating the constraint; consider concurrent or online capabilities. |
| Add index to a large table | MEDIUM–HIGH | Use the engine's online/concurrent option when available and monitor lock, disk, and replication impact. |
| Remove column, table, or relation | DESTRUCTIVE | Prove all consumers have stopped using it, retain a recovery path, and remove it in a later deployment. |

## Expand and contract

For changes that cannot remain compatible in one deployment:

```text
expand schema compatibly
→ deploy code that supports old and new forms
→ backfill and validate
→ switch reads and writes
→ remove old behavior in a later release
→ contract the schema after usage is proven absent
```

Escalate the classification when the table is large, traffic is high, rollback is unclear, existing data is unknown, or multiple application versions run during deployment.
