import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

import build_city as bc


class BuilderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, name, text):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding='utf-8')
        return p

    def test_python_class_scope_async_and_members(self):
        p = self.write('sample.py', 'class A:\n    value = 1\n    async def run(self):\n        self.count = 2\n        self.run()\n\ndef helper():\n    pass\n')
        buildings = bc._scan_file('sample.py', p, 'python')
        a = next(b for b in buildings if b['name'] == 'A')
        self.assertEqual(a['loc'], 5)
        self.assertEqual(a['methods'], 1)
        self.assertEqual(a['attributes'], 2)
        self.assertEqual(a['members'][0]['name'], 'run')
        self.assertTrue(any(b['functions'] == 1 for b in buildings))

    def test_nested_classes_have_unique_ids(self):
        p = self.write('nested.py', 'class A:\n    class Inner:\n        pass\nclass B:\n    class Inner:\n        pass\n')
        bs = bc._scan_file('nested.py', p, 'python')
        self.assertEqual(len(bs), len({b['id'] for b in bs}))

    def test_python_import_roads(self):
        self.write('pkg/a.py', 'from . import b\nfrom pkg.b import run\n')
        self.write('pkg/b.py', 'async def run():\n    pass\n')
        self.write('main.py', 'import pkg.b\n')
        m = bc.scan_tree(self.root, 'fixture')
        pairs = {(r['a'].split('::')[0], r['b'].split('::')[0]) for r in m['roads']}
        self.assertIn(('pkg/a.py', 'pkg/b.py'), pairs)
        self.assertIn(('main.py', 'pkg/b.py'), pairs)
        self.assertTrue(all(isinstance(r['b'], str) for r in m['roads']))

    def test_js_imports_and_classes(self):
        self.write('main.ts', "import './lib';\nexport { Thing } from './lib';\n")
        self.write('lib/index.ts', 'export class Thing {\n  value = 1;\n  run() { return this.value; }\n}\n')
        m = bc.scan_tree(self.root, 'fixture')
        self.assertEqual(len(m['roads']), 1)
        thing = next(b for b in m['buildings'] if b['name'] == 'Thing')
        self.assertEqual(thing['methods'], 1)

    def test_attributes_do_not_count_method_calls(self):
        self.assertEqual(bc._extract_attributes('this.run(); this.value = 2;', 'javascript'), 1)
        self.assertEqual(bc._extract_attributes('self.run()\nself.value = 2', 'python'), 1)

    def test_js_class_methods_exclude_control_flow_and_strings(self):
        p = self.write('a.ts', 'export abstract class A {\n  ready = true;\n  async run() {\n    if (this.ready) {\n      this.run();\n      const value = "}";\n    }\n  }\n}\nexport function helper() {}\n')
        bs = bc._scan_file('a.ts', p, 'typescript')
        self.assertEqual(bs[0]['methods'], 1)
        self.assertEqual(bs[0]['attributes'], 1)
        self.assertEqual(bs[0]['loc'], 9)
        self.assertEqual(bs[1]['functions'], 1)

    def test_nested_class_attributes_do_not_leak(self):
        p = self.write('nested.py', 'class Outer:\n    class Inner:\n        def run(self):\n            self.value = 2\n')
        bs = bc._scan_file('nested.py', p, 'python')
        self.assertEqual(bs[0]['attributes'], 0)
        self.assertEqual(bs[1]['attributes'], 1)

    def test_zero_metrics_and_degrees_in_export(self):
        self.write('a.py', 'import b\n')
        self.write('b.py', 'pass\n')
        m = bc.scan_tree(self.root, 'fixture')
        self.assertTrue(all(b['nom'] == b['noa'] == 0 for b in m['buildings']))
        self.assertTrue(all(b['deps'] == 1 for b in m['buildings']))

    def test_skip_generated_and_empty(self):
        self.write('vendor/ignore.py', 'pass\n')
        self.write('node_modules/ignore.js', 'const x=1;')
        self.write('empty.py', '')
        self.assertEqual(bc.scan_tree(self.root, 'fixture')['buildings'], [])

    def make_db(self):
        db = self.root / '.codegraph/codegraph.db'
        db.parent.mkdir()
        with closing(sqlite3.connect(db)) as conn:
            conn.executescript('CREATE TABLE nodes(id TEXT, kind TEXT, name TEXT, qualified_name TEXT, file_path TEXT, language TEXT, start_line INTEGER, end_line INTEGER); CREATE TABLE edges(source TEXT, target TEXT, kind TEXT); CREATE TABLE files(path TEXT, language TEXT, size INTEGER);')
            conn.execute('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?)', ('a', 'class', 'Indexed', 'Indexed', 'a.py', 'python', 1, 2))
            conn.execute('INSERT INTO files VALUES(?,?,?)', ('a.py', 'python', 20))
            conn.commit()
        self.write('a.py', 'class Indexed:\n    pass\n')
        return db

    def test_explicit_codegraph_uses_database(self):
        db = self.make_db()
        with patch.object(bc, 'scan_tree', side_effect=AssertionError('scanner called')):
            m = bc.build(self.root, self.root / 'out.json', 'codegraph', str(db))
        self.assertEqual(m['meta']['source'], 'codegraph')
        self.assertEqual(m['buildings'][0]['name'], 'Indexed')

    def test_auto_and_scan_sources(self):
        self.make_db()
        self.assertEqual(bc.build(self.root, self.root / 'auto.json', 'auto', None)['meta']['source'], 'codegraph')
        self.assertEqual(bc.build(self.root, self.root / 'scan.json', 'scan', None)['meta']['source'], 'scan')

    def test_missing_root_fails(self):
        with self.assertRaises(ValueError):
            bc.build(self.root / 'missing', self.root / 'out.json', 'scan', None)

    def test_missing_explicit_database_fails(self):
        with self.assertRaises(SystemExit):
            bc.build(self.root, self.root / 'out.json', 'auto', str(self.root / 'missing.db'))

    def test_coverage_path_boundary(self):
        self.assertIsNone(bc.coverage_for('foo.py', {'notfoo.py': .9}))
        self.assertEqual(bc.coverage_for('pkg/foo.py', {'C:/repo/pkg/foo.py': .8}), .8)

    def test_coverage_and_output(self):
        self.write('a.py', 'pass\n')
        self.write('cov.json', json.dumps({'a.py': {'pct': 1}}))
        m = bc.build(self.root, self.root / 'out.json', 'scan', None, coverage='cov.json')
        self.assertEqual(m['buildings'][0]['coverage'], .01)
        self.assertEqual(json.loads((self.root / 'out.json').read_text()), m)

    def test_infrastructure(self):
        self.write('requirements.txt', 'fastapi>=1\n# comment\n-r other.txt\n')
        self.write('package.json', json.dumps({'dependencies': {'react': '1', 'redis': '1'}}))
        self.write('Dockerfile', 'FROM python:3.13\n')
        self.write('vendor/requirements.txt', 'torch\n')
        m = bc.scan_tree(self.root, 'fixture')
        names = {s['name'] for s in bc.scan_infra(self.root, m)['services']}
        self.assertEqual(names, {'fastapi', 'react', 'redis', 'python:3.13'})

    def test_history_renames_and_deleted_files(self):
        log = '@@aaa\t100\n2\t0\ta.py\n7\t0\tREADME.md\n@@bbb\t200\n0\t2\ta.py\n2\t0\tb.py\n'
        with patch.object(bc.subprocess, 'check_output', return_value=log) as run:
            h = bc.scan_history(self.root)
        self.assertIn('--no-renames', run.call_args.args[0])
        self.assertEqual(h['frames'][-1]['files'], {'b.py': 2})
        self.assertEqual(h['frames'][0]['total'], 2)


if __name__ == '__main__':
    unittest.main()
