# Tests

This directory contains test files for knitout-to-kcode.js which exercise basic functionality of the code.
Both ".k" (knitout) and ".kc" (kcode) files are included, with the intent that after any code edits, the knitout-to-kcode code can be checked against these files to avoid regressions.

## Description of individual tests

`position-{left|right|center|keep|none}.k` -- simple file to check that the `Position:` header (if specified) puts the pattern in the right spot.

`small-square.k` -- general purpose example exercising half-pitch racking and some transfers

`xfer-style.k` -- test the `x-xfer-style` extension

## TODO

Many tests are still needed!
