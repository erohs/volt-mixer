import path from "path";

/*
 * Which file a URL path maps to inside the built site. No Electron here, so Vitest can test it:
 * it's what keeps app:// and the phone server from serving anything outside the site.
 */

/** The file under `root` for `pathname` ("/" ends in index.html), or null if it would leave `root`. */
export const fileWithin = (root: string, pathname: string): string | null => {
    try {
        const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
        const file = path.resolve(root, relative, pathname.endsWith("/") ? "index.html" : "");
        return file.startsWith(root + path.sep) ? file : null;
    } catch {
        return null;
    }
};
