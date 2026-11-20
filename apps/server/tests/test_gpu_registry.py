"""The graphics card is read from the registry first (WMI did not answer on the owner's PC)."""
import sys
import types

from services import hardware_detect


class _Key:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _fake_winreg(subkeys: dict[str, str | None]):
    order = list(subkeys)
    m = types.ModuleType("winreg")
    m.HKEY_LOCAL_MACHINE = object()

    def OpenKey(parent, name):
        if isinstance(parent, _Key) and name not in subkeys:
            raise OSError
        return _Key(name)

    def EnumKey(key, i):
        if i >= len(order):
            raise OSError
        return order[i]

    def QueryValueEx(key, value):
        desc = subkeys.get(key.name)
        if desc is None:
            raise OSError
        return (desc, 1)

    m.OpenKey, m.EnumKey, m.QueryValueEx = OpenKey, EnumKey, QueryValueEx
    return m


def test_names_from_registry(monkeypatch):
    monkeypatch.setitem(sys.modules, "winreg", _fake_winreg(
        {"0000": "AMD Radeon R9 200 Series", "0001": "Microsoft Basic Display Adapter", "Properties": None, "0002": None}))
    assert hardware_detect._gpu_names_registry() == ["AMD Radeon R9 200 Series", "Microsoft Basic Display Adapter"]


def test_registry_first_and_ranked(monkeypatch):
    monkeypatch.setitem(sys.modules, "winreg", _fake_winreg({"0000": "Intel(R) UHD Graphics 620", "0001": "NVIDIA GeForce GTX 1080"}))
    monkeypatch.setattr(hardware_detect.platform, "system", lambda: "Windows")
    monkeypatch.setattr(hardware_detect.subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no PowerShell")))
    assert hardware_detect._gpu_name_from_wmi() == "NVIDIA GeForce GTX 1080"
