"""Local QA harness for the unpacked Qollab UI; substitutes only the runtime bridge.

Run from build/qollab-submission. The same packaged Python solvers serve the same
JSON boundary. This does not substitute for the final owner-side Qollab Run.
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path.cwd()))
from qiskit.providers.basic_provider import BasicSimulator
from qollab_app import bridge

ADAPTER = '''
async function call(action, args=[]) {
 const response=await fetch('/bridge?'+new URLSearchParams({action,args:JSON.stringify(args)}));
 const result=await response.json(); if(!response.ok)throw Error(result.error); return result;
}
let maps; function mapData(){return maps??=call('map');}
export function configureBackend(){}
export async function loadCities(){return (await mapData()).cities;}
export async function loadLanes(){return (await mapData()).lanes;}
export async function loadRoutePaths(){return (await mapData()).paths;}
export function runSimulation(...args){return call('week',args);}
export function compareObjectives(...args){return call('compare',args);}
export function runQuantumComparison(...args){return call('quantum',args);}
'''

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        request = urlsplit(self.path)
        if request.path in ('/', '/index.html'):
            text = Path('index.html').read_text(encoding='utf-8').replace('</body>', '<script type="module" src="main.js"></script></body>')
            self.reply(text, 'text/html'); return
        if request.path == '/src/data_source.js':
            self.reply(ADAPTER, 'application/javascript'); return
        if request.path == '/main.js':
            text = Path('main.js').read_text(encoding='utf-8').replace('configureBackend(backend)', 'configureBackend(null)')
            self.reply(text, 'application/javascript'); return
        if request.path != '/bridge':
            super().do_GET(); return
        query = parse_qs(request.query)
        args = json.loads(query.get('args', ['[]'])[0])
        try:
            action = query['action'][0]
            if action == 'map': result = bridge.map_data()
            elif action == 'week': result = bridge.run_week(*args)
            elif action == 'compare': result = bridge.compare_week(*args)
            elif action == 'quantum':
                result = bridge.quantum_compare(BasicSimulator(), *args)
                Path('../validation-result.json').write_text(result, encoding='utf-8')
            else: raise ValueError('Unknown action')
            self.reply(result, 'application/json')
        except Exception as error:
            self.reply(json.dumps({'error': str(error)}), 'application/json', 500)

    def reply(self, text, kind, status=200):
        content = text.encode('utf-8')
        self.send_response(status); self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(content))); self.end_headers(); self.wfile.write(content)

if __name__ == '__main__':
    print('Qollab package QA preview: http://127.0.0.1:8023/')
    ThreadingHTTPServer(('127.0.0.1', 8023), Handler).serve_forever()
