-- AZF-P1 S3: the order the Cut Man bank is folded in.
--
-- `seq` is assigned by the database, so neither clock skew nor two rows
-- sharing a timestamp can reorder the ledger. Every write happens under a
-- per-user advisory lock (EngageRepo.withGraceLedger). Existing rows are
-- numbered as the column is added.

ALTER TABLE engage.grace_ledger ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE;
