"""Unit tests import the deployed source with a mocked GenVM host.
These exercise state, guards and validator rejection; they do not emulate network consensus.
"""
import hashlib
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path


class TreeMap(dict):
    @classmethod
    def __class_getitem__(cls, item):
        return cls


class HostContract:
    def __new__(cls):
        obj = super().__new__(cls)
        obj.agreements = TreeMap()
        return obj


class Return:
    def __init__(self, data):
        self.calldata = data


class Runtime:
    sender = '0x' + '1' * 40
    message = types.SimpleNamespace(sender_address=sender)
    public = types.SimpleNamespace(write=lambda f: f, view=lambda f: f)
    Contract = HostContract
    snapshot = '<h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission. Avoid use in operations.</p>'
    web_status = 200
    proposals = []
    leader_override = None
    evaluations = 0
    audit_valid = True
    votes = []

    @classmethod
    def get(cls, url):
        return types.SimpleNamespace(status=cls.web_status, body=cls.snapshot.encode())

    @classmethod
    def prompt(cls, prompt, **kwargs):
        if prompt.startswith('Independently audit'):
            return {'valid': cls.audit_valid}
        cls.evaluations += 1
        return cls.proposals.pop(0) if len(cls.proposals) > 1 else cls.proposals[0]

    @classmethod
    def run(cls, leader, validator):
        result = leader() if cls.leader_override is None else cls.leader_override
        vote = validator(Return(result))
        cls.votes.append(vote)
        if not vote:
            raise Exception('CONSENSUS_REJECTED')
        return result


Runtime.nondet = types.SimpleNamespace(web=types.SimpleNamespace(get=Runtime.get), exec_prompt=Runtime.prompt)
Runtime.vm = types.SimpleNamespace(Return=Return, run_nondet_unsafe=Runtime.run)
Runtime.eq_principle = types.SimpleNamespace(strict_eq=lambda fn: fn())
sys.modules['genlayer'] = types.SimpleNamespace(gl=Runtime, TreeMap=TreeMap, u256=int)
spec = importlib.util.spec_from_file_location('veridict_source', Path(__file__).with_name('veridict_escrow.py'))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)

CRITERIA = [
    {'id': 'docs', 'text': 'Domain is intended for documentation examples.', 'weight_bps': 7000},
    {'id': 'ops', 'text': 'Domain is intended for production operations.', 'weight_bps': 3000},
]


def finding(criterion, status, quote=None):
    return {'id': criterion, 'status': status, 'quote': '' if status == 'UNKNOWN' else (quote or ('documentation examples without needing permission' if criterion == 'docs' else 'Avoid use in operations.')), 'reason': 'The evidence directly supports this criterion-specific classification.'}


def assessment(a='PASS', b='FAIL'):
    return {'findings': [finding('docs', a), finding('ops', b)]}


