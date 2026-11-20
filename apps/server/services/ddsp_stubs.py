"""Stand-ins for packages MIDI-DDSP imports but does not use when it plays notes.

crepe (pitch tracking of recordings) downloads its model while it is being installed, which often fails;
tensorflow-addons (only for training) has no build for some Python versions; resource is a Unix module that
tensorflow-datasets imports at start (to raise the open-file limit while shuffling training data), so it is
missing on Windows. Playing MIDI needs none of them.
Run with the Python of the AI Instruments environment; it writes a stand-in only where the real package is missing.
"""
import importlib.util
import os
import site
import sys

STUBS = {
    "crepe": '"""Stand-in written by AI Music Studio: CREPE is not needed to play MIDI."""\n'
             'def predict(*a, **k):\n    raise RuntimeError("CREPE is not installed")\n',
    "tensorflow_addons": '"""Stand-in written by AI Music Studio: only training uses tensorflow-addons."""\n'
                         'class _Layers:\n    @staticmethod\n    def SpectralNormalization(layer):\n        return layer\n'
                         'layers = _Layers()\n',
    # a module, not a package: written as resource.py (only where Python has none, i.e. on Windows)
    "resource.py": '"""Stand-in written by AI Music Studio: the Unix resource module, which Windows does not have."""\n'
                   'RLIMIT_NOFILE = 7\n'
                   'def getrlimit(which):\n    return (8192, 8192)\n'
                   'def setrlimit(which, limits):\n    return None\n',
}

target = next((p for p in site.getsitepackages() if p.endswith("site-packages")), site.getsitepackages()[-1])
for name, code in STUBS.items():
    module = name[:-3] if name.endswith(".py") else name
    if importlib.util.find_spec(module) is not None:
        continue
    if name.endswith(".py"):
        path = os.path.join(target, name)
    else:
        os.makedirs(os.path.join(target, name), exist_ok=True)
        path = os.path.join(target, name, "__init__.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    print(f"stand-in written: {module}")
sys.exit(0)
