module.exports = {
  apps: [
    {
      name: 'bot-po',
      script: 'src/server.js',
      cwd: '/home/reandynad/bot-po-whatsapp',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
