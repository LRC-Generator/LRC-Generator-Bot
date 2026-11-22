// pm2's settings for running the bot on a server: `pm2 start ecosystem.config.cjs`.
// Run `npm run build` first, and again after each update.
module.exports = {
  apps: [
    {
      name: "lrc-bot",
      // Node runs the bot itself (not through `npm start`), so pm2's stop
      // signal reaches it and it can shut down cleanly.
      script: "dist/index.js",
      node_args: "--env-file-if-exists=.env",
      // Time to send the last server log lines to Discord before pm2 kills it.
      kill_timeout: 5000,
      // A bot that crashes straight away is retried with growing waits,
      // rather than in a tight loop.
      exp_backoff_restart_delay: 1000,
      time: true,
    },
  ],
};
