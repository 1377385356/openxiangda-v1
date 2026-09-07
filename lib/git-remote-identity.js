const crypto = require('crypto');

function legacyRemoteIdentity(value) {
  const remote = String(value || '').trim();
  try {
    const url = new URL(remote);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return remote
      .replace(/^[^@/]+@([^:]+):/, '$1:')
      .replace(/[?#].*$/, '');
  }
}

function toggleDotGit(value) {
  const normalized = String(value || '').replace(/\/+$/, '');
  return /\.git$/i.test(normalized)
    ? normalized.replace(/\.git$/i, '')
    : `${normalized}.git`;
}

function canonicalRemoteIdentity(value) {
  const legacy = legacyRemoteIdentity(value).replace(/\/+$/, '');
  try {
    const url = new URL(legacy);
    const host = url.hostname.toLowerCase();
    const port = url.port ? `:${url.port}` : '';
    const pathname = url.pathname
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.git$/i, '');
    return `${host}${port}/${pathname}`.replace(/\/+$/, '');
  } catch {
    return legacy
      .replace(/^([^:]+):/, '$1/')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
  }
}

function remoteIdentityVariants(value) {
  const legacy = legacyRemoteIdentity(value).replace(/\/+$/, '');
  return Array.from(
    new Set(
      [
        legacy,
        toggleDotGit(legacy),
        canonicalRemoteIdentity(legacy),
      ].filter(Boolean)
    )
  );
}

function sha256(value) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex')}`;
}

function remoteRepositoryHashes(value) {
  return remoteIdentityVariants(value).map(identity =>
    sha256(`remote:${identity}`)
  );
}

function remoteUrlHashes(value) {
  return remoteIdentityVariants(value).map(sha256);
}

function identitiesIntersect(left, right) {
  const leftSet = new Set(
    (Array.isArray(left) ? left : [left]).filter(Boolean)
  );
  return (Array.isArray(right) ? right : [right]).some(value =>
    leftSet.has(value)
  );
}

module.exports = {
  identitiesIntersect,
  legacyRemoteIdentity,
  remoteIdentityVariants,
  remoteRepositoryHashes,
  remoteUrlHashes,
};
