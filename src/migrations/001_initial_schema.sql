CREATE SCHEMA IF NOT EXISTS worker;

CREATE TABLE IF NOT EXISTS worker.jobs (
    id SERIAL PRIMARY KEY,
    type VARCHAR NOT NULL,
    status VARCHAR NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    payload JSONB,
    retries INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON worker.jobs (status);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON worker.jobs (created_at);