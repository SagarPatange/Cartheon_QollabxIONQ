"""Loopback API, asset boundary and HTTP solver integration tests."""
import http.client
from contextlib import redirect_stderr
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest

from application.jobs import RunManager
from application.scenarios import default_controls
from application.server import make_server

PROJECT = Path(__file__).resolve().parents[1]
BASE = json.loads((PROJECT / 'data/operating_case.json').read_text(encoding='utf-8'))


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=PROJECT / 'results')
        self.addCleanup(self.temp.cleanup)
        self.assets = Path(self.temp.name) / 'assets'
        self.assets.mkdir()
        (self.assets / 'index.html').write_text('<!doctype html><title>Cabinet</title>', encoding='utf-8')
        (self.assets / 'app.js').write_text('window.test = true;', encoding='utf-8')
        (self.assets / 'secret.txt').write_text('secret', encoding='utf-8')
        self.release = threading.Event()

        def worker(scenario, output_dir):
            self.release.wait(5)
            return {'status': 'complete', 'scenario': scenario, 'value': 12}

        self.manager = RunManager(base=BASE, solver=worker, output_root=Path(self.temp.name))
        self.addCleanup(self.manager.close)
        self.addCleanup(self.release.set)
        self.server = make_server(0, self.manager, static_dir=self.assets)
        self.addCleanup(self.server.server_close)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self._stop)
        self.port = self.server.server_port

    def _stop(self):
        self.server.shutdown()
        self.thread.join(5)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        data = response.read()
        status, headers = response.status, dict(response.getheaders())
        connection.close()
        try:
            data = json.loads(data)
        except (ValueError, UnicodeDecodeError):
            pass
        return status, data, headers

    def post(self, payload, origin=None):
        headers = {'Content-Type': 'application/json'}
        if origin is not None:
            headers['Origin'] = origin
        return self.request('POST', '/api/runs', json.dumps(payload), headers)

    def stalled_connection(self, data=b''):
        """Wait for real server acceptance, then retain the unfinished request."""
        accepted = threading.Event()
        handler = self.server.RequestHandlerClass

        class AcceptedHandler(handler):
            def setup(self):
                super().setup()
                accepted.set()

        self.server.RequestHandlerClass = AcceptedHandler
        connection = socket.create_connection(('127.0.0.1', self.port), timeout=5)
        self.addCleanup(connection.close)
        try:
            if data:
                connection.sendall(data)
            self.assertTrue(accepted.wait(1), 'Server did not accept the test connection')
        finally:
            self.server.RequestHandlerClass = handler
        return connection

    def test_unfinished_request_line_or_headers_leave_routes_responsive(self):
        job = self.manager.submit(default_controls(BASE), 6)
        for data in (b'', b'GET /api/config HTTP/1.1\r\nHost: 127.'):
            with self.subTest(data=data), self.stalled_connection(data) as stalled:
                for path in ('/api/config', '/', '/api/runs/' + job['run_id']):
                    connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=1)
                    started = time.monotonic()
                    try:
                        connection.request('GET', path)
                        try:
                            response = connection.getresponse()
                        except TimeoutError:
                            self.fail(f'{path} stalled behind an unfinished request')
                        self.assertEqual(response.status, 200)
                        response.read()
                        self.assertLess(time.monotonic() - started, 1)
                    finally:
                        connection.close()
                # Leave the unfinished headers open until server expiry, rather
                # than turning cleanup into a fresh peer-abort response race.
                stalled.settimeout(3)
                self.assertEqual(stalled.recv(4096), b'')

    def test_idle_and_partial_header_connections_expire(self):
        for data in (b'', b'GET /api/config HTTP/1.1\r\nHost: 127.'):
            with self.subTest(data=data), self.stalled_connection(data) as connection:
                connection.settimeout(3)
                try:
                    self.assertEqual(connection.recv(4096), b'')
                except TimeoutError:
                    self.fail('Unfinished request was not closed within three seconds')
        self.assertEqual(self.request('GET', '/api/config')[0], 200)

    def test_shutdown_is_bounded_with_an_idle_connection_open(self):
        with self.stalled_connection():
            stopped = threading.Event()

            def stop():
                self.server.shutdown()
                self.server.server_close()
                stopped.set()

            stopper = threading.Thread(target=stop, daemon=True)
            stopper.start()
            self.assertTrue(stopped.wait(1), 'Idle handler blocked shutdown/server_close')
            self.thread.join(1)
            self.assertFalse(self.thread.is_alive())

    def test_disconnect_errors_are_quiet_but_unexpected_errors_are_reported(self):
        handler = self.server.RequestHandlerClass

        class DisconnectHandler(handler):
            def do_GET(self):
                if self.path == '/reset':
                    raise ConnectionResetError(10054, 'Client reset')
                if self.path == '/broken-pipe':
                    raise BrokenPipeError('Client closed')
                raise ValueError('Unexpected request failure')

        self.server.RequestHandlerClass = DisconnectHandler
        original_error = self.server.handle_error
        reported = threading.Event()

        def handle_error(request, address):
            try:
                original_error(request, address)
            finally:
                reported.set()

        self.server.handle_error = handle_error
        self.addCleanup(setattr, self.server, 'handle_error', original_error)
        self.addCleanup(setattr, self.server, 'RequestHandlerClass', handler)
        for path, expected in (('/reset', ''), ('/broken-pipe', ''),
                               ('/unexpected', 'ValueError: Unexpected request failure')):
            with self.subTest(path=path):
                reported.clear()
                output = io.StringIO()
                with redirect_stderr(output):
                    with self.assertRaises(http.client.RemoteDisconnected):
                        self.request('GET', path)
                    self.assertTrue(reported.wait(1))
                if expected:
                    self.assertIn(expected, output.getvalue())
                else:
                    self.assertEqual(output.getvalue(), '')

    def test_config_submission_busy_poll_and_not_found(self):
        status, config, _ = self.request('GET', '/api/config')
        self.assertEqual(status, 200)
        self.assertEqual(set(config), {'base_case', 'default_controls', 'domains', 'display'})
        status, job, _ = self.post({'controls': default_controls(BASE), 'revision': 4},
                                   f'http://127.0.0.1:{self.port}')
        self.assertEqual(status, 202)
        self.assertEqual(job['revision'], 4)
        self.assertEqual(self.post({'controls': default_controls(BASE), 'revision': 5})[0], 409)
        self.release.set()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            status, result, _ = self.request('GET', '/api/runs/' + job['run_id'])
            if result['status'] == 'complete':
                break
            time.sleep(.02)
        self.assertEqual(status, 200)
        self.assertEqual(result['revision'], 4)
        self.assertEqual(result['data']['value'], 12)
        self.assertEqual(self.request('GET', '/api/runs/unknown')[0], 404)

    def test_static_routes_are_allowlisted(self):
        self.assertIn('Cabinet', self.request('GET', '/')[1].decode())
        self.assertIn('javascript', self.request('GET', '/app.js')[2]['Content-Type'])
        for path in ('/secret.txt', '/../data/operating_case.json', '/%2e%2e/secret.txt',
                     '/api/wrong', '/application/app.js', '/app.js/../../secret.txt'):
            with self.subTest(path=path):
                self.assertEqual(self.request('GET', path)[0], 404)

    def test_bad_body_controls_origin_and_method(self):
        self.assertEqual(self.request('POST', '/api/runs', '{', {'Content-Type': 'application/json'})[0], 400)
        self.assertEqual(self.request('POST', '/api/runs', '',
                                      {'Content-Type': 'application/json',
                                       'Content-Length': str(1024 * 1024 + 1)})[0], 400)
        self.assertEqual(self.post({'controls': default_controls(BASE), 'revision': True})[0], 400)
        controls = default_controls(BASE)
        controls['load_percent'] = float('nan')
        self.assertEqual(self.post({'controls': controls, 'revision': 2})[0], 400)
        self.assertEqual(self.post({'controls': default_controls(BASE), 'revision': 1},
                                   'https://foreign.example')[0], 403)
        self.assertEqual(self.request('POST', '/unknown', '{}', {'Content-Type': 'application/json'})[0], 404)
        self.assertEqual(self.request('PUT', '/api/runs', '{}')[0], 405)

    def test_partial_post_does_not_block_the_request_loop(self):
        with socket.create_connection(('127.0.0.1', self.port), timeout=5) as partial:
            partial.sendall((f'POST /api/runs HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n'
                             'Content-Type: application/json\r\nContent-Length: 10\r\n\r\n{').encode())
            connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=4)
            try:
                connection.request('GET', '/api/config')
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                response.read()
            finally:
                connection.close()
            partial.settimeout(3)
            response = http.client.HTTPResponse(partial)
            response.begin()
            self.assertEqual(response.status, 400)
            self.assertIn('error', json.loads(response.read()))

    def test_truncated_post_reports_bad_request(self):
        with socket.create_connection(('127.0.0.1', self.port), timeout=5) as partial:
            partial.sendall((f'POST /api/runs HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n'
                             'Content-Type: application/json\r\nContent-Length: 10\r\n\r\n{').encode())
            partial.shutdown(socket.SHUT_WR)
            self.assertIn(b' 400 ', partial.recv(4096))
        self.assertEqual(self.request('GET', '/api/config')[0], 200)

    def test_malformed_origin_and_deep_json_return_bounded_errors(self):
        body = json.dumps({'controls': default_controls(BASE), 'revision': 1})
        self.assertEqual(self.request('POST', '/api/runs', body,
                                      {'Content-Type': 'application/json', 'Origin': 'http://['})[0], 403)
        nested = '[' * 20000 + '0' + ']' * 20000
        status, payload, _ = self.request('POST', '/api/runs', nested,
                                          {'Content-Type': 'application/json'})
        self.assertEqual(status, 400)
        self.assertIn('error', payload)
        self.assertLessEqual(len(payload['error']), 240)

    def test_server_binds_loopback(self):
        self.assertEqual(self.server.server_address[0], '127.0.0.1')


