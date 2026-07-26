import { createAssetLibrary, migrateAssetLibrary } from "./audioAssetLibrary";

const DB_NAME = "novelverse-audio-assets"; const DB_VERSION = 1; const BLOB_STORE = "audio-blobs"; const META_KEY = "novelverse.assetLibrary.v1";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("IndexedDB is unavailable.")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(BLOB_STORE)) request.result.createObjectStore(BLOB_STORE); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("IndexedDB failure."));
  });
}

export class IndexedDbAssetStorage {
  constructor({ metadataStorage = globalThis.localStorage } = {}) { this.metadataStorage = metadataStorage; this.kind = "indexeddb"; }
  loadLibrary() { return migrateAssetLibrary(this.metadataStorage?.getItem(META_KEY)); }
  saveLibrary(library) { const value = { ...library, updatedAt: new Date().toISOString() }; this.metadataStorage?.setItem(META_KEY, JSON.stringify(value)); return value; }
  async putBlob(assetId, blob) { const db = await openDatabase(); await transaction(db, "readwrite", (store) => store.put(blob, assetId)); db.close(); return { provider: this.kind, key: assetId }; }
  async getBlob(reference) { if (!reference?.key) throw new Error("Missing object reference."); const db = await openDatabase(); const blob = await transaction(db, "readonly", (store) => store.get(reference.key)); db.close(); if (!blob) throw new Error("Missing, revoked, or corrupted object reference."); return blob; }
  async deleteBlob(reference) { if (!reference?.key) return; const db = await openDatabase(); await transaction(db, "readwrite", (store) => store.delete(reference.key)); db.close(); }
}

function transaction(db, mode, operation) { return new Promise((resolve, reject) => { const tx = db.transaction(BLOB_STORE, mode); const request = operation(tx.objectStore(BLOB_STORE)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction failed.")); }); }

export class MemoryAssetStorage {
  constructor() { this.blobs = new Map(); this.library = createAssetLibrary(); this.kind = "memory"; }
  loadLibrary() { return this.library; } saveLibrary(library) { this.library = migrateAssetLibrary(library); return this.library; }
  async putBlob(assetId, blob) { this.blobs.set(assetId, blob); return { provider: this.kind, key: assetId, temporary: true }; }
  async getBlob(reference) { const blob = this.blobs.get(reference?.key); if (!blob) throw new Error("Missing temporary audio data."); return blob; }
  async deleteBlob(reference) { this.blobs.delete(reference?.key); }
}

export function createAssetStorage(options) { try { if (!globalThis.indexedDB) return new MemoryAssetStorage(); return new IndexedDbAssetStorage(options); } catch { return new MemoryAssetStorage(); } }
