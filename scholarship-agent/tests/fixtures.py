"""Fixtures F1-F14 (test-specification.md) and a local fake web server."""
import http.server, threading, time

def page(title, body, extra_head="", footer="© 2026 Test University"):
    return f"""<html><head><title>{title} | Test University</title>{extra_head}</head><body>
<nav>Home | About | Study</nav><h1>{title}</h1>{body}<footer>{footer}</footer></body></html>""".encode()

PAD = "<p>This page describes funding for postgraduate study at Test University and how to apply for it.</p>"

F1 = page("Test Art History Scholarship", PAD + """
<p>The Test Art History Scholarship supports a Master's student in History of Art for 2027 entry.</p>
<p>Value: £32,000 covering tuition fees and a stipend.</p>
<p>The scholarship is open to international students including EU applicants.</p>
<p>Deadline: 18 January 2027</p>
<p>Taught in English. Contact <a href="mailto:scholarships@test.ac.uk">scholarships@test.ac.uk</a></p>""")
F2 = F1.replace(b"18 January 2027", b"25 January 2027")
F3 = F1.replace(b"\xc2\xa9 2026", b"\xc2\xa9 2027").replace(b"<nav>", b"<p>We use cookies. Accept all cookies.</p><nav>")
F4 = page("Home Fee Bursary", PAD + """<p>The Home Fee Bursary of £4,000 is for UK Home students only. 2027 entry. Deadline: 1 March 2027.</p>""")
F5 = page("Old Scholarship", PAD + """<p>Scholarship worth £5,000 for September 2026 entry. International students may apply. Deadline: 1 May 2026.</p>""")
F6 = page("General Scholarship Information", PAD + "<p>The university offers several scholarships. Please read the rules carefully before you apply for a scholarship.</p>")
F7 = page("Arts Management Award", PAD + "<p>Award for Arts Management MA, 2027 entry, open to international students. Applications are closing in January.</p>")
F8 = page("Funding with PDF", PAD + '<p>Scholarship guidance is in <a href="/guide.pdf">the PDF</a>.</p>')
F11 = b"<html><head><title>App</title></head><body><div id='root'></div><script>document.title='x'</script></body></html>"
F12 = page("Fees and Funding", PAD + """
<a href="/funding/art-history">Art history scholarships</a>
<a href="/funding/economics">Economics studentships</a>
<a href="/funding/management">Arts management bursaries</a>
<a href="/funding/sports">Sports scholarships</a>
<a href="/funding/athletics">Athletics funding</a>
<a href="/funding/music">Music funding</a>
<a href="/login/funding">Scholarship portal login</a>
<a href="http://other.example.org/scholarships">Scholarships at another site</a>
<a href="/forms/funding-form.pdf">Funding form</a>""")
def sub(title, field):
    return page(title, PAD + f"<p>Scholarship for {field} Master's students, open to international students, 2027 entry. Deadline: 1 February 2027. Value £10,000.</p>")
F_ART, F_ECON, F_MGMT = sub("Art History Award", "art history"), sub("Economics Studentship", "economics"), sub("Arts Management Bursary", "arts management")
F_SPORT = page("Sports Scholarships", PAD + "<p>Sports scholarship for athletes only; no academic field matches here.</p>" + "<p>Training bursary for rowers and runners.</p>")
F14 = page("Dutch Programme Funding", PAD + "<p>Scholarship for the Dutch-taught Master's in Kunstgeschiedenis, taught in Dutch. 2027 entry. Open to EU students. Deadline: 1 April 2027.</p>")
F_PERSONAL = page("Personal Contact Award", PAD + '<p>Scholarship for international students, 2027 entry, Deadline: 1 April 2027. Contact <a href="mailto:jane.smith@test.ac.uk">Jane</a></p>')
F_NONEU = page("Non-EU Award", PAD + "<p>Scholarship for non-EU applicants only. 2027 entry. Deadline: 1 April 2027.</p>")
F_REFUGEE = page("New Voices Scholarship", PAD + "<p>Scholarship of £15,500 for refugees and forcibly displaced people. 2027 entry. Deadline: 12 January 2027.</p>")
F9_LATIN1 = "<html><head><title>Bourse d'études</title></head><body><h1>Bourse d'études</h1><p>Scholarship for international students, 2027 entry. Deadline: 5 March 2027. Pr\xe9sentation du dossier et frais d'inscription couverts par la bourse pour les \xe9tudiants.</p></body></html>".encode("latin-1")
F9_MALFORMED = b"<html><body><h1>Scholarship <p>unclosed <div><b>scholarship for international students 2027 entry Deadline: 5 March 2027 </body>"
F9_BIG = b"<html><body>" + b"x" * (6 * 1024 * 1024) + b"</body></html>"

class Handler(http.server.BaseHTTPRequestHandler):
    routes = {}; hits = []
    def do_GET(self):
        Handler.hits.append((self.path, time.monotonic()))
        item = Handler.routes.get(self.path)
        if item is None: self.send_response(404); self.end_headers(); return
        body, ctype = item if isinstance(item, tuple) else (item, "text/html; charset=utf-8")
        self.send_response(200); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

class Server:
    def __enter__(self):
        Handler.routes, Handler.hits = {}, []
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start(); return self
    def __exit__(self, *a): self.httpd.shutdown(); self.httpd.server_close()
    @property
    def base(self): return f"http://127.0.0.1:{self.port}"
    def set(self, path, body, ctype="text/html; charset=utf-8"): Handler.routes[path] = (body, ctype)
    hits = property(lambda self: Handler.hits)

PROFILE = {"citizenships": ["Austria", "Spain"], "fields": ["art history", "economics", "arts management"],
           "levels": ["masters", "phd"], "entry_year": 2027, "countries": ["GB", "IE", "AT", "ES", "FR", "NL", "DE"]}
