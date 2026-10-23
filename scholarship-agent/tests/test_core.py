import os, shutil, tempfile, unittest
from datetime import date
from scanner import regions, extract, eligibility, db as dbm
from scanner.fetch import parse_html, Page
from . import fixtures as fx

TODAY = "2026-10-23"
SRC = {"name": "Test University – Funding", "country": "GB", "level": "both", "university": "Test University"}

def ex(html, src=SRC, profile=fx.PROFILE, url="http://t/x"):
    return extract.extract(parse_html(html.decode("utf-8", "replace") if isinstance(html, bytes) else html, url), src, profile, TODAY)

class Regions(unittest.TestCase):
    def test_TC_B10_group_derived(self):
        self.assertEqual(regions.region_group(["GB"]), "UK")
        for c in ("IE", "AT", "ES", "SE"): self.assertEqual(regions.region_group([c]), "EU")
        self.assertEqual(regions.region_group(["GB", "AT"]), "both")
    def test_filter_semantics(self):
        self.assertTrue(regions.matches_filter(["GB", "AT"], "UK")); self.assertTrue(regions.matches_filter(["GB", "AT"], "EU"))
        self.assertFalse(regions.matches_filter(["GB"], "EU")); self.assertFalse(regions.matches_filter(["ES"], "UK"))

class Extraction(unittest.TestCase):
    def test_TC_E1_E3_F1(self):
        o = ex(fx.F1)
        self.assertEqual(o["deadline"], "2027-01-18"); self.assertEqual((o["value"], o["currency"]), (32000.0, "GBP"))
        self.assertEqual(o["eligibility"], "eligible"); self.assertEqual(o["stipend_type"], "full funding")
        self.assertEqual(o["entry_year"], 2027); self.assertIn("art history", o["topics"]); self.assertEqual(o["language"], "English")
        self.assertEqual(o["contact"], "scholarships@test.ac.uk"); self.assertEqual(o["level"], "masters")
    def test_TC_E2_nothing_invented(self):
        o = ex(fx.F6)
        self.assertIsNone(o["deadline"]); self.assertIsNone(o["value"]); self.assertEqual(o["stipend_type"], "not stated")
        self.assertEqual(o["eligibility"], "unclear"); self.assertIsNone(o["contact"]); self.assertIsNone(o["entry_year"])
    def test_TC_E4_home_only(self):
        o = ex(fx.F4); self.assertEqual(o["eligibility"], "not eligible"); self.assertIn("UK Home", o["eligibility_reason"])
    def test_TC_E5_other_year(self):
        self.assertEqual(ex(fx.F5)["eligibility"], "other year")
    def test_TC_E6_quote_is_verbatim(self):
        for f in (fx.F1, fx.F4, fx.F_NONEU, fx.F14):
            o = ex(f); text = parse_html(f.decode(), "u").text
            self.assertTrue(o["quote"] and o["quote"] in text, o["quote"])
    def test_TC_E7_month_only_is_approximate(self):
        o = ex(fx.F7); self.assertIsNone(o["deadline"]); self.assertEqual(o["deadline_text"], "January"); self.assertEqual(o["deadline_approx"], 1)
    def test_TC_E8_profile_change(self):
        uk = dict(fx.PROFILE, citizenships=["United Kingdom"])
        self.assertEqual(ex(fx.F4)["eligibility"], "not eligible")
        self.assertEqual(ex(fx.F4, profile=uk)["eligibility"], "eligible")
    def test_TC_E10_EU_vs_nonEU(self):
        self.assertEqual(ex(fx.F_NONEU, src=dict(SRC, country="AT"))["eligibility"], "not eligible")
        self.assertEqual(ex(fx.F_NONEU)["eligibility_reason"], "non-EU applicants only")
        self.assertEqual(ex(fx.F14, src=dict(SRC, country="NL"))["eligibility"], "eligible")
    def test_refugee_only_not_eligible(self):
        o = ex(fx.F_REFUGEE); self.assertEqual(o["eligibility"], "not eligible")
    def test_TC_E11_local_language(self):
        self.assertEqual(ex(fx.F14, src=dict(SRC, country="NL"))["language"], "local language")
    def test_TC_B2_personal_contact_not_taken(self):
        self.assertIsNone(ex(fx.F_PERSONAL)["contact"])
    def test_no_funding_page_returns_none(self):
        self.assertIsNone(ex(b"<html><body><h1>Campus map</h1><p>Where to find the library and cafe.</p></body></html>"))
    def test_TC_B3_numbers(self):
        o = ex(fx.F1); self.assertIsInstance(o["value"], float)
    def test_stipend_vocabulary(self):
        for f in (fx.F1, fx.F4, fx.F6, fx.F14):
            self.assertIn(ex(f)["stipend_type"], dbm.STIPEND_TYPES)
    def test_TC_E9_every_fact_marked(self):
        # nothing is filled without a source: unknown -> None / 'not stated' / 'unclear'
        o = ex(fx.F6)
        for k in ("deadline", "value", "contact"): self.assertIsNone(o[k])

