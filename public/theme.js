/*
 * Applies the saved theme before first paint, so choosing Light or Dark never flashes the other.
 * A plain file rather than part of the bundle, because it has to run in the head.
 * src/scripts/theme.ts owns the setting; this only reads it.
 */
try {
    const theme = JSON.parse(localStorage.getItem("volt-mixer.theme"));
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {
    /* Storage unavailable: follow the system. */
}
