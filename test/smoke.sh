#!/bin/sh
# Load the page headless, report JS errors and screenshot each tab.
cd "$(dirname "$0")/.."
for tab in kmeans ward image; do
  ~/venv_ds4400/bin/python test/run_headless.py "file://$PWD/index.html#$tab" \
    --wait 'document.readyState === "complete"' \
    --eval 'new Promise(r => setTimeout(r, 1500)).then(() => __err.length ? __err.join("; ") : "ok")' \
    --shot "shots/$tab.png"
done