class Database(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(); self.db = dbm.Db(os.path.join(self.d, "t.db"), today=TODAY)
    def tearDown(self): self.db.close(); shutil.rmtree(self.d)
    def test_TC_B1_B5_B6_B7_B8(self):
        o = ex(fx.F1); self.assertEqual(self.db.upsert(o), "new")
        self.assertEqual(self.db.upsert(o), "same")
        o2 = ex(fx.F2, url="http://t/other"); o2["source_urls"] = ["http://t/other"]
        self.assertEqual(self.db.upsert(o2), "changed")
        row = self.db.get(o["id"])
        self.assertEqual(len(row["source_urls"]), 2)                                    # B5: same scholarship, two URLs, one row
        self.assertEqual(len(self.db.all()), 1)
        h = self.db.history(o["id"]); self.assertEqual((h[0]["field"], h[0]["old"], h[0]["new"]), ("deadline", "2027-01-18", "2027-01-25"))
        self.db.mark(o["id"], "applied", "sent"); self.db.upsert(ex(fx.F1))
        self.assertEqual(self.db.get(o["id"])["user_mark"], "applied")                    # B7: mark survives rescans
        with self.assertRaises(ValueError): self.db.mark(o["id"], "bogus")
        self.assertEqual(self.db.get(o["id"])["status"], "open")
        self.db.today = "2027-02-01"; self.db.refresh_status()
        self.assertEqual(self.db.get(o["id"])["status"], "closed")                        # B8: closed, not deleted
    def test_TC_B10_region_group_not_writable(self):
        self.db.upsert(ex(fx.F1)); r = self.db.all()[0]
        self.assertEqual(r["region_group"], "UK")
        cols = [c[1] for c in self.db.c.execute("PRAGMA table_info(opportunities)")]
        self.assertNotIn("region_group", cols)
    def test_TC_B11_both(self):
        o = ex(fx.F1); o["countries"] = ["GB", "AT"]; self.db.upsert(o)
        self.assertEqual(self.db.all()[0]["region_group"], "both")
    def test_TC_B8_schema_backup_and_reopen(self):
        self.db.upsert(ex(fx.F1)); self.db.close()
        d2 = dbm.Db(os.path.join(self.d, "t.db"), today=TODAY)
        self.assertEqual(d2.version(), dbm.SCHEMA_VERSION); self.assertEqual(len(d2.all()), 1)
        self.assertTrue(os.path.exists(os.path.join(self.d, "t.db.bak"))); d2.close(); self.db = dbm.Db(os.path.join(self.d, "t.db"), today=TODAY)
    def test_TC_B9_no_secrets_stored(self):
        self.db.upsert(ex(fx.F1)); self.db.close()
        with open(os.path.join(self.d, "t.db"), "rb") as f: raw = f.read()
        self.assertNotIn(b"SECRET_PW", raw); self.db = dbm.Db(os.path.join(self.d, "t.db"), today=TODAY)

if __name__ == "__main__": unittest.main()
