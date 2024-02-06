import ErrorStackParser from "error-stack-parser";
import {
  IN_NODE,
  IN_NODE_ESM,
  IN_BROWSER_MAIN_THREAD,
  IN_BROWSER_WEB_WORKER,
  IN_NODE_COMMONJS,
} from "./environments";
import { API } from "./types";

declare var globalThis: {
  _____pyodide_compatExt: Required<CompatExtension>;
  importScripts: (url: string) => void;
  document?: any;
  fetch?: any;
};

export type CompatExtension = {
  node?: {
    path: any;
    fs: any;
    fsPromises: any;
    url: any;
    crypto: any;
    ws: any;
    tty: any;
  };
  resolvePath?: (path: string, base?: string) => string;
  loadLockFile?: (lockFileURL: string) => API["lockFilePromise"];
  fetchBinary?: (
    path: string,
    file_sub_resource_hash?: string | undefined
  ) =>
    | { response: Promise<Response>; binary?: undefined }
    | { binary: Promise<Uint8Array>; response?: undefined };
};

// Need to store in globalThis since this code seems to be added to two
// different files
globalThis._____pyodide_compatExt =
  globalThis._____pyodide_compatExt ?? ({} as Required<CompatExtension>);
export const compat = {
  loader: null!,
  setExtension(ext: CompatExtension, override?: boolean) {
    const __compatExt = globalThis._____pyodide_compatExt;
    if (ext.node && (override || !__compatExt.node)) {
      __compatExt.node = ext.node;
    }
    if (ext.fetchBinary && (override || !__compatExt.fetchBinary)) {
      __compatExt.fetchBinary = ext.fetchBinary;
    }
    if (ext.loadLockFile && (override || !__compatExt.loadLockFile)) {
      __compatExt.loadLockFile = ext.loadLockFile;
    }
    if (ext.resolvePath && (override || !__compatExt.resolvePath)) {
      __compatExt.resolvePath = ext.resolvePath;
    }
  },
  get node() {
    return globalThis._____pyodide_compatExt.node;
  },
  resolvePath(path: string, base?: string) {
    return globalThis._____pyodide_compatExt.resolvePath(path, base);
  },
  fetchBinary(path: string, file_sub_resource_hash?: string | undefined) {
    return globalThis._____pyodide_compatExt.fetchBinary(
      path,
      file_sub_resource_hash
    );
  },
  async loadBinaryFile(
    path: string,
    file_sub_resource_hash?: string | undefined
  ): Promise<Uint8Array> {
    const { response, binary } = globalThis._____pyodide_compatExt.fetchBinary(
      path,
      file_sub_resource_hash
    );
    if (binary) {
      return binary;
    }
    const r = await response!;
    if (!r.ok) {
      throw new Error(`Failed to load '${path}': request failed.`);
    }
    return new Uint8Array(await r.arrayBuffer());
  },
  async loadLockFile(lockFileURL: string) {
    return await globalThis._____pyodide_compatExt.loadLockFile(lockFileURL);
  },
};

/**
 * If we're in node, it's most convenient to import various node modules on
 * initialization. Otherwise, this does nothing.
 * @private
 */
export async function initNodeModules() {
  if (!IN_NODE) {
    return;
  }

  // Emscripten uses `require`, so if it's missing (because we were imported as
  // an ES6 module) we need to polyfill `require` with `import`. `import` is
  // async and `require` is synchronous, so we import all packages that might be
  // required up front and define require to look them up in this table.

  if (typeof require !== "undefined") {
    return;
  }
  // These are all the packages required in pyodide.asm.js. You can get this
  // list with:
  // $ grep -o 'require("[a-z]*")' pyodide.asm.js  | sort -u
  // Since we're in an ES6 module, this is only modifying the module namespace,
  // it's still private to Pyodide.
  (globalThis as any).require = function (mod: string): any {
    // @ts-expect-error
    return globalThis._____pyodide_compatExt.node[mod];
  };
}

