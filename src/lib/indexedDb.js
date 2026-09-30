const DB_NAME = 'yks-takip-medya-db'
const DB_VERSION = 1
const STORE_NAME = 'medyalar'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveMedia({ imageBlobs = [], imageBlob, audioBlob }) {
  const db = await openDb()
  const id = crypto.randomUUID()

  // Yeni kayıtlar imageBlobs dizisi kullanır; eski tek fotoğraflı kayıtlar için imageBlob da kabul edilir
  const blobs =
    Array.isArray(imageBlobs) && imageBlobs.length > 0
      ? imageBlobs
      : imageBlob
        ? [imageBlob]
        : []

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({
      id,
      imageBlobs: blobs,
      audioBlob: audioBlob || null,
      createdAt: Date.now(),
    })

    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getMediaById(id) {
  if (!id) return null
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}
