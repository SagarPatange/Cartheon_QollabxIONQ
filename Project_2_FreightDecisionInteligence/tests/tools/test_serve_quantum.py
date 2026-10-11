"""A missing optional quantum dependency must produce JSON, not a closed connection."""
import builtins

from serve import DispatchRequestHandler


def test_missing_qiskit_returns_an_actionable_json_error(monkeypatch):
    original_import = builtins.__import__

    def import_without_qiskit(name, *args, **kwargs):
        if name == "qiskit.providers.basic_provider":
            raise ModuleNotFoundError("No module named 'qiskit'")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_qiskit)
    handler = object.__new__(DispatchRequestHandler)
    handler.path = "/api/quantum?start=2022-03-07&seed=1&objective=profit"
    replies = []
    handler.send_json = lambda status, body: replies.append((status, body))
    handler.do_GET()
    assert replies[0][0] == 500
    assert "requirements-local.txt" in replies[0][1]["error"]
    assert "restart" in replies[0][1]["error"].lower()
