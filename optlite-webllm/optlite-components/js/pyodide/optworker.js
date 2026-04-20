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
      // Do not use pydoc.render_doc inside user scripts: PGLogger (bdb) assumes f_globals['__name__'] on every
      // frame and breaks on pydoc's deep stack (KeyError '__name__', IndexError on bdb stack).
      // inspect.getdoc/signature matches normal __doc__ for builtins without running pydoc.
      // fetch and install optlite from pypi
      results = await self.pyodide.runPythonAsync(`
      import builtins
      import inspect
      import micropip
      from js import packages, optlite
      await micropip.install(optlite)
      for p in packages:
          await micropip.install(p)
      def _help(*args, **kwargs):
          if not args:
              print("Type help(object) for help about object.")
              return
          obj = args[0]
          name = getattr(obj, "__name__", None) or type(obj).__name__
          parts = ["Help on " + name + ":"]
          try:
              parts.append(str(inspect.signature(obj)))
          except (TypeError, ValueError):
              pass
          doc = inspect.getdoc(obj)
          parts.append(doc if doc else "No documentation string.")
          print("\\n\\n".join(parts))
      builtins.help = _help
      `)
    } else { // visualize code
      await self.pyodide.loadPackagesFromImports(self.script);
      results = await self.pyodide.runPythonAsync(`
      import builtins
      import inspect
      def _help(*args, **kwargs):
          if not args:
              print("Type help(object) for help about object.")
              return
          obj = args[0]
          name = getattr(obj, "__name__", None) or type(obj).__name__
          parts = ["Help on " + name + ":"]
          try:
              parts.append(str(inspect.signature(obj)))
          except (TypeError, ValueError):
              pass
          doc = inspect.getdoc(obj)
          parts.append(doc if doc else "No documentation string.")
          print("\\n\\n".join(parts))
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