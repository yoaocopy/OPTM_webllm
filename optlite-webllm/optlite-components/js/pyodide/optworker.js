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
      await self.pyodide.loadPackage("pydoc_data");
      // fetch and install optlite from pypi
      results = await self.pyodide.runPythonAsync(`
      import builtins
      import micropip
      import types
      from js import packages, optlite
      await micropip.install(optlite)
      for p in packages:
          await micropip.install(p)
      _helper_mod = types.ModuleType("optlite_help")
      _helper_src = """
import inspect
try:
    import pydoc_data.topics as _topics
except Exception:
    _topics = None

def help(*args, **kwargs):
    if not args:
        print("Type help(object) for help about object.")
        return
    obj = args[0]
    if isinstance(obj, str):
        key = obj.strip()
        if _topics is not None:
            keywords = getattr(_topics, "keywords", {})
            topics = getattr(_topics, "topics", {})
            if key in keywords:
                topic_name = keywords[key]
                print(topics.get(topic_name, "No topic text found for keyword: " + key))
                return
            if key in topics:
                print(topics[key])
                return
        print("Sorry, topic and keyword documentation is unavailable.")
        return

    name = getattr(obj, "__name__", None) or type(obj).__name__
    parts = ["Help on " + name + ":"]
    try:
        parts.append(str(inspect.signature(obj)))
    except (TypeError, ValueError):
        pass
    doc = inspect.getdoc(obj)
    parts.append(doc if doc else "No documentation string.")
    print("\\n\\n".join(parts))
"""
      exec(_helper_src, _helper_mod.__dict__)
      builtins.help = _helper_mod.help
      `)
    } else { // visualize code
      await self.pyodide.loadPackagesFromImports(self.script);
      results = await self.pyodide.runPythonAsync(`
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