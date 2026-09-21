self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// V1 intentionally has no fetch/cache handler.
// MyTool data and pages stay network-fresh until offline rules are designed and tested.
