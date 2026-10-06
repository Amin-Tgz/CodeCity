import functools
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch, MagicMock

import fetch_vendor
import metrics_agent
import serve


class ServiceTests(unittest.TestCase):
    def start(self, server_type, handler):
        server = server_type(('127.0.0.1', 0), handler)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
        thread.start()
        def stop():
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
        self.addCleanup(stop)
        return f'http://127.0.0.1:{server.server_address[1]}'

    def test_metrics_cpu_delta(self):
        with patch.object(metrics_agent, '_last_cpu', None):
            self.assertEqual(metrics_agent._cpu_percent(20, 100), -1)
            self.assertEqual(metrics_agent._cpu_percent(40, 200), 80)
            self.assertEqual(metrics_agent._cpu_percent(40, 200), -1)

    def test_real_machine_metrics(self):
        sample = metrics_agent._cpu_ram()
        self.assertTrue(-1 <= sample['cpu_pct'] <= 100)
        self.assertTrue(0 <= sample['ram_pct'] <= 100)
        self.assertGreater(sample['ram_total_mb'], 0)

    def test_metrics_http_and_not_found(self):
        base = self.start(metrics_agent.Server, metrics_agent.Handler)
        with urllib.request.urlopen(base+'/metrics') as response:
            data = json.load(response)
            self.assertIn('cpu_pct', data)
            self.assertIn('t', data)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(response.headers['Access-Control-Allow-Origin'], '*')
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(base+'/missing')
        self.assertEqual(caught.exception.code, 404)
        caught.exception.close()

    def test_static_server_resources(self):
        handler = functools.partial(serve.Handler, directory=str(serve.HERE))
        base = self.start(serve.Server, handler)
        for path in ['/index.html','/styles.css','/src/main.js','/vendor/three.module.js','/city.json']:
            with urllib.request.urlopen(base+path) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
                self.assertTrue(response.read())

    def test_vendor_default_offline_skip(self):
        with patch.object(fetch_vendor.urllib.request, 'urlopen', side_effect=AssertionError('unexpected network')):
            self.assertEqual(fetch_vendor.main([]), 0)

    def test_explicit_root_rebuilds_cached_model(self):
        server = MagicMock()
        server.server_address = ('127.0.0.1', 12345)
        with patch.object(serve, 'Server', return_value=server), patch('build_city.build') as build:
            self.assertEqual(serve.main(['--root', str(serve.HERE), '--no-open']), 0)
            build.assert_called_once()
            self.assertEqual(build.call_args.args[0], serve.HERE)

    def test_server_falls_back_from_reserved_port_range(self):
        server = MagicMock()
        server.server_address = ('127.0.0.1', 12345)
        with patch.object(serve, 'Server', side_effect=[OSError('reserved')]*20+[server]) as factory:
            self.assertEqual(serve.main(['--no-build','--no-open']), 0)
            self.assertEqual(factory.call_args.args[0], ('127.0.0.1', 0))

    def test_vendor_explicit_version_refreshes_pair(self):
        with tempfile.TemporaryDirectory() as tmp:
            vendor = Path(tmp)/'vendor'
            vendor.mkdir()
            for name in fetch_vendor.FILES: (vendor/name).write_bytes(b'old')
            response = MagicMock()
            response.__enter__.return_value.read.return_value = b'new'
            with patch.object(fetch_vendor, '__file__', str(Path(tmp)/'fetch_vendor.py')), patch.object(fetch_vendor.urllib.request, 'urlopen', return_value=response) as request:
                self.assertEqual(fetch_vendor.main(['0.161.0']), 0)
                self.assertEqual(request.call_count, 2)
                self.assertTrue(all('@0.161.0/' in call.args[0] for call in request.call_args_list))
                self.assertTrue(all((vendor/name).read_bytes() == b'new' for name in fetch_vendor.FILES))


if __name__ == '__main__':
    unittest.main()
