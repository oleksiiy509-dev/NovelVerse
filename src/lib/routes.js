export const readerRoutes = Object.freeze([
  "/", "/library", "/catalog", "/profile", "/downloads", "/reader/:id",
  "/novel/:id", "/login", "/subscription", "/beta",
]);

export const adminRoutes = Object.freeze([
  "/admin", "/admin/novels", "/admin/novels/add", "/admin/novels/edit/:id",
  "/admin/chapters", "/admin/chapters/add", "/admin/chapters/edit/:id",
  "/admin/taxonomy", "/admin/characters", "/admin/ai-brain",
  "/admin/voice-studio", "/admin/scene-studio", "/admin/audio-studio",
  "/admin/narration-studio", "/admin/export-studio", "/admin/publishing",
  "/admin/subscriptions",
  "/admin/novels/:novelId/characters",
]);

export const applicationRoutes = Object.freeze([...readerRoutes, ...adminRoutes]);

export function matchesApplicationRoute(pathname) {
  const segments = String(pathname || "").split("/").filter(Boolean);
  return applicationRoutes.some((route) => {
    const pattern = route.split("/").filter(Boolean);
    return pattern.length === segments.length && pattern.every((part, index) => part.startsWith(":") || part === segments[index]);
  });
}
