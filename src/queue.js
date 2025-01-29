const { Pool } = require("pg");

class Queue {
  constructor(config) {
    this.pool = new Pool(config);
    this.pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });
  }

  async addJob(type, payload, { maxRetries = 3 } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO worker.jobs (type, status, payload, retries, max_retries)
                 VALUES ($1, 'queued', $2, 0, $3)
                 RETURNING *`,
        [type, payload, maxRetries],
      );
      await client.query("NOTIFY new_job");
      await client.query("COMMIT");
      return res.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removeJob(id) {
    const res = await this.pool.query(
      "DELETE FROM worker.jobs WHERE id = $1 RETURNING *",
      [id],
    );
    return res.rows[0];
  }

  async updateJob(id, updates) {
    const { payload, maxRetries } = updates;
    const res = await this.pool.query(
      `UPDATE worker.jobs
             SET payload = COALESCE($2, payload),
                 max_retries = COALESCE($3, max_retries),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
      [id, payload, maxRetries],
    );
    return res.rows[0];
  }

  async listJobs(status) {
    const query = status
      ? "SELECT * FROM worker.jobs WHERE status = $1 ORDER BY created_at"
      : "SELECT * FROM worker.jobs ORDER BY created_at";
    const params = status ? [status] : [];
    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = Queue;
