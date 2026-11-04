-- AZF-P1 S7: experiment arms, written once per person per experiment the
-- first time they are eligible, so analysis reads the arm they were
-- actually in even after the treatment share changes.

CREATE TABLE engage.experiment_arms (
  user_id      TEXT NOT NULL,
  experiment   TEXT NOT NULL CHECK (experiment IN ('early_cheers')),
  arm          TEXT NOT NULL CHECK (arm IN ('treatment', 'holdout')),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment)
);