class RealHttpSolverTest(unittest.TestCase):
    def test_default_case_over_http(self):
        root = PROJECT / 'results/application-http-integration'
        root.mkdir(parents=True, exist_ok=True)
        manager = RunManager(base=BASE, output_root=root)
        server = make_server(0, manager)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=10)
            request = json.dumps({'controls': default_controls(BASE), 'revision': 9})
            connection.request('POST', '/api/runs', request, {'Content-Type': 'application/json'})
            response = connection.getresponse()
            self.assertEqual(response.status, 202)
            run_id = json.loads(response.read())['run_id']
            connection.close()
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=10)
                connection.request('GET', '/api/runs/' + run_id)
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                result = json.loads(response.read())
                connection.close()
                if result['status'] not in ('queued', 'running'):
                    break
                time.sleep(.05)
            self.assertEqual(result['status'], 'complete', result.get('error'))
            self.assertEqual(result['revision'], 9)
            self.assertTrue(result['data']['certificates']['commitment']['passed'])
            self.assertTrue(result['data']['certificates']['conditional_pricing']['passed'])
            self.assertAlmostEqual(result['data']['commitment']['objective_dollars'], 82039.2757548886, places=4)
        finally:
            server.shutdown()
            thread.join(5)
            server.server_close()
            manager.close()


