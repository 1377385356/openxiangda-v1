function buildOpenXiangdaFunctionInvokeRequest(appType, functionCode, body) {
  return {
    method: 'POST',
    path: `/openxiangda-api/v1/apps/${encodeURIComponent(appType)}/functions/${encodeURIComponent(functionCode)}/invoke`,
    body,
    strictEnvelope: true,
  };
}

function buildLegacyFunctionInvokeRequest(appType, functionCode, body) {
  return {
    method: 'POST',
    path: `/${encodeURIComponent(appType)}/v1/functions/${encodeURIComponent(functionCode)}/invoke.json`,
    body,
    strictEnvelope: true,
  };
}

function isHttpNotFound(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status);
  return status === 404 || String(error?.message || '').includes('HTTP 404');
}

module.exports = {
  buildLegacyFunctionInvokeRequest,
  buildOpenXiangdaFunctionInvokeRequest,
  isHttpNotFound,
};
