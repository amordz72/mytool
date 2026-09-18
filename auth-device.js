(() => {
  'use strict';

  const DB_NAME = 'mytool_core_auth_v1';
  const DB_VERSION = 1;
  const STORE = 'installation';
  const KEY = 'default';

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('INDEXEDDB_UNAVAILABLE'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error || new Error('INDEXEDDB_OPEN_FAILED'));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  function txRequest(mode, action) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let req;
      try {
        req = action(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      req.onerror = () => reject(req.error || new Error('INDEXEDDB_REQUEST_FAILED'));
      req.onsuccess = () => resolve(req.result);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('INDEXEDDB_TX_FAILED'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error('INDEXEDDB_TX_ABORTED'));
      };
    }));
  }

  function randomHex(bytes = 32) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }

  async function readIdentity() {
    return txRequest('readonly', store => store.get(KEY));
  }

  async function saveIdentity(record) {
    return txRequest('readwrite', store => store.put(record));
  }

  async function getOrCreateIdentity() {
    let row = await readIdentity();
    if (row?.publicDeviceId && row?.deviceSecret) return row;

    row = {
      key: KEY,
      publicDeviceId: uuid(),
      deviceSecret: randomHex(32),
      createdAt: new Date().toISOString()
    };
    await saveIdentity(row);
    return row;
  }

  async function clearIdentity() {
    return txRequest('readwrite', store => store.delete(KEY));
  }

  function platformHint() {
    const ua = navigator.userAgent || '';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    return [platform, ua].filter(Boolean).join(' | ').slice(0, 240);
  }

  function deviceLabel() {
    const platform = navigator.userAgentData?.platform || navigator.platform || 'Browser';
    return String(platform).slice(0, 80);
  }

  function v2Enabled() {
    const value = new URLSearchParams(location.search).get('authv2');
    if (value === '1') {
      sessionStorage.setItem('mytool_auth_v2_preview', '1');
      return true;
    }
    if (value === '0') {
      sessionStorage.removeItem('mytool_auth_v2_preview');
      return false;
    }
    return sessionStorage.getItem('mytool_auth_v2_preview') === '1';
  }

  window.MyToolDeviceAuth = Object.freeze({
    getOrCreateIdentity,
    clearIdentity,
    platformHint,
    deviceLabel,
    v2Enabled
  });
})();
