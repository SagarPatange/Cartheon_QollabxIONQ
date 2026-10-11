"""Loopback-only HTTP interface for the certified local optimizer."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

from application.jobs import BusyRunError, RunManager
from application.scenarios import PROJECT, configuration

MAX_BODY = 1024 * 1024
MAX_UPLOAD_BODY = 32 * 1024 * 1024
ASSETS = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/cabinet.css': ('cabinet.css', 'text/css; charset=utf-8'),
    '/state.js': ('state.js', 'text/javascript; charset=utf-8'),
    '/diagram.js': ('diagram.js', 'text/javascript; charset=utf-8'),
    '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
    '/test-system': ('index.html', 'text/html; charset=utf-8'),
    '/market.js': ('market.js', 'text/javascript; charset=utf-8'),
    '/market_charts.js': ('market_charts.js', 'text/javascript; charset=utf-8'),
    '/market_state.js': ('market_state.js', 'text/javascript; charset=utf-8'),
    '/market.css': ('market.css', 'text/css; charset=utf-8'),
}


class RequestHTTPServer(ThreadingHTTPServer):
    """Independent HTTP handlers; solver work remains serialized by RunManager."""

    def handle_error(self, request, client_address):
        # A peer may leave while headers/body are read or a response is written.
        # Keep unexpected handler failures visible through the standard reporter.
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def make_server(port: int, manager: RunManager, *, static_dir=None, market=None) -> ThreadingHTTPServer:
    """Serve only declared routes, always on the IPv4 loopback interface."""
    if type(port) is not int or not 0 <= port <= 65535:
        raise ValueError('port must be an integer from 0 through 65535')
    asset_dir = Path(static_dir) if static_dir is not None else Path(__file__).parent
    config = configuration(manager.base)

    class Handler(BaseHTTPRequestHandler):
        # StreamRequestHandler.setup applies this before request-line/header reads.
        timeout = 2

        def log_message(self, format, *args):
            pass

        def _send(self, status, payload):
            data = json.dumps(payload, allow_nan=False, separators=(',', ':')).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def _error(self, status, message):
            self._send(status, {'error': message[:240]})

        def _path(self):
            # Match the raw path: percent escapes and traversal never become filenames.
            parts = urlsplit(self.path)
            return parts.path if not parts.query and not parts.fragment else None

        def _local_request(self):
            authority = self.headers.get('Host', '')
            return authority in (f'127.0.0.1:{self.server.server_port}',
                                 f'localhost:{self.server.server_port}')

        def _origin_allowed(self):
            origin = self.headers.get('Origin')
            if origin is None:
                return True  # CLI clients on loopback do not send Origin.
            try:
                parts = urlsplit(origin)
            except ValueError:
                return False
            return (parts.scheme == 'http' and not parts.path and not parts.query
                    and not parts.fragment and parts.netloc == self.headers.get('Host'))

        def _drain_rejected_body(self):
            # A bounded read avoids a Windows connection reset before the
            # client can read a rejection for an already-sent small body.
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if 0 < length <= MAX_BODY:
                    self.connection.settimeout(5)
                    self.rfile.read(length)
            except (ValueError, OSError):
                pass

        def do_GET(self):
            if not self._local_request():
                self._error(403, 'Local host required')
                return
            path = self._path()
            if market is not None and path and path.startswith('/api/market/'):
                parts = path.split('/')
                try:
                    if path == '/api/market/config':
                        self._send(200, market.store.describe(market.store.default_id))
                        return
                    if len(parts)==7 and parts[3]=='datasets' and parts[5]=='hours':
                        self._send(200,market.store.hour(parts[4],int(parts[6])))
                        return
                    if len(parts)==5 and parts[3]=='runs':
                        self._send(200,market.get(parts[4]))
                        return
                except KeyError:
                    self._error(404,'Unknown dataset or run')
                    return
                except ValueError as error:
                    self._error(400,str(error))
                    return
            if path == '/api/config':
                self._send(200, config)
                return
            if path and path.startswith('/api/runs/') and path.count('/') == 3:
                try:
                    self._send(200, manager.get(path.rsplit('/', 1)[1]))
                except KeyError:
                    self._error(404, 'Unknown run')
                return
            if path in ASSETS:
                filename, mime = ASSETS[path]
                if market is not None and path in ('/','/index.html'):
                    filename = 'market.html'
                file = asset_dir / filename
                if file.is_file():
                    data = file.read_bytes()
                    self.send_response(200)
                    self.send_header('Content-Type', mime)
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(data)
                    return
            self._error(404, 'Not found')

        def do_POST(self):
            if not self._local_request() or not self._origin_allowed():
                self._drain_rejected_body()
                self._error(403, 'Local origin required')
                return
            path = self._path()
            routes = {'/api/runs'} | ({'/api/market/datasets','/api/market/runs','/api/market/comparisons'} if market is not None else set())
            if path not in routes:
                self._drain_rejected_body()
                self._error(404, 'Not found')
                return
            if self.headers.get('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json':
                self._drain_rejected_body()
                self._error(400, 'Expected application/json')
                return
            length_text = self.headers.get('Content-Length', '')
            try:
                length = int(length_text)
            except ValueError:
                length = -1
            limit = MAX_UPLOAD_BODY if path == '/api/market/datasets' else MAX_BODY
            if not 0 < length <= limit:
                self._error(400, 'Invalid or oversized request body')
                return
            try:
                self.connection.settimeout(20 if path == '/api/market/datasets' else 2)
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError('Incomplete request body')
                payload = json.loads(body, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON number')))
                if not isinstance(payload, dict):
                    raise ValueError('Require a JSON object')
                if path == '/api/market/datasets':
                    if set(payload) != {'energy','clearing'}:
                        raise ValueError('Require energy and clearing files')
                    accepted = market.store.register(payload['energy'],payload['clearing'])
                elif path == '/api/market/comparisons':
                    if set(payload) != {'baseline_run_id','hour_index'}:
                        raise ValueError('Require baseline_run_id and hour_index')
                    if not isinstance(payload['baseline_run_id'],str):
                        raise ValueError('Require string baseline_run_id')
                    accepted = market.submit_comparison(payload['baseline_run_id'],payload['hour_index'])
                elif path == '/api/market/runs':
                    if set(payload) != {'dataset_id','hour_indices'}:
                        raise ValueError('Require dataset_id and hour_indices')
                    accepted = market.submit(payload['dataset_id'],payload['hour_indices'])
                else:
                    if set(payload) != {'controls', 'revision'}:
                        raise ValueError('Require controls and revision')
                    accepted = manager.submit(payload['controls'], payload['revision'])
            except (OSError, RecursionError, ValueError) as error:
                self._error(400, str(error))
                return
            except BusyRunError as error:
                self._error(409, str(error))
                return
            except KeyError:
                self._error(404,'Unknown dataset or run')
                return
            self._send(201 if path == '/api/market/datasets' else 202, accepted)

        def do_PUT(self):
            self._drain_rejected_body()
            self._error(405, 'Method not allowed')

        def do_DELETE(self):
            self._drain_rejected_body()
            self._error(405, 'Method not allowed')

    return RequestHTTPServer(('127.0.0.1', port), Handler)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Local analog optimizer application')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args(argv)
    from application.market_data import DatasetStore
    from application.market_jobs import MarketRunManager
    market = MarketRunManager(DatasetStore())
    manager = RunManager()
    try:
        try:
            server = make_server(args.port, manager,market=market)
        except OSError as error:
            print(f'Cannot start application on 127.0.0.1:{args.port}: {error}', file=sys.stderr)
            return 1
        try:
            print(f'Application listening at http://127.0.0.1:{server.server_port}/', flush=True)
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return 0
    finally:
        manager.close()
        market.close()


if __name__ == '__main__':
    raise SystemExit(main())
