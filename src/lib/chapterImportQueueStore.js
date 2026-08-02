const DATABASE = "novelverse-chapter-imports";
const STORE = "queues";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, action) {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = action(database.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result ?? true);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export const loadImportQueue = (novelId) => transaction("readonly", (store) => store.get(String(novelId)));
export const saveImportQueue = (novelId, queue) => transaction("readwrite", (store) => store.put(queue, String(novelId)));
export const clearImportQueue = (novelId) => transaction("readwrite", (store) => store.delete(String(novelId)));
