const { Queue } = require("./src");

const pgConfig = {
  host: "localhost",
  port: 5432,
  database: "worker",
  user: "postgres",
  password: "postgres",
};

const queue = new Queue(pgConfig);
(async () => {
  for (let i = 0; i < 10; i++) {
    await queue.addJob("send_email", {
      to: `user${i}@example.com`,
      subject: `Hello ${i}`,
    });

    // // Example usage
    // await queue.addJob("webhook", {
    //   url: "https://example.com",
    //   method: "POST",
    //   headers: {
    //     Authorization: "Bearer your-token",
    //   },
    //   body: {
    //     event: "user.created",
    //     data: { id: 123 },
    //   },
    // });
  }

  process.exit(0);
})();
