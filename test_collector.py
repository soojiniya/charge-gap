"""Offline checks; these tests make no external API calls."""
import unittest
from unittest.mock import Mock, patch
import requests
from collector import Client, CollectionError, frame_from, clean_and_summarize


def response(code='00', count=1, items='<item><statId>001</statId><chgerId>01</chgerId></item>'):
    xml = f'<response><header><resultCode>{code}</resultCode><resultMsg>OK</resultMsg></header><body><pageNo>1</pageNo><numOfRows>10</numOfRows><totalCount>{count}</totalCount><items>{items}</items></body></response>'
    return Mock(status_code=200, content=xml.encode(), text=xml)


class CollectorTests(unittest.TestCase):
    def test_success_and_preserve_leading_zero(self):
        client = Client('fake-key')
        client.session.get = Mock(return_value=response())
        data = client.fetch(1, 10)
        self.assertEqual(data['items'][0]['chgerId'], '01')
        self.assertEqual(client.events[0]['http_status'], 200)
        self.assertEqual(client.events[0]['resultCode'], '00')

    def test_auth_error_is_not_retried(self):
        client = Client('fake-key')
        client.session.get = Mock(return_value=response(code='30'))
        with self.assertRaises(CollectionError):
            client.fetch(1, 10)
        self.assertEqual(client.session.get.call_count, 1)

    @patch('collector.time.sleep')
    def test_transient_timeout_retried_without_secret(self, _):
        client = Client('fake%2Bkey')
        client.session.get = Mock(side_effect=[requests.Timeout('secret URL fake+key'), response()])
        client.fetch(1, 10)
        self.assertEqual(len(client.events), 2)
        self.assertNotIn('secret URL', str(client.events))
        self.assertNotIn('fake', client.safe('fake%2Bkey fake+key'))

    def test_truncated_page_rejected(self):
        client = Client('fake-key')
        client.session.get = Mock(return_value=response(count=10))
        with self.assertRaises(CollectionError):
            client.fetch(1, 10)

    def test_quality_and_station_charger_counts(self):
        first = dict(statId='001', chgerId='01', zcode='11', lat='37.5', lng='127')
        rows = [first, first.copy(), dict(first, chgerId='02'),
                dict(statId='', chgerId='', zcode='99', lat='0', lng='0')]
        clean, summary, quality = clean_and_summarize(frame_from(rows))
        self.assertEqual(quality['duplicate_removed'], 1)
        self.assertEqual(quality['missing_identity_rows'], 1)
        self.assertEqual(quality['invalid_coordinates'], 1)
        self.assertEqual(quality['invalid_region_codes'], 1)
        self.assertEqual(summary.charger_count.sum(), 2)
        self.assertEqual(summary.station_count.sum(), 1)
        self.assertEqual(len(clean), 3)

    def test_effective_server_page_size(self):
        client = Client('fake-key')
        client.session.get = Mock(return_value=response())
        result = client.fetch(1, 9999, allow_effective_size=True)
        self.assertEqual(result['numOfRows'], 10)
        self.assertEqual(len(result['items']), 1)

    def test_missing_coordinates_are_issues(self):
        clean, _, metrics = clean_and_summarize(frame_from([
            dict(statId='s1', chgerId='01', lat='', lng='127', zcode='42'),
            dict(statId='s1', chgerId='02', lat='not-a-number', lng='127', zcode='51'),
        ]))
        self.assertEqual(metrics['invalid_coordinates'], 2)
        self.assertEqual(metrics['coordinate_issue_counts'], {'missing': 1, 'non_numeric': 1})
        self.assertFalse(clean.coordinate_valid.any())
        self.assertTrue(clean.region_valid.all())

    def test_last_page_reports_remainder_as_num_of_rows(self):
        item = '<item><statId>s1</statId><chgerId>01</chgerId></item>'
        resp = response(count=12, items=item * 2)
        resp.text = resp.text.replace('<pageNo>1</pageNo>', '<pageNo>2</pageNo>').replace('<numOfRows>10</numOfRows>', '<numOfRows>2</numOfRows>')
        resp.content = resp.text.encode()
        client = Client('fake-key')
        client.session.get = Mock(return_value=resp)
        result = client.fetch(2, 10)
        self.assertEqual(result['numOfRows'], 10)
        self.assertEqual(result['response_numOfRows'], 2)
        self.assertEqual(len(result['items']), 2)

    def test_current_integrated_region_and_deleted_flag(self):
        clean, summary, metrics = clean_and_summarize(frame_from([
            dict(statId='s1', chgerId='01', zcode='12', delYn='N'),
            dict(statId='s1', chgerId='02', zcode='12', delYn='Y'),
        ]))
        self.assertEqual(metrics['invalid_region_codes'], 0)
        self.assertEqual(summary.iloc[0].region_name, '전남광주통합특별시')
        self.assertEqual(summary.iloc[0].charger_count, 2)
        self.assertEqual(summary.iloc[0].deleted_flag_charger_count, 1)
        self.assertEqual(metrics['not_deleted_flag_charger_count'], 1)

    def test_official_type_11_is_known_without_changing_counts(self):
        rows = [dict(statId='s1', chgerId='01', chgerType='11', zcode='11', delYn='N'),
                dict(statId='s1', chgerId='02', chgerType='11', zcode='11', delYn='Y')]
        clean, summary, metrics = clean_and_summarize(frame_from(rows))
        self.assertTrue(clean.charger_type_known.all())
        self.assertEqual(metrics['unknown_nonmissing_chgerType'], 0)
        self.assertEqual(metrics['charger_count'], 2)
        self.assertEqual(metrics['station_count'], 1)
        self.assertEqual(metrics['deleted_flag_charger_count'], 1)
        self.assertEqual(summary.charger_count.sum(), 2)

    def test_collector_type_validation_matches_api_definitions(self):
        # Read the literal constant without importing Flask into the collector environment.
        import ast
        from pathlib import Path
        tree = ast.parse((Path(__file__).parent/'backend/chargegap_api/data.py').read_text(encoding='utf-8'))
        codes = next(ast.literal_eval(node.value) for node in tree.body
                     if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TYPE_DEFINITIONS' for t in node.targets))
        rows = [dict(statId='s1', chgerId=str(i), chgerType=code, zcode='11')
                for i, code in enumerate([*codes, '00', '12', ''])]
        clean, _, metrics = clean_and_summarize(frame_from(rows))
        self.assertTrue(clean.iloc[:len(codes)].charger_type_known.all())
        self.assertFalse(clean.iloc[len(codes):].charger_type_known.any())
        self.assertEqual(metrics['unknown_nonmissing_chgerType'], 2)

    def test_atomic_csv_write_preserves_existing_file(self):
        import tempfile
        from pathlib import Path
        from collector import csv_new
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            target = Path(temp) / 'test.csv'
            frame = frame_from([dict(statId='001', chgerId='01')])
            csv_new(frame, target)
            before = target.read_bytes()
            self.assertTrue(before.startswith(b'\xef\xbb\xbf'))
            with self.assertRaises(FileExistsError):
                csv_new(frame, target)
            self.assertEqual(before, target.read_bytes())


if __name__ == '__main__':
    unittest.main()
