import { loadPyodide, version, setCompatExtension } from "./pyodide";
import { type PackageData } from "./load-package";
export { loadPyodide, setCompatExtension, version, type PackageData };
(globalThis as any).loadPyodide = loadPyodide;
