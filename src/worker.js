const { Pool } = require("pg");
class Worker {
  constructor(config, handlers = {}, { concurrency = 1 } = {}) {
    this.pool = new Pool(config);
    this.handlers = handlers;
    this.concurrency = concurrency;
    this.processing = false;
  }
  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }
  async start() {
    this.processing = true;
    await this.#resetStuckJobs();
    const client = await this.pool.connect();
    client.on("notification", () => this.#processJobs());
    await client.query("LISTEN new_job");
    client.release();

    // Start processing loops based on concurrency
    for (let i = 0; i < this.concurrency; i++) {
      this.#processJobs();
    }
  }

  async #createSchema() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
            CREATE SCHEMA IF NOT EXISTS worker;
        `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      console.log("Schema created");
      client.release();
    }
  }

  async #createTable() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
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
        `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      console.log("Table created");
      client.release();
    }
  }

  async #createIndexes() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
            CREATE INDEX IF NOT EXISTS jobs_status_idx 
            ON worker.jobs (status);
        `);
      await client.query(`
            CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON
            worker.jobs (created_at);
        `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      console.log("Indexes created");
      client.release();
    }
  }

  async migrate() {
    await this.#createSchema();
    await this.#createTable();
    await this.#createIndexes();
  }

  async #processJobs() {
    while (this.processing) {
      await this.#processNextJob();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async #resetStuckJobs() {
    await this.pool.query(`
            UPDATE worker.jobs
            SET status = 'queued'
            WHERE status = 'processing'
            AND updated_at < NOW() - INTERVAL '5 minutes'
        `);
  }

  async #processNextJob() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(`
                WITH next_job AS (
                    SELECT id
                    FROM worker.jobs
                    WHERE status = 'queued'
                    ORDER BY created_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE worker.jobs
                SET status = 'processing', updated_at = NOW()
                WHERE id = (SELECT id FROM next_job)
                RETURNING *
            `);
      await client.query("COMMIT");

      if (rows.length === 0) return;

      const job = rows[0];
      console.log(`Processing job ${JSON.stringify(job)}`);
      const handler = this.handlers[job.type];

      if (!handler) {
        console.error(`No handler for job type: ${job.type}`);
        await this.#failJob(job.id);
        return;
      }

      try {
        await handler(job.payload);
        await this.#completeJob(job.id);
      } catch (error) {
        console.error(`Job ${job.id} failed: ${error.message}`);
        job.retries < job.max_retries
          ? await this.#retryJob(job.id)
          : await this.#failJob(job.id);
      }
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Processing error:", error);
    } finally {
      client.release();
    }
  }

  async #completeJob(id) {
    await this.pool.query(
      "UPDATE worker.jobs SET status = 'completed', updated_at = NOW() WHERE id = $1",
      [id],
    );
  }

  async #failJob(id) {
    await this.pool.query(
      "UPDATE worker.jobs SET status = 'failed', updated_at = NOW() WHERE id = $1",
      [id],
    );
  }

  async #retryJob(id) {
    await this.pool.query(
      `
            UPDATE worker.jobs
            SET status = 'queued', retries = retries + 1, updated_at = NOW()
            WHERE id = $1
        `,
      [id],
    );
  }

  async stop() {
    this.processing = false;
    await this.pool.end();
  }
}

module.exports = Worker;
