const https = require("https");

module.exports = async (payload) => {
  const { url, method = "POST", headers = {}, body } = payload;

  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      },
      (response) => {
        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(data);
          } else {
            reject(
              new Error(`Request failed with status ${response.statusCode}`),
            );
          }
        });
      },
    );

    request.on("error", reject);

    if (body) {
      request.write(JSON.stringify(body));
    }

    request.end();
  });
};