// Set default loader
if (IN_NODE) {
  compat.setExtension({
    resolvePath(path, base) {
      return globalThis._____pyodide_compatExt.node.fs.resolve(
        base || ".",
        path
      );
    },
    /**
     * Load a binary file, only for use in Node. If the path explicitly is a URL,
     * then fetch from a URL, else load from the file system.
     * @param indexURL base path to resolve relative paths
     * @param path the path to load
     * @param checksum sha-256 checksum of the package
     * @returns An ArrayBuffer containing the binary data
     * @private
     */
    fetchBinary(path: string, _file_sub_resource_hash?: string | undefined) {
      if (path.startsWith("file://")) {
        // handle file:// with filesystem operations rather than with fetch.
        path = path.slice("file://".length);
      }
      if (path.includes("://")) {
        // If it has a protocol, make a fetch request
        return { response: fetch(path) };
      } else {
        // Otherwise get it from the file system
        return {
          binary: globalThis._____pyodide_compatExt.node.fsPromises
            .readFile(path)
            .then(
              (data: Buffer) =>
                new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            ),
        };
      }
    },
    async loadLockFile(lockFileURL) {
      await initNodeModules();
      const package_string =
        await globalThis._____pyodide_compatExt.node.fsPromises.readFile(
          lockFileURL
        );
      return JSON.parse(package_string);
    },
  });
} else {
  compat.setExtension({
    resolvePath(path, base) {
      if (base === undefined) {
        // @ts-ignore
        base = location;
      }
      return new URL(path, base).toString();
    },
    /**
     * Load a binary file, only for use in browser. Resolves relative paths against
     * indexURL.
     *
     * @param path the path to load
     * @param subResourceHash the sub resource hash for fetch() integrity check
     * @returns A Uint8Array containing the binary data
     * @private
     */
    fetchBinary(path: string, subResourceHash: string | undefined) {
      const url = new URL(path, location as unknown as URL);
      let options = subResourceHash ? { integrity: subResourceHash } : {};
      return { response: fetch(url, options) };
    },
    async loadLockFile(lockFileURL) {
      let response = await fetch(lockFileURL);
      return await response.json();
    },
  });
}

/**
 * Currently loadScript is only used once to load `pyodide.asm.js`.
 * @param url
 * @async
 * @private
 */
export let loadScript: (url: string) => Promise<void>;

if (IN_BROWSER_MAIN_THREAD) {
  // browser
  loadScript = async (url) => await import(/* webpackIgnore: true */ url);
} else if (IN_BROWSER_WEB_WORKER) {
  // webworker
  loadScript = async (url) => {
    try {
      // use importScripts in classic web worker
      globalThis.importScripts(url);
    } catch (e) {
      // importScripts throws TypeError in a module type web worker, use import instead
      if (e instanceof TypeError) {
        await import(/* webpackIgnore: true */ url);
      } else {
        throw e;
      }
    }
  };
} else if (IN_NODE) {
  loadScript = nodeLoadScript;
} else {
  throw new Error("Cannot determine runtime environment");
}

/**
 * Load a text file and executes it as Javascript
 * @param url The path to load. May be a url or a relative file system path.
 * @private
 */
async function nodeLoadScript(url: string) {
  if (url.startsWith("file://")) {
    // handle file:// with filesystem operations rather than with fetch.
    url = url.slice("file://".length);
  }
  if (url.includes("://")) {
    await import(url);
    // If it's a url, load it with fetch then eval it.
    // nodeVmMod.runInThisContext(await (await fetch(url)).text());
  } else {
    // Otherwise, hopefully it is a relative path we can load from the file
    // system.
    await import(
      /* webpackIgnore: true */ globalThis._____pyodide_compatExt.node.url.pathToFileURL(
        url
      ).href
    );
  }
}

// consider dropping this this once we drop support for node 14?
function nodeBase16ToBase64(b16: string): string {
  return Buffer.from(b16, "hex").toString("base64");
}

function browserBase16ToBase64(b16: string): string {
  return btoa(
    b16
      .match(/\w{2}/g)!
      .map(function (a) {
        return String.fromCharCode(parseInt(a, 16));
      })
      .join("")
  );
}

export const base16ToBase64 = IN_NODE
  ? nodeBase16ToBase64
  : browserBase16ToBase64;

/**
 * Calculate the directory name of the current module.
 * This is used to guess the indexURL when it is not provided.
 */
export async function calculateDirname(): Promise<string> {
  if (IN_NODE_COMMONJS) {
    return __dirname;
  }

  let err: Error;
  try {
    throw new Error();
  } catch (e) {
    err = e as Error;
  }
  let fileName = ErrorStackParser.parse(err)[0].fileName!;

  if (IN_NODE_ESM) {
    // FIXME: We would like to use import.meta.url here,
    // but mocha seems to mess with compiling typescript files to ES6.
    return globalThis._____pyodide_compatExt.node.url.fileURLToPath(
      globalThis._____pyodide_compatExt.node.path.dirname(fileName)
    );
  }

  const indexOfLastSlash = fileName.lastIndexOf(
    globalThis._____pyodide_compatExt.node.fs.sep
  );
  if (indexOfLastSlash === -1) {
    throw new Error(
      "Could not extract indexURL path from pyodide module location"
    );
  }
  return fileName.slice(0, indexOfLastSlash);
}