class LauncherTests(unittest.TestCase):
    def test_path_independent_no_browser_reports_busy_port(self):
        with socket.socket() as held:
            held.bind(('127.0.0.1', 0))
            held.listen(1)
            port = held.getsockname()[1]
            result = subprocess.run(
                ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                 '-File', str(PROJECT / 'start_application.ps1'), '-NoBrowser', '-Port', str(port)],
                cwd=PROJECT.parent, capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f'Cannot start application on 127.0.0.1:{port}',
                      result.stdout + result.stderr)

    def test_default_launcher_rejects_occupied_compatible_app_before_spawn(self):
        manager = RunManager(base=BASE, solver=lambda *_: None)
        server = make_server(0, manager)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            environment = dict(os.environ, APP_TEST_LAUNCHER=str(PROJECT / 'start_application.ps1'),
                               APP_TEST_PORT=str(server.server_port))
            command = ("function Start-Process { throw 'UNEXPECTED_START_PROCESS' }; "
                       "& $env:APP_TEST_LAUNCHER -Port ([int]$env:APP_TEST_PORT)")
            result = subprocess.run(
                ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
                cwd=PROJECT.parent, env=environment, capture_output=True, text=True, timeout=15)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(f'Cannot start application on 127.0.0.1:{server.server_port}',
                          result.stdout + result.stderr)
            self.assertNotIn('UNEXPECTED_START_PROCESS', result.stdout + result.stderr)
        finally:
            server.shutdown()
            thread.join(5)
            server.server_close()
            manager.close()

    def test_default_launcher_surfaces_child_exit_code(self):
        with socket.socket() as available:
            available.bind(('127.0.0.1', 0))
            port = available.getsockname()[1]
        environment = dict(os.environ, APP_TEST_LAUNCHER=str(PROJECT / 'start_application.ps1'),
                           APP_TEST_PORT=str(port))
        command = r"""
function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle,
          [switch]$PassThru, $RedirectStandardOutput, $RedirectStandardError)
    if ($FilePath -like 'http://*') { return }
    $child = Microsoft.PowerShell.Management\Start-Process -FilePath powershell.exe `
        -ArgumentList @('-NoProfile', '-Command', 'Start-Sleep -Seconds 2; exit 7') `
        -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath $RedirectStandardOutput `
        -Value "Application listening at http://127.0.0.1:$env:APP_TEST_PORT/"
    return $child
}
function Invoke-RestMethod { [pscustomobject]@{ default_controls = @{}; base_case = @{} } }
& $env:APP_TEST_LAUNCHER -Port ([int]$env:APP_TEST_PORT)
"""
        result = subprocess.run(
            ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
            cwd=PROJECT.parent, env=environment, capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Application exited with code 7', result.stdout + result.stderr)
