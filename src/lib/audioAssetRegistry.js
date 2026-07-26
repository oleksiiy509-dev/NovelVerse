export const AUDIO_ASSET_TYPES = ["ambience", "music", "sfx"];
export class LocalAudioAssetRegistry {
  constructor({ storage = globalThis.localStorage, key = "novelverse.audioAssets.v1" } = {}) { this.storage = storage; this.key = key; this.assets = this.load(); this.urls = new Set(); }
  load() { try { const parsed = JSON.parse(this.storage?.getItem(this.key) || "[]"); return Array.isArray(parsed) ? parsed.filter((asset) => AUDIO_ASSET_TYPES.includes(asset.type)) : []; } catch { return []; } }
  save() { this.storage?.setItem(this.key, JSON.stringify(this.assets.map((asset) => { const metadata = { ...asset }; delete metadata.objectUrl; return metadata; }))); }
  register({ id, type, name, file, reference = "" }) { if (!AUDIO_ASSET_TYPES.includes(type)) throw new Error(`Unsupported asset type: ${type}`); const objectUrl = file ? URL.createObjectURL(file) : ""; if (objectUrl) this.urls.add(objectUrl); const asset = { id: id || `asset_${Date.now()}`, type, name: name || file?.name || "Untitled asset", reference, objectUrl, size: file?.size || 0, contentType: file?.type || "", missing: !objectUrl && !reference, createdAt: new Date().toISOString() }; this.assets = [...this.assets.filter((item) => item.id !== asset.id), asset]; this.save(); return asset; }
  resolve(id) { const asset = this.assets.find((item) => item.id === id); return asset ? { ...asset, missing: asset.missing || (!asset.objectUrl && !asset.reference) } : null; }
  revoke(id) { const asset = this.assets.find((item) => item.id === id); if (asset?.objectUrl) { URL.revokeObjectURL(asset.objectUrl); this.urls.delete(asset.objectUrl); } this.assets = this.assets.map((item) => item.id === id ? { ...item, objectUrl: "", missing: true } : item); this.save(); }
  dispose() { for (const url of this.urls) URL.revokeObjectURL(url); this.urls.clear(); this.assets = this.assets.map((asset) => ({ ...asset, objectUrl: "", missing: !asset.reference })); }
}
