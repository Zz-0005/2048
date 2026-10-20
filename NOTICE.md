# NOTICE

## Upstream project

This game follows the rules and the visual language of **2048** by
**Gabriele Cirulli**:

- Upstream repository: <https://github.com/gabrielecirulli/2048>
- Upstream licence: MIT

The upstream MIT licence text is reproduced below, as required for
attribution.

```
The MIT License (MIT)

Copyright (c) 2014 Gabriele Cirulli

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Modifications in this package

This package is an independent implementation written for PRD-2048 v2.0.
It shares the game rules and the colour language with the upstream project
but does not copy upstream source files.

- `index.html`, `styles.css`, `script.js` were written for this package.
- The rule engine is a pure module with an injectable RNG and a whitelisted
  local event interface (no third-party analytics).
- Only `bestScore` is persisted. The P1 snapshot key `gameState` is **not**
  implemented, and the UI does not claim any "resume after closing"
  behaviour (PRD D-003).
- Tile colours were adjusted so every tile number meets WCAG AA contrast
  (4.5:1); the upstream palette does not.
