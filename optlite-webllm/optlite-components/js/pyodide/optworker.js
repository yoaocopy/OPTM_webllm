// web worker

self.onmessage = async (event) => {
  // copy the context in worker's own "memory"
  const { id, ...context } = event.data;
  for (const key of Object.keys(context)) {
    self[key] = context[key];
  }

  try {
    let results;
    if (id < 0) { // initialize worker
      // load pyodide from its url — indexURL must match the CDN folder or loadPackage("pydoc_data") can fail silently / 404.
      const pyodideScript = self.pyodide;
      importScripts(pyodideScript);
      const indexURL = pyodideScript.replace(/\/[^/]*$/, "/");
      self.pyodide = await loadPyodide({ indexURL });
      await self.pyodide.loadPackage("micropip");
      // Builtin types' help() text lives in unvendored stdlib; see Pyodide wasm-constraints (pydoc_data).
      await self.pyodide.loadPackage("pydoc_data");
      // help() uses pydoc's pager (less/subprocess); WASM has no pager — use plain output and a help() that only prints.
      // fetch and install optlite from pypi
      results = await self.pyodide.runPythonAsync(`
      import builtins
      import micropip
      import pydoc
      import pydoc_data  # noqa: F401 — ensure topics for builtins resolve
      from js import packages, optlite
      await micropip.install(optlite)
      for p in packages:
          await micropip.install(p)
      pydoc.pager = pydoc.plainpager
      def _help(*args, **kwargs):
          if not args:
              print("Type help(object) for help about object.")
              return
          print(pydoc.render_doc(args[0]))
      builtins.help = _help
      `)
    } else { // visualize code
      await self.pyodide.loadPackagesFromImports(self.script);
      results = await self.pyodide.runPythonAsync(`
      import builtins
      import pydoc
      import pydoc_data  # noqa: F401
      pydoc.pager = pydoc.plainpager
      def _help(*args, **kwargs):
          if not args:
              print("Type help(object) for help about object.")
              return
          print(pydoc.render_doc(args[0]))
      builtins.help = _help
      import optlite
      from js import script, rawInputLst
      optlite.exec_script(script, rawInputLst)
      `);
    }
    self.postMessage({ results, id });
  } catch (error) {
    self.postMessage({ error: "Failed to run code: "+error.message, id });
  }
};