#!/usr/bin/env python3
"""Build the portfolio viewer pages under /p/.

Every portfolio gets /p/<slug>/. From the Cloudtalk batch onwards the slug is
the company followed by the job title; earlier ones keep the short company
slug they were first sent out with. To add one, drop the PDF in portfolio/
and add a line below.

Links that have already been sent out must never break, so when a slug
changes, keep the old one in `aliases`: it becomes a page that forwards
straight to the new address, carrying any ?ref= along with it.

    ./tools/build-viewers.py
"""

import os
import re
import urllib.parse

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# (slug, pdf filename, [old slugs that should forward here])
PORTFOLIOS = [
    ("portfolio",                              "Harry_Down-Portfolio.pdf", []),

    ("baton",                                  "Harry_Down-Portfolio-Baton_Corporation.pdf", []),
    ("factorial",                              "Harry_Down-Portfolio-Factorial.pdf", []),
    ("moniepoint",                             "Harry_Down-Portfolio-Moniepoint.pdf", []),

    ("boulevard-collective-brand-designer",    "Harry_Down-Portfolio-The_Boulevard_Collective-Brand_Designer.pdf", ["boulevard-collective"]),
    ("circle",           "Harry_Down-Portfolio-Circle-Senior_Brand_Designer.pdf", []),
    ("cloudtalk-senior-product-designer",      "Harry_Down-Portfolio-Cloudtalk-Senior_Product_Designer.pdf", ["cloudtalk"]),
    ("ewor-ui-ux-brand-designer",              "Harry_Down-Portfolio-EWOR-UI_UX_Brand_Designer.pdf", ["ewor"]),
    ("magic-eden-senior-product-designer-sportsbook",
                                               "Harry_Down-Portfolio-Magic_Eden-Senior_Product_Designer_Sportsbook.pdf", ["magic-eden"]),
    ("neo-group-lead-brand-designer",          "Harry_Down-Portfolio-Neo_Group-Lead_Brand_Designer.pdf", ["neo-group"]),
    ("otherlife",              "Harry_Down-Portfolio-Otherlife-Senior_Designer.pdf", []),
    ("pavago-product-designer",                "Harry_Down-Portfolio-Pavago-Product_Designer.pdf", ["pavago"]),
    ("phantom",          "Harry_Down-Portfolio-Phantom_Senior_Brand_Designer.pdf", []),
    ("ruby-labs",
                                               "Harry_Down-Portfolio-Ruby_Labs-Creative_Performance_Design_Lead.pdf", []),
    ("siena-ai-founding-creative-director",    "Harry_Down-Portfolio-Siena_AI-Founding_Creative_Director.pdf", ["siena-ai"]),
    ("swift-tech-ux-ui-designer",              "Harry_Down-Portfolio-Swift_Tech-UX_UI_Designer.pdf", ["swift-tech"]),
    ("tem",         "Harry_Down-Portfolio-Tem-Brand_Creative_Design_Lead.pdf", []),
    ("tether-event-designer-coordinator",      "Harry_Down-Portfolio-Tether_Event_Designer_Coordinator.pdf", ["tether"]),
    ("todoist",              "Harry_Down-Portfolio-Todoist-Brand_Design_Lead.pdf", []),
]

VIEWER = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portfolio — Harry Down</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg?v={v}" type="image/svg+xml">
<link rel="icon" href="/favicon-32-dark.png?v={v}" sizes="32x32" type="image/png"
      media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon-32-light.png?v={v}" sizes="32x32" type="image/png"
      media="(prefers-color-scheme: light)">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v={v}">
<script defer src="https://cloud.umami.is/script.js" data-website-id="40035a4a-b023-47fd-a177-6272f5355262"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/pdf.css?v={v}">
</head>
<body data-pdf="{pdf}" data-slug="{slug}">
  <header class="ui">
    <a class="label" href="/">HARRY DOWN</a>
    <a class="label" href="{pdf}" download>DOWNLOAD</a>
  </header>

  <div class="doc" id="doc"></div>
  <p class="status" id="status">LOADING…</p>

  <div class="cursor" id="cursor" aria-hidden="true"></div>

  <script type="module" src="/js/pdf-viewer.js?v={v}"></script>
</body>
</html>
"""

# No analytics here: the page it forwards to records the visit, and a
# redirect that also counted would log every old link twice.
FORWARD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Portfolio — Harry Down</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="/p/{slug}/">
<script>location.replace("/p/{slug}/" + location.search + location.hash);</script>
<meta http-equiv="refresh" content="0; url=/p/{slug}/">
<style>html, body {{ background: #000; }}</style>
</head>
<body></body>
</html>
"""


def current_version():
    """Reuse the cache-busting version the existing pages already carry."""
    sample = os.path.join(ROOT, "p", "portfolio", "index.html")
    return re.search(r"pdf-viewer\.js\?v=(\d+)", open(sample).read()).group(1)


def write(slug, content):
    folder = os.path.join(ROOT, "p", slug)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "index.html"), "w") as f:
        f.write(content)


def main():
    v = current_version()
    slugs = [s for s, _, _ in PORTFOLIOS]
    aliases = [a for _, _, al in PORTFOLIOS for a in al]
    assert len(set(slugs + aliases)) == len(slugs) + len(aliases), "duplicate slug"

    for slug, pdf, old in PORTFOLIOS:
        path = "/portfolio/" + urllib.parse.quote(pdf)
        if not os.path.isfile(os.path.join(ROOT, "portfolio", pdf)):
            print("  ! missing PDF, skipped: " + pdf)
            continue
        write(slug, VIEWER.format(pdf=path, slug=slug, v=v))
        print("  /p/%s/" % slug)
        for alias in old:
            write(alias, FORWARD.format(slug=slug))
            print("      /p/%s/  forwards here" % alias)


if __name__ == "__main__":
    main()
