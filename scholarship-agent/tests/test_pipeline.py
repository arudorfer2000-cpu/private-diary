import json, os, shutil, tempfile, unittest
from scanner import ai, digest, mailer, pipeline, discover
from scanner.db import Db
from scanner.fetch import Fetcher, FetchError
from . import fixtures as fx

TODAY = "2026-10-23"

class FakeSMTP:
    sent, fail = [], False
    def __init__(self, host, port, timeout=30): self.host, self.port = host, port
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def starttls(self): pass
    def login(self, u, p):
        if FakeSMTP.fail: raise RuntimeError("auth failed for password " + p)
        self.pw = p
    def send_message(self, m): FakeSMTP.sent.append(m)

def cfg(email=True):
    return {"profile": dict(fx.PROFILE), "database": "t.db", "output_dir": "out", "delay_s": 0.05,
            "email": {"enabled": email, "user": "me@outlook.com", "to": "me@outlook.com", "password_env": "PW"}}

class Base(unittest.TestCase):
    def setUp(self):
        self.srv = fx.Server().__enter__(); self.dir = tempfile.mkdtemp(); FakeSMTP.sent, FakeSMTP.fail = [], False
        self.env = {"PW": "SECRET_PW_123"}
    def tearDown(self): self.srv.__exit__(); shutil.rmtree(self.dir)
    def src(self, path, name="Test University – Funding", country="GB"):
        return {"name": name, "url": self.srv.base + path, "country": country, "level": "both", "kind": "university"}
    def run_(self, sources, today=TODAY, email=True, **kw):
        f = Fetcher(delay_s=0.05, use_browser=False)
        return pipeline.run(self.dir, cfg(email), sources, fetcher=f, today=today, env=self.env, smtp_factory=FakeSMTP, **kw)

class Fetching(Base):
    def test_TC_F1_text_only(self):
        self.srv.set("/a", fx.F1); p = Fetcher(0, False).fetch(self.srv.base + "/a")
        self.assertIn("18 January 2027", p.text); self.assertNotIn("Home | About", p.text); self.assertNotIn("document.title", p.text)
    def test_TC_F2_politeness_and_agent(self):
        for i in range(3): self.srv.set(f"/p{i}", fx.F1)
        f = Fetcher(0.3, False)
        for i in range(3): f.fetch(self.srv.base + f"/p{i}")
        times = [t for _, t in self.srv.hits]
        self.assertTrue(all(b - a >= 0.28 for a, b in zip(times, times[1:])), times)
    def test_TC_F3_robots(self):
        self.srv.set("/robots.txt", b"User-agent: *\nDisallow: /private", "text/plain"); self.srv.set("/private/x", fx.F1)
        with self.assertRaises(FetchError) as c: Fetcher(0, False).fetch(self.srv.base + "/private/x")
        self.assertEqual(c.exception.kind, "robots")
        self.assertFalse([h for h in self.srv.hits if h[0] == "/private/x"])
    def test_TC_F4_failures_do_not_stop_run(self):
        self.srv.set("/ok", fx.F1)
        r = self.run_([self.src("/missing", "Gone"), self.src("/ok", "Good"), {"name": "Dead", "url": "http://127.0.0.1:9/x", "country": "GB"}])
        self.assertEqual(len(r["failed"]), 2); self.assertEqual(len(r["new"]), 1)
        self.assertIn("Could not be checked", r["digest"].read_text())
    def test_TC_F7_robustness(self):
        self.srv.set("/latin", fx.F9_LATIN1, "text/html; charset=latin-1"); self.srv.set("/bad", fx.F9_MALFORMED)
        self.srv.set("/empty", b""); self.srv.set("/big", fx.F9_BIG)
        f = Fetcher(0, False)
        self.assertIn("frais d'inscription", f.fetch(self.srv.base + "/latin").text)
        self.assertIn("5 March 2027", f.fetch(self.srv.base + "/bad").text)
        self.assertEqual(f.fetch(self.srv.base + "/empty").text, "")
        with self.assertRaises(FetchError) as c: f.fetch(self.srv.base + "/big")
        self.assertEqual(c.exception.kind, "too_large")
    def test_TC_F9_missing_playwright_message(self):
        self.srv.set("/js", fx.F11)
        with self.assertRaises(FetchError) as c: Fetcher(0, True).fetch(self.srv.base + "/js")
        self.assertEqual(c.exception.kind, "needs_browser"); self.assertIn("playwright", str(c.exception))
    def test_TC_F9_other_sources_still_processed(self):
        self.srv.set("/js", fx.F11); self.srv.set("/ok", fx.F1)
        f = Fetcher(0.0, True)
        r = pipeline.run(self.dir, cfg(False), [self.src("/js", "JS"), self.src("/ok", "Good")], fetcher=f, today=TODAY, env=self.env, send=False)
        self.assertEqual(len(r["new"]), 1); self.assertIn("playwright", r["failed"][0][2])
    def test_TC_F6_possibly_moved(self):
        for i in range(3): r = self.run_([self.src("/gone")], email=False)
        self.assertIn("possibly moved", r["failed"][0][2])

