/* MyTool Notes local-first storage — IndexedDB is continuity storage, Supabase remains durable sync target. */
(() => {
  'use strict';

  const DB_NAME='mytool-notes-local-v1';
  const DB_VERSION=1;
  const NOTES='notes';
  const IMAGES='images';
  let dbPromise=null;

  function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('INDEXEDDB_REQUEST_FAILED'))})}
  function completed(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('INDEXEDDB_TX_ABORTED'));tx.onerror=()=>reject(tx.error||new Error('INDEXEDDB_TX_FAILED'))})}

  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(NOTES)){
          const store=db.createObjectStore(NOTES,{keyPath:'key'});
          store.createIndex('sync_state','sync_state',{unique:false});
          store.createIndex('client_uuid','client_uuid',{unique:false});
          store.createIndex('remote_id','remote_id',{unique:false});
          store.createIndex('updated_at','updated_at',{unique:false});
        }
        if(!db.objectStoreNames.contains(IMAGES)){
          const store=db.createObjectStore(IMAGES,{keyPath:'key'});
          store.createIndex('note_key','note_key',{unique:false});
          store.createIndex('sync_state','sync_state',{unique:false});
          store.createIndex('client_uuid','client_uuid',{unique:false});
          store.createIndex('remote_id','remote_id',{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('INDEXEDDB_OPEN_FAILED'));
    });
    return dbPromise;
  }

  async function all(storeName){const db=await open();const tx=db.transaction(storeName,'readonly');const rows=await request(tx.objectStore(storeName).getAll());await completed(tx);return rows||[]}
  async function get(storeName,key){const db=await open();const tx=db.transaction(storeName,'readonly');const row=await request(tx.objectStore(storeName).get(key));await completed(tx);return row||null}
  async function put(storeName,value){const db=await open();const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).put(value);await completed(tx);return value}
  async function remove(storeName,key){const db=await open();const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).delete(key);await completed(tx)}
  async function byIndex(storeName,indexName,value){const db=await open();const tx=db.transaction(storeName,'readonly');const rows=await request(tx.objectStore(storeName).index(indexName).getAll(value));await completed(tx);return rows||[]}

  async function patchNote(key,patch){const current=await get(NOTES,key);if(!current)return null;const next={...current,...patch};await put(NOTES,next);return next}
  async function patchImage(key,patch){const current=await get(IMAGES,key);if(!current)return null;const next={...current,...patch};await put(IMAGES,next);return next}

  function noteKey(clientUuid,remoteId){return clientUuid?'client:'+clientUuid:'remote:'+remoteId}
  function imageKey(clientUuid,remoteId){return clientUuid?'clientimg:'+clientUuid:'remoteimg:'+remoteId}

  window.MyToolNotesLocal=Object.freeze({
    open,
    noteKey,
    imageKey,
    getNotes:()=>all(NOTES),
    getNote:key=>get(NOTES,key),
    putNote:value=>put(NOTES,value),
    patchNote,
    deleteNote:key=>remove(NOTES,key),
    getImages:()=>all(IMAGES),
    getImagesForNote:key=>byIndex(IMAGES,'note_key',key),
    getImage:key=>get(IMAGES,key),
    putImage:value=>put(IMAGES,value),
    patchImage,
    deleteImage:key=>remove(IMAGES,key)
  });
})();