class ContractTests(unittest.TestCase):
    def setUp(self):
        Runtime.message.sender_address = Runtime.sender
        Runtime.web_status = 200
        Runtime.proposals = [assessment()]
        Runtime.leader_override = None
        Runtime.evaluations = 0
        Runtime.audit_valid = True
        Runtime.votes = []
        self.c = source.VeridictEscrow()

    def create(self, **changes):
        args = dict(agreement_id='vrd-test', beneficiary='0x' + '2' * 40,
                    natural_language_clause='Evaluate the two independently weighted delivery conditions.',
                    evidence_url='https://example.com/', equivalence_mode='independent', escrow_amount=45000,
                    criteria_json=json.dumps(CRITERIA))
        args.update(changes)
        return json.loads(self.c.create_agreement(**args))

    def adjudicate(self):
        return json.loads(self.c.adjudicate_claim('vrd-test', 'The documentation page has been delivered.'))

    def test_01_source_creation(self):
        record = self.create()
        self.assertEqual(record['status'], 'ACTIVE')
        self.assertEqual(self.c.agreement_count, 1)
        self.assertEqual(record['unit'], 'TEST')

    def test_02_duplicate_id_cannot_overwrite(self):
        original = self.create()
        with self.assertRaisesRegex(Exception, 'ALREADY_EXISTS'):
            self.create()
        self.assertEqual(json.loads(self.c.get_agreement('vrd-test')), original)

    def test_03_weight_sum(self):
        rows = [dict(CRITERIA[0], weight_bps=9999)]
        with self.assertRaisesRegex(Exception, 'WEIGHTS_MUST'):
            self.create(criteria_json=json.dumps(rows))

    def test_04_duplicate_criterion(self):
        rows = [dict(CRITERIA[0], weight_bps=5000)] * 2
        with self.assertRaisesRegex(Exception, 'DUPLICATE_CRITERION'):
            self.create(criteria_json=json.dumps(rows))

    def test_05_private_host_and_http_rejected(self):
        for url in ['http://example.com/', 'https://127.0.0.1/', 'https://service.local/', 'https://user@example.com/', 'https://host.internal/', 'https://[::1]/']:
            with self.subTest(url=url), self.assertRaises(Exception):
                self.create(evidence_url=url)

    def test_06_unauthorized_adjudication(self):
        self.create()
        Runtime.message.sender_address = '0x' + '3' * 40
        with self.assertRaisesRegex(Exception, 'PARTIES_ONLY'):
            self.adjudicate()
        self.assertEqual(Runtime.evaluations, 0)

    def test_07_beneficiary_can_adjudicate(self):
        self.create()
        Runtime.message.sender_address = '0x' + '2' * 40
        self.assertEqual(self.adjudicate()['verdict'], 'PARTIAL_SETTLEMENT')

    def test_08_partial_amount_derived_from_weights(self):
        self.create()
        record = self.adjudicate()
        self.assertEqual(record['payout_ratio_bps'], 7000)
        self.assertEqual(record['nominal_payout'], 31500)
        self.assertEqual(record['evidence_sha256'], hashlib.sha256(Runtime.snapshot.encode()).hexdigest())
        self.assertEqual(Runtime.evaluations, 2)
        self.assertEqual(Runtime.votes, [True])

    def test_09_unknown_blocks_all_payout(self):
        self.create()
        Runtime.proposals = [assessment('PASS', 'UNKNOWN')]
        record = self.adjudicate()
        self.assertEqual(record['status'], 'REVIEW_REQUIRED')
        self.assertEqual(record['nominal_payout'], 0)

    def test_10_fabricated_quote_rejected(self):
        self.create()
        data = assessment()
        data['findings'][0]['quote'] = 'This text does not exist in the actual source.'
        Runtime.leader_override = data
        with self.assertRaisesRegex(Exception, 'CONSENSUS_REJECTED'):
            self.adjudicate()
        self.assertEqual(json.loads(self.c.get_agreement('vrd-test'))['status'], 'ACTIVE')

    def test_11_validator_disagreement_rejected(self):
        self.create()
        Runtime.proposals = [assessment(), assessment('FAIL', 'FAIL')]
        with self.assertRaisesRegex(Exception, 'CONSENSUS_REJECTED'):
            self.adjudicate()
        self.assertEqual(Runtime.evaluations, 2)

    def test_12_empty_proposal_not_default_success(self):
        self.create()
        Runtime.leader_override = {}
        with self.assertRaisesRegex(Exception, 'CONSENSUS_REJECTED'):
            self.adjudicate()

    def test_13_audited_mode_checks_reasoning(self):
        self.create(equivalence_mode='audited')
        Runtime.audit_valid = False
        with self.assertRaisesRegex(Exception, 'CONSENSUS_REJECTED'):
            self.adjudicate()

    def test_14_replay_requires_review(self):
        self.create()
        self.adjudicate()
        with self.assertRaisesRegex(Exception, 'REQUEST_REVIEW'):
            self.adjudicate()

    def test_15_review_preserves_history_and_limit(self):
        self.create()
        before = self.adjudicate()
        record = json.loads(self.c.request_review('vrd-test', 'Please independently reassess this evidence and criterion.'))
        self.assertEqual(record['status'], 'REVIEW_REQUESTED')
        self.assertEqual(record['history'], before['history'])
        after = self.adjudicate()
        self.assertEqual(after['revision'], 2)
        self.assertEqual(len(after['history']), 2)
        with self.assertRaisesRegex(Exception, 'REVIEW_LIMIT'):
            self.c.request_review('vrd-test', 'Another review requested for the same evidence.')

    def test_16_unauthorized_review(self):
        self.create()
        self.adjudicate()
        Runtime.message.sender_address = '0x' + '3' * 40
        with self.assertRaisesRegex(Exception, 'PARTIES_ONLY'):
            self.c.request_review('vrd-test', 'Please review the decision with independent evidence.')

    def test_17_web_error_does_not_settle(self):
        self.create()
        Runtime.web_status = 404
        with self.assertRaisesRegex(Exception, 'EVIDENCE_HTTP'):
            self.adjudicate()
        self.assertEqual(json.loads(self.c.get_agreement('vrd-test'))['status'], 'ACTIVE')

    def test_18_full_and_breach_derive_exactly(self):
        for a, b, verdict, ratio in [('PASS', 'PASS', 'FULFILLED', 10000), ('FAIL', 'FAIL', 'BREACH_CONFIRMED', 0)]:
            result = source.decision(assessment(a, b), CRITERIA)
            self.assertEqual((result['verdict'], result['payout_ratio_bps']), (verdict, ratio))

    def test_19_review_before_decision_rejected(self):
        self.create()
        with self.assertRaisesRegex(Exception, 'NO_DECISION'):
            self.c.request_review('vrd-test', 'Requesting review before any assessment is created.')

    def test_20_unknown_id_read_is_empty(self):
        self.assertEqual(self.c.get_agreement('not-found'), '{}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
