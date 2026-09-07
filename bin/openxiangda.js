#!/usr/bin/env node

const { main } = require('../lib/cli');
const { maskText } = require('../lib/utils');

const argv = process.argv.slice(2);

main(argv).catch(error => {
  const message =
    error && error.message ? error.message : String(error || 'Unknown error');
  if (argv.includes('--json')) {
    const payload = {
      success: false,
      error: {
        status: Number.isInteger(error?.status) ? error.status : null,
        code: error?.code || error?.payload?.errorCode || null,
        message,
        data: error?.data ?? error?.payload?.data ?? null,
      },
    };
    console.error(maskText(JSON.stringify(payload)));
    process.exit(1);
  }
  console.error(maskText(message));
  process.exit(1);
});