class Changes(Base):
    def test_TC_C1_C2_C3_C4_history(self):
        self.srv.set("/a", fx.F1); s = [self.src("/a")]
        self.assertEqual(len(self.run_(s)["new"]), 1)
        r = self.run_(s); self.assertEqual((len(r["new"]), len(r["changed"])), (0, 0))      # C1 unchanged
        self.srv.set("/a", fx.F3); r = self.run_(s); self.assertEqual(len(r["changed"]), 0)  # C3 noise ignored
        self.srv.set("/a", fx.F2); r = self.run_(s); self.assertEqual(len(r["changed"]), 1)  # C2
        txt = r["digest"].read_text(); self.assertIn("deadline 2027-01-18 → 2027-01-25", txt)   # C3
        db = Db(os.path.join(self.dir, "t.db"), backup=False); h = db.history(db.all()[0]["id"])
        self.assertEqual((h[0]["old"], h[0]["new"]), ("2027-01-18", "2027-01-25")); db.close()
    def test_TC_C5_all_fail_keeps_state(self):
        self.srv.set("/a", fx.F1); s = [self.src("/a")]; self.run_(s)
        db = Db(os.path.join(self.dir, "t.db"), backup=False); before = (db.sources()[0]["hash"], len(db.all())); db.close()
        fx.Handler.routes.pop("/a")                      # page now returns 404 for every source
        r = self.run_(s, email=False); self.assertEqual(len(r["failed"]), 1)
        db = Db(os.path.join(self.dir, "t.db"), backup=False); self.assertEqual((db.sources()[0]["hash"], len(db.all())), before); db.close()

class Marks(Base):
    def test_TC_D4_dismissed_and_applied_stay_quiet(self):
        self.srv.set("/a", fx.F1); s = [self.src("/a")]; self.run_(s)
        db = Db(os.path.join(self.dir, "t.db"), backup=False); oid = db.all()[0]["id"]; db.mark(oid, "dismissed"); db.close()
        self.srv.set("/a", fx.F2); r = self.run_(s); self.assertEqual((len(r["new"]), len(r["changed"])), (0, 0))
        db = Db(os.path.join(self.dir, "t.db"), backup=False); self.assertEqual(db.get(oid)["deadline"], "2027-01-25"); db.close()  # still updated
        self.assertEqual(len(FakeSMTP.sent), 1)                                                                                 # no email for the quiet change

class Digest(Base):
    def test_TC_D1_D2_D3_D7(self):
        for p, dl in (("/a", "10 November 2026"), ("/b", "5 February 2027"), ("/c", "20 January 2027")):
            self.srv.set(p, fx.page("Award " + p[1], fx.PAD + f"<p>Scholarship for art history Master's, international students, 2027 entry. Deadline: {dl}. Value £1,000.</p>"))
        s = [self.src(p, f"Uni{p[1]} – Funding") for p in ("/a", "/b", "/c")]
        r = self.run_(s); txt = r["digest"].read_text()
        order = [txt.index(f"Award {x}") for x in "acb"]; self.assertEqual(order, sorted(order))   # D2 by nearest deadline
        self.assertIn("URGENT", txt); self.assertIn("3 new · 0 changed · 0 could not be checked", txt)  # D3
        self.assertEqual(len(r["urgent"]), 1)
        r2 = self.run_(s); self.assertNotEqual(r["digest"], r2["digest"]); self.assertTrue(r["digest"].exists())  # D7 keeps both
    def test_TC_D5_closed_after_deadline(self):
        self.srv.set("/a", fx.F1); s = [self.src("/a")]; self.run_(s)
        self.run_(s, today="2027-02-01")
        db = Db(os.path.join(self.dir, "t.db"), today="2027-02-01", backup=False)
        self.assertEqual(db.all()[0]["status"], "closed"); db.close()
    def test_TC_D8_checked_date_shown(self):
        self.srv.set("/a", fx.F1); self.assertIn("checked 2026-10-23", self.run_([self.src("/a")])["digest"].read_text())

