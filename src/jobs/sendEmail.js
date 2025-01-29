// sendEmail.js
module.exports = async (payload) => {
  console.log(`Sending email to ${payload.to}: ${payload.subject}`);
  // Simulate async operation
  await new Promise((resolve) => setTimeout(resolve, 1000));
};
