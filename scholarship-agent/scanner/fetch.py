"""Polite page fetching (FR-F1..F4, F6, NFR-3, NFR-7)."""
import re, time, urllib.request, urllib.robotparser
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

UA = "Mozilla/5.0 (compatible; ScholarshipScanner/2.0; personal use)"
MAX_BYTES = 5 * 1024 * 1024
MIN_TEXT = 200  # shorter than this = probably needs JavaScript

class FetchError(Exception):
    def __init__(self, kind, msg): super().__init__(msg); self.kind = kind

class Page:
    def __init__(self, url, title, text, links, rendered=False):
        self.url, self.title, self.text, self.links, self.rendered = url, title, text, links, rendered

class _Parse(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form"}
    BREAK = {"p", "li", "br", "h1", "h2", "h3", "h4", "tr", "div", "section"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.skip, self.title, self.h1, self.links = [], 0, "", "", []
        self._in = None; self._href = None; self._anchor = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.SKIP: self.skip += 1
        if tag in ("title", "h1"): self._in = tag
        if tag == "a" and a.get("href"): self._href, self._anchor = a["href"], []
    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip: self.skip -= 1
        if tag in self.BREAK: self.parts.append("\n")
        if tag == self._in: self._in = None
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._anchor).split()))); self._href = None
    def handle_data(self, d):
        if self._in == "title": self.title += d
        elif self._in == "h1" and not self.h1: self.h1 += d
        if self._href is not None: self._anchor.append(d)
        if not self.skip: self.parts.append(d)

def parse_html(html, url):
    p = _Parse()
    try: p.feed(html)
    except Exception: pass  # malformed HTML: keep whatever was parsed
    text = re.sub(r"[ \t\r\f\v]+", " ", "".join(p.parts))
    text = "\n".join(l.strip() for l in text.splitlines() if l.strip())
    links = [(urljoin(url, h), t) for h, t in p.links]
    title = " ".join((p.h1 or p.title).split())
    return Page(url, title, text, links)

class Fetcher:
    def __init__(self, delay_s=3.0, use_browser=True, clock=time.monotonic, sleep=time.sleep):
        self.delay, self.use_browser, self.clock, self.sleep = delay_s, use_browser, clock, sleep
        self._last, self._robots, self.requests = {}, {}, []

    def _wait(self, host):
        if host in self._last:
            gap = self.delay - (self.clock() - self._last[host])
            if gap > 0: self.sleep(gap)
        self._last[host] = self.clock()

    def _get(self, url):
        self._wait(urlparse(url).netloc)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        self.requests.append((url, self.clock()))
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES: raise FetchError("too_large", "page larger than 5 MB")
            return raw, r.headers.get_content_charset(), r.headers.get_content_type()

    def allowed(self, url):
        u = urlparse(url); base = f"{u.scheme}://{u.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                raw, cs, _ = self._get(base + "/robots.txt")
                rp.parse(raw.decode(cs or "utf-8", "replace").splitlines())
            except Exception:
                rp.parse([])  # no robots.txt reachable: allow
            self._robots[base] = rp
        return self._robots[base].can_fetch(UA, url)

    def fetch(self, url, needs_browser=False):
        if not self.allowed(url): raise FetchError("robots", "disallowed by robots.txt")
        if not needs_browser:
            try: raw, cs, ctype = self._get(url)
            except FetchError: raise
            except Exception as e: raise FetchError("network", str(e))
            if ctype and "html" not in ctype and "text" not in ctype:
                raise FetchError("not_html", f"unsupported content type {ctype}")
            html = None
            for enc in (cs, "utf-8", "latin-1"):
                try: html = raw.decode(enc or "utf-8"); break
                except (UnicodeDecodeError, LookupError): continue
            page = parse_html(html, url)
            if len(page.text) >= MIN_TEXT or not self.use_browser: return page
        return self._render(url)

    def _render(self, url):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise FetchError("needs_browser", "page needs JavaScript; install with: pip install playwright && playwright install chromium")
        try:
            with sync_playwright() as p:
                b = p.chromium.launch(); pg = b.new_page(user_agent=UA)
                pg.goto(url, wait_until="networkidle", timeout=45000)
                html = pg.content(); b.close()
        except Exception as e:
            raise FetchError("browser", str(e))
        page = parse_html(html, url); page.rendered = True
        return page
