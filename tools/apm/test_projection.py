#!/usr/bin/env python3
"""パッケージ境界、参照の向き、行数上限、モデルの対応表の回帰検証。"""
import json
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]


class Packages(unittest.TestCase):
    def test_model_mapping_tables_hold_three_tiers_and_no_agent_names(self):
        # ADR-0028 / ADR-0029: 対応表は tier の 3 段だけを持ち、agent 名を持たない。
        # APM は x-model-tier を変換しないので、オーケストレーターが起動時にこの表を引く（ADR-0062）。
        agents = {p.name.removesuffix('.agent.md') for p in (ROOT / 'packages').rglob('*.agent.md')}
        self.assertTrue(agents)
        for mapping in ('tools/apm/claude-models.json', 'tools/codex-sync/models.json'):
            text = (ROOT / mapping).read_text()
            config = json.loads(text)
            self.assertEqual(set(config['tiers']), {'top', 'mid', 'light'}, mapping)
            self.assertIn(config['default_tier'], config['tiers'], mapping)
            for name in agents:
                self.assertNotIn(name, text, f'{mapping}: agent 名 {name} を持っている')
        for tier, pin in json.loads((ROOT / 'tools/codex-sync/models.json').read_text())['tiers'].items():
            self.assertEqual(set(pin), {'model', 'reasoning_effort'}, tier)
            self.assertTrue(all(isinstance(v, str) and v for v in pin.values()), tier)
        for tier, family in json.loads((ROOT / 'tools/apm/claude-models.json').read_text())['tiers'].items():
            self.assertTrue(isinstance(family, str) and family, tier)

    def test_righthub_database_rules_reach_prisma_schemas(self):
        source = ROOT / 'packages/rules-righthub/.apm/instructions/backend-database.instructions.md'
        patterns = json.loads(re.search(r'(?m)^applyTo: (.+)$', source.read_text())[1]).split(',')
        script = """
import { matchesAny } from './tools/_shared/glob.mjs';
const patterns = JSON.parse(process.argv[1]);
const paths = ['prisma/schema.prisma', 'apps/api/prisma/schema.prisma'];
if (!paths.every(path => matchesAny(path, patterns))) process.exit(1);
"""
        result = subprocess.run(['node', '--input-type=module', '-e', script, json.dumps(patterns)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

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

    def test_native_sources_have_resolvable_links_and_scoped_metadata(self):
        for package in (ROOT / 'packages').iterdir():
            self.assertTrue((package / 'apm.yml').is_file())
            self.assertFalse((package / 'tools').exists())
            self.assertFalse((package / 'templates').exists())
            self.assertFalse((package / 'bin').exists())
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
                    # ADR-0047: agent 本文は相対リンクを持たない。Codex の TOML はリンクを書き換えないので、末端ファイルはオーケストレーターがパスで渡す
                    relative = [url for url in re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)', text) if '://' not in url and not url.startswith('/')]
                    self.assertEqual(relative, [], f'{source}: agent 本文の相対リンク {relative}')
                    # ADR-0048: agent は読む規約を名指ししない（届いた規約に従う）
                    self.assertNotRegex(text, r'\.instructions\.md|末端ファイル', f'{source}: agent 本文が規約を名指ししている')
                if source.name.endswith('.instructions.md') and 'rules-' in source.parts[1]:
                    # ADR-0048: rules は skill と agent を知らない
                    self.assertNotRegex(text, r'\bdevelop\b|完了条件|終端|spec-author|test-author|implementer|reviewer|attacker', f'{source}: 規約が skill または agent を参照している')
                for url in re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)', text):
                    path = url.split('#')[0]
                    if path and '://' not in path and not path.startswith('/'):
                        self.assertTrue((source.parent / path).exists(), f'{source}: {url}')

    def test_prompt_sources_stay_within_line_budget(self):
        # ADR-0044: プロンプト正本の行数上限。ラチェットなので縮む方向にだけ動かし、超えたら本文を削る側で解く。
        budgets = {
            'packages/develop-core/.apm/skills/develop/SKILL.md': 65,
            'packages/develop-core/.apm/skills/develop/references/*.md': 115,
            'packages/develop-core/.apm/skills/attack/SKILL.md': 35,
            'packages/develop-core/.apm/skills/docs-migrate/SKILL.md': 50,
            'packages/develop-core/.apm/agents/develop/*.agent.md': 47,
            'packages/develop-core/.apm/instructions/*.instructions.md': 125,
            'packages/rules-cloudflare-hono-react/.apm/instructions/*.instructions.md': 40,
            'packages/rules-righthub/.apm/instructions/*.instructions.md': 40,
            'packages/rules-next/.apm/instructions/*.instructions.md': 50,
            'packages/rules-expo/.apm/instructions/*.instructions.md': 60,
            'packages/rules-swiftui/.apm/instructions/*.instructions.md': 60,
            # crow は非公開フレームワークの事実を持つため大きい。それでも縮む方向にだけ動かす
            'packages/rules-crow/.apm/instructions/*.instructions.md': 270,
        }
        for pattern, limit in budgets.items():
            sources = list(ROOT.glob(pattern))
            self.assertTrue(sources, pattern)
            for source in sources:
                lines = len(source.read_text().splitlines())
                self.assertLessEqual(lines, limit, f'{source.relative_to(ROOT)}: {lines} 行 > 上限 {limit}')

    def test_frontmatter_plain_values_are_valid_yaml(self):
        # 引用符なしの値に ": " や " #" があると YAML として読めず、APM は frontmatter 全体を無視する。
        for source in (ROOT / 'packages').rglob('*.md'):
            frontmatter = re.match(r'---\n(.*?)\n---\n', source.read_text(), re.S)
            if not frontmatter:
                continue
            for line in frontmatter[1].splitlines():
                entry = re.match(r'([\w-]+): (.+)$', line)
                if entry and entry[2][0] not in '"\'>|[{':
                    self.assertNotRegex(entry[2], r': | #|:$', f'{source}: {entry[1]}')


if __name__ == '__main__':
    unittest.main()
