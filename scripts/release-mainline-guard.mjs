import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assertReleaseSourceIntegrated,
  prepareReleaseSourceRevision,
} = require('../lib/release-mainline');

try {
  const tag = process.env.npm_config_tag || 'v1';
  if (tag !== 'v1') throw new Error('V1_RELEASE_CHANNEL_REQUIRED: V1 维护包只能发布到 v1，不能改写 latest');
  const options = { cwd: process.cwd() };
  const source = prepareReleaseSourceRevision(options);
  const integration = assertReleaseSourceIntegrated(source, options);
  process.stdout.write(
    `release mainline guard passed: ${integration.sourceCommit} -> ${
      integration.remoteName ? `${integration.remoteName}/` : ''
    }${integration.mainBranch}@${integration.mainTipCommit}\n`,
  );
} catch (error) {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
}
