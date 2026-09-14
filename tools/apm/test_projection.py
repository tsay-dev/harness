#!/usr/bin/env python3
"""パッケージ境界と出力所有権の回帰検証。"""
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class Projection(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='harness projection ')
        self.addCleanup(self.temp.cleanup)
        self.host = Path(self.temp.name) / 'consumer with spaces'
        self.host.mkdir()

    def run_projection(self, target='codex', packages=('develop-core', 'rules-next'), success=True):
        command = [str(ROOT / 'init.sh'), target, str(self.host)]
        for package in packages:
            command += ['--package', package]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result

    def snapshot(self):
        return {str(p.relative_to(self.host)): p.read_bytes() for p in self.host.rglob('*') if p.is_file()}

    def test_each_target_selected_only_idempotent(self):
        for target in ('claude', 'cursor', 'grok', 'codex'):
            self.run_projection(target)
        first = self.snapshot()
        for target in ('claude', 'cursor', 'grok', 'codex'):
            self.run_projection(target)
        self.assertEqual(first, self.snapshot())
        self.assertFalse(any('manga' in name or 'expo' in name or 'video' in name for name in first))
        self.assertFalse((self.host / 'AGENTS.md').exists())
        self.assertFalse((self.host / '.claude/settings.json').exists())
        self.assertFalse((self.host / 'tools').exists())
        self.assertFalse((self.host / 'templates').exists())

    def test_model_tiers_are_mapped_without_agent_name_tables(self):
        expected = {
            'spec-author': ('opus', 'gpt-6-astra', 'high'),
            'implementer': ('sonnet', 'gpt-5.6-luna', 'high'),
        }
        self.run_projection('claude', ('develop-core',))
        self.run_projection('cursor', ('develop-core',))
        self.run_projection('codex', ('develop-core',))
        for name, (claude_model, codex_model, effort) in expected.items():
            claude = (self.host / f'.claude/agents/{name}.md').read_text()
            cursor = (self.host / f'.cursor/agents/{name}.md').read_text()
            codex = (self.host / f'.codex/agents/{name}.toml').read_text()
            self.assertRegex(claude, rf'(?m)^model: "{claude_model}"$')
            self.assertRegex(cursor, r'(?m)^model: "inherit"$')
            self.assertNotIn('x-model-tier', claude + cursor + codex)
            self.assertIn(f'model = "{codex_model}"', codex)
            self.assertIn(f'model_reasoning_effort = "{effort}"', codex)
        for mapping in ('tools/apm/claude-models.json', 'tools/codex-sync/models.json'):
            text = (ROOT / mapping).read_text()
            for name in expected:
                self.assertNotIn(name, text)

    def test_all_agent_tier_assignments(self):
        # light は現在空（該当する develop エージェントが無い）。tier 自体は対応表に残る。
        expected_develop = {
            'top': {'spec-author', 'reviewer', 'attacker'},
            'mid': {'test-author', 'implementer'},
            'light': set(),
        }
        actual = {tier: set() for tier in expected_develop}
        develop_root = ROOT / 'packages/develop-core/.apm/agents/develop'
        for source in develop_root.glob('*.agent.md'):
            tier = re.search(r'(?m)^x-model-tier: (top|mid|light)$', source.read_text())[1]
            actual[tier].add(source.stem.removesuffix('.agent'))
        self.assertEqual(actual, expected_develop)

        for package in ('produce-video', 'render-media', 'translate-manga'):
            for source in (ROOT / 'packages' / package / '.apm/agents').rglob('*.agent.md'):
                self.assertRegex(source.read_text(), r'(?m)^x-model-tier: top$')

    def test_shrink_removes_owned_files_only(self):
        self.run_projection('claude', ('develop-core', 'rules-next', 'translate-manga'))
        custom = self.host / '.claude/agents/my-agent.md'
        custom.write_text('handwritten')
        self.run_projection('claude')
        self.assertEqual(custom.read_text(), 'handwritten')
        self.assertFalse(any('manga' in name for name in self.snapshot()))

    def test_handwritten_collision_untouched(self):
        custom = self.host / '.codex/agents/spec-author.toml'
        custom.parent.mkdir(parents=True)
        custom.write_text('handwritten')
        first = self.snapshot()
        self.run_projection(success=False)
        self.assertEqual(first, self.snapshot())

    def test_modified_generated_file_untouched(self):
        self.run_projection()
        custom = self.host / '.codex/agents/spec-author.toml'
        custom.write_text(custom.read_text() + '\n# personal change\n')
        first = self.snapshot()
        self.run_projection(packages=('grilling',), success=False)
        self.assertEqual(first, self.snapshot())

    def test_new_target_protects_shared_skill_edits(self):
        self.run_projection('claude', ('grilling',))
        skill = self.host / '.claude/skills/grilling/SKILL.md'
        skill.write_text(skill.read_text() + '\nmanual edit\n')
        first = self.snapshot()
        self.run_projection('grok', ('grilling',), success=False)
        self.assertEqual(first, self.snapshot())

    def test_apm_mixing_rejected(self):
        (self.host / 'apm.yml').write_text('name: consumer\n')
        first = self.snapshot()
        self.run_projection(success=False)
        self.assertEqual(first, self.snapshot())

    def test_manifest_symlink_rejected(self):
        external = self.host.parent / 'external-state.json'
        external.write_text('{"version": 1, "targets": {}}')
        (self.host / '.harness-legacy.json').symlink_to(external)
        self.run_projection(success=False)
        self.assertEqual(external.read_text(), '{"version": 1, "targets": {}}')

    def test_manifest_path_escape_rejected(self):
        victim = self.host.parent / 'unmanaged.txt'
        victim.write_text('keep')
        for path in ('../unmanaged.txt', str(victim), '.git/config'):
            (self.host / '.harness-legacy.json').write_text(json.dumps({'version': 1, 'source': str(ROOT), 'targets': {'codex': {'packages': ['grilling'], 'files': {path: 'unused'}}}}))
            self.run_projection(packages=('grilling',), success=False)
            self.assertEqual(victim.read_text(), 'keep')

    def test_symlink_ancestor_rejected_even_with_empty_output(self):
        external = self.host.parent / 'external'
        (external / 'skills').mkdir(parents=True)
        victim = external / 'skills/victim.md'
        victim.write_text('GENERATED by harness codex-sync\nkeep')
        (self.host / '.agents').symlink_to(external, target_is_directory=True)
        self.run_projection(packages=('rules-next',), success=False)
        self.assertTrue(victim.exists())

    def test_native_sources_have_resolvable_links_and_scoped_metadata(self):
        for package in (ROOT / 'packages').iterdir():
            self.assertTrue((package / 'apm.yml').is_file())
            self.assertFalse((package / 'tools').exists())
            self.assertFalse((package / 'templates').exists())
            for source in package.rglob('*.md'):
                text = source.read_text()
                if source.name.endswith('.instructions.md'):
                    self.assertEqual(source.parent.name, 'instructions')
                    self.assertRegex(text, r'(?m)^applyTo: ".+"$')
                    self.assertNotRegex(text, r'(?m)^paths:')
                if source.name.endswith('.agent.md'):
                    name = re.search(r'(?m)^name: (.+)$', text)[1]
                    self.assertEqual(source.name, name + '.agent.md')
                    self.assertNotRegex(text, r'(?m)^model:')
                    self.assertRegex(text, r'(?m)^x-model-tier: (top|mid|light)$')
                    self.assertIn('Package source resolution', text)
                for url in re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)', text):
                    path = url.split('#')[0]
                    if path and '://' not in path and not path.startswith('/'):
                        self.assertTrue((source.parent / path).exists(), f'{source}: {url}')


if __name__ == '__main__':
    unittest.main()
