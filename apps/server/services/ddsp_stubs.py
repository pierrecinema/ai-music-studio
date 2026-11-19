"""Stand-ins for two packages MIDI-DDSP imports but does not use when it plays notes.

crepe (pitch tracking of recordings) downloads its model while it is being installed, which often fails;
tensorflow-addons (only for training) has no build for some Python versions. Playing MIDI needs neither.
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
}

target = next((p for p in site.getsitepackages() if p.endswith("site-packages")), site.getsitepackages()[-1])
for name, code in STUBS.items():
    if importlib.util.find_spec(name) is not None:
        continue
    os.makedirs(os.path.join(target, name), exist_ok=True)
    with open(os.path.join(target, name, "__init__.py"), "w", encoding="utf-8") as f:
        f.write(code)
    print(f"stand-in written: {name}")
sys.exit(0)