class Sources(Base):
    def test_TC_S1_new_source_no_code_change(self):
        self.srv.set("/a", fx.F1); self.srv.set("/b", fx.F4)
        self.assertEqual(len(self.run_([self.src("/a")])["new"]), 1)
        self.assertEqual(len(self.run_([self.src("/a"), self.src("/b", "Other Uni – Funding")])["new"]), 1)
    def test_TC_S3_disabled_not_fetched(self):
        self.srv.set("/a", fx.F1); self.run_([self.src("/a")])
        db = Db(os.path.join(self.dir, "t.db"), backup=False); db.update_source(self.srv.base + "/a", enabled=0); db.close()
        n = len(self.srv.hits); self.run_([self.src("/a")]); self.assertEqual(len(self.srv.hits), n)
    def _site(self):
        self.srv.set("/funding", fx.F12)
        for p, f in (("/funding/art-history", fx.F_ART), ("/funding/economics", fx.F_ECON), ("/funding/management", fx.F_MGMT),
                     ("/funding/sports", fx.F_SPORT), ("/funding/athletics", fx.F_SPORT), ("/funding/music", fx.F_SPORT),
                     ("/login/funding", fx.F1)):
            self.srv.set(p, f)
        self.srv.set("/forms/funding-form.pdf", b"%PDF", "application/pdf")
    def test_TC_S5_S7_S8_discovery(self):
        self._site(); r = self.run_([self.src("/funding")], email=False)
        added = {u.replace(self.srv.base, "") for u in r["added_sources"]}
        self.assertEqual(added, {"/funding/art-history", "/funding/economics", "/funding/management"})
        db = Db(os.path.join(self.dir, "t.db"), backup=False)
        rej = {x["url"].replace(self.srv.base, ""): x["reason"] for x in db.rejected()}
        self.assertIn("/login/funding", rej); self.assertTrue(any("other.example" in u for u in rej)); self.assertIn("/forms/funding-form.pdf", rej)
        self.assertIn("/funding/sports", rej)                                                    # S7 irrelevant -> rejected log
        s = db.source(self.srv.base + "/funding/art-history"); self.assertEqual(s["auto_added"], 1)
        self.assertIn("funding", s["reason"]); self.assertEqual(s["discovered_from"], self.srv.base + "/funding"); db.close()
    def test_TC_S6_cap_of_five(self):
        links = "".join(f'<a href="/f/{i}">Scholarship {i}</a>' for i in range(12))
        self.srv.set("/hub", fx.page("Hub", fx.PAD + links))
        for i in range(12): self.srv.set(f"/f/{i}", fx.sub(f"Award {i}", "art history"))
        r = self.run_([self.src("/hub")], email=False); self.assertEqual(len(r["added_sources"]), 5)
        db = Db(os.path.join(self.dir, "t.db"), backup=False); self.assertEqual(len(db.rejected()), 0); db.close()
        r2 = self.run_([self.src("/hub")], email=False); self.assertEqual(len(r2["added_sources"]), 5)   # the rest wait for later runs
    def test_TC_S9_removed_not_readded(self):
        self._site(); self.run_([self.src("/funding")], email=False)
        u = self.srv.base + "/funding/economics"
        db = Db(os.path.join(self.dir, "t.db"), backup=False); db.remove_source(u); db.close()
        r = self.run_([self.src("/funding")], email=False)
        self.assertNotIn(u, r["added_sources"])
        db = Db(os.path.join(self.dir, "t.db"), backup=False); self.assertNotIn(u, [s["url"] for s in db.sources()]); db.close()
    def test_TC_S10_auto_source_not_urgent_on_first_check(self):
        soon = fx.page("Soon Award", fx.PAD + "<p>Scholarship for art history Master's, international students, 2027 entry. Deadline: 1 November 2026. Value £1,000.</p>")
        self.srv.set("/hub", fx.page("Hub", fx.PAD + '<a href="/f/soon">Scholarship soon</a>')); self.srv.set("/f/soon", soon)
        self.run_([self.src("/hub")], email=False)
        r = self.run_([self.src("/hub")])
        self.assertEqual(len(r["new"]), 1); self.assertFalse(r["subject_urgent"])
        self.assertNotIn("URGENT", FakeSMTP.sent[-1]["Subject"])
    def test_TC_S11_disabled_country_not_scanned_or_discovered(self):
        self._site(); c = cfg(False); c["profile"]["countries"] = ["DE"]
        f = Fetcher(0.0, False); n0 = len(self.srv.hits)
        r = pipeline.run(self.dir, c, [self.src("/funding", country="GB")], fetcher=f, today=TODAY, env=self.env, send=False)
        self.assertEqual(len(self.srv.hits), n0); self.assertEqual(r["added_sources"], [])

