const { ensureDeviceHub, superviseDeviceHub, deviceHubAddresses } = require('../../worker/deviceHubService.cjs');

module.exports = function deviceServiceMiddleware(next) {
  superviseDeviceHub();
  return (request, response, nextMiddleware) => {
    if (request.url?.split('?')[0] !== '/__vasa/devices') return next(request, response, nextMiddleware);
    if (request.method !== 'POST' || request.headers['x-vasa-device-request'] !== '1') {
      response.writeHead(405); response.end(); return;
    }
    void ensureDeviceHub().then(() => {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ urls: deviceHubAddresses(request.headers.host) }));
    }).catch(() => {
      response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '3' });
      response.end(JSON.stringify({ error: 'Preparing Devices. Retrying automatically.' }));
    });
  };
};
