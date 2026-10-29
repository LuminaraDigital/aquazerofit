-- AZF-P1 S9-S11 review: the person's first day in the calendar their arm
-- was recorded in. Week one is counted from it, by the treatment and by the
-- analysis alike. Expand, fill, then constrain, in one transaction: any arm
-- recorded before this takes its UTC assignment day.

ALTER TABLE engage.experiment_arms ADD COLUMN day_zero DATE;
UPDATE engage.experiment_arms SET day_zero = (assigned_at AT TIME ZONE 'UTC')::date WHERE day_zero IS NULL;
ALTER TABLE engage.experiment_arms ALTER COLUMN day_zero SET NOT NULL;