class Mail(Base):
    def test_TC_M1_M2_M3_M5_M6(self):
        self.srv.set("/a", fx.page("Soon", fx.PAD + "<p>Scholarship art history, international students, 2027 entry. Deadline: 1 November 2026.</p>"))
        r = self.run_([self.src("/a")])
        self.assertEqual(len(FakeSMTP.sent), 1); m = FakeSMTP.sent[0]
        self.assertTrue(m["Subject"].startswith("URGENT"))                                      # M3
        self.assertIn("Scholarship digest", m.get_content()); self.assertNotIn("SECRET_PW_123", m.as_string())  # M1, M6
        self.run_([self.src("/a")]); self.assertEqual(len(FakeSMTP.sent), 1)                     # M2 nothing new -> no email
    def test_TC_M4_wrong_password(self):
        FakeSMTP.fail = True; self.srv.set("/a", fx.F1); r = self.run_([self.src("/a")])
        self.assertTrue(r["digest"].exists()); self.assertTrue(r["email"].startswith("email failed")); self.assertNotIn("SECRET_PW_123", r["email"])
    def test_email_off_or_missing_password(self):
        ok, msg = mailer.send({"enabled": True, "user": "a", "to": "b", "password_env": "PW"}, "s", "b", env={}); self.assertFalse(ok)
        ok, msg = mailer.send({"enabled": False}, "s", "b", env={}); self.assertFalse(ok)
    def test_TC_M5_viewer_link_in_digest(self):
        t, _ = digest.build(TODAY, [], [], [], 0, viewer_url="https://claude.ai/artifact/xyz"); self.assertIn("https://claude.ai/artifact/xyz", t)

class AI(Base):
    class R:
        def __init__(s, b): s.b = b
        def __enter__(s): return s
        def __exit__(s, *a): pass
        def read(s): return s.b
    def test_TC_A1_no_key(self):
        self.assertIsNone(ai.summarise({"name": "n", "university": "u"}, "text", fx.PROFILE, env={}))
    def test_TC_A2_A5_request_content_and_marker(self):
        seen = {}
        def opener(req, timeout=0):
            seen["body"] = json.loads(req.data); seen["key"] = req.get_header("X-api-key")
            return AI.R(json.dumps({"content": [{"text": "- unclear"}]}).encode())
        out = ai.summarise({"name": "Prize", "university": "Uni"}, "PAGE TEXT", fx.PROFILE, env={"ANTHROPIC_API_KEY": "k"}, opener=opener)
        self.assertEqual(out, "- unclear"); prompt = seen["body"]["messages"][0]["content"]
        self.assertIn("PAGE TEXT", prompt); self.assertIn("unclear", prompt); self.assertNotIn("me@outlook.com", prompt)
        item = "\n".join(digest._item({**dict(id="x", name="n", university="u", countries=["GB"], level="both", stipend_type="not stated", value=None,
                      currency=None, deadline=None, deadline_text=None, language="x", entry_year=None, eligibility="unclear", eligibility_reason="r",
                      contact=None, source_urls=["u"], last_checked=TODAY, quote="")}, TODAY, {"x": out}))
        self.assertIn("AI-generated summary", item)
    def test_TC_A4_failure_fallback(self):
        def bad(req, timeout=0): raise OSError("net")
        out = ai.summarise({"name": "n", "university": "u"}, "t", fx.PROFILE, env={"ANTHROPIC_API_KEY": "k"}, opener=bad)
        self.assertIn("AI summary failed", out); self.assertNotIn("k\n", out)
    def test_TC_A6_key_not_stored(self):
        self.env["ANTHROPIC_API_KEY"] = "sk-ant-KEYKEYKEY"; self.srv.set("/a", fx.F1)
        reply = lambda req, timeout=0: AI.R(json.dumps({"content": [{"text": "- value 32,000 GBP"}]}).encode())
        r = self.run_([self.src("/a")], email=False, ai_opener=reply)
        self.assertIn("AI-generated summary", r["digest"].read_text())
        blob = r["digest"].read_text()
        for name, mode in (("t.db", "rb"), (os.path.join("out", "viewer.html"), "rb")):
            with open(os.path.join(self.dir, name), mode) as f: blob += f.read().decode("latin-1")
        self.assertNotIn("sk-ant-KEYKEYKEY", blob)

if __name__ == "__main__": unittest.main()
