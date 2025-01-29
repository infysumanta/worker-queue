const { Queue, Worker } = require("./src/index");
const sendEmail = require("./src/jobs/sendEmail");
const webhook = require("./src/jobs/webhook");

const pgConfig = {
  host: "localhost",
  port: 5432,
  database: "worker",
  user: "postgres",
  password: "postgres",
};

const worker = new Worker(
  pgConfig,
  {
    send_email: sendEmail,
    webhook: webhook,
  },
  { concurrency: 2 },
);

(async () => {
  await worker.migrate();
  await worker.start();
})();
